// ══════════════════════════════════════════════════════════════
// ── API ROUTES ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

const path = require("path");
const { pgPool } = require("../db/pool");
const { readBody, parseForm, sendJSON } = require("../lib/utils");
const { searchCampaign, buildRagContext } = require("../lib/search");
const azure = require("../lib/azure");

/**
 * Handle API routes. Returns true if the route was handled, false otherwise.
 */
async function handleApiRoutes(decoded, req, res, session, url) {

  // ── Chat API ───────────────────────────────────────────────
  if (decoded === "/api/chat" && req.method === "POST") {
    if (!azure.openaiClient) return sendJSON(res, { error: "Chat is not configured. No AI backend available." }, 503), true;
    try {
      const body = await readBody(req);
      const { messages } = JSON.parse(body);
      const userMessages = (messages || []).slice(-10).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 2000),
      }));

      // ── Build campaign context from DB ───────────────────
      let campaignContext = "";
      try {
        const [pcRes, npcRes, sessRes, artRes, handRes] = await Promise.all([
          pgPool.query("SELECT character_name, player_name, race, class_summary, subclass, level, alignment, backstory, personality_traits, ideals, bonds, flaws FROM hotd_player_characters ORDER BY character_name"),
          pgPool.query("SELECT id, name, race, npc_class, location, status, alignment_tag, description, portrait_url FROM hotd_npcs ORDER BY sort_order, name"),
          pgPool.query("SELECT session_number, title, summary, game_date FROM hotd_sessions ORDER BY session_number"),
          pgPool.query("SELECT name, rarity, description, lore, is_legendary, owner FROM hotd_artifacts ORDER BY name"),
          pgPool.query("SELECT name, description, about FROM hotd_handouts ORDER BY name"),
        ]);

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
        console.warn("Campaign context fetch failed:", ctxErr.message);
      }

      const systemPrompt = `You are the DM AI for "Halls of the Damned", a D&D 5th Edition campaign hosted on KnoxRPG.

Your primary knowledge comes from the campaign data and reference material below. When answering questions about characters, NPCs, sessions, artifacts, handouts, or campaign events, always use the Campaign Data first. For D&D rules, spells, monsters, items, and lore, use the Reference Material. You may link to relevant pages on the site using markdown links to https://hotd.knoxrpg.com/<path>.

Be accurate, concise, and in-character as a knowledgeable Dungeon Master. If unsure about campaign-specific details, say so rather than guessing. Format using markdown.${campaignContext}`;

      // ── Fetch RAG context for the latest user message ──────
      let ragContext = "";
      const lastUserMsg = userMessages.filter(m => m.role === "user").pop();
      if (lastUserMsg) {
        ragContext = await buildRagContext(lastUserMsg.content);
      }

      const chatMessages = [{ role: "system", content: systemPrompt }];
      if (ragContext) {
        chatMessages.push({ role: "system", content: `# Reference Material (from D&D books, rules, and indexed content)\n\n${ragContext}` });
      }

      // ── Response format rules (placed last for maximum LLM attention) ──
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

      const completion = await azure.openaiClient.chat.completions.create({
        model: azure.aiModel,
        messages: chatMessages,
        max_tokens: 2048, temperature: 0.7,
      });
      const reply = completion.choices[0]?.message?.content || "I don't have a response for that.";
      sendJSON(res, { reply });
      return true;
    } catch (err) {
      console.error("Chat error:", err);
      sendJSON(res, { error: "An error occurred while generating a response." }, 500);
      return true;
    }
  }

  // ── Search API ─────────────────────────────────────────────
  if (decoded === "/api/search" && req.method === "GET") {
    const q = url.searchParams.get("q") || "";
    try {
      const results = await searchCampaign(q);
      sendJSON(res, results);
    } catch (err) {
      console.error("Search error:", err);
      sendJSON(res, { results: [], total: 0 });
    }
    return true;
  }

  // ── Adventure Journal: list entries (one per date) ─────────
  if (decoded === "/api/journal" && req.method === "GET" && session) {
    const since = url.searchParams.get("since");
    try {
      let rows;
      if (since) {
        const r = await pgPool.query(
          "SELECT DISTINCT ON (actual_date) * FROM hotd_adventure_journal WHERE updated_at > $1 ORDER BY actual_date DESC, updated_at DESC",
          [since]
        );
        rows = r.rows;
      } else {
        const r = await pgPool.query(
          "SELECT DISTINCT ON (actual_date) * FROM hotd_adventure_journal ORDER BY actual_date DESC, updated_at DESC"
        );
        rows = r.rows;
      }
      sendJSON(res, { entries: rows, ts: new Date().toISOString() });
    } catch (err) {
      console.error("Journal list error:", err);
      sendJSON(res, { error: "Failed to load journal." }, 500);
    }
    return true;
  }

  // ── Adventure Journal: save (create or update) ────────────
  if (decoded === "/api/journal/save" && req.method === "POST" && session) {
    try {
      const body = await readBody(req);
      const { actual_date, world_date, body: entryBody } = JSON.parse(body);
      if (!actual_date || typeof entryBody !== "string") {
        sendJSON(res, { error: "actual_date and body are required." }, 400);
        return true;
      }
      const authorName = (session.firstName && session.lastName)
        ? `${session.firstName} ${session.lastName}`
        : session.username;
      // Shared model: one entry per date (any user can edit)
      const existing = await pgPool.query(
        "SELECT id FROM hotd_adventure_journal WHERE actual_date = $1 ORDER BY updated_at DESC LIMIT 1",
        [actual_date]
      );
      let result;
      if (existing.rows.length > 0) {
        result = await pgPool.query(
          `UPDATE hotd_adventure_journal
           SET body = $1, world_date = COALESCE(NULLIF($2, ''), world_date),
               author_name = $3, user_id = $4, updated_at = NOW()
           WHERE id = $5 RETURNING *`,
          [entryBody, world_date || "", authorName, session.userId, existing.rows[0].id]
        );
      } else {
        result = await pgPool.query(
          `INSERT INTO hotd_adventure_journal (actual_date, world_date, user_id, author_name, body)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [actual_date, world_date || "", session.userId, authorName, entryBody]
        );
      }
      sendJSON(res, { entry: result.rows[0] });
    } catch (err) {
      console.error("Journal save error:", err);
      sendJSON(res, { error: "Failed to save journal entry." }, 500);
    }
    return true;
  }

  // ── Adventure Journal: delete entry ────────────────────────
  if (decoded === "/api/journal/delete" && req.method === "POST" && session) {
    try {
      const body = await readBody(req);
      const { id } = JSON.parse(body);
      if (!id) { sendJSON(res, { error: "id required" }, 400); return true; }
      if (session.role === "admin") {
        await pgPool.query("DELETE FROM hotd_adventure_journal WHERE id = $1", [id]);
      } else {
        await pgPool.query("DELETE FROM hotd_adventure_journal WHERE id = $1 AND user_id = $2", [id, session.userId]);
      }
      sendJSON(res, { success: true });
    } catch (err) {
      console.error("Journal delete error:", err);
      sendJSON(res, { error: "Failed to delete." }, 500);
    }
    return true;
  }

  // ── Adventure Journal: entity dictionary for autocomplete ──
  if (decoded === "/api/journal/entities" && req.method === "GET" && session) {
    try {
      const entities = [];
      // NPCs from HOTD (include all for autocomplete, even hidden)
      const npcRes = await pgPool.query("SELECT name, race, npc_class, location, status, description FROM hotd_npcs ORDER BY name");
      const locationSet = new Set();
      for (const n of npcRes.rows) {
        entities.push({ name: n.name, type: "NPC", detail: [n.race, n.npc_class, n.location].filter(Boolean).join(" · "), description: (n.description || "").slice(0, 200) });
        // Extract locations from NPC location fields
        if (n.location) {
          const parts = n.location.split(/[,;]/).map(s => s.replace(/\(.*?\)/g, "").trim()).filter(Boolean);
          for (const p of parts) if (p.length > 2) locationSet.add(p);
        }
      }
      // Locations from maps
      try {
        const mapRes = await pgPool.query("SELECT name, description FROM hotd_maps ORDER BY name");
        for (const m of mapRes.rows) {
          locationSet.add(m.name);
          if (m.description) entities.push({ name: m.name, type: "Location", detail: "Map", description: (m.description || "").slice(0, 200) });
        }
      } catch (_) {}
      // Locations from calendar events
      try {
        const calRes = await pgPool.query("SELECT DISTINCT title FROM hotd_calendar_events WHERE title != '' ORDER BY title");
        for (const c of calRes.rows) {
          if (c.title && c.title.length > 3) locationSet.add(c.title);
        }
      } catch (_) {}
      // Add deduplicated locations (skip if already an entity name)
      const entityNames = new Set(entities.map(e => e.name.toLowerCase()));
      for (const loc of locationSet) {
        if (!entityNames.has(loc.toLowerCase())) {
          entities.push({ name: loc, type: "Location", detail: "Campaign Location", description: "" });
          entityNames.add(loc.toLowerCase());
        }
      }
      // Artifacts from HOTD
      const artRes = await pgPool.query("SELECT name, rarity, description FROM hotd_artifacts ORDER BY name");
      for (const a of artRes.rows) {
        entities.push({ name: a.name, type: "Artifact", detail: a.rarity || "", description: (a.description || "").slice(0, 200) });
      }
      // Player Characters from HOTD
      const pcRes = await pgPool.query("SELECT character_name, race, class_summary, player_name FROM hotd_player_characters ORDER BY character_name");
      for (const c of pcRes.rows) {
        entities.push({ name: c.character_name, type: "PC", detail: [c.race, c.class_summary].filter(Boolean).join(" · "), description: c.player_name ? `Played by ${c.player_name}` : "" });
      }
      // Spells from main DB
      try {
        const spRes = await pgPool.query("SELECT name, level, school FROM spells ORDER BY name LIMIT 500");
        for (const s of spRes.rows) {
          entities.push({ name: s.name, type: "Spell", detail: [s.school, s.level != null ? `Level ${s.level}` : ""].filter(Boolean).join(" · "), description: "" });
        }
      } catch (_) {}
      // Monsters from main DB
      try {
        const mRes = await pgPool.query("SELECT name, type, challenge_rating_display FROM monsters ORDER BY name LIMIT 500");
        for (const m of mRes.rows) {
          entities.push({ name: m.name, type: "Monster", detail: [m.type, m.challenge_rating_display ? `CR ${m.challenge_rating_display}` : ""].filter(Boolean).join(" · "), description: "" });
        }
      } catch (_) {}
      // Magic Items from main DB
      try {
        const miRes = await pgPool.query("SELECT name, rarity FROM magic_items ORDER BY name LIMIT 500");
        for (const mi of miRes.rows) {
          entities.push({ name: mi.name, type: "Magic Item", detail: mi.rarity || "", description: "" });
        }
      } catch (_) {}
      sendJSON(res, { entities });
    } catch (err) {
      console.error("Entity fetch error:", err);
      sendJSON(res, { entities: [] });
    }
    return true;
  }

  // ── Add journal entry ──────────────────────────────────────
  if (decoded === "/api/character-journal/add" && req.method === "POST" && session) {
    const body = await readBody(req); const form = parseForm(body);
    const charIdJ = parseInt(form.characterId, 10);
    if (isNaN(charIdJ)) { res.writeHead(400); res.end("Bad request"); return true; }
    let allowed = session.role === "admin";
    if (!allowed) {
      try {
        const ar = await pgPool.query("SELECT can_add_journal FROM hotd_character_access WHERE character_id = $1 AND user_id = $2", [charIdJ, session.userId]);
        if (ar.rows.length > 0 && ar.rows[0].can_add_journal) allowed = true;
      } catch (_) {}
    }
    if (!allowed) { res.writeHead(403); res.end("Forbidden"); return true; }
    try {
      await pgPool.query("INSERT INTO hotd_character_journal (character_id, user_id, title, body) VALUES ($1, $2, $3, $4)", [charIdJ, session.userId, form.title || "", form.body || ""]);
    } catch (e) { console.error("Add journal:", e.message); }
    res.writeHead(302, { Location: "/characters/" + charIdJ }); res.end();
    return true;
  }

  // ── Delete journal entry ───────────────────────────────────
  if (decoded === "/api/character-journal/delete" && req.method === "POST" && session) {
    const body = await readBody(req); const form = parseForm(body);
    const jId = parseInt(form.journalId, 10);
    const charIdJ = parseInt(form.characterId, 10);
    if (isNaN(jId) || isNaN(charIdJ)) { res.writeHead(400); res.end("Bad request"); return true; }
    try {
      if (session.role === "admin") {
        await pgPool.query("DELETE FROM hotd_character_journal WHERE id = $1", [jId]);
      } else {
        await pgPool.query("DELETE FROM hotd_character_journal WHERE id = $1 AND user_id = $2", [jId, session.userId]);
      }
    } catch (e) { console.error("Delete journal:", e.message); }
    res.writeHead(302, { Location: "/characters/" + charIdJ }); res.end();
    return true;
  }

  // ── Grant character access (admin only) ────────────────────
  if (decoded === "/api/character-access/add" && req.method === "POST" && session && session.role === "admin") {
    const body = await readBody(req); const form = parseForm(body);
    const charIdA = parseInt(form.characterId, 10);
    const userIdA = parseInt(form.userId, 10);
    if (isNaN(charIdA) || isNaN(userIdA)) { res.writeHead(400); res.end("Bad request"); return true; }
    try {
      await pgPool.query(
        `INSERT INTO hotd_character_access (character_id, user_id, can_update_ddb, can_add_journal) VALUES ($1, $2, $3, $4) ON CONFLICT (character_id, user_id) DO UPDATE SET can_update_ddb = $3, can_add_journal = $4`,
        [charIdA, userIdA, form.can_update_ddb === "true", form.can_add_journal === "true"]
      );
    } catch (e) { console.error("Grant access:", e.message); }
    res.writeHead(302, { Location: "/characters/" + charIdA }); res.end();
    return true;
  }

  // ── Toggle character access field (admin only) ─────────────
  if (decoded === "/api/character-access/toggle" && req.method === "POST" && session && session.role === "admin") {
    const body = await readBody(req); const form = parseForm(body);
    const charIdA = parseInt(form.characterId, 10);
    const userIdA = parseInt(form.userId, 10);
    const field = form.field;
    if (isNaN(charIdA) || isNaN(userIdA) || !["can_update_ddb", "can_add_journal"].includes(field)) { res.writeHead(400); res.end("Bad request"); return true; }
    const newVal = form.current === "true" ? false : true;
    try {
      await pgPool.query(`UPDATE hotd_character_access SET ${field} = $1 WHERE character_id = $2 AND user_id = $3`, [newVal, charIdA, userIdA]);
    } catch (e) { console.error("Toggle access:", e.message); }
    res.writeHead(302, { Location: "/characters/" + charIdA }); res.end();
    return true;
  }

  // ── Remove character access (admin only) ───────────────────
  if (decoded === "/api/character-access/remove" && req.method === "POST" && session && session.role === "admin") {
    const body = await readBody(req); const form = parseForm(body);
    const charIdA = parseInt(form.characterId, 10);
    const userIdA = parseInt(form.userId, 10);
    if (isNaN(charIdA) || isNaN(userIdA)) { res.writeHead(400); res.end("Bad request"); return true; }
    try { await pgPool.query("DELETE FROM hotd_character_access WHERE character_id = $1 AND user_id = $2", [charIdA, userIdA]); } catch (e) { console.error("Remove access:", e.message); }
    res.writeHead(302, { Location: "/characters/" + charIdA }); res.end();
    return true;
  }

  // ── Bulk Upload API (admin only, JSON body) ─────────────────
  if (decoded.startsWith("/api/bulk-upload/") && req.method === "POST") {
    if (!session || session.role !== "admin") return sendJSON(res, { error: "Forbidden" }, 403), true;
    const entity = decoded.split("/api/bulk-upload/")[1];
    if (!["npcs", "artifacts", "handouts"].includes(entity)) return sendJSON(res, { error: "Unknown entity: " + entity }, 400), true;
    try {
      const body = await readBody(req);
      const items = JSON.parse(body);
      if (!Array.isArray(items) || items.length === 0) return sendJSON(res, { error: "Request body must be a non-empty JSON array." }, 400), true;
      let inserted = 0;
      if (entity === "npcs") {
        for (const n of items) {
          if (!n.name) continue;
          await pgPool.query(
            `INSERT INTO hotd_npcs (name,race,npc_class,location,status,alignment_tag,portrait_url,description,sort_order,is_hidden) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [n.name, n.race||"", n.npc_class||"", n.location||"", n.status||"Unknown", n.alignment_tag||"neutral", n.portrait_url||"", n.description||"", parseInt(n.sort_order)||0, n.is_hidden !== false]
          );
          inserted++;
        }
      } else if (entity === "artifacts") {
        for (const a of items) {
          if (!a.name) continue;
          await pgPool.query(
            `INSERT INTO hotd_artifacts (name,rarity,image_url,description,lore,is_legendary,owner) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [a.name, a.rarity||"Unknown", a.image_url||"", a.description||"", a.lore||"", a.is_legendary===true, a.owner||""]
          );
          inserted++;
        }
      } else if (entity === "handouts") {
        for (const h of items) {
          if (!h.name) continue;
          await pgPool.query(
            `INSERT INTO hotd_handouts (name,image_url,description,about) VALUES ($1,$2,$3,$4)`,
            [h.name, h.image_url||"", h.description||"", h.about||""]
          );
          inserted++;
        }
      }
      sendJSON(res, { success: true, entity, inserted, total: items.length });
      return true;
    } catch (err) {
      console.error("Bulk upload error:", err);
      sendJSON(res, { error: "Bulk upload failed: " + err.message }, 500);
      return true;
    }
  }

  // ── Refresh character from DnD Beyond ──────────────────────
  if (decoded === "/api/character/refresh-ddb" && req.method === "POST" && session) {
    const body = await readBody(req); const form = parseForm(body);
    const charIdR = parseInt(form.characterId, 10);
    if (isNaN(charIdR)) { res.writeHead(400); res.end("Bad request"); return true; }
    let allowed = session.role === "admin";
    if (!allowed) {
      try {
        const ar = await pgPool.query("SELECT can_update_ddb FROM hotd_character_access WHERE character_id = $1 AND user_id = $2", [charIdR, session.userId]);
        if (ar.rows.length > 0 && ar.rows[0].can_update_ddb) allowed = true;
      } catch (_) {}
    }
    if (!allowed) { res.writeHead(403); res.end("Forbidden"); return true; }
    try {
      const { execFile } = require("child_process");
      const scriptPath = path.join(__dirname, "..", "..", "scripts", "extract-ddb-characters.js");
      execFile("node", [scriptPath], { timeout: 60000 }, (err, stdout, stderr) => {
        if (err) console.error("DDB refresh error:", err.message);
        if (stdout) console.log("DDB refresh:", stdout);
        if (stderr) console.error("DDB refresh stderr:", stderr);
      });
    } catch (e) { console.error("DDB refresh spawn:", e.message); }
    res.writeHead(302, { Location: "/characters/" + charIdR }); res.end();
    return true;
  }

  return false;
}

module.exports = { handleApiRoutes };
