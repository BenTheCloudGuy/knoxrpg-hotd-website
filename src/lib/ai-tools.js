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

async function executeTool(name, args, openaiClient, isDM = false) {
  switch (name) {

    case "lookup_npc": {
      const pattern = `%${args.name}%`;
      const columns = isDM
        ? 'id, name, race, npc_class, location, status, alignment_tag, portrait_url, description, dm_notes'
        : 'id, name, race, npc_class, location, status, alignment_tag, portrait_url, description';
      const filter = isDM ? '' : ' AND is_hidden = FALSE';
      const res = await pgPool.query(
        `SELECT ${columns} FROM hotd_npcs WHERE name ILIKE $1${filter} ORDER BY sort_order, name LIMIT 5`, [pattern]
      );
      if (res.rows.length === 0) return JSON.stringify({ found: false, message: `No NPC found matching "${args.name}"` });
      return JSON.stringify({
        found: true,
        npcs: res.rows.map(n => {
          const npc = {
            id: n.id, name: n.name, race: n.race, class: n.npc_class,
            location: n.location, status: n.status, alignment: n.alignment_tag,
            portrait_url: n.portrait_url || null,
            description: n.description || "",
            profile_url: `https://hotd.knoxrpg.com/npcs/${n.id}`,
          };
          if (isDM && n.dm_notes) npc.dm_notes = n.dm_notes;
          return npc;
        }),
      });
    }

    case "search_npcs": {
      const pattern = `%${args.query}%`;
      const limit = args.limit || 10;
      const filter = isDM ? '' : ' AND is_hidden = FALSE';
      const res = await pgPool.query(
        `SELECT id, name, race, npc_class, location, status, alignment_tag, portrait_url, description
         FROM hotd_npcs
         WHERE (name ILIKE $1 OR location ILIKE $1 OR status ILIKE $1 OR race ILIKE $1
               OR npc_class ILIKE $1 OR description ILIKE $1)${filter}
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
          sessions: res.rows.map(s => ({ number: s.session_number, title: s.title, summary: (s.summary || "").slice(0, 1000), game_date: s.game_date })),
        });
      }
      // No params — return the latest session with full summary, plus recent list
      const latest = await pgPool.query("SELECT session_number, title, summary, game_date, play_date FROM hotd_sessions ORDER BY session_number DESC LIMIT 1");
      const recent = await pgPool.query("SELECT session_number, title, game_date FROM hotd_sessions ORDER BY session_number DESC LIMIT 5");
      return JSON.stringify({
        latest_session: latest.rows.length ? { number: latest.rows[0].session_number, title: latest.rows[0].title, summary: latest.rows[0].summary, game_date: latest.rows[0].game_date, play_date: latest.rows[0].play_date } : null,
        recent_sessions: recent.rows.map(s => ({ number: s.session_number, title: s.title, game_date: s.game_date })),
      });
    }

    case "lookup_spell": {
      const pattern = `%${args.name}%`;
      try {
        const res = await pgPool.query(
          `SELECT name, level, school, activation_type, range_field, components, duration_type, duration_field,
                  requires_concentration, can_cast_as_ritual, can_cast_at_higher_level, aoe_type, aoe_size,
                  save_ability, description_text, source, source_page
           FROM spells WHERE name ILIKE $1 LIMIT 3`, [pattern]);
        if (res.rows.length === 0) return JSON.stringify({ found: false, message: `No spell found matching "${args.name}"` });
        const ordSuffix = (n) => { const s = ['th','st','nd','rd']; const v = n % 100; return n + (s[(v-20)%10]||s[v]||s[0]); };
        return JSON.stringify({
          found: true,
          spells: res.rows.map(s => ({
            name: s.name,
            level: s.level === 0 ? 'Cantrip' : `${ordSuffix(s.level)}-level`,
            school: s.school,
            casting_time: s.activation_type,
            range: s.range_field,
            components: s.components,
            duration: s.requires_concentration
              ? `Concentration, ${s.duration_field || s.duration_type}`
              : s.duration_field || s.duration_type,
            area: s.aoe_type ? `${s.aoe_size}-foot ${s.aoe_type}` : null,
            saving_throw: s.save_ability || null,
            ritual: s.can_cast_as_ritual || false,
            description: s.description_text,
            at_higher_levels: s.can_cast_at_higher_level || false,
            source: s.source_page ? `${s.source}, p. ${s.source_page}` : s.source,
          })),
        });
      } catch (_) {
        return JSON.stringify({ found: false, message: "Spells table not available" });
      }
    }

    case "lookup_monster": {
      const pattern = `%${args.name}%`;
      try {
        if (isDM) {
          const res = await pgPool.query(
            `SELECT name, size, type, sub_types, alignment, challenge_rating, challenge_rating_display, xp,
                    proficiency_bonus, armor_class, armor_class_type, hit_points, average_hit_points, hit_dice,
                    ability_scores, speed, skills, saving_throws, senses, passive_perception,
                    damage_resistances, damage_immunities, damage_vulnerabilities, condition_immunities,
                    languages, environments, description_text, is_legendary, avatar_url, source
             FROM monsters WHERE name ILIKE $1 LIMIT 3`, [pattern]);
          if (res.rows.length === 0) return JSON.stringify({ found: false, message: `No monster found matching "${args.name}"` });
          return JSON.stringify({ found: true, monsters: res.rows });
        } else {
          const res = await pgPool.query(
            `SELECT name, size, type, sub_types, alignment, description_text, environments, avatar_url, source
             FROM monsters WHERE name ILIKE $1 LIMIT 3`, [pattern]);
          if (res.rows.length === 0) return JSON.stringify({ found: false, message: `No monster found matching "${args.name}"` });
          return JSON.stringify({ found: true, monsters: res.rows });
        }
      } catch (_) {
        return JSON.stringify({ found: false, message: "Monsters table not available" });
      }
    }

    case "lookup_magic_item": {
      const pattern = `%${args.name}%`;
      try {
        const res = await pgPool.query(
          `SELECT name, type, item_type, rarity, requires_attunement, cost, weight,
                  has_charges, number_of_charges, charge_reset_condition,
                  description_text, avatar_url, source, source_page
           FROM magic_items WHERE name ILIKE $1 LIMIT 3`, [pattern]);
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
      const results = await searchEmbeddings(openaiClient, args.query, { limit: 6, minScore: 0.3, includeDmOnly: isDM });
      if (results.length === 0) return JSON.stringify({ found: false, message: "No reference material found" });
      const context = results.map(r => `## ${r.title}\n${r.chunk_text}`).join("\n\n---\n\n");
      return JSON.stringify({ found: true, content: context });
    }

    case "search_campaign_lore": {
      if (!openaiClient) return JSON.stringify({ found: false, message: "AI client not available for semantic search" });
      const searchOpts = { limit: 8, minScore: 0.25, includeDmOnly: isDM };
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

const SYSTEM_PROMPT_BASE = `You are the DM AI for "Halls of the Damned", a D&D 5th Edition campaign set in Barovia, hosted on KnoxRPG (https://hotd.knoxrpg.com).

You have tools to look up campaign and D&D data. ALWAYS use the appropriate tool before answering — do not guess or rely on general knowledge when a tool can provide accurate campaign-specific data.

## Tool Usage Guidelines
- When asked "who is [name]" or about a character by name: call BOTH \`lookup_npc\` AND \`get_player_character\` in parallel — the name could be either a PC or NPC. Use whichever returns a result.
- For "who is in <location>" or NPC searches by trait: use \`search_npcs\`.
- For "list the party" or "who are the player characters": use \`get_player_character\` with a broad name like "%" or a common term.
- For "what happened last session", "what happened recently", or session/event questions: use \`get_session_log\` WITHOUT a session_number to get the most recent sessions, then report from the HIGHEST session number returned. That is the latest session.
- For "what day is it", "what is the current date", or any time/calendar question: use \`get_calendar\` with NO parameters to get the current in-game date.
- For spell questions: use \`lookup_spell\`. For monster questions: use \`lookup_monster\`.
- For magic item questions: use \`lookup_magic_item\`. For campaign artifacts: use \`lookup_artifact\`.
- For player character questions: use \`get_player_character\`.
- For handouts or documents: use \`get_handout\`.
- For calendar events on a specific date: use \`get_calendar\` with a month number or query.
- For D&D rules, class features, conditions, or general lore: use \`search_dnd_reference\`.
- For campaign world-building, stat blocks, factions, realm info, or campaign notes: use \`search_campaign_lore\`.
- You may call multiple tools in parallel if the question requires data from different sources.
- When asked about an NPC, creature, or location: call BOTH \`lookup_npc\` AND \`search_campaign_lore\` in parallel to get the database profile AND any stat block or lore.

## Response Formatting
- Use markdown formatting (bold, headers, lists, tables). The chat client renders full markdown including images.
- Include links to KnoxRPG pages when tool data provides a URL (e.g. NPC profile link).

## Formatting by Content Type

### Spells
Format as a spell card:
- **Name** as header
- Level, School on one line (e.g., "3rd-level Evocation")
- **Casting Time / Range / Components / Duration** each on their own line, bolded label
- Area of effect if applicable
- Save type if applicable
- Description text
- "At Higher Levels" section if at_higher_levels is true
- Source citation at bottom (e.g., "Source: Player's Handbook, p. 241")

### NPCs
- Portrait image at top (if portrait_url exists)
- **Name** as header
- Race, Class, Alignment on one line
- **Location** and **Status** on their own lines
- Description paragraph
- Link to NPC profile page

### Session Logs
- **Session N: Title** as header
- Game date and play date
- Summary as bullet points for key events, not a wall of text

### Magic Items
- **Name** as header
- Type, Rarity, Attunement requirement
- Description
- Charges/reset if applicable
- Source citation

### Player Characters
- Avatar at top (if avatar_url exists)
- **Name** (played by Player Name) as header
- Level, Race, Class/Subclass
- Ability scores in a 6-column table
- AC, HP, Speed
- Key features and notable equipment
- Background summary

## Image Rules (STRICT)
- ONLY include an image if the tool result contains a non-null value in one of these fields: portrait_url, avatar_url, or image_url.
- If a tool result does NOT contain any of those fields, or the field is null/empty, do NOT include any image markdown.
- NEVER fabricate, guess, or construct image URLs. No image URL in the tool data means no image in the response.
- When an image URL IS present in tool data, display it using: \`![Name](url)\`

## Response Guidelines
- Be accurate, detailed, and conversational — answer like a knowledgeable DM at the table.
- When asked "tell me about" or "what is" something, give a thorough answer with all relevant details.
- Always cite the source (book name and page) when referencing official D&D rules.
- If a tool returns no results, say so honestly rather than guessing. You may supplement with general D&D knowledge from official sources, but explicitly note that it comes from general knowledge and not from the campaign's data. Never present general knowledge as if it came from a tool lookup.
- NEVER invent campaign facts. Only state what the tools return.`;

const SYSTEM_PROMPT_DM_ADDON = `

## Your Role — Dungeon Master Mode
You are speaking to the Dungeon Master (admin). You have full access to all campaign data, including hidden NPCs, DM notes, secret plot elements, and full monster stat blocks.

### Monster Stat Blocks (DM only)
Format as a standard 5e stat block:
- **Name** as header
- *Size Type, Alignment* in italics
- **Armor Class** (with type), **Hit Points** (with hit dice), **Speed**
- Ability scores in a 6-column table: STR | DEX | CON | INT | WIS | CHA
- Saving throws, skills, senses, languages, CR each on their own line
- Damage resistances/immunities/vulnerabilities and condition immunities
- Traits, Actions, Legendary Actions as bold-headed sections

### DM Notes
When NPC tool results include dm_notes, present them in a clearly labeled **DM Notes** section so they stand out from player-visible information.`;

const SYSTEM_PROMPT_PLAYER_ADDON = `

## Your Role — Player Mode
You are speaking to a player. Do not reveal:
- Hidden NPCs or NPCs the party has not encountered.
- DM notes or behind-the-screen information.
- Full monster stat blocks (AC, HP, exact ability scores, legendary actions).
- Secret plot points or upcoming story elements.

When asked about a monster, describe what the character might know based on common knowledge or relevant skill checks (Arcana, Nature, History, Religion). Frame it as in-world knowledge, not game mechanics. You may mention the creature's general type, size, and known behaviors, but do not provide AC, HP, ability scores, or other stat block details.`;

/**
 * Build the full system prompt for the given role and user context.
 */
function buildSystemPrompt(opts = {}) {
  let prompt = SYSTEM_PROMPT_BASE;
  if (opts.isDM) {
    prompt += SYSTEM_PROMPT_DM_ADDON;
  } else {
    prompt += SYSTEM_PROMPT_PLAYER_ADDON;
  }
  // Add user identity
  if (opts.isDM) {
    prompt += `\n\n## Current User\nYou are speaking with the Dungeon Master. Address them directly and provide full behind-the-screen information when relevant.`;
  } else if (opts.username) {
    prompt += `\n\n## Current User\nYou are speaking with ${opts.username}. Answer from an in-world perspective where appropriate.`;
  }
  return prompt;
}

// Keep the old export name for backward compat
const SYSTEM_PROMPT_WITH_TOOLS = SYSTEM_PROMPT_BASE;

// ── Max tool-call rounds to prevent infinite loops ───────────
const MAX_TOOL_ROUNDS = 5;

/**
 * Run the OpenAI chat completion loop with function calling.
 *
 * @param {object} openaiClient - The OpenAI SDK client
 * @param {string} model - Model name
 * @param {object[]} userMessages - Array of {role, content} from the user
 * @param {object} opts - { maxTokens, temperature, isDM, username, userId }
 * @returns {{ reply: string, _debug: object }}
 */
async function chatWithTools(openaiClient, model, userMessages, opts = {}) {
  const isDM = opts.isDM || false;
  const maxTokens = opts.maxTokens || (isDM ? 4096 : 2048);
  const temperature = opts.temperature != null ? opts.temperature : 0.7;

  const systemPrompt = buildSystemPrompt(opts);

  const debug = {
    model, maxTokens, temperature, isDM,
    toolCalls: [],
    totalRounds: 0,
    systemPromptLength: systemPrompt.length,
  };

  const chatMessages = [
    { role: "system", content: systemPrompt },
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
          result = await executeTool(fnName, fnArgs, openaiClient, isDM);
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


module.exports = { toolDefinitions, executeTool, chatWithTools, buildSystemPrompt, SYSTEM_PROMPT_WITH_TOOLS };
