// ══════════════════════════════════════════════════════════════
// ── ADMIN PAGES ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

const { pgPool } = require("../db/pool");
const { esc } = require("../lib/utils");
const { HARPTOS_MONTHS } = require("../config");
const { pageShell } = require("../components/shell");
const { renderRichTextBlock } = require("../lib/markdown");

// ── Home Dashboard Admin ──────────────────────────────────────
async function renderHomeAdminPage(session) {
  if (!session || session.role !== "admin") return null;
  let nextGameDate = "", partyLocation = "";
  try {
    const cfgRes = await pgPool.query("SELECT key, value FROM hotd_config WHERE key IN ('next_game_date','party_location')");
    for (const r of cfgRes.rows) {
      if (r.key === "next_game_date") nextGameDate = r.value;
      if (r.key === "party_location") partyLocation = r.value;
    }
  } catch (_) {}

  const body = `
  <div class="content">
    <h2 class="section-title">&#9881; Home Dashboard Admin</h2>
    <p style="color:#888;margin-bottom:16px;"><a href="/" style="color:#e8b923;text-decoration:none;">&larr; Back to Home</a></p>

    <div class="admin-campaign-form">
      <h3>&#128197; Next Scheduled Game</h3>
      <form method="POST" action="/admin/home/update">
        <div class="form-row"><div><label>Date &amp; Time</label><input type="datetime-local" name="next_game_date" value="${esc(nextGameDate)}" /></div><div></div></div>
        <div class="form-row"><div><label>Party Location</label><input type="text" name="party_location" value="${esc(partyLocation)}" placeholder="e.g. Waterdeep, The Yawning Portal" /></div><div></div></div>
        <button type="submit">Save</button>
      </form>
    </div>

    <div class="admin-campaign-form" style="margin-top:16px;">
      <h3>&#128506; Map Markers</h3>
      <p style="color:#888;font-size:0.85rem;">Place and manage markers on the Barovia map. <a href="/map/admin" style="color:#e8b923;">Edit Map Markers &rarr;</a></p>
    </div>

    <div class="admin-campaign-form" style="margin-top:16px;">
      <h3>&#9876; Player Characters</h3>
      <p style="color:#888;font-size:0.85rem;">Player characters are NPCs with alignment_tag set to <strong style="color:#e8b923;">player</strong>. Manage them via <a href="/npcs/admin" style="color:#e8b923;">NPCs Admin</a>.</p>
    </div>

    <div class="admin-campaign-form" style="margin-top:16px;">
      <h3>&#128228; Bulk Upload</h3>
      <p style="color:#888;font-size:0.85rem;">Bulk import NPCs, Artifacts, or Handouts via JSON. <a href="/bulk-upload/admin" style="color:#e8b923;">Go to Bulk Upload &rarr;</a></p>
    </div>
  </div>`;
  return pageShell("Home Admin — Halls of the Damned", "/", body, session);
}

