// ══════════════════════════════════════════════════════════════
// ── ADMIN API TEST ROUTES (admin-only) ────────────────────────
// ══════════════════════════════════════════════════════════════

const { pgPool } = require("../db/pool");
const { readBody, sendJSON } = require("../lib/utils");
const { searchCampaign, buildRagContext } = require("../lib/search");
const azure = require("../lib/azure");
const { chatWithTools } = require("../lib/ai-tools");
const { trackAiImage } = require("../lib/telemetry");
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
      const maxTokens = (params && (params.max_completion_tokens || params.max_tokens)) || 2048;
      const temperature = (params && params.temperature != null) ? params.temperature : 0.7;

      const { reply, _debug } = await chatWithTools(azure.openaiClient, model, userMessages, { maxTokens, temperature });

      sendJSON(res, { reply, _debug });
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
      let response;
      try {
        response = await azure.openaiClient.images.generate({
          model: "gpt-image-1.5",
          prompt: String(prompt).slice(0, 4000),
          n: 1,
          size: size || "1024x1024",
          quality: quality || "medium",
        });
      } catch (imgErr) {
        trackAiImage({
          model: "gpt-image-1.5",
          size: size || "1024x1024",
          quality: quality || "medium",
          count: 1,
          latencyMs: Date.now() - t0,
          success: false,
          source: "admin.test-image",
          error: imgErr && imgErr.message ? imgErr.message : String(imgErr),
        });
        throw imgErr;
      }
      const elapsed = Date.now() - t0;
      trackAiImage({
        model: "gpt-image-1.5",
        size: size || "1024x1024",
        quality: quality || "medium",
        count: 1,
        latencyMs: elapsed,
        success: true,
        source: "admin.test-image",
      });

      const imageData = response.data[0];
      sendJSON(res, {
        image_b64: imageData.b64_json,
        revised_prompt: imageData.revised_prompt || "",
        _debug: {
          model: "gpt-image-1.5",
          size: size || "1024x1024",
          quality: quality || "medium",
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
