// ══════════════════════════════════════════════════════════════
// ── ADMIN ROUTES (campaign CRUD + user management) ───────────
// ══════════════════════════════════════════════════════════════

const { pgPool } = require("../db/pool");
const { readBody, parseForm, parseMultipart } = require("../lib/utils");
const { uploadBlobToStorage } = require("../lib/azure");

/**
 * Handle admin routes. Returns true if the route was handled, false otherwise.
 * All routes require session && session.role === "admin".
 */
async function handleAdminRoutes(decoded, req, res, session) {
  if (!session || session.role !== "admin" || req.method !== "POST") return false;

  // ── User management ────────────────────────────────────────
  if (decoded === "/admin/approve-user") {
    const body = await readBody(req); const form = parseForm(body);
    try { await pgPool.query("UPDATE account_info SET is_approved = true WHERE id = $1", [form.userId]); } catch (e) { console.error(e); }
    res.writeHead(302, { Location: "/account" }); res.end(); return true;
  }
  if (decoded === "/admin/promote-user") {
    const body = await readBody(req); const form = parseForm(body);
    try { await pgPool.query("UPDATE account_info SET role = 'admin' WHERE id = $1", [form.userId]); } catch (e) { console.error(e); }
    res.writeHead(302, { Location: "/account" }); res.end(); return true;
  }
  if (decoded === "/admin/demote-user") {
    const body = await readBody(req); const form = parseForm(body);
    try { await pgPool.query("UPDATE account_info SET role = 'user' WHERE id = $1", [form.userId]); } catch (e) { console.error(e); }
    res.writeHead(302, { Location: "/account" }); res.end(); return true;
  }
  if (decoded === "/admin/delete-user") {
    const body = await readBody(req); const form = parseForm(body);
    try { await pgPool.query("DELETE FROM account_info WHERE id = $1", [form.userId]); } catch (e) { console.error(e); }
    res.writeHead(302, { Location: "/account" }); res.end(); return true;
  }

  // ── Calendar ───────────────────────────────────────────────
  if (decoded === "/admin/calendar/add-event") {
    const body = await readBody(req); const form = parseForm(body);
    try { await pgPool.query("INSERT INTO hotd_calendar_events (day,month_idx,title,description,session_refs) VALUES ($1,$2,$3,$4,$5)", [parseInt(form.day), parseInt(form.month_idx), form.title, form.description || "", form.session_refs || ""]); } catch (e) { console.error("Add calendar event:", e.message); }
    res.writeHead(302, { Location: "/calendar/admin?month=" + (form.month_idx || "") }); res.end(); return true;
  }
  if (decoded === "/admin/calendar/delete-event") {
    const body = await readBody(req); const form = parseForm(body);
    try { await pgPool.query("DELETE FROM hotd_calendar_events WHERE id = $1", [form.id]); } catch (e) { console.error(e); }
    res.writeHead(302, { Location: "/calendar/admin?month=" + (form.month_idx || "") }); res.end(); return true;
  }
  if (decoded === "/admin/calendar/update-event") {
    const body = await readBody(req); const form = parseForm(body);
    try { await pgPool.query("UPDATE hotd_calendar_events SET day=$1,title=$2,description=$3,session_refs=$4 WHERE id=$5", [parseInt(form.day), form.title, form.description||"", form.session_refs||"", form.id]); } catch (e) { console.error("Update calendar event:", e.message); }
    res.writeHead(302, { Location: "/calendar/admin?month=" + (form.month_idx || "") }); res.end(); return true;
  }
  if (decoded === "/admin/calendar/set-date") {
    const body = await readBody(req); const form = parseForm(body);
    try {
      await pgPool.query("INSERT INTO hotd_config (key,value) VALUES ('current_month',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [form.month_idx]);
      await pgPool.query("INSERT INTO hotd_config (key,value) VALUES ('current_day',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [form.day]);
      if (form.year) await pgPool.query("INSERT INTO hotd_config (key,value) VALUES ('current_year',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [form.year]);
    } catch (e) { console.error("Set date:", e.message); }
    res.writeHead(302, { Location: "/calendar/admin" }); res.end(); return true;
  }

  // ── Home Dashboard Config ──────────────────────────────────
  if (decoded === "/admin/home/update") {
    const body = await readBody(req); const form = parseForm(body);
    try {
      if (form.next_game_date !== undefined) await pgPool.query("INSERT INTO hotd_config (key,value) VALUES ('next_game_date',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [form.next_game_date]);
      if (form.party_location !== undefined) await pgPool.query("INSERT INTO hotd_config (key,value) VALUES ('party_location',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [form.party_location]);
    } catch (e) { console.error("Update home config:", e.message); }
    res.writeHead(302, { Location: "/home/admin" }); res.end(); return true;
  }

  // ── NPCs ───────────────────────────────────────────────────
  if (decoded === "/admin/npcs/add") {
    let form = {};
    let portraitUrl = "";
    const ct = req.headers["content-type"] || "";
    if (ct.includes("multipart/form-data")) {
      const parsed = await parseMultipart(req, ct);
      form = parsed.fields;
      if (parsed.file && parsed.file.data.length > 0) {
        try { portraitUrl = await uploadBlobToStorage(parsed.file.filename, parsed.file.data, parsed.file.contentType, "hotd-website-content", "handouts"); } catch (e) { console.error("NPC portrait upload:", e.message); }
      }
    } else { const body = await readBody(req); form = parseForm(body); }
    if (!portraitUrl && form.portrait_url) portraitUrl = form.portrait_url;
    const isHiddenAdd = form.is_hidden !== "false";
    try { await pgPool.query("INSERT INTO hotd_npcs (name,race,npc_class,location,status,alignment_tag,portrait_url,description,sort_order,is_hidden) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [form.name, form.race||"", form.npc_class||"", form.location||"", form.status||"Unknown", form.alignment_tag||"neutral", portraitUrl, form.description||"", parseInt(form.sort_order)||0, isHiddenAdd]); } catch (e) { console.error("Add NPC:", e.message); }
    res.writeHead(302, { Location: "/npcs/admin" }); res.end(); return true;
  }
  if (decoded === "/admin/npcs/delete") {
    const body = await readBody(req); const form = parseForm(body);
    try { await pgPool.query("DELETE FROM hotd_npcs WHERE id = $1", [form.id]); } catch (e) { console.error(e); }
    res.writeHead(302, { Location: "/npcs/admin" }); res.end(); return true;
  }
  if (decoded === "/admin/npcs/update") {
    let form = {};
    let portraitUrl = "";
    const ct = req.headers["content-type"] || "";
    if (ct.includes("multipart/form-data")) {
      const parsed = await parseMultipart(req, ct);
      form = parsed.fields;
      if (parsed.file && parsed.file.data.length > 0) {
        try { portraitUrl = await uploadBlobToStorage(parsed.file.filename, parsed.file.data, parsed.file.contentType, "hotd-website-content", "handouts"); } catch (e) { console.error("NPC portrait upload (update):", e.message); }
      }
    } else { const body = await readBody(req); form = parseForm(body); }
    if (!portraitUrl && form.portrait_url) portraitUrl = form.portrait_url;
    const isHiddenUpd = form.is_hidden !== "false";
    try { await pgPool.query("UPDATE hotd_npcs SET name=$1,race=$2,npc_class=$3,location=$4,status=$5,alignment_tag=$6,portrait_url=$7,description=$8,sort_order=$9,is_hidden=$10 WHERE id=$11", [form.name, form.race||"", form.npc_class||"", form.location||"", form.status||"", form.alignment_tag||"neutral", portraitUrl, form.description||"", parseInt(form.sort_order)||0, isHiddenUpd, form.id]); } catch (e) { console.error("Update NPC:", e.message); }
    res.writeHead(302, { Location: "/npcs/admin" }); res.end(); return true;
  }

  // ── Sessions ───────────────────────────────────────────────
  if (decoded === "/admin/sessions/add") {
    const body = await readBody(req); const form = parseForm(body);
    try { await pgPool.query("INSERT INTO hotd_sessions (session_number,title,summary,game_date,play_date) VALUES ($1,$2,$3,$4,$5)", [parseInt(form.session_number), form.title, form.summary||"", form.game_date||"", form.play_date || null]); } catch (e) { console.error("Add session:", e.message); }
    res.writeHead(302, { Location: "/sessions/admin" }); res.end(); return true;
  }
  if (decoded === "/admin/sessions/delete") {
    const body = await readBody(req); const form = parseForm(body);
    try { await pgPool.query("DELETE FROM hotd_sessions WHERE id = $1", [form.id]); } catch (e) { console.error(e); }
    res.writeHead(302, { Location: "/sessions/admin" }); res.end(); return true;
  }
  if (decoded === "/admin/sessions/update") {
    const body = await readBody(req); const form = parseForm(body);
    try { await pgPool.query("UPDATE hotd_sessions SET session_number=$1,title=$2,summary=$3,game_date=$4,play_date=$5 WHERE id=$6", [parseInt(form.session_number), form.title, form.summary||"", form.game_date||"", form.play_date || null, form.id]); } catch (e) { console.error("Update session:", e.message); }
    res.writeHead(302, { Location: "/sessions/admin" }); res.end(); return true;
  }

  // ── Art / Images ───────────────────────────────────────────
  if (decoded === "/admin/art/add") {
    let form = {};
    let imageUrl = "";
    const ct = req.headers["content-type"] || "";
    if (ct.includes("multipart/form-data")) {
      const parsed = await parseMultipart(req, ct);
      form = parsed.fields;
      if (parsed.file && parsed.file.data.length > 0) {
        try { imageUrl = await uploadBlobToStorage(parsed.file.filename, parsed.file.data, parsed.file.contentType, "hotd-website-content", "art"); } catch (e) { console.error("Art image upload:", e.message); }
      }
    } else { const body = await readBody(req); form = parseForm(body); }
    if (imageUrl) {
      try { await pgPool.query("INSERT INTO hotd_art (title,image_url,description,sort_order) VALUES ($1,$2,$3,$4)", [form.title || "", imageUrl, form.description || "", parseInt(form.sort_order) || 0]); } catch (e) { console.error("Add art:", e.message); }
    }
    res.writeHead(302, { Location: "/art/admin" }); res.end(); return true;
  }
  if (decoded === "/admin/art/delete") {
    const body = await readBody(req); const form = parseForm(body);
    try { await pgPool.query("DELETE FROM hotd_art WHERE id = $1", [form.id]); } catch (e) { console.error(e); }
    res.writeHead(302, { Location: "/art/admin" }); res.end(); return true;
  }
  if (decoded === "/admin/art/update") {
    let form = {};
    let imageUrl = "";
    const ct = req.headers["content-type"] || "";
    if (ct.includes("multipart/form-data")) {
      const parsed = await parseMultipart(req, ct);
      form = parsed.fields;
      if (parsed.file && parsed.file.data.length > 0) {
        try { imageUrl = await uploadBlobToStorage(parsed.file.filename, parsed.file.data, parsed.file.contentType, "hotd-website-content", "art"); } catch (e) { console.error("Art image upload (update):", e.message); }
      }
    } else { const body = await readBody(req); form = parseForm(body); }
    if (!imageUrl) {
      try { const current = await pgPool.query("SELECT image_url FROM hotd_art WHERE id = $1", [form.id]); imageUrl = current.rows[0]?.image_url || ""; } catch (_) {}
    }
    try { await pgPool.query("UPDATE hotd_art SET title=$1,image_url=$2,description=$3,sort_order=$4 WHERE id=$5", [form.title || "", imageUrl, form.description || "", parseInt(form.sort_order) || 0, form.id]); } catch (e) { console.error("Update art:", e.message); }
    res.writeHead(302, { Location: "/art/admin" }); res.end(); return true;
  }

  // ── Artifacts ──────────────────────────────────────────────
  if (decoded === "/admin/artifacts/add") {
    let form = {};
    let imageUrl = "";
    const ct = req.headers["content-type"] || "";
    if (ct.includes("multipart/form-data")) {
      const parsed = await parseMultipart(req, ct);
      form = parsed.fields;
      if (parsed.file && parsed.file.data.length > 0) {
        try { imageUrl = await uploadBlobToStorage(parsed.file.filename, parsed.file.data, parsed.file.contentType, "hotd-website-content", "artifacts"); } catch (e) { console.error("Artifact image upload:", e.message); }
      }
    } else { const body = await readBody(req); form = parseForm(body); }
    if (!imageUrl && form.image_url) imageUrl = form.image_url;
    try {
      await pgPool.query(
        "INSERT INTO hotd_artifacts (name,rarity,image_url,description,lore,is_legendary,owner) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [form.name, form.rarity || "Unknown", imageUrl, form.description || "", form.lore || "", form.is_legendary === "true", form.owner || ""]
      );
    } catch (e) { console.error("Add artifact:", e.message); }
    res.writeHead(302, { Location: "/artifacts/admin" }); res.end(); return true;
  }
  if (decoded === "/admin/artifacts/delete") {
    const body = await readBody(req); const form = parseForm(body);
    try { await pgPool.query("DELETE FROM hotd_artifacts WHERE id = $1", [form.id]); } catch (e) { console.error(e); }
    res.writeHead(302, { Location: "/artifacts/admin" }); res.end(); return true;
  }
  if (decoded === "/admin/artifacts/update") {
    let form = {};
    let imageUrl = "";
    const ct = req.headers["content-type"] || "";
    if (ct.includes("multipart/form-data")) {
      const parsed = await parseMultipart(req, ct);
      form = parsed.fields;
      if (parsed.file && parsed.file.data.length > 0) {
        try { imageUrl = await uploadBlobToStorage(parsed.file.filename, parsed.file.data, parsed.file.contentType, "hotd-website-content", "artifacts"); } catch (e) { console.error("Artifact image upload (update):", e.message); }
      }
    } else { const body = await readBody(req); form = parseForm(body); }
    if (!imageUrl && form.image_url) imageUrl = form.image_url;
    if (!imageUrl) {
      try { const current = await pgPool.query("SELECT image_url FROM hotd_artifacts WHERE id = $1", [form.id]); imageUrl = current.rows[0]?.image_url || ""; } catch (_) {}
    }
    try {
      await pgPool.query(
        "UPDATE hotd_artifacts SET name=$1,rarity=$2,image_url=$3,description=$4,lore=$5,is_legendary=$6,owner=$7 WHERE id=$8",
        [form.name, form.rarity || "Unknown", imageUrl, form.description || "", form.lore || "", form.is_legendary === "true", form.owner || "", form.id]
      );
    } catch (e) { console.error("Update artifact:", e.message); }
    res.writeHead(302, { Location: "/artifacts/admin" }); res.end(); return true;
  }

  // ── Handouts ───────────────────────────────────────────────
  if (decoded === "/admin/handouts/add") {
    let form = {};
    let imageUrl = "";
    const ct = req.headers["content-type"] || "";
    if (ct.includes("multipart/form-data")) {
      const parsed = await parseMultipart(req, ct);
      form = parsed.fields;
      if (parsed.file && parsed.file.data.length > 0) {
        try { imageUrl = await uploadBlobToStorage(parsed.file.filename, parsed.file.data, parsed.file.contentType, "hotd-website-content", "handouts"); } catch (e) { console.error("Handout image upload:", e.message); }
      }
    } else { const body = await readBody(req); form = parseForm(body); }
    try {
      await pgPool.query(
        "INSERT INTO hotd_handouts (name,image_url,description,about) VALUES ($1,$2,$3,$4)",
        [form.name, imageUrl, form.description || "", form.about || ""]
      );
    } catch (e) { console.error("Add handout:", e.message); }
    res.writeHead(302, { Location: "/handouts/admin" }); res.end(); return true;
  }
  if (decoded === "/admin/handouts/delete") {
    const body = await readBody(req); const form = parseForm(body);
    try { await pgPool.query("DELETE FROM hotd_handouts WHERE id = $1", [form.id]); } catch (e) { console.error(e); }
    res.writeHead(302, { Location: "/handouts/admin" }); res.end(); return true;
  }
  if (decoded === "/admin/handouts/update") {
    let form = {};
    let imageUrl = "";
    const ct = req.headers["content-type"] || "";
    if (ct.includes("multipart/form-data")) {
      const parsed = await parseMultipart(req, ct);
      form = parsed.fields;
      if (parsed.file && parsed.file.data.length > 0) {
        try { imageUrl = await uploadBlobToStorage(parsed.file.filename, parsed.file.data, parsed.file.contentType, "hotd-website-content", "handouts"); } catch (e) { console.error("Handout image upload (update):", e.message); }
      }
    } else { const body = await readBody(req); form = parseForm(body); }
    if (!imageUrl) {
      try { const current = await pgPool.query("SELECT image_url FROM hotd_handouts WHERE id = $1", [form.id]); imageUrl = current.rows[0]?.image_url || ""; } catch (_) {}
    }
    try {
      await pgPool.query(
        "UPDATE hotd_handouts SET name=$1,image_url=$2,description=$3,about=$4 WHERE id=$5",
        [form.name, imageUrl, form.description || "", form.about || "", form.id]
      );
    } catch (e) { console.error("Update handout:", e.message); }
    res.writeHead(302, { Location: "/handouts/admin" }); res.end(); return true;
  }

  // ── Maps ───────────────────────────────────────────────────
  if (decoded === "/admin/maps/add") {
    let form = {};
    let imageUrl = "";
    const ct = req.headers["content-type"] || "";
    if (ct.includes("multipart/form-data")) {
      const parsed = await parseMultipart(req, ct);
      form = parsed.fields;
      if (parsed.file && parsed.file.data.length > 0) {
        try { imageUrl = await uploadBlobToStorage(parsed.file.filename, parsed.file.data, parsed.file.contentType, "hotd-website-content", "maps"); } catch (e) { console.error("Map image upload:", e.message); }
      }
    } else { const body = await readBody(req); form = parseForm(body); }
    if (!imageUrl && form.image_url) imageUrl = form.image_url;
    try { await pgPool.query("INSERT INTO hotd_maps (name,description,image_url,sort_order) VALUES ($1,$2,$3,$4)", [form.name, form.description||"", imageUrl, parseInt(form.sort_order)||0]); } catch (e) { console.error("Add map:", e.message); }
    res.writeHead(302, { Location: "/maps/admin" }); res.end(); return true;
  }
  if (decoded === "/admin/maps/delete") {
    const body = await readBody(req); const form = parseForm(body);
    try { await pgPool.query("DELETE FROM hotd_maps WHERE id = $1", [form.id]); } catch (e) { console.error(e); }
    res.writeHead(302, { Location: "/maps/admin" }); res.end(); return true;
  }
  if (decoded === "/admin/maps/update") {
    let form = {};
    let imageUrl = "";
    const ct = req.headers["content-type"] || "";
    if (ct.includes("multipart/form-data")) {
      const parsed = await parseMultipart(req, ct);
      form = parsed.fields;
      if (parsed.file && parsed.file.data.length > 0) {
        try { imageUrl = await uploadBlobToStorage(parsed.file.filename, parsed.file.data, parsed.file.contentType, "hotd-website-content", "maps"); } catch (e) { console.error("Map image upload (update):", e.message); }
      }
    } else { const body = await readBody(req); form = parseForm(body); }
    if (!imageUrl && form.image_url) imageUrl = form.image_url;
    try { await pgPool.query("UPDATE hotd_maps SET name=$1,description=$2,image_url=$3,sort_order=$4 WHERE id=$5", [form.name, form.description||"", imageUrl, parseInt(form.sort_order)||0, form.id]); } catch (e) { console.error("Update map:", e.message); }
    res.writeHead(302, { Location: "/maps/admin" }); res.end(); return true;
  }

  return false;
}

module.exports = { handleAdminRoutes };
