// Tool definitions and dispatcher for the HotD RAG MCP server.
//
// Bridges two sources of tools:
//   1. Website AI function tools (from src/lib/ai-tools.js) — reused for parity with
//      the DM AI on the website itself.
//   2. MCP-only custom tools — raw search, RAG status, reindex trigger, content generation.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { toolDefinitions, executeTool } = require('../lib/ai-tools.js');
const { searchEmbeddings } = require('../lib/rag.js');
const homebrewSchema = require('../lib/homebrew-schema.js');
const homebrewPublish = require('../lib/homebrew-publish.js');
const { pgPool } = require('../db/pool.js');

import { getOpenAIClient } from './openai-client.mjs';
import { ragStatus } from './rag-status.mjs';
import { triggerReindex } from './reindex.mjs';
import { generateCampaignContent } from './story-forge.mjs';

// Website tools we expose through the MCP. Read-only lookups + scoped RAG.
// We deliberately EXCLUDE query_database and describe_table — too broad for
// general MCP exposure; agents should use the typed lookup_* tools instead.
const EXPOSED_WEBSITE_TOOLS = new Set([
  'lookup_npc',
  'search_npcs',
  'get_session_log',
  'lookup_spell',
  'lookup_monster',
  'lookup_magic_item',
  'lookup_artifact',
  'get_player_character',
  'get_handout',
  'get_calendar',
  'search_dnd_reference',
  'search_campaign_lore',
]);

function toMcpToolDef(openaiToolDef) {
  const f = openaiToolDef.function;
  return {
    name: f.name,
    description: f.description,
    inputSchema: f.parameters,
  };
}

const websiteMcpTools = toolDefinitions
  .filter((t) => EXPOSED_WEBSITE_TOOLS.has(t.function.name))
  .map(toMcpToolDef);

// MCP-only custom tools
const customMcpTools = [
  {
    name: 'search_embeddings',
    description:
      'Raw vector search over hotd_embeddings (pgvector hybrid with full-text boost). ' +
      'Use this for low-level RAG queries when the lookup_* tools are too narrow. ' +
      'Returns chunks with score, source_type, source_id, source_path, title, and chunk_text.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language query' },
        limit: { type: 'integer', description: 'Max results (default 10)' },
        sourceType: {
          type: 'string',
          description:
            'Filter by source_type. Common values: npc, session, lore, lore_json, artifact, ' +
            'character, journal, ddb_spell, ddb_monster, ddb_magic_item, ddb_class, ddb_feat, ' +
            'ddb_background, ddb_race, dnd_book',
        },
        includeDmOnly: {
          type: 'boolean',
          description: 'Include DM-only chunks (default false)',
        },
        minScore: {
          type: 'number',
          description: 'Minimum cosine similarity 0-1 (default 0.3)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'rag_status',
    description:
      'Report RAG health: total embeddings, DM-only count, and per-source-type stats ' +
      '(chunk count, first/last updated_at). Use this to check coverage and freshness ' +
      'before generating content.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'trigger_reindex',
    description:
      'Run scripts/embed-pipeline.js to re-index a content source. Returns stdout/stderr tails ' +
      'and exit code. Long-running (up to 5 minutes); prefer incremental mode unless you have ' +
      'a reason to re-embed everything.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Source to re-index',
          enum: ['npc', 'session', 'lore', 'artifact', 'character', 'journal', 'handout', 'calendar', 'all'],
        },
        mode: {
          type: 'string',
          description: 'full | incremental | dry-run (default incremental)',
          enum: ['full', 'incremental', 'dry-run'],
        },
      },
      required: ['source'],
    },
  },
  {
    name: 'generate_campaign_content',
    description:
      'RAG-augmented prose generation. Pulls campaign context for the ' +
      'prompt + named entities, then asks the model to write canon-aware content. Heavier than ' +
      'search; use for NPC backstories, scene descriptions, magic items, session summaries, ' +
      'quest hooks, faction lore. Output is suitable for pasting into a campaign notebook page.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What to generate, in plain language' },
        template: {
          type: 'string',
          description: 'Template type (default freeform)',
          enum: [
            'npc_backstory',
            'magic_item',
            'spell',
            'session_summary',
            'session_planning',
            'scene_description',
            'quest_hook',
            'faction_lore',
            'freeform',
          ],
        },
        entities: {
          type: 'array',
          items: { type: 'string' },
          description: 'Named NPCs/locations/factions to anchor the generation (max 10)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'list_homebrew_categories',
    description:
      'List the 7 D&D Beyond homebrew authoring categories (magic-item, feat, spell, monster, ' +
      'species, subclass, background) with each label and whether it can be pushed to D&D Beyond.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_homebrew_drafts',
    description:
      'List saved homebrew drafts from hotd_homebrew (id, category, name, status, player-visibility, ' +
      'D&D Beyond URL, RAG chunk count). Optionally filter by category.',
    inputSchema: {
      type: 'object',
      properties: { category: { type: 'string', description: 'Optional category filter', enum: [...homebrewSchema.ORDER] } },
    },
  },
  {
    name: 'create_homebrew_draft',
    description:
      'Create or update a homebrew draft (saved to hotd_homebrew, not yet published). Provide ' +
      'category, name, and a fields object matching that category schema (see list_homebrew_categories). ' +
      'Set is_player_visible=false for DM-only. Returns the saved draft (with its id).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'Existing draft id to update (omit to create new)' },
        category: { type: 'string', enum: [...homebrewSchema.ORDER] },
        name: { type: 'string', description: 'Display name' },
        fields: { type: 'object', description: 'Category fields: name, description, and category-specific keys' },
        is_player_visible: { type: 'boolean', description: 'Player-searchable via DM AI when published (default true)' },
      },
      required: ['category', 'fields'],
    },
  },
  {
    name: 'publish_homebrew',
    description:
      'Publish a homebrew draft: mirror it into the campaign content tables, embed it into the RAG ' +
      '(player-searchable via DM AI unless DM-only), and push to D&D Beyond when DDB push is enabled ' +
      '(env DDB_ENABLE_PUSH). Returns a per-step report (mirror / embed / ddb).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'integer', description: 'Draft id from create_homebrew_draft / list_homebrew_drafts' } },
      required: ['id'],
    },
  },
];

