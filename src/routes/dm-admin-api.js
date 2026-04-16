// ══════════════════════════════════════════════════════════════
// ── DM ADMIN API ROUTES ──────────────────────────────────────
// JSON API endpoints for the DM Management Interface.
// All routes require session.role === "admin".
// ══════════════════════════════════════════════════════════════

const { pgPool } = require("../db/pool");
const { readBody, sendJSON } = require("../lib/utils");
const azure = require("../lib/azure");
const { uploadBlobToStorage } = azure;
const { searchEmbeddings, buildEmbeddingContext } = require("../lib/rag");

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
    const r = await pgPool.query("SELECT id, name, race, npc_class, location, status, alignment_tag, portrait_url, description, dm_notes, sort_order, is_hidden FROM hotd_npcs ORDER BY name");
    sendJSON(res, { npcs: r.rows });
    return true;
  }

  // ── NPCs: create ──────────────────────────────────────────
  if (decoded === "/api/dm-admin/npcs" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const b = JSON.parse(await readBody(req));
      const r = await pgPool.query(
        "INSERT INTO hotd_npcs (name,race,npc_class,location,status,alignment_tag,portrait_url,description,dm_notes,sort_order,is_hidden) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
        [b.name, b.race||"", b.npc_class||"", b.location||"", b.status||"Unknown", b.alignment_tag||"neutral", b.portrait_url||"", b.description||"", b.dm_notes||"", parseInt(b.sort_order)||0, b.is_hidden||false]
      );
      sendJSON(res, { id: r.rows[0].id });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── NPCs: update ──────────────────────────────────────────
  const npcUpdate = decoded.match(/^\/api\/dm-admin\/npcs\/(\d+)$/);
  if (npcUpdate && req.method === "PUT") {
    if (!requireAdmin(session, res)) return true;
    try {
      const b = JSON.parse(await readBody(req));
      await pgPool.query(
        "UPDATE hotd_npcs SET name=$1,race=$2,npc_class=$3,location=$4,status=$5,alignment_tag=$6,portrait_url=$7,description=$8,dm_notes=$9,sort_order=$10,is_hidden=$11 WHERE id=$12",
        [b.name, b.race||"", b.npc_class||"", b.location||"", b.status||"", b.alignment_tag||"neutral", b.portrait_url||"", b.description||"", b.dm_notes||"", parseInt(b.sort_order)||0, b.is_hidden||false, npcUpdate[1]]
      );
      sendJSON(res, { ok: true });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── NPCs: delete ──────────────────────────────────────────
  if (npcUpdate && req.method === "DELETE") {
    if (!requireAdmin(session, res)) return true;
    try {
      await pgPool.query("DELETE FROM hotd_npcs WHERE id = $1", [npcUpdate[1]]);
      sendJSON(res, { ok: true });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── NPCs: AI split descriptions ───────────────────────────
  if (decoded === "/api/dm-admin/npcs/split-descriptions" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const npcs = (await pgPool.query("SELECT id, name, description, dm_notes FROM hotd_npcs WHERE description != '' AND (dm_notes IS NULL OR dm_notes = '') ORDER BY name")).rows;
      if (!npcs.length) { sendJSON(res, { message: "No NPCs to process — all already have dm_notes or no description.", processed: 0 }); return true; }
      const client = azure.openaiClient;
      if (!client) { sendJSON(res, { error: "OpenAI client not initialized" }, 500); return true; }
      const results = [];
      for (const npc of npcs) {
        try {
          const resp = await client.chat.completions.create({
            model: azure.aiModel,
            temperature: 0.2,
            messages: [
              { role: "system", content: "You are a D&D campaign assistant. Given an NPC description, split it into two parts:\\n1. **player_description**: Safe for players to see. Include appearance, known history, public role, and general personality. Remove any mention of secret motives, hidden alliances, secret associations, betrayals, or DM-only plot hooks.\\n2. **dm_notes**: DM-only content. Include secret motives, hidden alliances, associations, plot hooks, and anything players should not know.\\n\\nRespond ONLY with valid JSON: {\"player_description\": \"...\", \"dm_notes\": \"...\"}\\nIf there is nothing secret/DM-only, set dm_notes to empty string. Preserve the original writing style and detail level." },
              { role: "user", content: "NPC: " + npc.name + "\\n\\nFull Description:\\n" + npc.description }
            ]
          });
          const content = resp.choices[0].message.content.trim();
          const parsed = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, ""));
          await pgPool.query("UPDATE hotd_npcs SET description = $1, dm_notes = $2 WHERE id = $3", [parsed.player_description || npc.description, parsed.dm_notes || "", npc.id]);
          results.push({ id: npc.id, name: npc.name, status: "ok" });
        } catch (err) {
          results.push({ id: npc.id, name: npc.name, status: "error", error: err.message });
        }
      }
      sendJSON(res, { processed: results.length, results });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Sessions: list ─────────────────────────────────────────
  if (decoded === "/api/dm-admin/sessions" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const r = await pgPool.query("SELECT id, session_number, title, summary, game_date, play_date FROM hotd_sessions ORDER BY session_number DESC");
    sendJSON(res, { sessions: r.rows });
    return true;
  }

  // ── Sessions: create ──────────────────────────────────────
  if (decoded === "/api/dm-admin/sessions" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const b = JSON.parse(await readBody(req));
      const r = await pgPool.query(
        "INSERT INTO hotd_sessions (session_number,title,summary,game_date,play_date) VALUES ($1,$2,$3,$4,$5) RETURNING id",
        [parseInt(b.session_number), b.title, b.summary||"", b.game_date||"", b.play_date||null]
      );
      sendJSON(res, { id: r.rows[0].id });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Sessions: update ──────────────────────────────────────
  const sessUpdate = decoded.match(/^\/api\/dm-admin\/sessions\/(\d+)$/);
  if (sessUpdate && req.method === "PUT") {
    if (!requireAdmin(session, res)) return true;
    try {
      const b = JSON.parse(await readBody(req));
      await pgPool.query(
        "UPDATE hotd_sessions SET session_number=$1,title=$2,summary=$3,game_date=$4,play_date=$5 WHERE id=$6",
        [parseInt(b.session_number), b.title, b.summary||"", b.game_date||"", b.play_date||null, sessUpdate[1]]
      );
      sendJSON(res, { ok: true });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Sessions: delete ──────────────────────────────────────
  if (sessUpdate && req.method === "DELETE") {
    if (!requireAdmin(session, res)) return true;
    try {
      await pgPool.query("DELETE FROM hotd_sessions WHERE id = $1", [sessUpdate[1]]);
      sendJSON(res, { ok: true });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
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

  // ── Images: list gallery ────────────────────────────────────
  if (decoded === "/api/dm-admin/images" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const params = new URL("http://x" + req.url).searchParams;
    const folder = params.get("folder") || null;
    let q = "SELECT id, prompt, revised_prompt, folder, tags, size, style, quality, image_url, thumbnail_url, is_published, published_to, created_at FROM hotd_generated_images";
    const vals = [];
    if (folder) { q += " WHERE folder = $1"; vals.push(folder); }
    q += " ORDER BY created_at DESC";
    const r = await pgPool.query(q, vals);
    sendJSON(res, { images: r.rows });
    return true;
  }

  // ── Images: list folders ───────────────────────────────────
  if (decoded === "/api/dm-admin/images/folders" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const r = await pgPool.query("SELECT DISTINCT folder FROM hotd_generated_images WHERE folder IS NOT NULL ORDER BY folder");
    sendJSON(res, { folders: r.rows.map(r => r.folder) });
    return true;
  }

  // ── Images: generate via DALL-E 3 ─────────────────────────
  if (decoded === "/api/dm-admin/images/generate" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    if (!azure.openaiClient) { sendJSON(res, { error: "OpenAI client not initialized" }, 500); return true; }
    try {
      const body = JSON.parse(await readBody(req));
      const prompt = (body.prompt || "").trim();
      if (!prompt) { sendJSON(res, { error: "Prompt is required" }, 400); return true; }

      // Get style prefix from config
      const cfgR = await pgPool.query("SELECT value FROM hotd_config WHERE key = 'dalle_style_prefix'");
      const stylePrefix = cfgR.rows.length ? cfgR.rows[0].value : "";
      const fullPrompt = stylePrefix ? `${stylePrefix} ${prompt}` : prompt;

      const size = body.size || "1024x1024";
      const style = body.style || "vivid";
      const quality = body.quality || "standard";
      const folder = body.folder || null;
      const tags = body.tags || [];

      // Call DALL-E 3
      const imgResp = await azure.openaiClient.images.generate({
        model: "dall-e-3",
        prompt: fullPrompt,
        n: 1,
        size,
        style,
        quality,
        response_format: "b64_json",
      });

      const b64 = imgResp.data[0].b64_json;
      const revisedPrompt = imgResp.data[0].revised_prompt || "";
      const imgBuffer = Buffer.from(b64, "base64");

      // Save to local storage
      const ts = Date.now();
      const safeName = prompt.replace(/[^a-z0-9]/gi, "_").substring(0, 40) + "_" + ts + ".png";
      const dir = folder ? `generated-images/${folder}` : "generated-images";
      const imageUrl = await uploadBlobToStorage(safeName, imgBuffer, "image/png", "hotd-website-content", dir);

      // Insert DB record
      const tagsArr = Array.isArray(tags) ? tags : [];
      const insertR = await pgPool.query(
        `INSERT INTO hotd_generated_images (prompt, revised_prompt, folder, tags, size, style, quality, image_url)
         VALUES ($1, $2, $3, $4::text[], $5, $6, $7, $8) RETURNING id, created_at`,
        [prompt, revisedPrompt, folder, tagsArr, size, style, quality, imageUrl]
      );

      sendJSON(res, {
        ok: true,
        image: {
          id: insertR.rows[0].id,
          prompt,
          revised_prompt: revisedPrompt,
          folder,
          tags,
          size,
          style,
          quality,
          image_url: imageUrl,
          created_at: insertR.rows[0].created_at,
        },
      });
    } catch (err) {
      console.error("DALL-E generation error:", err);
      sendJSON(res, { error: err.message }, 500);
    }
    return true;
  }

  // ── Images: update (folder, tags) ──────────────────────────
  const imgUpdateMatch = decoded.match(/^\/api\/dm-admin\/images\/(\d+)$/);
  if (imgUpdateMatch && req.method === "PUT") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(imgUpdateMatch[1], 10);
    const body = JSON.parse(await readBody(req));
    const sets = [];
    const vals = [];
    let idx = 1;
    if (body.folder !== undefined) { sets.push(`folder = $${idx++}`); vals.push(body.folder || null); }
    if (body.tags !== undefined) { sets.push(`tags = $${idx++}::text[]`); vals.push(Array.isArray(body.tags) ? body.tags : []); }
    if (sets.length === 0) { sendJSON(res, { error: "Nothing to update" }, 400); return true; }
    vals.push(id);
    await pgPool.query(`UPDATE hotd_generated_images SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
    sendJSON(res, { ok: true });
    return true;
  }

  // ── Images: delete ─────────────────────────────────────────
  const imgDeleteMatch = decoded.match(/^\/api\/dm-admin\/images\/(\d+)$/);
  if (imgDeleteMatch && req.method === "DELETE") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(imgDeleteMatch[1], 10);
    // Get image URL to delete file
    const imgR = await pgPool.query("SELECT image_url FROM hotd_generated_images WHERE id = $1", [id]);
    if (imgR.rows.length === 0) { sendJSON(res, { error: "Image not found" }, 404); return true; }
    // Delete from filesystem if local
    const url = imgR.rows[0].image_url;
    if (url.startsWith("/hotd-content/")) {
      const { HOTD_CONTENT_DIR } = require("../config");
      if (HOTD_CONTENT_DIR) {
        const relPath = url.replace("/hotd-content/", "");
        const fs = require("fs");
        const filePath = require("path").join(HOTD_CONTENT_DIR, relPath);
        try { fs.unlinkSync(filePath); } catch (_) { /* file may already be gone */ }
      }
    }
    await pgPool.query("DELETE FROM hotd_generated_images WHERE id = $1", [id]);
    sendJSON(res, { ok: true });
    return true;
  }

  // ── Images: publish to Art Gallery ─────────────────────────
  const imgPublishMatch = decoded.match(/^\/api\/dm-admin\/images\/(\d+)\/publish$/);
  if (imgPublishMatch && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(imgPublishMatch[1], 10);
    const imgR = await pgPool.query("SELECT prompt, image_url, folder FROM hotd_generated_images WHERE id = $1", [id]);
    if (imgR.rows.length === 0) { sendJSON(res, { error: "Image not found" }, 404); return true; }
    const img = imgR.rows[0];
    const body = JSON.parse(await readBody(req));
    const title = body.title || img.prompt;
    const category = body.category || img.folder || "Generated";
    // Insert into art gallery
    await pgPool.query(
      "INSERT INTO hotd_art (title, category, image_url) VALUES ($1, $2, $3)",
      [title, category, img.image_url]
    );
    await pgPool.query("UPDATE hotd_generated_images SET is_published = true WHERE id = $1", [id]);
    sendJSON(res, { ok: true, message: `Published "${title}" to Art Gallery` });
    return true;
  }

  // ══════════════════════════════════════════════════════════════
  // ── STORY FORGE ─────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════

  // ── Story Forge: generate content ──────────────────────────
  if (decoded === "/api/dm-admin/story-forge/generate" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    if (!azure.openaiClient) { sendJSON(res, { error: "OpenAI client not initialized" }, 500); return true; }
    try {
      const body = JSON.parse(await readBody(req));
      const { template, prompt, entities } = body;
      if (!prompt) { sendJSON(res, { error: "Prompt is required" }, 400); return true; }

      // Build RAG context from the prompt + entity names
      const searchTerms = [prompt, ...(entities || [])].join(" ");
      const ragContext = await buildEmbeddingContext(azure.openaiClient, searchTerms, {
        includeDmOnly: true, limit: 12, minScore: 0.25,
      });

      // Also do direct DB lookups for mentioned entities
      const entityData = [];
      for (const ent of (entities || []).slice(0, 10)) {
        const npcR = await pgPool.query(
          "SELECT name, race, npc_class, location, status, alignment_tag, description FROM hotd_npcs WHERE name ILIKE $1 LIMIT 1",
          [`%${ent}%`]
        );
        if (npcR.rows.length) entityData.push({ type: "NPC", ...npcR.rows[0] });
      }

      const templatePrompts = {
        npc_backstory: "Generate a rich, detailed NPC backstory. Include personality traits, motivations, secrets, and connections to other campaign elements. Format with markdown headers.",
        magic_item: "Design a custom D&D 5e magic item. Include: Name, Rarity, Type, Attunement requirements, Description, Mechanical effects (with specific numbers), Lore/History. Format as a proper item card.",
        spell: "Design a custom D&D 5e spell. Include: Name, Level, School, Casting Time, Range, Components, Duration, Description with mechanical effects. Format as a proper spell card.",
        session_summary: "Write a narrative session summary in the voice of a chronicler. Include key events, NPC interactions, combat highlights, and plot developments. Reference specific characters and locations accurately.",
        session_planning: "Create a detailed session plan. Include: Opening scene, Key encounters (social/combat/exploration), NPC motivations and dialogue hooks, Potential branching points, Treasure/rewards, Cliffhanger ending options.",
        scene_description: "Write an evocative scene description for the DM to read aloud. Use vivid sensory details (sight, sound, smell, touch). Set the mood and atmosphere. Keep it 2-3 paragraphs.",
        quest_hook: "Design a compelling quest hook. Include: The hook (how players learn about it), Background (what's really going on), Key NPCs involved, Locations, Potential rewards, Complications/twists.",
        faction_lore: "Write detailed faction lore. Include: Name, History, Goals, Leadership, Membership, Relations with other factions, Current activities, How PCs might interact with them.",
        freeform: "",
      };

      const templateInstr = templatePrompts[template] || templatePrompts.freeform;
      const entityContext = entityData.length
        ? "\n\nDirect entity data:\n" + entityData.map(e => `- ${e.type}: ${e.name} — ${e.race || ""} ${e.npc_class || ""}, ${e.location || ""}, ${e.status || ""}. ${(e.description || "").slice(0, 500)}`).join("\n")
        : "";

      const systemPrompt = `You are the Story Forge — an AI assistant for the Dungeon Master of "Halls of the Damned", a D&D 5e campaign set in Barovia.

You MUST use the campaign context provided below to ensure accuracy. Never invent NPCs, locations, events, or history that contradict the established campaign data. If the context doesn't cover something, you may extrapolate creatively but flag it as [NEW CONTENT].

${templateInstr}

${ragContext}${entityContext}`;

      const cfgR = await pgPool.query("SELECT value FROM hotd_config WHERE key = 'ai_model'");
      const model = cfgR.rows.length ? cfgR.rows[0].value : "gpt-4o-mini";

      const completion = await azure.openaiClient.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        max_tokens: 4096,
        temperature: 0.8,
      });

      const content = completion.choices[0]?.message?.content || "";
      sendJSON(res, {
        ok: true,
        content,
        usage: completion.usage,
        ragChunks: ragContext ? ragContext.split("---").length : 0,
        entityLookups: entityData.length,
      });
    } catch (err) {
      console.error("Story Forge generation error:", err);
      sendJSON(res, { error: err.message }, 500);
    }
    return true;
  }

  // ── Story Forge: list story elements ───────────────────────
  if (decoded === "/api/dm-admin/story-elements" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const params = new URL("http://x" + req.url).searchParams;
    const type = params.get("type") || null;
    const status = params.get("status") || null;
    let q = "SELECT id, element_type, title, status, related_entities, created_at, updated_at FROM hotd_dm_story_elements";
    const wheres = [];
    const vals = [];
    let idx = 1;
    if (type) { wheres.push(`element_type = $${idx++}`); vals.push(type); }
    if (status) { wheres.push(`status = $${idx++}`); vals.push(status); }
    if (wheres.length) q += " WHERE " + wheres.join(" AND ");
    q += " ORDER BY updated_at DESC";
    const r = await pgPool.query(q, vals);
    sendJSON(res, { elements: r.rows });
    return true;
  }

  // ── Story Forge: get single element ────────────────────────
  const storyGetMatch = decoded.match(/^\/api\/dm-admin\/story-elements\/(\d+)$/);
  if (storyGetMatch && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(storyGetMatch[1], 10);
    const r = await pgPool.query("SELECT * FROM hotd_dm_story_elements WHERE id = $1", [id]);
    if (r.rows.length === 0) { sendJSON(res, { error: "Not found" }, 404); return true; }
    sendJSON(res, { element: r.rows[0] });
    return true;
  }

  // ── Story Forge: commit (save) element ─────────────────────
  if (decoded === "/api/dm-admin/story-elements" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    const body = JSON.parse(await readBody(req));
    const { element_type, title, content, related_entities, status } = body;
    if (!element_type || !title || !content) {
      sendJSON(res, { error: "element_type, title, and content are required" }, 400);
      return true;
    }
    const r = await pgPool.query(
      `INSERT INTO hotd_dm_story_elements (element_type, title, content, related_entities, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [element_type, title, content, JSON.stringify(related_entities || []), status || "draft"]
    );
    sendJSON(res, { ok: true, id: r.rows[0].id, created_at: r.rows[0].created_at });
    return true;
  }

  // ── Story Forge: update element ────────────────────────────
  const storyUpdateMatch = decoded.match(/^\/api\/dm-admin\/story-elements\/(\d+)$/);
  if (storyUpdateMatch && req.method === "PUT") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(storyUpdateMatch[1], 10);
    const body = JSON.parse(await readBody(req));
    const sets = [];
    const vals = [];
    let idx = 1;
    if (body.title !== undefined) { sets.push(`title = $${idx++}`); vals.push(body.title); }
    if (body.content !== undefined) { sets.push(`content = $${idx++}`); vals.push(body.content); }
    if (body.status !== undefined) { sets.push(`status = $${idx++}`); vals.push(body.status); }
    if (body.related_entities !== undefined) { sets.push(`related_entities = $${idx++}`); vals.push(JSON.stringify(body.related_entities)); }
    if (body.element_type !== undefined) { sets.push(`element_type = $${idx++}`); vals.push(body.element_type); }
    if (sets.length === 0) { sendJSON(res, { error: "Nothing to update" }, 400); return true; }
    sets.push("updated_at = NOW()");
    vals.push(id);
    await pgPool.query(`UPDATE hotd_dm_story_elements SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
    sendJSON(res, { ok: true });
    return true;
  }

  // ── Story Forge: delete element ────────────────────────────
  const storyDeleteMatch = decoded.match(/^\/api\/dm-admin\/story-elements\/(\d+)$/);
  if (storyDeleteMatch && req.method === "DELETE") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(storyDeleteMatch[1], 10);
    await pgPool.query("DELETE FROM hotd_dm_story_elements WHERE id = $1", [id]);
    sendJSON(res, { ok: true });
    return true;
  }

  // ── Story Forge: apply to NPCs (update NPC description with story element content) ──
  if (decoded === "/api/dm-admin/story-elements/apply" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    const body = JSON.parse(await readBody(req));
    const { element_id, npc_ids, append_text } = body;
    if (!element_id || !npc_ids?.length) {
      sendJSON(res, { error: "element_id and npc_ids are required" }, 400);
      return true;
    }
    const elR = await pgPool.query("SELECT title, content FROM hotd_dm_story_elements WHERE id = $1", [element_id]);
    if (elR.rows.length === 0) { sendJSON(res, { error: "Story element not found" }, 404); return true; }
    const text = append_text || `\n\n---\n**[Story Forge: ${elR.rows[0].title}]**\n${elR.rows[0].content}`;
    let updated = 0;
    for (const npcId of npc_ids) {
      const nid = parseInt(npcId, 10);
      if (isNaN(nid)) continue;
      await pgPool.query("UPDATE hotd_npcs SET description = description || $1 WHERE id = $2", [text, nid]);
      updated++;
    }
    // Mark element as committed
    await pgPool.query("UPDATE hotd_dm_story_elements SET status = 'committed' WHERE id = $1", [element_id]);
    sendJSON(res, { ok: true, updated });
    return true;
  }

  // ── Story Forge: RAG search preview ────────────────────────
  if (decoded === "/api/dm-admin/story-forge/rag-search" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    if (!azure.openaiClient) { sendJSON(res, { error: "OpenAI client not initialized" }, 500); return true; }
    try {
      const body = JSON.parse(await readBody(req));
      const results = await searchEmbeddings(azure.openaiClient, body.query || "", {
        includeDmOnly: true, limit: body.limit || 10, minScore: body.minScore || 0.2,
        sourceType: body.sourceType || undefined,
      });
      sendJSON(res, { results });
    } catch (err) {
      sendJSON(res, { error: err.message }, 500);
    }
    return true;
  }

  // ══════════════════════════════════════════════════════════════
  // ── DM CHAT (persistent conversations) ──────────────────────
  // ══════════════════════════════════════════════════════════════

  // ── Chat: list conversations ───────────────────────────────
  if (decoded === "/api/dm-admin/conversations" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const r = await pgPool.query(
      "SELECT id, title, conversation_type, context_refs, created_at, updated_at, jsonb_array_length(messages) AS message_count FROM hotd_dm_conversations ORDER BY updated_at DESC"
    );
    sendJSON(res, { conversations: r.rows });
    return true;
  }

  // ── Chat: get single conversation ──────────────────────────
  const chatGetMatch = decoded.match(/^\/api\/dm-admin\/conversations\/(\d+)$/);
  if (chatGetMatch && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(chatGetMatch[1], 10);
    const r = await pgPool.query("SELECT * FROM hotd_dm_conversations WHERE id = $1", [id]);
    if (r.rows.length === 0) { sendJSON(res, { error: "Not found" }, 404); return true; }
    sendJSON(res, { conversation: r.rows[0] });
    return true;
  }

  // ── Chat: create conversation ──────────────────────────────
  if (decoded === "/api/dm-admin/conversations" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    const body = JSON.parse(await readBody(req));
    const title = body.title || "New Conversation";
    const type = body.conversation_type || "general";
    const r = await pgPool.query(
      "INSERT INTO hotd_dm_conversations (title, conversation_type, messages) VALUES ($1, $2, '[]'::jsonb) RETURNING id, created_at",
      [title, type]
    );
    sendJSON(res, { ok: true, id: r.rows[0].id });
    return true;
  }

  // ── Chat: send message (append + get AI reply) ─────────────
  const chatMsgMatch = decoded.match(/^\/api\/dm-admin\/conversations\/(\d+)\/message$/);
  if (chatMsgMatch && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    if (!azure.openaiClient) { sendJSON(res, { error: "OpenAI client not initialized" }, 500); return true; }
    const id = parseInt(chatMsgMatch[1], 10);
    try {
      const body = JSON.parse(await readBody(req));
      const userMsg = (body.message || "").trim();
      if (!userMsg) { sendJSON(res, { error: "Message required" }, 400); return true; }

      // Get conversation
      const convR = await pgPool.query("SELECT messages FROM hotd_dm_conversations WHERE id = $1", [id]);
      if (convR.rows.length === 0) { sendJSON(res, { error: "Conversation not found" }, 404); return true; }
      const messages = convR.rows[0].messages || [];

      // Build RAG context from the message
      const ragContext = await buildEmbeddingContext(azure.openaiClient, userMsg, {
        includeDmOnly: true, limit: 8, minScore: 0.25,
      });

      const systemPrompt = `You are the DM AI assistant for "Halls of the Damned", a D&D 5e campaign set in Barovia.
You have access to the campaign's full knowledge base including DM-only secrets. Respond accurately using the context below.
Use markdown formatting. Be conversational but precise.

${ragContext}`;

      // Build message history (last 20 messages for context window)
      const historySlice = messages.slice(-20);
      const chatMessages = [
        { role: "system", content: systemPrompt },
        ...historySlice.map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: userMsg },
      ];

      const cfgR = await pgPool.query("SELECT value FROM hotd_config WHERE key = 'ai_model'");
      const model = cfgR.rows.length ? cfgR.rows[0].value : "gpt-4o-mini";

      const completion = await azure.openaiClient.chat.completions.create({
        model,
        messages: chatMessages,
        max_tokens: 4096,
        temperature: 0.7,
      });

      const aiReply = completion.choices[0]?.message?.content || "No response.";
      const now = new Date().toISOString();

      // Append both messages
      const newMsgs = [
        ...messages,
        { role: "user", content: userMsg, timestamp: now },
        { role: "assistant", content: aiReply, timestamp: now },
      ];

      await pgPool.query(
        "UPDATE hotd_dm_conversations SET messages = $1::jsonb, updated_at = NOW() WHERE id = $2",
        [JSON.stringify(newMsgs), id]
      );

      sendJSON(res, {
        ok: true,
        reply: aiReply,
        usage: completion.usage,
        ragChunks: ragContext ? ragContext.split("---").length : 0,
      });
    } catch (err) {
      console.error("DM Chat error:", err);
      sendJSON(res, { error: err.message }, 500);
    }
    return true;
  }

  // ── Chat: rename conversation ──────────────────────────────
  const chatRenameMatch = decoded.match(/^\/api\/dm-admin\/conversations\/(\d+)$/);
  if (chatRenameMatch && req.method === "PUT") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(chatRenameMatch[1], 10);
    const body = JSON.parse(await readBody(req));
    if (body.title) {
      await pgPool.query("UPDATE hotd_dm_conversations SET title = $1, updated_at = NOW() WHERE id = $2", [body.title, id]);
    }
    sendJSON(res, { ok: true });
    return true;
  }

  // ── Chat: delete conversation ──────────────────────────────
  const chatDeleteMatch = decoded.match(/^\/api\/dm-admin\/conversations\/(\d+)$/);
  if (chatDeleteMatch && req.method === "DELETE") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(chatDeleteMatch[1], 10);
    await pgPool.query("DELETE FROM hotd_dm_conversations WHERE id = $1", [id]);
    sendJSON(res, { ok: true });
    return true;
  }

  // ══════════════════════════════════════════════════════════════
  // ── CAMPAIGN NOTES (Kanban) ─────────────────────────────────
  // ══════════════════════════════════════════════════════════════

  // ── Notes: list ────────────────────────────────────────────
  if (decoded === "/api/dm-admin/notes" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const r = await pgPool.query("SELECT * FROM hotd_dm_notes ORDER BY sort_order, created_at DESC");
    sendJSON(res, { notes: r.rows });
    return true;
  }

  // ── Notes: create ──────────────────────────────────────────
  if (decoded === "/api/dm-admin/notes" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    const body = JSON.parse(await readBody(req));
    const { title, content, status, priority, category, tags } = body;
    if (!title) { sendJSON(res, { error: "Title is required" }, 400); return true; }
    const r = await pgPool.query(
      "INSERT INTO hotd_dm_notes (title, content, status, priority, category, tags) VALUES ($1, $2, $3, $4, $5, $6::text[]) RETURNING id, created_at",
      [title, content || "", status || "backlog", priority || "medium", category || "General", tags || []]
    );
    sendJSON(res, { ok: true, id: r.rows[0].id });
    return true;
  }

  // ── Notes: update (including status change for drag-and-drop) ──
  const noteUpdateMatch = decoded.match(/^\/api\/dm-admin\/notes\/(\d+)$/);
  if (noteUpdateMatch && req.method === "PUT") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(noteUpdateMatch[1], 10);
    const body = JSON.parse(await readBody(req));
    const sets = [];
    const vals = [];
    let idx = 1;
    if (body.title !== undefined) { sets.push(`title = $${idx++}`); vals.push(body.title); }
    if (body.content !== undefined) { sets.push(`content = $${idx++}`); vals.push(body.content); }
    if (body.status !== undefined) { sets.push(`status = $${idx++}`); vals.push(body.status); }
    if (body.priority !== undefined) { sets.push(`priority = $${idx++}`); vals.push(body.priority); }
    if (body.category !== undefined) { sets.push(`category = $${idx++}`); vals.push(body.category); }
    if (body.tags !== undefined) { sets.push(`tags = $${idx++}::text[]`); vals.push(body.tags || []); }
    if (body.sort_order !== undefined) { sets.push(`sort_order = $${idx++}`); vals.push(body.sort_order); }
    if (sets.length === 0) { sendJSON(res, { error: "Nothing to update" }, 400); return true; }
    sets.push("updated_at = NOW()");
    vals.push(id);
    await pgPool.query(`UPDATE hotd_dm_notes SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
    sendJSON(res, { ok: true });
    return true;
  }

  // ── Notes: delete ──────────────────────────────────────────
  const noteDeleteMatch = decoded.match(/^\/api\/dm-admin\/notes\/(\d+)$/);
  if (noteDeleteMatch && req.method === "DELETE") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(noteDeleteMatch[1], 10);
    await pgPool.query("DELETE FROM hotd_dm_notes WHERE id = $1", [id]);
    sendJSON(res, { ok: true });
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
