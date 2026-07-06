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

  if (EXPOSED_WEBSITE_TOOLS.has(name)) {
    // Website tools run in DM mode so MCP callers get the full data set.
    return await executeTool(name, args || {}, openai, true);
  }

  throw new Error(`Unknown tool: ${name}`);
}
