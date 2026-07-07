// ══════════════════════════════════════════════════════════════
// ── API ROUTES ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

const path = require("path");
const { pgPool } = require("../db/pool");
const { readBody, parseForm, sendJSON } = require("../lib/utils");
const { searchCampaign, buildRagContext } = require("../lib/search");
const azure = require("../lib/azure");
const { chatWithTools } = require("../lib/ai-tools");
const { mapPcToActor, mapNpcToActor } = require("../lib/foundry-actors");

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

  // ── Foundry DM AI (RAG) bridge ─────────────────────────────
  // Token-authenticated, CORS-enabled endpoint so the FoundryVTT module
  // (hotd-website-integration) can query the campaign RAG from in-game chat
  // via the "DMAI <question>" command. The shared token and allowed origin
  // live in hotd_config (keys foundry_dmai_token / foundry_dmai_origin) so no
  // Helm/secret changes are needed. Runs chatWithTools (same RAG path as the
  // website DM AI); the module keeps this GM-only and whispers responses since
  // isDM answers can contain DM-only lore.
  if (decoded === "/api/foundry/dmai" && (req.method === "POST" || req.method === "OPTIONS")) {
    let allowOrigin = "https://hotd-foundry.knoxrpg.com";
    try {
      const r = await pgPool.query("SELECT value FROM hotd_config WHERE key = 'foundry_dmai_origin'");
      if (r.rows[0] && r.rows[0].value) allowOrigin = r.rows[0].value;
    } catch (_) {}
    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return true; }

    let expected = "";
    try {
      const r = await pgPool.query("SELECT value FROM hotd_config WHERE key = 'foundry_dmai_token'");
      expected = (r.rows[0] && r.rows[0].value) || "";
    } catch (_) {}
    if (!expected) { sendJSON(res, { error: "DM AI bridge not configured (set foundry_dmai_token)." }, 503); return true; }
    if (!azure.openaiClient) { sendJSON(res, { error: "No AI backend available." }, 503); return true; }

    const crypto = require("crypto");
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const ok = token.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
    if (!ok) { sendJSON(res, { error: "Unauthorized" }, 401); return true; }

    try {
      const body = await readBody(req);
      const { question, dm } = JSON.parse(body || "{}");
      const q = String(question || "").slice(0, 2000).trim();
      if (!q) { sendJSON(res, { error: "question required" }, 400); return true; }
      const { reply } = await chatWithTools(
        azure.openaiClient, azure.aiModel,
        [{ role: "user", content: q }],
        { isDM: dm !== false, username: "Foundry DM" }
      );
      sendJSON(res, { reply });
    } catch (err) {
      console.error("Foundry DMAI error:", err);
      sendJSON(res, { error: "An error occurred while generating a response." }, 500);
    }
    return true;
  }

  // ── Foundry actor export (PCs / NPCs -> dnd5e Actor JSON) ──
  // Same token + CORS as /api/foundry/dmai. The hotd-website-integration
  // module fetches this and creates Actors via Actor.create(). GM-owned data
  // (NPC dm_notes) is fine here because the module makes NPC actors GM-only.
  if (decoded === "/api/foundry/actors" && (req.method === "GET" || req.method === "OPTIONS")) {
    let allowOrigin = "https://hotd-foundry.knoxrpg.com";
    try {
      const r = await pgPool.query("SELECT value FROM hotd_config WHERE key = 'foundry_dmai_origin'");
      if (r.rows[0] && r.rows[0].value) allowOrigin = r.rows[0].value;
    } catch (_) {}
    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return true; }

    let expected = "";
    try {
      const r = await pgPool.query("SELECT value FROM hotd_config WHERE key = 'foundry_dmai_token'");
      expected = (r.rows[0] && r.rows[0].value) || "";
    } catch (_) {}
    if (!expected) { sendJSON(res, { error: "Foundry bridge not configured." }, 503); return true; }
    const crypto = require("crypto");
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const ok = token.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
    if (!ok) { sendJSON(res, { error: "Unauthorized" }, 401); return true; }

    try {
      const type = (url.searchParams.get("type") || "").toLowerCase();
      let actors = [];
      if (type === "pc" || type === "pcs") {
        const { rows } = await pgPool.query("SELECT * FROM hotd_player_characters ORDER BY character_name");
        actors = rows.map(mapPcToActor);
      } else if (type === "npc" || type === "npcs") {
        const { rows } = await pgPool.query("SELECT * FROM hotd_npcs WHERE COALESCE(is_hidden, false) = false ORDER BY name");
        actors = rows.map(mapNpcToActor);
      } else {
        sendJSON(res, { error: "type must be 'pc' or 'npc'" }, 400); return true;
      }
      sendJSON(res, { type, count: actors.length, actors });
    } catch (err) {
      console.error("Foundry actors export error:", err);
      sendJSON(res, { error: "An error occurred building actor data." }, 500);
    }
    return true;
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
