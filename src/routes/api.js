// ══════════════════════════════════════════════════════════════
// ── API ROUTES ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

const path = require("path");
const { pgPool } = require("../db/pool");
const { readBody, parseForm, sendJSON } = require("../lib/utils");
const { searchCampaign, buildRagContext } = require("../lib/search");
const azure = require("../lib/azure");
const { chatWithTools } = require("../lib/ai-tools");

/**
 * Handle API routes. Returns true if the route was handled, false otherwise.
 */
async function handleApiRoutes(decoded, req, res, session, url) {

  // ── Chat API ───────────────────────────────────────────────
  if (decoded === "/api/chat" && req.method === "POST") {
    if (!session) return sendJSON(res, { error: "Please log in to use the DM AI." }, 401), true;
    if (!azure.openaiClient) return sendJSON(res, { error: "Chat is not configured. No AI backend available." }, 503), true;
    try {
      const body = await readBody(req);
      const { messages } = JSON.parse(body);
      const userMessages = (messages || []).slice(-10).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 2000),
      }));

      const isDM = session.role === 'admin';
      const { reply } = await chatWithTools(azure.openaiClient, azure.aiModel, userMessages, {
        isDM,
        username: session.firstName || session.username || 'Adventurer',
        userId: session.userId,
      });
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

  // ── Map Markers API ─────────────────────────────────────────
  if (decoded === "/api/map-markers" && req.method === "GET") {
    try {
      const r = await pgPool.query("SELECT id, marker_type, label, x, y, size FROM hotd_map_markers ORDER BY id");
      return sendJSON(res, { markers: r.rows.map(m => ({ id: m.id, type: m.marker_type, label: m.label, x: parseFloat(m.x), y: parseFloat(m.y), size: parseFloat(m.size) })) }), true;
    } catch (e) { return sendJSON(res, { error: e.message }, 500), true; }
  }
  if (decoded === "/api/map-markers" && req.method === "POST") {
    if (!session || session.role !== "admin") return sendJSON(res, { error: "Unauthorized" }, 403), true;
    try {
      const body = await readBody(req);
      const { marker_type, label, x, y, size } = JSON.parse(body);
      const validTypes = ["allied_werewolves", "barovia", "battle", "dusk_elves", "kezk", "party", "poi", "ravenkind", "strahd", "strahd_abbot", "strahd_demon_army", "strahd_werewolves", "villaki", "vistani"];
      if (!validTypes.includes(marker_type)) return sendJSON(res, { error: "Invalid marker type" }, 400), true;
      if (!label || typeof label !== "string") return sendJSON(res, { error: "Label is required" }, 400), true;
      const mSize = Math.max(10, Math.min(200, parseFloat(size) || 54));
      const r = await pgPool.query("INSERT INTO hotd_map_markers (marker_type, label, x, y, size) VALUES ($1, $2, $3, $4, $5) RETURNING id", [marker_type, String(label).slice(0, 200), parseFloat(x), parseFloat(y), mSize]);
      return sendJSON(res, { id: r.rows[0].id }), true;
    } catch (e) { return sendJSON(res, { error: e.message }, 500), true; }
  }
  if (decoded.startsWith("/api/map-markers/") && req.method === "PUT") {
    if (!session || session.role !== "admin") return sendJSON(res, { error: "Unauthorized" }, 403), true;
    const markerId = parseInt(decoded.split("/")[3], 10);
    if (isNaN(markerId)) return sendJSON(res, { error: "Invalid marker ID" }, 400), true;
    try {
      const body = await readBody(req);
      const updates = JSON.parse(body);
      const fields = [], vals = [];
      let idx = 1;
      if (updates.x !== undefined) { fields.push("x=$" + idx); vals.push(parseFloat(updates.x)); idx++; }
      if (updates.y !== undefined) { fields.push("y=$" + idx); vals.push(parseFloat(updates.y)); idx++; }
      if (updates.size !== undefined) { fields.push("size=$" + idx); vals.push(Math.max(10, Math.min(200, parseFloat(updates.size)))); idx++; }
      if (updates.label !== undefined) { fields.push("label=$" + idx); vals.push(String(updates.label).slice(0, 200)); idx++; }
      if (fields.length === 0) return sendJSON(res, { error: "No fields to update" }, 400), true;
      vals.push(markerId);
      await pgPool.query("UPDATE hotd_map_markers SET " + fields.join(",") + " WHERE id=$" + idx, vals);
      return sendJSON(res, { ok: true }), true;
    } catch (e) { return sendJSON(res, { error: e.message }, 500), true; }
  }
  if (decoded.startsWith("/api/map-markers/") && req.method === "DELETE") {
    if (!session || session.role !== "admin") return sendJSON(res, { error: "Unauthorized" }, 403), true;
    const markerId = parseInt(decoded.split("/")[3], 10);
    if (isNaN(markerId)) return sendJSON(res, { error: "Invalid marker ID" }, 400), true;
    try {
      await pgPool.query("DELETE FROM hotd_map_markers WHERE id = $1", [markerId]);
      return sendJSON(res, { ok: true }), true;
    } catch (e) { return sendJSON(res, { error: e.message }, 500), true; }
  }

  return false;
}

module.exports = { handleApiRoutes };