export const mcpToolList = [...websiteMcpTools, ...customMcpTools];

export async function dispatchTool(name, args) {
  const openai = await getOpenAIClient();

  if (name === 'search_embeddings') {
    const { query, limit, sourceType, includeDmOnly, minScore } = args || {};
    if (!query) throw new Error('query is required');
    const results = await searchEmbeddings(openai, query, {
      limit, sourceType, includeDmOnly, minScore,
    });
    return { count: results.length, results };
  }
  if (name === 'rag_status') {
    return await ragStatus();
  }
  if (name === 'trigger_reindex') {
    return await triggerReindex(args || {});
  }
  if (name === 'generate_campaign_content') {
    return await generateCampaignContent(openai, args || {});
  }

  if (name === 'list_homebrew_categories') {
    return { categories: homebrewSchema.categoryList() };
  }
  if (name === 'list_homebrew_drafts') {
    return { drafts: await homebrewPublish.listDrafts(pgPool, (args && args.category) || null) };
  }
  if (name === 'create_homebrew_draft') {
    const { id, category, name: draftName, fields, is_player_visible } = args || {};
    if (!homebrewSchema.getCategory(category)) throw new Error(`unknown category: ${category}`);
    if (!fields || typeof fields !== 'object') throw new Error('fields object is required');
    const draft = await homebrewPublish.saveDraft(pgPool, {
      id, category, name: draftName, fields, is_player_visible, created_by: 'mcp',
    });
    return { draft };
  }
  if (name === 'publish_homebrew') {
    if (!args || !args.id) throw new Error('id is required');
    const report = await homebrewPublish.publishDraft(pgPool, openai, args.id, {});
    return { report };
  }

  if (EXPOSED_WEBSITE_TOOLS.has(name)) {
    // Website tools run in DM mode so MCP callers get the full data set.
    return await executeTool(name, args || {}, openai, true);
  }

  throw new Error(`Unknown tool: ${name}`);
}
