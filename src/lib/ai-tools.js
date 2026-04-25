// ══════════════════════════════════════════════════════════════
// ── OpenAI Function-Calling Tools for DM AI ───────────────────
// ══════════════════════════════════════════════════════════════
//
// Instead of dumping all campaign data into every prompt, these
// tools let the model query only what it needs on demand.
// ══════════════════════════════════════════════════════════════

const { pgPool } = require("../db/pool");
const { searchEmbeddings } = require("./rag");

// ── Tool definitions (OpenAI function-calling schema) ────────

const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "lookup_npc",
      description: "Look up a specific NPC by name (fuzzy match). Returns full profile including race, class, location, status, description, portrait URL, and profile link.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "NPC name or partial name to search for" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_npcs",
      description: "Search NPCs by location, status, or keyword. Use when the user asks about NPCs in a place, alive/dead NPCs, or groups of characters.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term — location name, status, race, class, or keyword in description" },
          limit: { type: "integer", description: "Max results to return (default 10)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_session_log",
      description: "Get session summary by session number, or search sessions by keyword. Returns session number, title, summary, and dates.",
      parameters: {
        type: "object",
        properties: {
          session_number: { type: "integer", description: "Specific session number to retrieve" },
          query: { type: "string", description: "Keyword to search across session titles and summaries" },
          limit: { type: "integer", description: "Max results when searching by query (default 5)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_spell",
      description: "Look up a D&D spell by name. Returns all available spell data from the database.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Spell name or partial name" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_monster",
      description: "Look up a D&D monster/creature by name. Returns stat block data from the database.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Monster name or partial name" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_magic_item",
      description: "Look up a D&D magic item by name. Returns item data from the database.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Magic item name or partial name" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_artifact",
      description: "Look up a campaign artifact or special item from Halls of the Damned. Returns name, rarity, description, lore, and owner.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Artifact name or partial name" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_player_character",
      description: "Look up a player character by name. Returns full character sheet data including stats, backstory, personality, equipment, and spells.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Character name or player name" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_handout",
      description: "Look up a campaign handout by name. Returns handout name, description, and about text.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Handout name or keyword" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_calendar",
      description: "Get in-game calendar events for a specific month or search across all events. The campaign uses a custom Barovian calendar with 12 months, 30 days each.",
      parameters: {
        type: "object",
        properties: {
          month: { type: "integer", description: "Month number (1-12) to get events for" },
          query: { type: "string", description: "Keyword to search event titles/descriptions" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_dnd_reference",
      description: "Search the D&D reference material (RAG) for rules, lore, class features, or any D&D content not covered by other tools. Use for rules questions, class/subclass abilities, conditions, etc.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The D&D rules question or topic to search for" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_campaign_lore",
      description: "Search embedded campaign lore, stat blocks, group info, realm descriptions, and campaign notes using semantic search. Use for campaign-specific world-building, NPC stat blocks, faction details, realm geography, or any campaign content not in the database tables.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The campaign topic, character name, location, or concept to search for" },
          source_type: { type: "string", description: "Optional: filter by source type (lore, lore_json, npc, session, artifact, character, journal)", enum: ["lore", "lore_json", "npc", "session", "artifact", "character", "journal"] },
        },
        required: ["query"],
      },
    },
  },
];


// ── Tool implementations ────────────────────────────────────

async function executeTool(name, args, openaiClient) {
  switch (name) {

    case "lookup_npc": {
      const pattern = `%${args.name}%`;
      const res = await pgPool.query(
        `SELECT id, name, race, npc_class, location, status, alignment_tag, portrait_url, description
         FROM hotd_npcs WHERE name ILIKE $1 ORDER BY sort_order, name LIMIT 5`, [pattern]
      );
      if (res.rows.length === 0) return JSON.stringify({ found: false, message: `No NPC found matching "${args.name}"` });
      return JSON.stringify({
        found: true,
        npcs: res.rows.map(n => ({
          id: n.id, name: n.name, race: n.race, class: n.npc_class,
          location: n.location, status: n.status, alignment: n.alignment_tag,
          portrait_url: n.portrait_url || null,
          description: n.description || "",
          profile_url: `https://hotd.knoxrpg.com/npcs/${n.id}`,
        })),
      });
    }

    case "search_npcs": {
      const pattern = `%${args.query}%`;
      const limit = args.limit || 10;
      const res = await pgPool.query(
        `SELECT id, name, race, npc_class, location, status, alignment_tag, portrait_url, description
         FROM hotd_npcs
         WHERE name ILIKE $1 OR location ILIKE $1 OR status ILIKE $1 OR race ILIKE $1
               OR npc_class ILIKE $1 OR description ILIKE $1
         ORDER BY sort_order, name LIMIT $2`, [pattern, limit]
      );
      return JSON.stringify({
        count: res.rows.length,
        npcs: res.rows.map(n => ({
          id: n.id, name: n.name, race: n.race, class: n.npc_class,
          location: n.location, status: n.status,
          profile_url: `https://hotd.knoxrpg.com/npcs/${n.id}`,
        })),
      });
    }

    case "get_session_log": {
      if (args.session_number != null) {
        const res = await pgPool.query(
          "SELECT session_number, title, summary, game_date, play_date FROM hotd_sessions WHERE session_number = $1",
          [args.session_number]
        );
        if (res.rows.length === 0) return JSON.stringify({ found: false, message: `Session ${args.session_number} not found` });
        const s = res.rows[0];
        return JSON.stringify({ found: true, session: { number: s.session_number, title: s.title, summary: s.summary, game_date: s.game_date, play_date: s.play_date } });
      }
      if (args.query) {
        const pattern = `%${args.query}%`;
        const limit = args.limit || 5;
        const res = await pgPool.query(
          "SELECT session_number, title, summary, game_date FROM hotd_sessions WHERE title ILIKE $1 OR summary ILIKE $1 ORDER BY session_number LIMIT $2",
          [pattern, limit]
        );
        return JSON.stringify({
          count: res.rows.length,
          sessions: res.rows.map(s => ({ number: s.session_number, title: s.title, summary: (s.summary || "").slice(0, 500), game_date: s.game_date })),
        });
      }
      // No params — return latest 5
      const res = await pgPool.query("SELECT session_number, title, game_date FROM hotd_sessions ORDER BY session_number DESC LIMIT 5");
      return JSON.stringify({ count: res.rows.length, sessions: res.rows.map(s => ({ number: s.session_number, title: s.title, game_date: s.game_date })) });
    }

    case "lookup_spell": {
      const pattern = `%${args.name}%`;
      try {
        const res = await pgPool.query("SELECT * FROM spells WHERE name ILIKE $1 LIMIT 3", [pattern]);
        if (res.rows.length === 0) return JSON.stringify({ found: false, message: `No spell found matching "${args.name}"` });
        return JSON.stringify({ found: true, spells: res.rows });
      } catch (_) {
        return JSON.stringify({ found: false, message: "Spells table not available" });
      }
    }

    case "lookup_monster": {
      const pattern = `%${args.name}%`;
      try {
        const res = await pgPool.query("SELECT * FROM monsters WHERE name ILIKE $1 LIMIT 3", [pattern]);
        if (res.rows.length === 0) return JSON.stringify({ found: false, message: `No monster found matching "${args.name}"` });
        return JSON.stringify({ found: true, monsters: res.rows });
      } catch (_) {
        return JSON.stringify({ found: false, message: "Monsters table not available" });
      }
    }

    case "lookup_magic_item": {
      const pattern = `%${args.name}%`;
      try {
        const res = await pgPool.query("SELECT * FROM magic_items WHERE name ILIKE $1 LIMIT 3", [pattern]);
        if (res.rows.length === 0) return JSON.stringify({ found: false, message: `No magic item found matching "${args.name}"` });
        return JSON.stringify({ found: true, items: res.rows });
      } catch (_) {
        return JSON.stringify({ found: false, message: "Magic items table not available" });
      }
    }

    case "lookup_artifact": {
      const pattern = `%${args.name}%`;
      const res = await pgPool.query(
        "SELECT name, rarity, description, lore, is_legendary, owner, image_url FROM hotd_artifacts WHERE name ILIKE $1 ORDER BY name LIMIT 3", [pattern]
      );
      if (res.rows.length === 0) return JSON.stringify({ found: false, message: `No artifact found matching "${args.name}"` });
      return JSON.stringify({ found: true, artifacts: res.rows });
    }

    case "get_player_character": {
      const pattern = `%${args.name}%`;
      const res = await pgPool.query(
        `SELECT character_name, player_name, level, race, class_summary, subclass, avatar_url,
                hit_points, max_hit_points, armor_class, speed,
                strength, dexterity, constitution, intelligence, wisdom, charisma,
                proficiency_bonus, alignment, background, backstory,
                personality_traits, ideals, bonds, flaws,
                skills, equipment, spells, features, attacks, languages, senses, notes
         FROM hotd_player_characters
         WHERE character_name ILIKE $1 OR player_name ILIKE $1
         LIMIT 3`, [pattern]
      );
      if (res.rows.length === 0) return JSON.stringify({ found: false, message: `No character found matching "${args.name}"` });
      return JSON.stringify({ found: true, characters: res.rows });
    }

    case "get_handout": {
      const pattern = `%${args.name}%`;
      const res = await pgPool.query(
        "SELECT name, description, about, image_url FROM hotd_handouts WHERE name ILIKE $1 OR description ILIKE $1 ORDER BY name LIMIT 5", [pattern]
      );
      if (res.rows.length === 0) return JSON.stringify({ found: false, message: `No handout found matching "${args.name}"` });
      return JSON.stringify({ found: true, handouts: res.rows });
    }

    case "get_calendar": {
      if (args.month != null) {
        const res = await pgPool.query(
          "SELECT day, month_idx, title, description, session_refs FROM hotd_calendar_events WHERE month_idx = $1 ORDER BY day",
          [args.month]
        );
        return JSON.stringify({ count: res.rows.length, events: res.rows });
      }
      if (args.query) {
        const pattern = `%${args.query}%`;
        const res = await pgPool.query(
          "SELECT day, month_idx, title, description FROM hotd_calendar_events WHERE title ILIKE $1 OR description ILIKE $1 ORDER BY month_idx, day LIMIT 10",
          [pattern]
        );
        return JSON.stringify({ count: res.rows.length, events: res.rows });
      }
      // Current date
      const cfgRes = await pgPool.query("SELECT key, value FROM hotd_config WHERE key IN ('current_month', 'current_day', 'current_year')");
      const cfg = {};
      for (const r of cfgRes.rows) cfg[r.key] = r.value;
      return JSON.stringify({ current_date: { month: cfg.current_month, day: cfg.current_day, year: cfg.current_year } });
    }

    case "search_dnd_reference": {
      if (!openaiClient) return JSON.stringify({ found: false, message: "AI client not available for search" });
      const results = await searchEmbeddings(openaiClient, args.query, { limit: 6, minScore: 0.3 });
      if (results.length === 0) return JSON.stringify({ found: false, message: "No reference material found" });
      const context = results.map(r => `## ${r.title}\n${r.chunk_text}`).join("\n\n---\n\n");
      return JSON.stringify({ found: true, content: context });
    }

    case "search_campaign_lore": {
      if (!openaiClient) return JSON.stringify({ found: false, message: "AI client not available for semantic search" });
      const searchOpts = { limit: 8, minScore: 0.25 };
      if (args.source_type) searchOpts.sourceType = args.source_type;
      const results = await searchEmbeddings(openaiClient, args.query, searchOpts);
      if (results.length === 0) return JSON.stringify({ found: false, message: `No campaign lore found matching "${args.query}"` });
      return JSON.stringify({
        found: true,
        count: results.length,
        results: results.map(r => ({
          title: r.title,
          source_type: r.source_type,
          score: r.score,
          content: r.chunk_text,
        })),
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ── Lightweight system prompt (no bulk data) ────────────────

const SYSTEM_PROMPT_WITH_TOOLS = `You are the DM AI for "Halls of the Damned", a D&D 5th Edition campaign set in Barovia, hosted on KnoxRPG (https://hotd.knoxrpg.com).

You have tools to look up campaign and D&D data. ALWAYS use the appropriate tool before answering — do not guess or rely on general knowledge when a tool can provide accurate campaign-specific data.

## Tool Usage Guidelines
- For NPC questions: use \`lookup_npc\` with the NPC name. For "who is in <location>": use \`search_npcs\`.
- For session/event questions: use \`get_session_log\` with session number or keyword.
- For spell questions: use \`lookup_spell\`. For monster questions: use \`lookup_monster\`.
- For magic item questions: use \`lookup_magic_item\`. For campaign artifacts: use \`lookup_artifact\`.
- For player character questions: use \`get_player_character\`.
- For handouts or documents: use \`get_handout\`.
- For calendar/timeline questions: use \`get_calendar\`.
- For D&D rules, class features, conditions, or general lore: use \`search_dnd_reference\`.
- For campaign world-building, stat blocks, factions, realm info, or campaign notes: use \`search_campaign_lore\`.
- You may call multiple tools in parallel if the question requires data from different sources.

## CRITICAL: Answer the Actual Question
Read the user's question carefully and answer ONLY what they asked.
- If they ask "what is the range of Fireball?" → answer with the range and source, nothing more.
- If they ask "tell me about Ireena" → give a full profile.
- If they ask a yes/no question → answer yes or no first, then briefly explain.
- If they ask for a specific stat, property, or detail → give that detail directly.
Do NOT dump a full data card unless the user asks to "look up", "describe", or "tell me about" something.

## Response Guidelines
- Be accurate, concise, and conversational — answer like a knowledgeable DM at the table.
- Use markdown formatting (bold, links, lists). The chat client renders markdown.
- Always cite the source (book name and page) when referencing D&D rules.
- Include a link to the relevant KnoxRPG page when tool data provides a URL (e.g. NPC profile link, spells page).
- If a tool returns no results, say so honestly rather than guessing.
- For full lookups (e.g. "tell me about Fireball"), include all relevant details from the tool data.`;

// ── Max tool-call rounds to prevent infinite loops ───────────
const MAX_TOOL_ROUNDS = 5;

/**
 * Run the OpenAI chat completion loop with function calling.
 *
 * @param {object} openaiClient - The OpenAI SDK client
 * @param {string} model - Model name
 * @param {object[]} userMessages - Array of {role, content} from the user
 * @param {object} opts - { maxTokens, temperature }
 * @returns {{ reply: string, _debug: object }}
 */
async function chatWithTools(openaiClient, model, userMessages, opts = {}) {
  const maxTokens = opts.maxTokens || 2048;
  const temperature = opts.temperature != null ? opts.temperature : 0.7;

  const debug = {
    model, maxTokens, temperature,
    toolCalls: [],
    totalRounds: 0,
    systemPromptLength: SYSTEM_PROMPT_WITH_TOOLS.length,
  };

  const chatMessages = [
    { role: "system", content: SYSTEM_PROMPT_WITH_TOOLS },
    ...userMessages,
  ];

  let rounds = 0;
  const t0 = Date.now();

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const completionParams = {
      model,
      messages: chatMessages,
      max_completion_tokens: maxTokens,
      temperature,
      tools: toolDefinitions,
      tool_choice: rounds === 1 ? "auto" : "auto",
    };

    const completion = await openaiClient.chat.completions.create(completionParams);
    const choice = completion.choices[0];

    // If model produced tool calls, execute them
    if (choice.finish_reason === "tool_calls" || (choice.message.tool_calls && choice.message.tool_calls.length > 0)) {
      // Append the assistant's tool-calling message
      chatMessages.push(choice.message);

      const calls = choice.message.tool_calls;
      const roundDebug = { round: rounds, calls: [] };

      // Execute all tool calls (can be parallel)
      const toolResults = await Promise.all(calls.map(async (tc) => {
        const fnName = tc.function.name;
        let fnArgs;
        try { fnArgs = JSON.parse(tc.function.arguments); } catch (_) { fnArgs = {}; }
        const callT0 = Date.now();
        let result;
        try {
          result = await executeTool(fnName, fnArgs, openaiClient);
        } catch (err) {
          result = JSON.stringify({ error: err.message });
        }
        const callMs = Date.now() - callT0;
        roundDebug.calls.push({ tool: fnName, args: fnArgs, resultLength: result.length, latencyMs: callMs });
        return { tool_call_id: tc.id, role: "tool", content: result };
      }));

      debug.toolCalls.push(roundDebug);

      // Append tool results
      chatMessages.push(...toolResults);
      continue;
    }

    // Model produced a final text response
    debug.totalRounds = rounds;
    debug.openaiLatencyMs = Date.now() - t0;
    debug.usage = completion.usage || {};
    debug.finishReason = choice.finish_reason;
    debug.totalMessages = chatMessages.length;

    const reply = choice.message.content || "I don't have a response for that.";
    return { reply, _debug: debug };
  }

  // Exceeded max rounds — return whatever we have
  debug.totalRounds = rounds;
  debug.openaiLatencyMs = Date.now() - t0;
  debug.warning = "Max tool-call rounds exceeded";
  return { reply: "I ran into a limit while looking up information. Please try a more specific question.", _debug: debug };
}


module.exports = { toolDefinitions, executeTool, chatWithTools, SYSTEM_PROMPT_WITH_TOOLS };