// ── Calendar Admin ────────────────────────────────────────────
async function renderCalendarAdminPage(session, monthParam) {
  if (!session || session.role !== "admin") return null;
  let currentMonth = 6, currentDay = 21, currentYear = 1497;
  try {
    const cfgRes = await pgPool.query("SELECT key, value FROM hotd_config WHERE key IN ('current_month','current_day','current_year')");
    for (const r of cfgRes.rows) {
      if (r.key === "current_month") currentMonth = parseInt(r.value, 10);
      if (r.key === "current_day") currentDay = parseInt(r.value, 10);
      if (r.key === "current_year") currentYear = parseInt(r.value, 10);
    }
  } catch (_) {}
  const viewMonth = monthParam ? Math.max(1, Math.min(12, parseInt(monthParam, 10) || currentMonth)) : currentMonth;
  let events = [];
  try { const r = await pgPool.query("SELECT * FROM hotd_calendar_events WHERE month_idx = $1 ORDER BY day, id", [viewMonth]); events = r.rows; } catch (_) {}

  const monthOpts = HARPTOS_MONTHS.map(m => `<option value="${m.idx}"${m.idx === viewMonth ? " selected" : ""}>${m.name}</option>`).join("");
  const monthOptsDate = HARPTOS_MONTHS.map(m => `<option value="${m.idx}"${m.idx === currentMonth ? " selected" : ""}>${m.name}</option>`).join("");

  const eventRows = events.map(ev => `
    <tr>
      <td>${ev.id}</td><td>${ev.day}</td><td>${esc(ev.title)}</td><td>${esc(ev.description || "")}</td><td>${esc(ev.session_refs || "")}</td>
      <td>
        <button class="edit-btn-inline" onclick="toggleEdit(this)">Edit</button>
        <form method="POST" action="/admin/calendar/delete-event" style="display:inline;"><input type="hidden" name="id" value="${ev.id}" /><input type="hidden" name="month_idx" value="${viewMonth}" /><button type="submit" class="delete-btn-inline" onclick="return confirm('Delete?')">Delete</button></form>
      </td>
    </tr>
    <tr class="edit-row" style="display:none;">
      <td colspan="6">
        <form method="POST" action="/admin/calendar/update-event" class="admin-campaign-form" style="margin:0;padding:12px;">
          <input type="hidden" name="id" value="${ev.id}" /><input type="hidden" name="month_idx" value="${viewMonth}" />
          <div class="form-row">
            <div><label>Day</label><input type="number" name="day" value="${ev.day}" min="1" max="30" required /></div>
            <div><label>Title</label><input type="text" name="title" value="${esc(ev.title)}" required /></div>
          </div>
          <div class="form-row"><div><label>Description</label><input type="text" name="description" value="${esc(ev.description || "")}" /></div>
            <div><label>Session Refs</label><input type="text" name="session_refs" value="${esc(ev.session_refs || "")}" /></div></div>
          <button type="submit">Save</button>
        </form>
      </td>
    </tr>`).join("");

  const body = `
  <div class="content">
    <h2 class="section-title">&#9881; Calendar Admin</h2>
    <p style="color:#888;margin-bottom:16px;"><a href="/calendar?month=${viewMonth}" style="color:#e8b923;text-decoration:none;">&larr; Back to Calendar</a></p>

    <div class="admin-campaign-form">
      <h3>&#128197; Set Current Campaign Date</h3>
      <form method="POST" action="/admin/calendar/set-date">
        <div class="form-row">
          <div><label>Day</label><input type="number" name="day" min="1" max="30" value="${currentDay}" required /></div>
          <div><label>Month</label><select name="month_idx">${monthOptsDate}</select></div>
          <div><label>Year</label><input type="number" name="year" value="${currentYear}" required /></div>
        </div>
        <button type="submit">Update Current Date</button>
      </form>
    </div>

    <div class="admin-campaign-form" style="margin-top:16px;">
      <h3>&#10133; Add Calendar Event</h3>
      <form method="POST" action="/admin/calendar/add-event">
        <div class="form-row">
          <div><label>Day (1-30)</label><input type="number" name="day" min="1" max="30" required /></div>
          <div><label>Month</label><select name="month_idx">${monthOpts}</select></div>
        </div>
        <div class="form-row">
          <div><label>Title</label><input type="text" name="title" required /></div>
          <div><label>Session Refs</label><input type="text" name="session_refs" placeholder="e.g. 1,2,3" /></div>
        </div>
        <div class="form-row full"><div><label>Description</label><textarea name="description" rows="2"></textarea></div></div>
        <button type="submit">Add Event</button>
      </form>
    </div>

    <div class="admin-campaign-form" style="margin-top:16px;">
      <h3>Events for ${esc(HARPTOS_MONTHS.find(m=>m.idx===viewMonth)?.name || "?")} (${events.length})</h3>
      <div style="margin-bottom:12px;">${HARPTOS_MONTHS.map(m => `<a href="/calendar/admin?month=${m.idx}" style="color:${m.idx===viewMonth?"#e8b923":"#888"};text-decoration:none;margin-right:8px;font-size:0.8rem;">${m.name}</a>`).join("")}</div>
      ${events.length > 0 ? `<div style="overflow-x:auto;"><table class="account-table"><thead><tr><th>ID</th><th>Day</th><th>Title</th><th>Description</th><th>Sessions</th><th>Actions</th></tr></thead><tbody>${eventRows}</tbody></table></div>` : "<p style=\"color:#888;\">No events for this month.</p>"}
    </div>
  </div>
  <script>
  function toggleEdit(btn){var r=btn.closest('tr').nextElementSibling;r.style.display=r.style.display==='none'?'table-row':'none';}
  </script>`;
  return pageShell("Calendar Admin — Halls of the Damned", "/calendar", body, session);
}

// ── Maps Admin ────────────────────────────────────────────────
async function renderMapsAdminPage(session) {
  if (!session || session.role !== "admin") return null;
  let maps = [];
  try { const r = await pgPool.query("SELECT * FROM hotd_maps ORDER BY sort_order, id"); maps = r.rows; } catch (_) {}

  const mapRows = maps.map(m => `
    <tr>
      <td>${m.id}</td><td>${esc(m.name)}</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">${esc(m.image_url)}</td>
      <td>${esc(m.description || "")}</td><td>${m.sort_order}</td>
      <td>
        <button class="edit-btn-inline" onclick="toggleEdit(this)">Edit</button>
        <form method="POST" action="/admin/maps/delete" style="display:inline;"><input type="hidden" name="id" value="${m.id}" /><button type="submit" class="delete-btn-inline" onclick="return confirm('Delete this map?')">Delete</button></form>
      </td>
    </tr>
    <tr class="edit-row" style="display:none;">
      <td colspan="6">
        <form method="POST" action="/admin/maps/update" enctype="multipart/form-data" class="admin-campaign-form" style="margin:0;padding:12px;">
          <input type="hidden" name="id" value="${m.id}" />
          <div class="form-row"><div><label>Name</label><input type="text" name="name" value="${esc(m.name)}" required /></div><div><label>Image URL</label><input type="text" name="image_url" value="${esc(m.image_url)}" /></div></div>
          <div class="form-row"><div><label>Upload Image</label><input type="file" name="image_file" accept="image/jpeg,image/png,image/bmp,image/webp" /></div><div></div></div>
          <div class="form-row full"><div><label>Description</label><textarea name="description" rows="2">${esc(m.description || "")}</textarea></div></div>
          <div class="form-row"><div><label>Sort Order</label><input type="number" name="sort_order" value="${m.sort_order}" /></div><div></div></div>
          <button type="submit">Save</button>
        </form>
      </td>
    </tr>`).join("");

  const body = `
  <div class="content">
    <h2 class="section-title">&#9881; Maps Admin</h2>
    <p style="color:#888;margin-bottom:16px;"><a href="/maps" style="color:#e8b923;text-decoration:none;">&larr; Back to Maps</a></p>

    <div class="admin-campaign-form">
      <h3>&#10133; Add Map</h3>
      <form method="POST" action="/admin/maps/add" enctype="multipart/form-data">
        <div class="form-row"><div><label>Map Name</label><input type="text" name="name" required /></div><div><label>Image URL</label><input type="text" name="image_url" placeholder="/images/maps/..." /></div></div>
        <div class="form-row"><div><label>Upload Image</label><input type="file" name="image_file" accept="image/jpeg,image/png,image/bmp,image/webp" /></div><div></div></div>
        <div class="form-row full"><div><label>Description</label><textarea name="description" rows="2"></textarea></div></div>
        <div class="form-row"><div><label>Sort Order</label><input type="number" name="sort_order" value="0" /></div><div></div></div>
        <button type="submit">Add Map</button>
      </form>
    </div>

    <div class="admin-campaign-form" style="margin-top:16px;">
      <h3>Existing Maps (${maps.length})</h3>
      ${maps.length > 0 ? `<div style="overflow-x:auto;"><table class="account-table"><thead><tr><th>ID</th><th>Name</th><th>Image URL</th><th>Description</th><th>Sort</th><th>Actions</th></tr></thead><tbody>${mapRows}</tbody></table></div>` : "<p style=\"color:#888;\">No maps yet.</p>"}
    </div>
  </div>
  <script>
  function toggleEdit(btn){var r=btn.closest('tr').nextElementSibling;r.style.display=r.style.display==='none'?'table-row':'none';}
  </script>`;
  return pageShell("Maps Admin — Halls of the Damned", "/maps", body, session);
}

// ── NPCs Admin ────────────────────────────────────────────────
async function renderNpcsAdminPage(session) {
  if (!session || session.role !== "admin") return null;
  let npcs = [];
  try { const r = await pgPool.query("SELECT * FROM hotd_npcs ORDER BY sort_order, name"); npcs = r.rows; } catch (_) {}

  const npcRows = npcs.map(n => `
    <tr>
      <td>${n.id}</td><td>${esc(n.name)}</td><td>${esc(n.race || "")}</td><td>${esc(n.npc_class || "")}</td>
      <td>${esc(n.alignment_tag)}</td><td>${esc(n.status || "")}</td><td>${n.sort_order}</td>
      <td style="text-align:center;"><span style="color:${n.is_hidden ? '#ef4444' : '#22c55e'};font-weight:600;">${n.is_hidden ? 'Hidden' : 'Visible'}</span></td>
      <td>
        <button class="edit-btn-inline" onclick="toggleEdit(this)">Edit</button>
        <form method="POST" action="/admin/npcs/delete" style="display:inline;"><input type="hidden" name="id" value="${n.id}" /><button type="submit" class="delete-btn-inline" onclick="return confirm('Delete?')">Delete</button></form>
      </td>
    </tr>
    <tr class="edit-row" style="display:none;">
      <td colspan="9">
        <form method="POST" action="/admin/npcs/update" enctype="multipart/form-data" class="admin-campaign-form" style="margin:0;padding:12px;">
          <input type="hidden" name="id" value="${n.id}" />
          <div class="form-row"><div><label>Name</label><input type="text" name="name" value="${esc(n.name)}" required /></div><div><label>Race</label><input type="text" name="race" value="${esc(n.race || "")}" /></div></div>
          <div class="form-row"><div><label>Class</label><input type="text" name="npc_class" value="${esc(n.npc_class || "")}" /></div><div><label>Location</label><input type="text" name="location" value="${esc(n.location || "")}" /></div></div>
          <div class="form-row"><div><label>Status</label><input type="text" name="status" value="${esc(n.status || "")}" /></div>
            <div><label>Alignment</label><select name="alignment_tag"><option value="ally"${n.alignment_tag==="ally"?" selected":""}>Ally</option><option value="enemy"${n.alignment_tag==="enemy"?" selected":""}>Enemy</option><option value="neutral"${n.alignment_tag==="neutral"?" selected":""}>Neutral</option></select></div></div>
          <div class="form-row"><div><label>Portrait URL (or upload below)</label><input type="text" name="portrait_url" value="${esc(n.portrait_url || "")}" /></div><div><label>Sort Order</label><input type="number" name="sort_order" value="${n.sort_order}" /></div></div>
          <div class="form-row"><div><label>Hidden from players?</label><select name="is_hidden"><option value="true"${n.is_hidden ? ' selected' : ''}>Hidden</option><option value="false"${!n.is_hidden ? ' selected' : ''}>Visible</option></select></div><div></div></div>
          <div class="form-row full"><div><label>Upload New Portrait Image</label><input type="file" name="portrait_file" accept="image/jpeg,image/png,image/bmp" style="color:#ccc;" /></div></div>
          ${n.portrait_url ? `<div class="form-row full"><div><label>Current Portrait</label><img src="${esc(n.portrait_url)}" alt="current" style="max-height:80px;border-radius:6px;margin-top:4px;" /></div></div>` : ''}
          <div class="form-row full"><div><label>Description</label><textarea name="description" rows="3">${esc(n.description || "")}</textarea></div></div>
          <button type="submit">Save</button>
        </form>
      </td>
    </tr>`).join("");

  const body = `
  <div class="content">
    <h2 class="section-title">&#9881; NPC Admin</h2>
    <p style="color:#888;margin-bottom:16px;"><a href="/npcs" style="color:#e8b923;text-decoration:none;">&larr; Back to NPCs</a></p>

    <div class="admin-campaign-form">
      <h3>&#10133; Add NPC</h3>
      <form method="POST" action="/admin/npcs/add" enctype="multipart/form-data">
        <div class="form-row"><div><label>Name</label><input type="text" name="name" required /></div><div><label>Race</label><input type="text" name="race" /></div></div>
        <div class="form-row"><div><label>Class</label><input type="text" name="npc_class" /></div><div><label>Location</label><input type="text" name="location" /></div></div>
        <div class="form-row"><div><label>Status</label><input type="text" name="status" value="Alive" /></div>
          <div><label>Alignment</label><select name="alignment_tag"><option value="ally">Ally</option><option value="enemy">Enemy</option><option value="neutral" selected>Neutral</option></select></div></div>
        <div class="form-row"><div><label>Portrait URL (or upload below)</label><input type="text" name="portrait_url" placeholder="/images/NpcName.jpg" /></div><div><label>Sort Order</label><input type="number" name="sort_order" value="0" /></div></div>
        <div class="form-row"><div><label>Hidden from players?</label><select name="is_hidden"><option value="true" selected>Hidden</option><option value="false">Visible</option></select></div><div></div></div>
        <div class="form-row full"><div><label>Upload Portrait Image</label><input type="file" name="portrait_file" accept="image/jpeg,image/png,image/bmp" style="color:#ccc;" /></div></div>
        <div class="form-row full"><div><label>Description</label><textarea name="description" rows="3"></textarea></div></div>
        <button type="submit">Add NPC</button>
      </form>
    </div>

    <div class="admin-campaign-form" style="margin-top:16px;">
      <h3>Existing NPCs (${npcs.length})</h3>
      ${npcs.length > 0 ? `<div style="overflow-x:auto;"><table class="account-table"><thead><tr><th>ID</th><th>Name</th><th>Race</th><th>Class</th><th>Align</th><th>Status</th><th>Sort</th><th>Visible</th><th>Actions</th></tr></thead><tbody>${npcRows}</tbody></table></div>` : "<p style=\"color:#888;\">No NPCs yet.</p>"}
    </div>
  </div>
  <script>
  function toggleEdit(btn){var r=btn.closest('tr').nextElementSibling;r.style.display=r.style.display==='none'?'table-row':'none';}
  </script>`;
  return pageShell("NPC Admin — Halls of the Damned", "/npcs", body, session);
}

// ── Sessions Admin ────────────────────────────────────────────
async function renderSessionsAdminPage(session) {
  if (!session || session.role !== "admin") return null;
  let sessions = [];
  try { const r = await pgPool.query("SELECT * FROM hotd_sessions ORDER BY session_number"); sessions = r.rows; } catch (_) {}

  const sessRows = sessions.map(s => {
    const pdVal = s.play_date ? new Date(s.play_date).toISOString().slice(0,16) : "";
    return `
    <tr>
      <td>${s.id}</td><td>${s.session_number}</td><td>${esc(s.title)}</td><td>${esc(s.game_date || "")}</td>
      <td>${pdVal ? esc(new Date(s.play_date).toLocaleDateString()) : ""}</td>
      <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.summary || "")}</td>
      <td>
        <button class="edit-btn-inline" onclick="toggleEdit(this)">Edit</button>
        <form method="POST" action="/admin/sessions/delete" style="display:inline;"><input type="hidden" name="id" value="${s.id}" /><button type="submit" class="delete-btn-inline" onclick="return confirm('Delete?')">Delete</button></form>
      </td>
    </tr>
    <tr class="edit-row" style="display:none;">
      <td colspan="7">
        <form method="POST" action="/admin/sessions/update" class="admin-campaign-form" style="margin:0;padding:12px;">
          <input type="hidden" name="id" value="${s.id}" />
          <div class="form-row"><div><label>Session #</label><input type="number" name="session_number" value="${s.session_number}" required /></div><div><label>Title</label><input type="text" name="title" value="${esc(s.title)}" required /></div></div>
          <div class="form-row"><div><label>In-Game Date</label><input type="text" name="game_date" value="${esc(s.game_date || "")}" /></div><div><label>Play Date</label><input type="datetime-local" name="play_date" value="${pdVal}" /></div></div>
          <div class="form-row full"><div><label>Summary (line breaks &amp; indentation preserved)</label><textarea name="summary" rows="10" style="white-space:pre-wrap;font-family:inherit;">${esc(s.summary || "")}</textarea></div></div>
          <button type="submit">Save</button>
        </form>
      </td>
    </tr>`;
  }).join("");

  const body = `
  <div class="content">
    <h2 class="section-title">&#9881; Sessions Admin</h2>
    <p style="color:#888;margin-bottom:16px;"><a href="/sessions" style="color:#e8b923;text-decoration:none;">&larr; Back to Sessions</a></p>

    <div class="admin-campaign-form">
      <h3>&#10133; Add Session Log</h3>
      <form method="POST" action="/admin/sessions/add">
        <div class="form-row"><div><label>Session Number</label><input type="number" name="session_number" min="0" required /></div><div><label>Title</label><input type="text" name="title" required /></div></div>
        <div class="form-row"><div><label>In-Game Date</label><input type="text" name="game_date" placeholder="e.g. 25th of Mirtul" /></div><div><label>Play Date</label><input type="datetime-local" name="play_date" /></div></div>
        <div class="form-row full"><div><label>Summary (line breaks &amp; indentation preserved)</label><textarea name="summary" rows="10" style="white-space:pre-wrap;font-family:inherit;"></textarea></div></div>
        <button type="submit">Add Session</button>
      </form>
    </div>

    <div class="admin-campaign-form" style="margin-top:16px;">
      <h3>Existing Sessions (${sessions.length})</h3>
      ${sessions.length > 0 ? `<div style="overflow-x:auto;"><table class="account-table"><thead><tr><th>ID</th><th>#</th><th>Title</th><th>In-Game</th><th>Played</th><th>Summary</th><th>Actions</th></tr></thead><tbody>${sessRows}</tbody></table></div>` : "<p style=\"color:#888;\">No sessions yet.</p>"}
    </div>
  </div>
  <script>
  function toggleEdit(btn){var r=btn.closest('tr').nextElementSibling;r.style.display=r.style.display==='none'?'table-row':'none';}
  </script>`;
  return pageShell("Sessions Admin — Halls of the Damned", "/sessions", body, session);
}

// ── Artifacts Admin ───────────────────────────────────────────
async function renderArtifactsAdminPage(session) {
  if (!session || session.role !== "admin") return null;
  let artifacts = [];
  try { const r = await pgPool.query("SELECT * FROM hotd_artifacts ORDER BY is_legendary DESC, name"); artifacts = r.rows; } catch (_) {}

  const artRows = artifacts.map(a => `
    <tr>
      <td>${a.id}</td><td>${esc(a.name)}</td><td>${esc(a.rarity)}</td><td>${a.is_legendary ? "Yes" : "No"}</td><td>${esc(a.owner || "")}</td>
      <td>
        <button class="edit-btn-inline" onclick="toggleEdit(this)">Edit</button>
        <form method="POST" action="/admin/artifacts/delete" style="display:inline;"><input type="hidden" name="id" value="${a.id}" /><button type="submit" class="delete-btn-inline" onclick="return confirm('Delete?')">Delete</button></form>
      </td>
    </tr>
    <tr class="edit-row" style="display:none;">
      <td colspan="6">
        <form method="POST" action="/admin/artifacts/update" enctype="multipart/form-data" class="admin-campaign-form" style="margin:0;padding:12px;">
          <input type="hidden" name="id" value="${a.id}" />
          <div class="form-row"><div><label>Name</label><input type="text" name="name" value="${esc(a.name)}" required /></div><div><label>Rarity</label><select name="rarity"><option value="Common"${a.rarity==="Common"?" selected":""}>Common</option><option value="Uncommon"${a.rarity==="Uncommon"?" selected":""}>Uncommon</option><option value="Rare"${a.rarity==="Rare"?" selected":""}>Rare</option><option value="Very Rare"${a.rarity==="Very Rare"?" selected":""}>Very Rare</option><option value="Legendary"${a.rarity==="Legendary"?" selected":""}>Legendary</option><option value="Artifact"${a.rarity==="Artifact"?" selected":""}>Artifact</option></select></div></div>
          <div class="form-row"><div><label>Image URL</label><input type="text" name="image_url" value="${esc(a.image_url || "")}" /></div><div><label>Owner</label><input type="text" name="owner" value="${esc(a.owner || "")}" /></div></div>
          <div class="form-row"><div><label>Upload Image</label><input type="file" name="image_file" accept="image/jpeg,image/png,image/bmp,video/webm,image/webm" /></div><div></div></div>
          <div class="form-row full"><div><label>Description</label><textarea name="description" rows="3">${esc(a.description || "")}</textarea></div></div>
          <div class="form-row full"><div><label>Lore</label><textarea name="lore" rows="3">${esc(a.lore || "")}</textarea></div></div>
          <div class="form-row"><div><label><input type="checkbox" name="is_legendary" value="true" ${a.is_legendary ? "checked" : ""} /> Legendary Item</label></div><div></div></div>
          <button type="submit">Save</button>
        </form>
      </td>
    </tr>`).join("");

  const body = `
  <div class="content">
    <h2 class="section-title">&#9881; Artifacts Admin</h2>
    <p style="color:#888;margin-bottom:16px;"><a href="/artifacts" style="color:#e8b923;text-decoration:none;">&larr; Back to Artifacts</a></p>

    <div class="admin-campaign-form">
      <h3>&#10133; Add Artifact</h3>
      <form method="POST" action="/admin/artifacts/add" enctype="multipart/form-data">
        <div class="form-row"><div><label>Name</label><input type="text" name="name" required /></div><div><label>Rarity</label><select name="rarity"><option value="Common">Common</option><option value="Uncommon">Uncommon</option><option value="Rare">Rare</option><option value="Very Rare">Very Rare</option><option value="Legendary">Legendary</option><option value="Artifact">Artifact</option></select></div></div>
        <div class="form-row"><div><label>Image URL</label><input type="text" name="image_url" placeholder="/images/artifact.jpg" /></div><div><label>Owner</label><input type="text" name="owner" /></div></div>
        <div class="form-row"><div><label>Upload Image</label><input type="file" name="image_file" accept="image/jpeg,image/png,image/bmp,video/webm,image/webm" /></div><div></div></div>
        <div class="form-row full"><div><label>Description</label><textarea name="description" rows="3"></textarea></div></div>
        <div class="form-row full"><div><label>Lore</label><textarea name="lore" rows="3"></textarea></div></div>
        <div class="form-row"><div><label><input type="checkbox" name="is_legendary" value="true" /> Legendary Item</label></div><div></div></div>
        <button type="submit">Add Artifact</button>
      </form>
    </div>

    <div class="admin-campaign-form" style="margin-top:16px;">
      <h3>Existing Artifacts (${artifacts.length})</h3>
      ${artifacts.length > 0 ? `<div style="overflow-x:auto;"><table class="account-table"><thead><tr><th>ID</th><th>Name</th><th>Rarity</th><th>Legendary</th><th>Owner</th><th>Actions</th></tr></thead><tbody>${artRows}</tbody></table></div>` : `<p style="color:#888;">No artifacts yet.</p>`}
    </div>
  </div>
  <script>
  function toggleEdit(btn){var r=btn.closest('tr').nextElementSibling;r.style.display=r.style.display==='none'?'table-row':'none';}
  </script>`;
  return pageShell("Artifacts Admin — Halls of the Damned", "/artifacts", body, session);
}

// ── Handouts Admin ────────────────────────────────────────────
async function renderHandoutsAdminPage(session) {
  if (!session || session.role !== "admin") return null;
  let handouts = [];
  try { const r = await pgPool.query("SELECT * FROM hotd_handouts ORDER BY name"); handouts = r.rows; } catch (_) {}

  const artRows = handouts.map(a => `
    <tr>
      <td>${a.id}</td><td>${esc(a.name)}</td>
      <td>
        <button class="edit-btn-inline" onclick="toggleEdit(this)">Edit</button>
        <form method="POST" action="/admin/handouts/delete" style="display:inline;"><input type="hidden" name="id" value="${a.id}" /><button type="submit" class="delete-btn-inline" onclick="return confirm('Delete?')">Delete</button></form>
      </td>
    </tr>
    <tr class="edit-row" style="display:none;">
      <td colspan="3">
        <form method="POST" action="/admin/handouts/update" enctype="multipart/form-data" class="admin-campaign-form" style="margin:0;padding:12px;">
          <input type="hidden" name="id" value="${a.id}" />
          <div class="form-row"><div><label>Name</label><input type="text" name="name" value="${esc(a.name)}" required /></div><div></div></div>
          <div class="form-row"><div><label>Upload Image</label><input type="file" name="image_file" accept="image/jpeg,image/png,image/bmp,video/webm,image/webm" /></div><div></div></div>
          <div class="form-row full"><div><label>Description</label><textarea name="description" rows="3">${esc(a.description || "")}</textarea></div></div>
          <div class="form-row full"><div><label>About</label><textarea name="about" rows="3">${esc(a.about || "")}</textarea></div></div>
          <button type="submit">Save</button>
        </form>
      </td>
    </tr>`).join("");

  const body = `
  <div class="content">
    <h2 class="section-title">&#9881; Handouts Admin</h2>
    <p style="color:#888;margin-bottom:16px;"><a href="/handouts" style="color:#e8b923;text-decoration:none;">&larr; Back to Handouts</a></p>

    <div class="admin-campaign-form">
      <h3>&#10133; Add Handout</h3>
      <form method="POST" action="/admin/handouts/add" enctype="multipart/form-data">
        <div class="form-row"><div><label>Name</label><input type="text" name="name" required /></div><div></div></div>
        <div class="form-row"><div><label>Upload Image</label><input type="file" name="image_file" accept="image/jpeg,image/png,image/bmp,video/webm,image/webm" /></div><div></div></div>
        <div class="form-row full"><div><label>Description</label><textarea name="description" rows="3"></textarea></div></div>
        <div class="form-row full"><div><label>About</label><textarea name="about" rows="3"></textarea></div></div>
        <button type="submit">Add Handout</button>
      </form>
    </div>

    <div class="admin-campaign-form" style="margin-top:16px;">
      <h3>Existing Handouts (${handouts.length})</h3>
      ${handouts.length > 0 ? `<div style="overflow-x:auto;"><table class="account-table"><thead><tr><th>ID</th><th>Name</th><th>Actions</th></tr></thead><tbody>${artRows}</tbody></table></div>` : `<p style="color:#888;">No handouts yet.</p>`}
    </div>
  </div>
  <script>
  function toggleEdit(btn){var r=btn.closest('tr').nextElementSibling;r.style.display=r.style.display==='none'?'table-row':'none';}
  </script>`;
  return pageShell("Handouts Admin — Halls of the Damned", "/handouts", body, session);
}

// ── Art / Images Admin ────────────────────────────────────────
async function renderArtAdminPage(session) {
  if (!session || session.role !== "admin") return null;
  let artItems = [];
  try { const r = await pgPool.query("SELECT * FROM hotd_art ORDER BY sort_order, created_at DESC"); artItems = r.rows; } catch (_) {}

  const artRows = artItems.map(a => `
    <tr>
      <td>${a.id}</td><td>${esc(a.title || "(untitled)")}</td><td>${a.image_url ? `<img src="${esc(a.image_url)}" style="height:40px;border-radius:4px;" />` : "\u2014"}</td>
      <td>
        <button class="edit-btn-inline" onclick="toggleEdit(this)">Edit</button>
        <form method="POST" action="/admin/art/delete" style="display:inline;"><input type="hidden" name="id" value="${a.id}" /><button type="submit" class="delete-btn-inline" onclick="return confirm('Delete?')">Delete</button></form>
      </td>
    </tr>
    <tr class="edit-row" style="display:none;">
      <td colspan="4">
        <form method="POST" action="/admin/art/update" enctype="multipart/form-data" class="admin-campaign-form" style="margin:0;padding:12px;">
          <input type="hidden" name="id" value="${a.id}" />
          <div class="form-row"><div><label>Title</label><input type="text" name="title" value="${esc(a.title || "")}" /></div><div><label>Sort Order</label><input type="number" name="sort_order" value="${a.sort_order || 0}" /></div></div>
          <div class="form-row"><div><label>Upload New Image</label><input type="file" name="image_file" accept="image/jpeg,image/png,image/bmp,image/webp" /></div><div></div></div>
          <div class="form-row full"><div><label>Description</label><textarea name="description" rows="2">${esc(a.description || "")}</textarea></div></div>
          <button type="submit">Save</button>
        </form>
      </td>
    </tr>`).join("");

  const body = `
  <div class="content">
    <h2 class="section-title">&#9881; Art &amp; Images Admin</h2>
    <p style="color:#888;margin-bottom:16px;"><a href="/art" style="color:#e8b923;text-decoration:none;">&larr; Back to Art</a></p>

    <div class="admin-campaign-form">
      <h3>&#10133; Add Art / Image</h3>
      <form method="POST" action="/admin/art/add" enctype="multipart/form-data">
        <div class="form-row"><div><label>Title (optional)</label><input type="text" name="title" /></div><div><label>Sort Order</label><input type="number" name="sort_order" value="0" /></div></div>
        <div class="form-row"><div><label>Upload Image</label><input type="file" name="image_file" accept="image/jpeg,image/png,image/bmp,image/webp" required /></div><div></div></div>
        <div class="form-row full"><div><label>Description (optional)</label><textarea name="description" rows="2"></textarea></div></div>
        <button type="submit">Add Image</button>
      </form>
    </div>

    <div class="admin-campaign-form" style="margin-top:16px;">
      <h3>Existing Art (${artItems.length})</h3>
      ${artItems.length > 0 ? `<div style="overflow-x:auto;"><table class="account-table"><thead><tr><th>ID</th><th>Title</th><th>Preview</th><th>Actions</th></tr></thead><tbody>${artRows}</tbody></table></div>` : `<p style="color:#888;">No art uploaded yet.</p>`}
    </div>
  </div>
  <script>
  function toggleEdit(btn){var r=btn.closest('tr').nextElementSibling;r.style.display=r.style.display==='none'?'table-row':'none';}
  </script>`;
  return pageShell("Art Admin — Halls of the Damned", "/art", body, session);
}

// ── Bulk Upload Admin ─────────────────────────────────────────
async function renderBulkUploadAdminPage(session) {
  if (!session || session.role !== "admin") return null;

  const npcSample = JSON.stringify([{ name: "Elminster Aumar", race: "Human", npc_class: "Wizard", location: "Shadowdale", status: "Alive", alignment_tag: "neutral-good", portrait_url: "", description: "The Sage of Shadowdale.", sort_order: 0 }], null, 2);
  const artifactSample = JSON.stringify([{ name: "Staff of the Magi", rarity: "Legendary", image_url: "", description: "A powerful staff.", lore: "Forged in the depths of...", is_legendary: true, owner: "" }], null, 2);
  const handoutSample = JSON.stringify([{ name: "Letter from Lord Neverember", image_url: "", description: "A sealed letter.", about: "Found in Session 5..." }], null, 2);

  const body = `
  <div class="content">
    <h2 class="section-title">&#9881; Bulk Upload</h2>
    <p style="color:#888;margin-bottom:16px;"><a href="/" style="color:#e8b923;text-decoration:none;">&larr; Back to Home</a></p>
    <p style="color:#aaa;margin-bottom:24px;">Paste a JSON array to bulk-insert NPCs, Artifacts, or Handouts. Use the individual admin pages to edit or delete existing records.</p>

    <div id="bulkResult" style="display:none;margin-bottom:16px;padding:12px 16px;border-radius:8px;font-weight:600;"></div>

    <div class="admin-campaign-form">
      <h3>&#128228; NPCs</h3>
      <details style="margin-bottom:8px;"><summary style="cursor:pointer;color:#e8b923;font-size:0.85rem;">Show JSON template</summary><pre style="background:#111;padding:12px;border-radius:6px;font-size:0.8rem;overflow-x:auto;color:#ccc;margin-top:8px;">${esc(npcSample)}</pre></details>
      <textarea id="npcJson" rows="6" style="width:100%;background:#111;color:#e0ddd5;border:1px solid #333;border-radius:6px;padding:12px;font-family:monospace;font-size:0.85rem;" placeholder='[{"name":"...","race":"...","npc_class":"..."}]'></textarea>
      <button onclick="bulkUpload('npcs','npcJson')" style="margin-top:8px;padding:10px 20px;background:#e8b923;color:#1a1a1a;border:none;border-radius:6px;font-weight:700;cursor:pointer;">Upload NPCs</button>
    </div>

    <div class="admin-campaign-form" style="margin-top:16px;">
      <h3>&#128228; Artifacts</h3>
      <details style="margin-bottom:8px;"><summary style="cursor:pointer;color:#e8b923;font-size:0.85rem;">Show JSON template</summary><pre style="background:#111;padding:12px;border-radius:6px;font-size:0.8rem;overflow-x:auto;color:#ccc;margin-top:8px;">${esc(artifactSample)}</pre></details>
      <textarea id="artifactJson" rows="6" style="width:100%;background:#111;color:#e0ddd5;border:1px solid #333;border-radius:6px;padding:12px;font-family:monospace;font-size:0.85rem;" placeholder='[{"name":"...","rarity":"Rare","description":"..."}]'></textarea>
      <button onclick="bulkUpload('artifacts','artifactJson')" style="margin-top:8px;padding:10px 20px;background:#e8b923;color:#1a1a1a;border:none;border-radius:6px;font-weight:700;cursor:pointer;">Upload Artifacts</button>
    </div>

    <div class="admin-campaign-form" style="margin-top:16px;">
      <h3>&#128228; Handouts</h3>
      <details style="margin-bottom:8px;"><summary style="cursor:pointer;color:#e8b923;font-size:0.85rem;">Show JSON template</summary><pre style="background:#111;padding:12px;border-radius:6px;font-size:0.8rem;overflow-x:auto;color:#ccc;margin-top:8px;">${esc(handoutSample)}</pre></details>
      <textarea id="handoutJson" rows="6" style="width:100%;background:#111;color:#e0ddd5;border:1px solid #333;border-radius:6px;padding:12px;font-family:monospace;font-size:0.85rem;" placeholder='[{"name":"...","description":"...","about":"..."}]'></textarea>
      <button onclick="bulkUpload('handouts','handoutJson')" style="margin-top:8px;padding:10px 20px;background:#e8b923;color:#1a1a1a;border:none;border-radius:6px;font-weight:700;cursor:pointer;">Upload Handouts</button>
    </div>

    <div class="admin-campaign-form" style="margin-top:16px;">
      <h3>&#128193; Upload from JSON File</h3>
      <p style="color:#888;font-size:0.85rem;margin-bottom:8px;">Select a JSON file and choose the entity type to upload.</p>
      <div class="form-row">
        <div><label>Entity Type</label><select id="fileEntity"><option value="npcs">NPCs</option><option value="artifacts">Artifacts</option><option value="handouts">Handouts</option></select></div>
        <div><label>JSON File</label><input type="file" id="jsonFile" accept=".json" /></div>
      </div>
      <button onclick="uploadFile()" style="margin-top:8px;padding:10px 20px;background:#e8b923;color:#1a1a1a;border:none;border-radius:6px;font-weight:700;cursor:pointer;">Upload File</button>
    </div>
  </div>
  <script>
  async function bulkUpload(entity, textareaId) {
    var el = document.getElementById(textareaId);
    var raw = el.value.trim();
    if (!raw) { showResult('Paste JSON data first.', true); return; }
    try { JSON.parse(raw); } catch(e) { showResult('Invalid JSON: ' + e.message, true); return; }
    try {
      var res = await fetch('/api/bulk-upload/' + entity, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw
      });
      var data = await res.json();
      if (data.error) { showResult('Error: ' + data.error, true); }
      else { showResult('Success! Inserted ' + data.inserted + ' of ' + data.total + ' ' + entity + '.', false); el.value = ''; }
    } catch(e) { showResult('Network error: ' + e.message, true); }
  }
  async function uploadFile() {
    var fileInput = document.getElementById('jsonFile');
    var entity = document.getElementById('fileEntity').value;
    if (!fileInput.files.length) { showResult('Select a file first.', true); return; }
    var reader = new FileReader();
    reader.onload = async function(e) {
      var raw = e.target.result;
      try { JSON.parse(raw); } catch(err) { showResult('Invalid JSON file: ' + err.message, true); return; }
      try {
        var res = await fetch('/api/bulk-upload/' + entity, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw
        });
        var data = await res.json();
        if (data.error) { showResult('Error: ' + data.error, true); }
        else { showResult('Success! Inserted ' + data.inserted + ' of ' + data.total + ' ' + entity + ' from file.', false); fileInput.value = ''; }
      } catch(err) { showResult('Network error: ' + err.message, true); }
    };
    reader.readAsText(fileInput.files[0]);
  }
  function showResult(msg, isError) {
    var d = document.getElementById('bulkResult');
    d.style.display = 'block';
    d.style.background = isError ? '#3b1111' : '#113b11';
    d.style.color = isError ? '#ef4444' : '#4ade80';
    d.textContent = msg;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  </script>`;
  return pageShell("Bulk Upload — Halls of the Damned", "/", body, session);
}

// ── Map Markers Admin ─────────────────────────────────────────
async function renderMapAdminPage(session) {
  if (!session || session.role !== "admin") return null;
  let markers = [];
  try {
    const r = await pgPool.query("SELECT * FROM hotd_map_markers ORDER BY id");
    markers = r.rows;
  } catch (_) {}

  const IMG_W = 5025, IMG_H = 3225;
  // Hex size: ~67px per hex on the 5025×3225 image (measured from grid)
  const HEX_SIZE = 67;
  const markerJson = JSON.stringify(markers.map(m => ({ id: m.id, type: m.marker_type, label: m.label, x: parseFloat(m.x), y: parseFloat(m.y), size: parseFloat(m.size || 54) })));
  const markerTableRows = markers.map(m => `
    <tr>
      <td>${m.id}</td>
      <td>${esc(m.marker_type)}</td>
      <td>${esc(m.label)}</td>
      <td>${parseFloat(m.x).toFixed(0)}, ${parseFloat(m.y).toFixed(0)}</td>
      <td>${parseFloat(m.size || 54).toFixed(0)}</td>
      <td>
        <form method="POST" action="/admin/map-markers/delete" style="display:inline;">
          <input type="hidden" name="id" value="${m.id}" />
          <button type="submit" class="delete-btn-inline" onclick="return confirm('Delete this marker?')">Delete</button>
        </form>
      </td>
    </tr>`).join("");

  const body = `
  <div class="content" style="width:95%;max-width:95%;margin:0 auto;">
    <h2 class="section-title">&#9881; Map Markers Admin</h2>
    <p style="color:#888;margin-bottom:16px;"><a href="/" style="color:#e8b923;text-decoration:none;">&larr; Back to Home</a> &nbsp;|&nbsp; <a href="/home/admin" style="color:#e8b923;text-decoration:none;">Home Admin</a></p>

    <div style="display:grid;grid-template-columns:1fr 360px;gap:20px;align-items:start;">
      <!-- MAP -->
      <div style="background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:20px;">
        <h3 style="color:#e8b923;margin:0 0 8px 0;font-size:1rem;">Click to place &middot; Drag to move &middot; Right-drag to pan</h3>
        <div style="margin-bottom:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <label style="color:#ccc;font-size:0.85rem;">Type:</label>
          <select id="markerTypeSelect" style="padding:6px 10px;background:#111;border:1px solid #444;color:#e0ddd5;border-radius:4px;font-size:0.85rem;">
            <option value="allied_werewolves">Allied Werewolves</option>
            <option value="battle">⚔️ Battle</option>
            <option value="barovia">Barovia</option>
            <option value="kezk">Kezk</option>
            <option value="party">Party</option>
            <option value="ravenkind">Ravenkind</option>
            <option value="strahd_abbot">Strahd Abbot</option>
            <option value="strahd_demon_army">Strahd Demon Army</option>
            <option value="strahd">Strahd</option>
            <option value="strahd_werewolves">Strahd Werewolves</option>
            <option value="villaki">Villaki</option>
            <option value="vistani">Vistani</option>
          </select>
          <label style="color:#ccc;font-size:0.85rem;">Label:</label>
          <input type="text" id="markerLabelInput" placeholder="Marker label..." style="padding:6px 10px;background:#111;border:1px solid #444;color:#e0ddd5;border-radius:4px;font-size:0.85rem;width:160px;" />
          <label style="color:#ccc;font-size:0.85rem;">Size:</label>
          <input type="range" id="markerSizeSlider" min="10" max="200" value="54" style="width:100px;accent-color:#e8b923;" />
          <span id="markerSizeVal" style="color:#e8b923;font-size:0.85rem;min-width:30px;">54</span>
        </div>
        <div id="adminMapContainer" style="width:100%;aspect-ratio:${IMG_W}/${IMG_H};overflow:hidden;cursor:crosshair;border-radius:8px;position:relative;background:#111;">
          <img id="adminMapImg" src="/images/main_map.jpeg" alt="Map of Barovia" draggable="false" style="position:absolute;top:0;left:0;transform-origin:0 0;max-width:none;user-select:none;width:${IMG_W}px;height:${IMG_H}px;" />
          <div id="adminMapMarkers" style="position:absolute;top:0;left:0;width:0;height:0;"></div>
        </div>
        <div style="color:#666;font-size:0.75rem;margin-top:8px;text-align:center;">Scroll to zoom &middot; Right-click+drag to pan &middot; Left-click empty area to place &middot; Drag markers to move</div>
      </div>

      <!-- SIDEBAR -->
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:16px;">
          <h3 style="color:#e8b923;margin:0 0 12px 0;font-size:1rem;">Marker Icons</h3>
          <div style="color:#ccc;font-size:0.85rem;line-height:2;">
            <div><img src="/images/icons/AlliedWerewolvesShield.png" style="width:18px;height:18px;vertical-align:middle;object-fit:contain;" /> <strong>Allied Werewolves</strong></div>
            <div>⚔️ <strong>Battle</strong> — Crossed Swords</div>
            <div><img src="/images/icons/baroviaShield.png" style="width:18px;height:18px;vertical-align:middle;object-fit:contain;" /> <strong>Barovia</strong></div>
            <div><img src="/images/icons/KezkShield.png" style="width:18px;height:18px;vertical-align:middle;object-fit:contain;" /> <strong>Kezk</strong></div>
            <div><img src="/images/icons/partyShield.png" style="width:18px;height:18px;vertical-align:middle;object-fit:contain;" /> <strong>Party</strong></div>
            <div><img src="/images/icons/RavenKindSheild.png" style="width:18px;height:18px;vertical-align:middle;object-fit:contain;" /> <strong>Ravenkind</strong></div>
            <div><img src="/images/icons/strahdAbbotShield.png" style="width:18px;height:18px;vertical-align:middle;object-fit:contain;" /> <strong>Strahd Abbot</strong></div>
            <div><img src="/images/icons/strahdDemonArmySheild.png" style="width:18px;height:18px;vertical-align:middle;object-fit:contain;" /> <strong>Strahd Demon Army</strong></div>
            <div><img src="/images/icons/strahdShield.png" style="width:18px;height:18px;vertical-align:middle;object-fit:contain;" /> <strong>Strahd</strong></div>
            <div><img src="/images/icons/strahdWerewolvesShield.png" style="width:18px;height:18px;vertical-align:middle;object-fit:contain;" /> <strong>Strahd Werewolves</strong></div>
            <div><img src="/images/icons/VillakiShield.png" style="width:18px;height:18px;vertical-align:middle;object-fit:contain;" /> <strong>Villaki</strong></div>
            <div><img src="/images/icons/vistaniShield.png" style="width:18px;height:18px;vertical-align:middle;object-fit:contain;" /> <strong>Vistani</strong></div>
          </div>
        </div>
        <div id="selectedMarkerPanel" style="background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:16px;display:none;">
          <h3 style="color:#e8b923;margin:0 0 12px 0;font-size:1rem;">Selected Marker</h3>
          <div style="color:#ccc;font-size:0.85rem;">
            <div style="margin-bottom:8px;"><strong id="selMarkerLabel"></strong> (<span id="selMarkerType"></span>)</div>
            <div style="margin-bottom:8px;">
              <label style="color:#888;">Resize:</label>
              <input type="range" id="selMarkerSize" min="10" max="200" value="54" style="width:140px;accent-color:#e8b923;vertical-align:middle;" />
              <span id="selMarkerSizeVal" style="color:#e8b923;min-width:30px;">54</span>px
            </div>
            <button id="selMarkerDeselect" style="padding:4px 12px;background:#333;border:1px solid #555;color:#ccc;border-radius:4px;cursor:pointer;font-size:0.8rem;">Deselect</button>
          </div>
        </div>
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:16px;max-height:400px;overflow-y:auto;">
          <h3 style="color:#e8b923;margin:0 0 12px 0;font-size:1rem;">Placed Markers (${markers.length})</h3>
          ${markers.length > 0 ? `<table class="admin-table" style="width:100%;font-size:0.8rem;"><thead><tr><th>ID</th><th>Type</th><th>Label</th><th>Pos</th><th>Size</th><th></th></tr></thead><tbody>${markerTableRows}</tbody></table>` : '<p style="color:#888;font-size:0.85rem;">No markers placed yet.</p>'}
        </div>
      </div>
    </div>
  </div>
  <script>
  (function() {
    var IMG_W = ${IMG_W}, IMG_H = ${IMG_H};
    var container = document.getElementById('adminMapContainer');
    var img = document.getElementById('adminMapImg');
    var markersEl = document.getElementById('adminMapMarkers');
    if (!container || !img) return;

    var cw = container.clientWidth, ch = container.clientHeight;
    var scale = Math.min(cw / IMG_W, ch / IMG_H);
    var minScale = scale * 0.5, maxScale = 5;
    var panX = (cw - IMG_W * scale) / 2, panY = (ch - IMG_H * scale) / 2;
    var isPanning = false, startX = 0, startY = 0;

    var ICON_PATHS = {
      allied_werewolves: '/images/icons/AlliedWerewolvesShield.png',
      barovia: '/images/icons/baroviaShield.png',
      kezk: '/images/icons/KezkShield.png',
      party: '/images/icons/partyShield.png',
      ravenkind: '/images/icons/RavenKindSheild.png',
      strahd_abbot: '/images/icons/strahdAbbotShield.png',
      strahd_demon_army: '/images/icons/strahdDemonArmySheild.png',
      strahd: '/images/icons/strahdShield.png',
      strahd_werewolves: '/images/icons/strahdWerewolvesShield.png',
      villaki: '/images/icons/VillakiShield.png',
      vistani: '/images/icons/vistaniShield.png'
    };
    var markers = ${markerJson};
    var dragging = null, dragStartX = 0, dragStartY = 0, dragOrigX = 0, dragOrigY = 0, didDrag = false;
    var selectedId = null;

    var sizeSlider = document.getElementById('markerSizeSlider');
    var sizeVal = document.getElementById('markerSizeVal');
    sizeSlider.addEventListener('input', function() { sizeVal.textContent = sizeSlider.value; });

    function applyTransform() {
      img.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + scale + ')';
      markersEl.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + scale + ')';
    }
    applyTransform();

    function selectMarker(m) {
      selectedId = m.id;
      document.getElementById('selectedMarkerPanel').style.display = 'block';
      document.getElementById('selMarkerLabel').textContent = m.label;
      document.getElementById('selMarkerType').textContent = m.type;
      var ss = document.getElementById('selMarkerSize');
      ss.value = m.size;
      document.getElementById('selMarkerSizeVal').textContent = Math.round(m.size);
      renderMarkers();
    }

    document.getElementById('selMarkerDeselect').addEventListener('click', function() {
      selectedId = null;
      document.getElementById('selectedMarkerPanel').style.display = 'none';
      renderMarkers();
    });

    document.getElementById('selMarkerSize').addEventListener('input', function() {
      var v = parseInt(this.value);
      document.getElementById('selMarkerSizeVal').textContent = v;
      var m = markers.find(function(x) { return x.id === selectedId; });
      if (m) { m.size = v; renderMarkers(); }
    });
    document.getElementById('selMarkerSize').addEventListener('change', function() {
      var v = parseInt(this.value);
      if (!selectedId) return;
      fetch('/api/map-markers/' + selectedId, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size: v })
      });
    });

    function renderMarkers() {
      markersEl.innerHTML = '';
      markers.forEach(function(m) {
        var mSize = m.size || 54;
        var div = document.createElement('div');
        var isSelected = m.id === selectedId;
        div.style.cssText = 'position:absolute;width:' + mSize + 'px;height:' + mSize + 'px;display:flex;align-items:center;justify-content:center;flex-direction:column;font-size:' + (mSize * 0.55) + 'px;cursor:grab;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.9));user-select:none;border-radius:50%;' + (isSelected ? 'outline:3px solid #e8b923;outline-offset:2px;' : '');
        div.style.left = (m.x - mSize / 2) + 'px';
        div.style.top = (m.y - mSize / 2) + 'px';
        div.title = m.label + ' (' + m.type + ', size:' + mSize + ')';
        div.dataset.markerId = m.id;

        var icon;
        if (ICON_PATHS[m.type]) {
          icon = document.createElement('img');
          icon.src = ICON_PATHS[m.type];
          icon.alt = m.type;
          icon.style.cssText = 'width:' + (mSize * 0.85) + 'px;height:' + (mSize * 0.85) + 'px;pointer-events:none;object-fit:contain;';
        } else {
          icon = document.createElement('span');
          icon.textContent = m.type === 'battle' ? '\u2694\uFE0F' : '\u{1F4CD}';
          icon.style.lineHeight = '1';
        }
        div.appendChild(icon);

        if (m.label) {
          var lbl = document.createElement('span');
          lbl.textContent = m.label;
          lbl.style.cssText = 'font-size:' + Math.max(8, mSize * 0.18) + 'px;color:#fff;background:rgba(0,0,0,0.7);padding:1px 4px;border-radius:3px;white-space:nowrap;margin-top:2px;max-width:' + (mSize * 2) + 'px;overflow:hidden;text-overflow:ellipsis;';
          div.appendChild(lbl);
        }

        // Drag start
        div.addEventListener('mousedown', function(e) {
          if (e.button !== 0) return;
          e.stopPropagation();
          dragging = m;
          didDrag = false;
          dragStartX = e.clientX;
          dragStartY = e.clientY;
          dragOrigX = m.x;
          dragOrigY = m.y;
          div.style.cursor = 'grabbing';
        });

        div.addEventListener('click', function(e) {
          e.stopPropagation();
          if (!didDrag) selectMarker(m);
        });

        markersEl.appendChild(div);
      });
    }
    renderMarkers();

    // Global mousemove/up for dragging markers
    window.addEventListener('mousemove', function(e) {
      if (isPanning) { panX = e.clientX - startX; panY = e.clientY - startY; applyTransform(); return; }
      if (!dragging) return;
      var dx = (e.clientX - dragStartX) / scale;
      var dy = (e.clientY - dragStartY) / scale;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag = true;
      dragging.x = dragOrigX + dx;
      dragging.y = dragOrigY + dy;
      renderMarkers();
    });
    window.addEventListener('mouseup', function() {
      if (isPanning) { isPanning = false; container.style.cursor = 'crosshair'; }
      if (dragging && didDrag) {
        fetch('/api/map-markers/' + dragging.id, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x: dragging.x, y: dragging.y })
        });
      }
      dragging = null;
    });

    // Zoom
    container.addEventListener('wheel', function(e) {
      e.preventDefault();
      var rect = container.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      var oldScale = scale;
      scale *= e.deltaY < 0 ? 1.15 : 1 / 1.15;
      scale = Math.max(minScale, Math.min(maxScale, scale));
      panX = mx - (mx - panX) * (scale / oldScale);
      panY = my - (my - panY) * (scale / oldScale);
      applyTransform();
    }, { passive: false });

    // Pan with right-click drag
    container.addEventListener('mousedown', function(e) {
      if (e.button === 2) { isPanning = true; startX = e.clientX - panX; startY = e.clientY - panY; container.style.cursor = 'grabbing'; e.preventDefault(); }
    });
    container.addEventListener('contextmenu', function(e) { e.preventDefault(); });

    // Place marker on left-click (only on empty area)
    container.addEventListener('click', function(e) {
      if (e.button !== 0 || didDrag) return;
      var rect = container.getBoundingClientRect();
      var imgX = (e.clientX - rect.left - panX) / scale;
      var imgY = (e.clientY - rect.top - panY) / scale;
      if (imgX < 0 || imgY < 0 || imgX > IMG_W || imgY > IMG_H) return;

      var markerType = document.getElementById('markerTypeSelect').value;
      var label = document.getElementById('markerLabelInput').value.trim();
      var mSize = parseInt(sizeSlider.value) || 54;
      if (!label) { alert('Please enter a label for the marker.'); return; }

      fetch('/api/map-markers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marker_type: markerType, label: label, x: imgX, y: imgY, size: mSize })
      }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.error) { alert(data.error); return; }
        markers.push({ id: data.id, type: markerType, label: label, x: imgX, y: imgY, size: mSize });
        renderMarkers();
      }).catch(function(err) { alert('Error: ' + err.message); });
    });

    // Touch support
    var lastTouchDist = 0;
    container.addEventListener('touchstart', function(e) {
      if (e.touches.length === 1) { isPanning = true; startX = e.touches[0].clientX - panX; startY = e.touches[0].clientY - panY; }
      if (e.touches.length === 2) { isPanning = false; lastTouchDist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY); }
    }, { passive: false });
    container.addEventListener('touchmove', function(e) {
      e.preventDefault();
      if (e.touches.length === 1 && isPanning) { panX = e.touches[0].clientX - startX; panY = e.touches[0].clientY - startY; applyTransform(); }
      if (e.touches.length === 2) {
        var dist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
        var rect = container.getBoundingClientRect();
        var mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        var my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        var oldScale = scale; scale *= dist / lastTouchDist;
        scale = Math.max(minScale, Math.min(maxScale, scale));
        panX = mx - (mx - panX) * (scale / oldScale); panY = my - (my - panY) * (scale / oldScale);
        lastTouchDist = dist; applyTransform();
      }
    }, { passive: false });
    container.addEventListener('touchend', function() { isPanning = false; });
  })();
  </script>`;
  return pageShell("Map Admin — Halls of the Damned", "/", body, session);
}

module.exports = {
  renderHomeAdminPage,
  renderCalendarAdminPage,
  renderMapsAdminPage,
  renderNpcsAdminPage,
  renderSessionsAdminPage,
  renderArtifactsAdminPage,
  renderHandoutsAdminPage,
  renderArtAdminPage,
  renderBulkUploadAdminPage,
  renderMapAdminPage,
};
