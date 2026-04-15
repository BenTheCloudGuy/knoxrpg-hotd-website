// ══════════════════════════════════════════════════════════════
// ── ADMIN API TEST ROUTES (admin-only) ────────────────────────
// ══════════════════════════════════════════════════════════════

const { pgPool } = require("../db/pool");
const { readBody, sendJSON } = require("../lib/utils");
const { searchCampaign, buildRagContext } = require("../lib/search");
const azure = require("../lib/azure");
const { renderApiTestPage } = require("../pages/api-test");

/**
 * Handle admin API test routes. Returns true if handled, false otherwise.
 * ALL routes require admin session.
 */
async function handleAdminTestRoutes(decoded, req, res, session, url) {

  // ── Admin gate for all /api/admin/* routes ─────────────────
  if (!decoded.startsWith("/api/admin/") && decoded !== "/api-test/admin") return false;
  if (!session || session.role !== "admin") {
    if (decoded === "/api-test/admin") {
      res.writeHead(302, { Location: "/login" }); res.end(); return true;
    }
    sendJSON(res, { error: "Unauthorized. Admin access required." }, 401);
    return true;
  }

  // ── API Test Console page ──────────────────────────────────
  if (decoded === "/api-test/admin") {
    const html = renderApiTestPage(session);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return true;
  }

  // ══════════════════════════════════════════════════════════
  // ── TEST CHAT ENDPOINT ────────────────────────────────────
  // ══════════════════════════════════════════════════════════
  if (decoded === "/api/admin/test-chat" && req.method === "POST") {
    if (!azure.openaiClient) return sendJSON(res, { error: "OpenAI client not initialized. No API key configured." }, 503), true;

    try {
      const body = await readBody(req);
      const { messages, params } = JSON.parse(body);
      const userMessages = (messages || []).slice(-10).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content).slice(0, 4000),
      }));

      const model = (params && params.model) || azure.aiModel;
      const maxTokens = (params && params.max_tokens) || 2048;
      const temperature = (params && params.temperature != null) ? params.temperature : 0.7;

      // ── Build campaign context from DB ─────────────────────
      const debug = { model, maxTokens, temperature, systemPromptLength: 0, ragContextLength: 0, campaignContextLength: 0, dbQueries: {} };
      let campaignContext = "";
      try {
        const [pcRes, npcRes, sessRes, artRes, handRes] = await Promise.all([
          pgPool.query("SELECT character_name, player_name, race, class_summary, subclass, level, alignment, backstory, personality_traits, ideals, bonds, flaws FROM hotd_player_characters ORDER BY character_name"),
          pgPool.query("SELECT id, name, race, npc_class, location, status, alignment_tag, description, portrait_url FROM hotd_npcs ORDER BY sort_order, name"),
          pgPool.query("SELECT session_number, title, summary, game_date FROM hotd_sessions ORDER BY session_number"),
          pgPool.query("SELECT name, rarity, description, lore, is_legendary, owner FROM hotd_artifacts ORDER BY name"),
          pgPool.query("SELECT name, description, about FROM hotd_handouts ORDER BY name"),
        ]);

        debug.dbQueries = {
          playerCharacters: pcRes.rows.length,
          npcs: npcRes.rows.length,
          sessions: sessRes.rows.length,
          artifacts: artRes.rows.length,
          handouts: handRes.rows.length,
        };

        const parts = [];
        if (pcRes.rows.length > 0) {
          parts.push("## Player Characters\n" + pcRes.rows.map(c => {
            let entry = `- **${c.character_name}** (${c.race} ${c.class_summary}${c.subclass ? "/" + c.subclass : ""}, Level ${c.level})`;
            if (c.player_name) entry += ` — played by ${c.player_name}`;
            if (c.alignment) entry += ` [${c.alignment}]`;
            if (c.backstory) entry += `\n  Backstory: ${c.backstory.slice(0, 300)}`;
            return entry;
          }).join("\n"));
        }
        if (npcRes.rows.length > 0) {
          parts.push("## Notable NPCs\n" + npcRes.rows.map(n => {
            let entry = `- **${n.name}** (ID: ${n.id})`;
            if (n.race) entry += ` (${n.race}${n.npc_class ? " " + n.npc_class : ""})`;
            if (n.location) entry += ` — ${n.location}`;
            if (n.status && n.status !== "Unknown") entry += ` [${n.status}]`;
            if (n.portrait_url) entry += `\n  Portrait: ${n.portrait_url}`;
            if (n.description) entry += `\n  ${n.description.slice(0, 200)}`;
            entry += `\n  Profile: https://hotd.knoxrpg.com/npcs/${n.id}`;
            return entry;
          }).join("\n"));
        }
        if (sessRes.rows.length > 0) {
          parts.push("## Session Logs\n" + sessRes.rows.map(s => {
            let entry = `- **Session ${s.session_number}: ${s.title}**`;
            if (s.game_date) entry += ` (${s.game_date})`;
            if (s.summary) entry += `\n  ${s.summary.slice(0, 400)}`;
            return entry;
          }).join("\n"));
        }
        if (artRes.rows.length > 0) {
          parts.push("## Artifacts & Items\n" + artRes.rows.map(a => {
            let entry = `- **${a.name}** [${a.rarity}${a.is_legendary ? ", Legendary" : ""}]`;
            if (a.owner) entry += ` — owned by ${a.owner}`;
            if (a.description) entry += `\n  ${a.description.slice(0, 200)}`;
            if (a.lore) entry += `\n  Lore: ${a.lore.slice(0, 200)}`;
            return entry;
          }).join("\n"));
        }
        if (handRes.rows.length > 0) {
          parts.push("## Handouts\n" + handRes.rows.map(h => {
            let entry = `- **${h.name}**`;
            if (h.description) entry += `: ${h.description.slice(0, 200)}`;
            if (h.about) entry += `\n  ${h.about.slice(0, 200)}`;
            return entry;
          }).join("\n"));
        }
        if (parts.length > 0) campaignContext = "\n\n# Campaign Data\n" + parts.join("\n\n");
      } catch (ctxErr) {
        debug.campaignContextError = ctxErr.message;
      }

      const systemPrompt = `You are the DM AI for "Halls of the Damned", a D&D 5th Edition campaign hosted on KnoxRPG.

Your primary knowledge comes from the campaign data and reference material below. When answering questions about characters, NPCs, sessions, artifacts, handouts, or campaign events, always use the Campaign Data first. For D&D rules, spells, monsters, items, and lore, use the Reference Material. You may link to relevant pages on the site using markdown links to https://hotd.knoxrpg.com/<path>.

Be accurate, concise, and in-character as a knowledgeable Dungeon Master. If unsure about campaign-specific details, say so rather than guessing. Format using markdown.${campaignContext}`;

      // ── RAG context ────────────────────────────────────────
      let ragContext = "";
      const lastUserMsg = userMessages.filter(m => m.role === "user").pop();
      if (lastUserMsg) {
        ragContext = await buildRagContext(lastUserMsg.content);
      }

      const chatMessages = [{ role: "system", content: systemPrompt }];
      if (ragContext) {
        chatMessages.push({ role: "system", content: `# Reference Material (from D&D books, rules, and indexed content)\n\n${ragContext}` });
      }

      chatMessages.push({ role: "system", content: `# MANDATORY Response Formatting

You MUST follow these formatting rules exactly based on what the user is asking about.

## SPELL Queries
When the user asks about ANY spell, format your response EXACTLY like this example:

**Fireball** — Level 3 Evocation

| | |
|---|---|
| **Casting Time** | 1 action |
| **Range** | 150 feet (20-ft sphere) |
| **Components** | V, S, M (a tiny ball of bat guano and sulfur) |
| **Duration** | Instantaneous |

A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame...

*Source: Player's Handbook, p. 241*

[Browse Spells on KnoxRPG](https://web.knoxrpg.com/spells)

RULES: Include ALL spell fields from the Reference Material. The source book and page number MUST appear. The LAST line MUST be a link to the spell browse page: \`https://web.knoxrpg.com/spells\`.

## NPC Queries
When the user asks about ANY NPC, format your response EXACTLY like this example:

![Ireena Kolyana](https://hotd.knoxrpg.com/images/ireena-kolyana.png)

**Ireena Kolyana** — Human Noble / Fighter

| | |
|---|---|
| **Location** | Village of Barovia |
| **Status** | Alive |

Ireena Kolyana is the adopted daughter of the late Burgomaster Kolyan Indirovich...

[View Ireena Kolyana's Full Profile](https://hotd.knoxrpg.com/npcs/42)

RULES: The portrait image MUST be the first line (use the Portrait URL from Campaign Data). Include Name, Race, Class/Role, Location, Status. Draw from NPC page, books, AND campaign session summaries. The LAST line MUST link to the NPC's detail page: \`https://hotd.knoxrpg.com/npcs/<npc_id>\` using the NPC's ID from Campaign Data.

## Advice / Rules Queries
When the user asks for rulings or advice:
1. Cite **Sage Advice** first if an official ruling exists
2. Then cite the **rulebook** with page number
3. If neither covers it, give your DM interpretation and clearly label it as such` });

      chatMessages.push(...userMessages);

      debug.systemPromptLength = systemPrompt.length;
      debug.campaignContextLength = campaignContext.length;
      debug.ragContextLength = ragContext.length;
      debug.totalMessages = chatMessages.length;
      debug.systemMessages = chatMessages.filter(m => m.role === "system").map(m => ({
        role: m.role,
        contentLength: m.content.length,
        preview: m.content.slice(0, 200) + (m.content.length > 200 ? "..." : ""),
      }));

      const t0 = Date.now();
      const completion = await azure.openaiClient.chat.completions.create({
        model, messages: chatMessages, max_tokens: maxTokens, temperature,
      });
      const elapsed = Date.now() - t0;

      const reply = completion.choices[0]?.message?.content || "I don't have a response for that.";
      debug.openaiLatencyMs = elapsed;
      debug.usage = completion.usage || {};
      debug.finishReason = completion.choices[0]?.finish_reason;

      sendJSON(res, { reply, _debug: debug });
      return true;
    } catch (err) {
      console.error("Admin test-chat error:", err);
      sendJSON(res, { error: err.message || "Chat request failed." }, 500);
      return true;
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── TEST SEARCH ENDPOINT ──────────────────────────────────
  // ══════════════════════════════════════════════════════════
  if (decoded === "/api/admin/test-search" && req.method === "GET") {
    const q = url.searchParams.get("q") || "";
    const limit = parseInt(url.searchParams.get("limit") || "20", 10);
    const source = url.searchParams.get("source") || "all";

    if (!q || q.length < 2) {
      return sendJSON(res, { error: "Query must be at least 2 characters.", results: [], total: 0 }), true;
    }

    const debug = { query: q, limit, source, sources: {} };
    const allResults = [];

    try {
      // ── Local static index ───────────────────────────────
      if (source === "all" || source === "local") {
        const localData = await searchCampaign(q);
        debug.sources.local = { count: localData.results.length };
        for (const r of localData.results) {
          allResults.push({ ...r, _source: "local" });
        }
      }

      // ── Database search ──────────────────────────────────
      if (source === "all" || source === "db") {
        const pattern = `%${q}%`;
        const dbResults = [];

        const [npcRes, sessRes, artRes, handRes, pcRes] = await Promise.all([
          pgPool.query("SELECT id, name, race, npc_class, location, description FROM hotd_npcs WHERE name ILIKE $1 OR description ILIKE $1 OR location ILIKE $1 LIMIT $2", [pattern, limit]),
          pgPool.query("SELECT session_number, title, summary FROM hotd_sessions WHERE title ILIKE $1 OR summary ILIKE $1 LIMIT $2", [pattern, limit]),
          pgPool.query("SELECT id, name, rarity, description FROM hotd_artifacts WHERE name ILIKE $1 OR description ILIKE $1 LIMIT $2", [pattern, limit]),
          pgPool.query("SELECT id, name, description FROM hotd_handouts WHERE name ILIKE $1 OR description ILIKE $1 LIMIT $2", [pattern, limit]),
          pgPool.query("SELECT id, character_name, race, class_summary, player_name FROM hotd_player_characters WHERE character_name ILIKE $1 OR player_name ILIKE $1 LIMIT $2", [pattern, limit]),
        ]);

        for (const n of npcRes.rows) {
          dbResults.push({ title: n.name, href: `/npcs/${n.id}`, category: "NPC", body: [n.race, n.npc_class, n.location].filter(Boolean).join(" · ") + (n.description ? " — " + n.description.slice(0, 150) : ""), score: 80, _source: "db" });
        }
        for (const s of sessRes.rows) {
          dbResults.push({ title: `Session ${s.session_number}: ${s.title}`, href: "/sessions", category: "Session", body: (s.summary || "").slice(0, 200), score: 70, _source: "db" });
        }
        for (const a of artRes.rows) {
          dbResults.push({ title: a.name, href: `/artifacts/${a.id}`, category: "Artifact", body: `[${a.rarity}] ${(a.description || "").slice(0, 150)}`, score: 60, _source: "db" });
        }
        for (const h of handRes.rows) {
          dbResults.push({ title: h.name, href: `/handouts/${h.id}`, category: "Handout", body: (h.description || "").slice(0, 150), score: 50, _source: "db" });
        }
        for (const c of pcRes.rows) {
          dbResults.push({ title: c.character_name, href: `/characters/${c.id}`, category: "PC", body: [c.race, c.class_summary, c.player_name ? `Player: ${c.player_name}` : ""].filter(Boolean).join(" · "), score: 75, _source: "db" });
        }

        // D&D reference tables (optional, may not exist)
        try {
          const spRes = await pgPool.query("SELECT name, level, school FROM spells WHERE name ILIKE $1 LIMIT $2", [pattern, limit]);
          for (const s of spRes.rows) {
            dbResults.push({ title: s.name, href: "/dungeon-master", category: "Spell", body: `Level ${s.level} ${s.school}`, score: 65, _source: "db" });
          }
        } catch (_) {}

        try {
          const mRes = await pgPool.query("SELECT name, type, challenge_rating_display FROM monsters WHERE name ILIKE $1 LIMIT $2", [pattern, limit]);
          for (const m of mRes.rows) {
            dbResults.push({ title: m.name, href: "/dungeon-master", category: "Monster", body: `${m.type} — CR ${m.challenge_rating_display || "?"}`, score: 65, _source: "db" });
          }
        } catch (_) {}

        try {
          const miRes = await pgPool.query("SELECT name, rarity FROM magic_items WHERE name ILIKE $1 LIMIT $2", [pattern, limit]);
          for (const mi of miRes.rows) {
            dbResults.push({ title: mi.name, href: "/dungeon-master", category: "Magic Item", body: mi.rarity || "", score: 55, _source: "db" });
          }
        } catch (_) {}

        debug.sources.db = {
          npcs: npcRes.rows.length, sessions: sessRes.rows.length,
          artifacts: artRes.rows.length, handouts: handRes.rows.length,
          pcs: pcRes.rows.length, total: dbResults.length,
        };

        // Merge: deduplicate by title (DB results preferred over local for same title)
        const existingTitles = new Set(allResults.map(r => r.title.toLowerCase()));
        for (const r of dbResults) {
          if (!existingTitles.has(r.title.toLowerCase())) {
            allResults.push(r);
            existingTitles.add(r.title.toLowerCase());
          }
        }
      }

      // Sort by score descending
      allResults.sort((a, b) => (b.score || 0) - (a.score || 0));
      const results = allResults.slice(0, limit);

      sendJSON(res, { results, total: results.length, _debug: debug });
      return true;
    } catch (err) {
      console.error("Admin test-search error:", err);
      sendJSON(res, { error: err.message || "Search failed.", results: [], total: 0 });
      return true;
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── TEST IMAGE GENERATION ENDPOINT ────────────────────────
  // ══════════════════════════════════════════════════════════
  if (decoded === "/api/admin/test-image" && req.method === "POST") {
    if (!azure.openaiClient) return sendJSON(res, { error: "OpenAI client not initialized." }, 503), true;

    try {
      const body = await readBody(req);
      const { prompt, size, quality, style } = JSON.parse(body);

      if (!prompt || prompt.length < 5) {
        return sendJSON(res, { error: "Prompt must be at least 5 characters." }, 400), true;
      }

      const t0 = Date.now();
      const response = await azure.openaiClient.images.generate({
        model: "dall-e-3",
        prompt: String(prompt).slice(0, 4000),
        n: 1,
        size: size || "1024x1024",
        quality: quality || "standard",
        style: style || "vivid",
        response_format: "b64_json",
      });
      const elapsed = Date.now() - t0;

      const imageData = response.data[0];
      sendJSON(res, {
        image_b64: imageData.b64_json,
        revised_prompt: imageData.revised_prompt || "",
        _debug: {
          model: "dall-e-3",
          size: size || "1024x1024",
          quality: quality || "standard",
          style: style || "vivid",
          latencyMs: elapsed,
          promptLength: prompt.length,
        },
      });
      return true;
    } catch (err) {
      console.error("Admin test-image error:", err);
      sendJSON(res, { error: err.message || "Image generation failed." }, 500);
      return true;
    }
  }

  return false;
}

module.exports = { handleAdminTestRoutes };
