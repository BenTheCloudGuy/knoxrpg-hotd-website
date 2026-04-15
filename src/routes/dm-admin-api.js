// ══════════════════════════════════════════════════════════════
// ── DM ADMIN API ROUTES ──────────────────────────────────────
// JSON API endpoints for the DM Management Interface.
// All routes require session.role === "admin".
// ══════════════════════════════════════════════════════════════

const { pgPool } = require("../db/pool");
const { readBody, sendJSON } = require("../lib/utils");

function requireAdmin(session, res) {
  if (!session || session.role !== "admin") {
    sendJSON(res, { error: "Unauthorized" }, 403);
    return false;
  }
  return true;
}

async function handleDmAdminApiRoutes(decoded, req, res, session) {
  if (!decoded.startsWith("/api/dm-admin")) return false;

  // ── Characters: list ───────────────────────────────────────
  if (decoded === "/api/dm-admin/characters" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const r = await pgPool.query(
      "SELECT id, ddb_character_id, character_name, player_name, level, race, class_summary, background, alignment, strength, dexterity, constitution, intelligence, wisdom, charisma, armor_class, hit_points, max_hit_points, speed, avatar_url FROM hotd_player_characters ORDER BY character_name"
    );
    sendJSON(res, { characters: r.rows });
    return true;
  }

  // ── Characters: update ─────────────────────────────────────
  const charUpdateMatch = decoded.match(/^\/api\/dm-admin\/characters\/(\d+)$/);
  if (charUpdateMatch && req.method === "PUT") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(charUpdateMatch[1], 10);
    const body = JSON.parse(await readBody(req));
    const fields = [
      "character_name", "player_name", "level", "race", "class_summary",
      "background", "alignment", "ddb_character_id",
      "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma",
      "armor_class", "hit_points", "max_hit_points", "speed",
    ];
    const sets = [];
    const vals = [];
    let idx = 1;
    for (const f of fields) {
      if (body[f] !== undefined) {
        sets.push(`${f} = $${idx}`);
        vals.push(body[f]);
        idx++;
      }
    }
    if (sets.length === 0) { sendJSON(res, { error: "No fields to update" }, 400); return true; }
    sets.push(`updated_at = NOW()`);
    vals.push(id);
    await pgPool.query(`UPDATE hotd_player_characters SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
    sendJSON(res, { ok: true });
    return true;
  }

  // ── Characters: single DDB sync ────────────────────────────
  const charSyncMatch = decoded.match(/^\/api\/dm-admin\/characters\/(\d+)\/sync$/);
  if (charSyncMatch && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(charSyncMatch[1], 10);
    try {
      const r = await pgPool.query("SELECT ddb_character_id FROM hotd_player_characters WHERE id = $1", [id]);
      if (r.rows.length === 0) { sendJSON(res, { error: "Character not found" }, 404); return true; }
      const ddbId = r.rows[0].ddb_character_id;
      if (!ddbId) { sendJSON(res, { error: "No DDB character ID set" }, 400); return true; }

      const result = await syncOneCharacterFromDDB(ddbId, id);
      sendJSON(res, result);
    } catch (err) {
      console.error("DDB sync error:", err);
      sendJSON(res, { error: err.message }, 500);
    }
    return true;
  }

  // ── Characters: sync all ───────────────────────────────────
  if (decoded === "/api/dm-admin/characters/sync-all" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const r = await pgPool.query("SELECT id, ddb_character_id, character_name FROM hotd_player_characters WHERE ddb_character_id IS NOT NULL");
      const results = [];
      for (const row of r.rows) {
        try {
          const result = await syncOneCharacterFromDDB(row.ddb_character_id, row.id);
          results.push({ name: row.character_name, ...result });
        } catch (err) {
          results.push({ name: row.character_name, error: err.message });
        }
      }
      const ok = results.filter(r => r.ok).length;
      const fail = results.filter(r => r.error).length;
      sendJSON(res, { message: `Synced ${ok}/${results.length} (${fail} failed)`, results });
    } catch (err) {
      sendJSON(res, { error: err.message }, 500);
    }
    return true;
  }

  // ── NPCs: list ─────────────────────────────────────────────
  if (decoded === "/api/dm-admin/npcs" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const r = await pgPool.query("SELECT id, name, race, npc_class, location, status, alignment_tag, is_hidden FROM hotd_npcs ORDER BY name");
    sendJSON(res, { npcs: r.rows });
    return true;
  }

  // ── Sessions: list ─────────────────────────────────────────
  if (decoded === "/api/dm-admin/sessions" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const r = await pgPool.query("SELECT id, session_number, title, summary, game_date, play_date FROM hotd_sessions ORDER BY session_number DESC");
    sendJSON(res, { sessions: r.rows });
    return true;
  }

  // ── Config: get all ────────────────────────────────────────
  if (decoded === "/api/dm-admin/config" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const r = await pgPool.query("SELECT key, value FROM hotd_config");
    const config = {};
    for (const row of r.rows) config[row.key] = row.value;
    sendJSON(res, config);
    return true;
  }

  // ── Config: update (upsert multiple keys) ──────────────────
  if (decoded === "/api/dm-admin/config" && req.method === "PUT") {
    if (!requireAdmin(session, res)) return true;
    const body = JSON.parse(await readBody(req));
    for (const [key, value] of Object.entries(body)) {
      if (typeof key !== "string" || key.length > 100) continue;
      await pgPool.query(
        "INSERT INTO hotd_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
        [key, String(value)]
      );
    }
    sendJSON(res, { ok: true });
    return true;
  }

  // ── RAG status check ───────────────────────────────────────
  if (decoded === "/api/dm-admin/rag-status" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const ragUrl = process.env.RAG_SERVICE_URL;
    if (!ragUrl) { sendJSON(res, { status: "not_configured" }); return true; }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const r = await fetch(ragUrl + "/health", { signal: controller.signal });
      clearTimeout(timeout);
      sendJSON(res, { status: r.ok ? "ok" : "error", code: r.status });
    } catch (err) {
      sendJSON(res, { status: "error", error: err.message });
    }
    return true;
  }

  // ── Users: list ────────────────────────────────────────────
  if (decoded === "/api/dm-admin/users" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const r = await pgPool.query("SELECT id, username, first_name, last_name, email, role, is_approved FROM account_info ORDER BY id");
    sendJSON(res, { users: r.rows });
    return true;
  }

  // ── Users: actions (approve/promote/demote/delete) ─────────
  const userActionMatch = decoded.match(/^\/api\/dm-admin\/users\/(\d+)\/(approve|promote|demote|delete)$/);
  if (userActionMatch && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    const uid = parseInt(userActionMatch[1], 10);
    const action = userActionMatch[2];
    try {
      switch (action) {
        case "approve":
          await pgPool.query("UPDATE account_info SET is_approved = true WHERE id = $1", [uid]);
          break;
        case "promote":
          await pgPool.query("UPDATE account_info SET role = 'admin' WHERE id = $1", [uid]);
          break;
        case "demote":
          await pgPool.query("UPDATE account_info SET role = 'user' WHERE id = $1", [uid]);
          break;
        case "delete":
          await pgPool.query("DELETE FROM account_info WHERE id = $1", [uid]);
          break;
      }
      sendJSON(res, { ok: true });
    } catch (err) {
      sendJSON(res, { error: err.message }, 500);
    }
    return true;
  }

  return false;
}

// ══════════════════════════════════════════════════════════════
// ── DDB SYNC (inline — no child process needed) ──────────────
// ══════════════════════════════════════════════════════════════

const DDB_API = "https://character-service.dndbeyond.com/character/v5/character";
const STAT_NAMES = { 1: "strength", 2: "dexterity", 3: "constitution", 4: "intelligence", 5: "wisdom", 6: "charisma" };

function ddbMod(score) { return Math.floor((score - 10) / 2); }

function ddbComputeAbilityScores(data) {
  const scores = {};
  for (const s of data.stats) scores[s.id] = s.value || 10;
  for (const b of (data.bonusStats || [])) {
    if (b.value) scores[b.id] = (scores[b.id] || 10) + b.value;
  }
  const categories = ["race", "class", "background", "item", "feat", "condition"];
  for (const cat of categories) {
    const mods = data.modifiers?.[cat] || [];
    for (const m of mods) {
      if (m.type === "bonus" && m.subType?.endsWith("-score")) {
        const statName = m.subType.replace("-score", "");
        const statId = Object.entries(STAT_NAMES).find(([, v]) => v === statName)?.[0];
        if (statId) scores[parseInt(statId)] = (scores[parseInt(statId)] || 10) + (m.value || 0);
      }
      if (m.type === "set" && m.subType?.endsWith("-score")) {
        const statName = m.subType.replace("-score", "");
        const statId = Object.entries(STAT_NAMES).find(([, v]) => v === statName)?.[0];
        if (statId && m.value > (scores[parseInt(statId)] || 0)) scores[parseInt(statId)] = m.value;
      }
    }
  }
  for (const o of (data.overrideStats || [])) {
    if (o.value !== null && o.value !== undefined) scores[o.id] = o.value;
  }
  return scores;
}

function ddbComputeAC(data, scores) {
  const dexMod = ddbMod(scores[2] || 10);
  let baseAC = 10 + dexMod;
  for (const item of (data.inventory || [])) {
    if (!item.equipped) continue;
    const def = item.definition;
    if (!def?.armorTypeId) continue;
    const ac = def.armorClass || 0;
    switch (def.armorTypeId) {
      case 1: baseAC = ac + dexMod; break;
      case 2: baseAC = ac + Math.min(dexMod, 2); break;
      case 3: baseAC = ac; break;
      case 4: baseAC += 2; break; // shield
    }
  }
  // AC bonuses from modifiers
  for (const cat of ["race", "class", "item", "feat", "condition"]) {
    for (const m of (data.modifiers?.[cat] || [])) {
      if (m.type === "bonus" && m.subType === "armor-class") baseAC += (m.value || 0);
    }
  }
  return baseAC;
}

function ddbComputeMaxHP(data, scores) {
  const conMod = ddbMod(scores[3] || 10);
  let level = 0;
  for (const cls of (data.classes || [])) level += cls.level || 0;

  let hp = (data.baseHitPoints || 0) + conMod * level;
  for (const cat of ["race", "class", "feat", "item", "condition"]) {
    for (const m of (data.modifiers?.[cat] || [])) {
      if (m.type === "bonus" && m.subType === "hit-points-per-level") hp += (m.value || 0) * level;
    }
  }
  return hp;
}

async function syncOneCharacterFromDDB(ddbId, localId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const resp = await fetch(`${DDB_API}/${ddbId}`, { signal: controller.signal });
  clearTimeout(timeout);

  if (!resp.ok) throw new Error(`DDB API returned ${resp.status}`);
  const json = await resp.json();
  const data = json.data;
  if (!data) throw new Error("No data in DDB response");

  const scores = ddbComputeAbilityScores(data);
  const ac = ddbComputeAC(data, scores);
  const level = (data.classes || []).reduce((s, c) => s + (c.level || 0), 0);
  const maxHp = ddbComputeMaxHP(data, scores);

  const classSummary = (data.classes || []).map(c => {
    const sub = c.subclassDefinition?.name ? ` (${c.subclassDefinition.name})` : "";
    return `${c.definition?.name || "?"}${sub} ${c.level}`;
  }).join(" / ");

  await pgPool.query(`
    UPDATE hotd_player_characters SET
      character_name = $1, level = $2, race = $3, class_summary = $4,
      strength = $5, dexterity = $6, constitution = $7,
      intelligence = $8, wisdom = $9, charisma = $10,
      armor_class = $11, max_hit_points = $12, hit_points = $12,
      speed = $13, avatar_url = $14, alignment = $15, background = $16,
      updated_at = NOW()
    WHERE id = $17
  `, [
    data.name, level,
    data.race?.fullName || data.race?.baseName || "",
    classSummary,
    scores[1] || 10, scores[2] || 10, scores[3] || 10,
    scores[4] || 10, scores[5] || 10, scores[6] || 10,
    ac, maxHp,
    (data.race?.weightSpeeds?.normal?.walk || 30),
    data.decorations?.avatarUrl || data.avatarUrl || "",
    data.alignmentId ? ["", "LG", "NG", "CG", "LN", "N", "CN", "LE", "NE", "CE"][data.alignmentId] || "" : "",
    data.background?.definition?.name || "",
    localId,
  ]);

  return { ok: true, message: `${data.name} synced (level ${level}, AC ${ac}, HP ${maxHp})` };
}

module.exports = { handleDmAdminApiRoutes };
