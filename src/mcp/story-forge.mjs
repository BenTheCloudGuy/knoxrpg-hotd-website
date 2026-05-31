// Story Forge: RAG-augmented content generation for the MCP server.
// Mirrors src/routes/dm-admin-api.js /api/dm-admin/story-forge/generate logic, in-process.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { pgPool } = require('../db/pool.js');
const { buildEmbeddingContext } = require('../lib/rag.js');

const TEMPLATE_PROMPTS = {
  npc_backstory: 'Generate a rich, detailed NPC backstory. Include personality traits, motivations, secrets, and connections to other campaign elements. Format with markdown headers.',
  magic_item: 'Design a custom D&D 5e magic item. Include: Name, Rarity, Type, Attunement requirements, Description, Mechanical effects (with specific numbers), Lore/History. Format as a proper item card.',
  spell: 'Design a custom D&D 5e spell. Include: Name, Level, School, Casting Time, Range, Components, Duration, Description with mechanical effects. Format as a proper spell card.',
  session_summary: 'Write a narrative session summary in the voice of a chronicler. Include key events, NPC interactions, combat highlights, and plot developments. Reference specific characters and locations accurately.',
  session_planning: 'Create a detailed session plan. Include: Opening scene, Key encounters (social/combat/exploration), NPC motivations and dialogue hooks, Potential branching points, Treasure/rewards, Cliffhanger ending options.',
  scene_description: 'Write an evocative scene description for the DM to read aloud. Use vivid sensory details. Set the mood and atmosphere. Keep it 2-3 paragraphs.',
  quest_hook: 'Design a compelling quest hook. Include: The hook (how players learn about it), Background (what is really going on), Key NPCs involved, Locations, Potential rewards, Complications/twists.',
  faction_lore: 'Write detailed faction lore. Include: Name, History, Goals, Leadership, Membership, Relations with other factions, Current activities, How PCs might interact with them.',
  freeform: '',
};

export async function storyForgeGenerate(openai, { prompt, template = 'freeform', entities = [] } = {}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt is required');
  }
  if (!TEMPLATE_PROMPTS[template]) {
    throw new Error(`template must be one of: ${Object.keys(TEMPLATE_PROMPTS).join(', ')}`);
  }

  const searchTerms = [prompt, ...(entities || [])].join(' ');
  const ragContext = await buildEmbeddingContext(openai, searchTerms, {
    includeDmOnly: true,
    limit: 12,
    minScore: 0.25,
  });

  // Direct entity lookups (mirrors the website Story Forge route)
  const entityData = [];
  for (const ent of (entities || []).slice(0, 10)) {
    const r = await pgPool.query(
      'SELECT name, race, npc_class, location, status, alignment_tag, description FROM hotd_npcs WHERE name ILIKE $1 LIMIT 1',
      [`%${ent}%`]
    );
    if (r.rows.length) entityData.push({ type: 'NPC', ...r.rows[0] });
  }

  const templateInstr = TEMPLATE_PROMPTS[template] ?? '';
  const entityContext = entityData.length
    ? '\n\nDirect entity data:\n' + entityData.map(e =>
        `- ${e.type}: ${e.name} — ${e.race || ''} ${e.npc_class || ''}, ${e.location || ''}, ${e.status || ''}. ${(e.description || '').slice(0, 500)}`
      ).join('\n')
    : '';

  const systemPrompt = `You are the Story Forge, an AI assistant for the Dungeon Master of "Halls of the Damned", a D&D 5e campaign set in Barovia.

You MUST use the campaign context provided below to ensure accuracy. Never invent NPCs, locations, events, or history that contradict the established campaign data. If the context doesn't cover something, you may extrapolate creatively but flag it as [NEW CONTENT].

${templateInstr}

${ragContext}${entityContext}`;

  const cfgR = await pgPool
    .query("SELECT value FROM hotd_config WHERE key = 'ai_model'")
    .catch(() => ({ rows: [] }));
  const model = cfgR.rows.length ? cfgR.rows[0].value : 'gpt-5.4-mini';

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    max_completion_tokens: 4096,
    temperature: 0.8,
  });

  const content = completion.choices[0]?.message?.content || '';
  return {
    content,
    template,
    model,
    usage: completion.usage,
    ragChunks: ragContext ? ragContext.split('---').length : 0,
    entityLookups: entityData.length,
  };
}
