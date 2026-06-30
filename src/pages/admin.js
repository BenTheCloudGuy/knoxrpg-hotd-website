// ══════════════════════════════════════════════════════════════
// ── ADMIN PAGES ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

const { pgPool } = require("../db/pool");
const { esc } = require("../lib/utils");
const { HARPTOS_MONTHS } = require("../config");
const { pageShell, embedShell } = require("../components/shell");
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
      <p style="color:#888;font-size:0.85rem;">GM-only workspace for player character data. Read-only view of all D&amp;D Beyond synced fields plus an editable <strong style="color:#e8b923;">DM Notes</strong> column that survives DDB syncs. Click <strong>PUBLISH</strong> to write changes into the RAG index. <a href="/characters/admin" style="color:#e8b923;">Open GM Player Workspace &rarr;</a></p>
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
// Two-pane workspace: 30% session list on the left, 70% markdown editor on
// the right. Drives the JSON API at /api/dm-admin/sessions/* for all
// mutations (save, generate summary, create PDF, publish, delete).
async function renderSessionsAdminPage(session, opts) {
  if (!session || session.role !== "admin") return null;
  const embed = !!(opts && opts.embed);
  const backLink = embed ? "" :
    `<a href="/sessions" style="color:#e8b923;text-decoration:none;font-size:0.9rem;">&larr; Back to Sessions</a>`;
  // Both modes use a DEFINITE grid height so the row's minmax(0,1fr) cap
  // propagates down to EasyMDE (a flex-resolved height does NOT propagate to
  // the editor's `height:100%` chain, which is why the buttons clipped when
  // embedded). Standalone subtracts the site nav; embed (inside the DMCC
  // iframe, no nav) only subtracts this page's title/note header.
  const contentStyle = "max-width:none;width:100%;padding:0 16px;";
  const wsHeight = embed ? "calc(100vh - 100px)" : "calc(100vh - 200px)";
  const wsMinHeight = embed ? "0" : "600px";
  const wsStyle = `display:grid;grid-template-columns:30% 70%;grid-template-rows:minmax(0,1fr);gap:12px;height:${wsHeight};min-height:${wsMinHeight};`;

  const body = `
  <div class="content" style="${contentStyle}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <h2 class="section-title" style="margin:0;">&#9881; Sessions Workspace</h2>
      ${backLink}
    </div>
    <p style="color:#888;font-size:0.85rem;margin:0 0 12px 0;">Drafts stay private until you click <strong>Publish Summary</strong>. The GM Guide PDF excludes the <code># Session Summary</code> section.</p>

    <div id="sessions-workspace" style="${wsStyle}">

      <!-- LEFT: session list -->
      <aside style="background:#1a1a1a;border:1px solid #333;border-radius:6px;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:10px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center;">
          <strong style="color:#e8b923;">Sessions</strong>
          <button id="btn-new" type="button" style="background:#2d5a2d;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:0.85rem;">+ New</button>
        </div>
        <div id="session-list" style="flex:1;overflow-y:auto;padding:4px;">
          <p style="color:#888;padding:12px;font-size:0.85rem;">Loading...</p>
        </div>
      </aside>

      <!-- RIGHT: editor -->
      <section id="editor-pane" style="background:#1a1a1a;border:1px solid #333;border-radius:6px;display:flex;flex-direction:column;overflow:hidden;">
        <div id="editor-empty" style="flex:1;display:flex;align-items:center;justify-content:center;color:#666;text-align:center;padding:40px;">
          <div>
            <div style="font-size:3rem;margin-bottom:12px;">&#128221;</div>
            <p>Select a session from the left, or click <strong>+ New</strong> to create one.</p>
          </div>
        </div>

        <div id="editor-active" style="display:none;flex:1;flex-direction:column;overflow:hidden;">
          <div id="editor-meta" style="padding:10px;border-bottom:1px solid #333;background:#202020;">
            <div style="display:grid;grid-template-columns:80px 1fr 160px 200px;gap:8px;align-items:end;">
              <div>
                <label style="font-size:0.7rem;color:#888;display:block;">Session #</label>
                <input id="f-session-number" type="number" min="0" style="width:100%;background:#0e0e0e;color:#eee;border:1px solid #444;padding:6px;border-radius:3px;" />
              </div>
              <div>
                <label style="font-size:0.7rem;color:#888;display:block;">Title</label>
                <input id="f-title" type="text" style="width:100%;background:#0e0e0e;color:#eee;border:1px solid #444;padding:6px;border-radius:3px;" />
              </div>
              <div>
                <label style="font-size:0.7rem;color:#888;display:block;">In-Game Date</label>
                <input id="f-game-date" type="text" placeholder="25th of Mirtul" style="width:100%;background:#0e0e0e;color:#eee;border:1px solid #444;padding:6px;border-radius:3px;" />
              </div>
              <div>
                <label style="font-size:0.7rem;color:#888;display:block;">Play Date</label>
                <input id="f-play-date" type="datetime-local" style="width:100%;background:#0e0e0e;color:#eee;border:1px solid #444;padding:6px;border-radius:3px;" />
              </div>
            </div>
            <div id="status-row" style="display:flex;gap:12px;align-items:center;margin-top:8px;font-size:0.78rem;color:#888;flex-wrap:wrap;">
              <span id="badge-published"></span>
              <span id="badge-pdf"></span>
              <span id="badge-updated" style="margin-left:auto;"></span>
            </div>
          </div>

          <div style="flex:1;overflow:hidden;padding:8px;">
            <textarea id="md-editor"></textarea>
          </div>

          <div id="editor-buttons" style="padding:10px;border-top:1px solid #333;background:#202020;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <button id="btn-save" type="button" style="background:#2d4a7a;color:#fff;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;">&#128190; Save</button>
            <button id="btn-pdf" type="button" style="background:#5a3a7a;color:#fff;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;">&#128196; Create PDF</button>
            <button id="btn-summary" type="button" style="background:#7a5a2d;color:#fff;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;">&#129302; Generate Summary</button>
            <button id="btn-publish" type="button" style="background:#2d7a2d;color:#fff;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;">&#128226; Publish Summary</button>
            <button id="btn-unpublish" type="button" style="background:#444;color:#ccc;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;display:none;">Unpublish</button>
            <span style="flex:1;"></span>
            <button id="btn-delete" type="button" style="background:#7a2222;color:#fff;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;">&#128465; Delete</button>
          </div>

          <div id="progress-wrap" style="display:none;padding:6px 12px;background:#0e0e0e;border-top:1px solid #222;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;font-size:0.78rem;color:#ddd;">
              <span id="progress-label">Working...</span>
              <span id="progress-timer" style="color:#888;">0s</span>
              <span style="flex:1;"></span>
              <span style="color:#666;font-size:0.72rem;">Long-running operation, please wait</span>
            </div>
            <div id="progress-bar-track" style="position:relative;height:6px;background:#1a1a1a;border-radius:3px;overflow:hidden;">
              <div id="progress-bar-fill" class="progress-bar-indeterminate"></div>
            </div>
          </div>
          <div id="status-line" style="padding:6px 12px;background:#0e0e0e;color:#888;font-size:0.78rem;min-height:24px;border-top:1px solid #222;"></div>
        </div>
      </section>
    </div>
  </div>

  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/easymde@2.18.0/dist/easymde.min.css">
  <script src="https://cdn.jsdelivr.net/npm/easymde@2.18.0/dist/easymde.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked@15.0.4/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"></script>

  <style>
    /* EasyMDE dark theme tweaks */
    .EasyMDEContainer { height:100%; display:flex; flex-direction:column; }
    .EasyMDEContainer .CodeMirror { background:#0e0e0e; color:#eee; border-color:#333; flex:1; min-height:200px; }
    .EasyMDEContainer .CodeMirror-cursor { border-color:#e8b923; }
    .editor-toolbar { background:#1a1a1a; border-color:#333; }
    .editor-toolbar button { color:#bbb !important; }
    .editor-toolbar button:hover, .editor-toolbar button.active { background:#333 !important; border-color:#444 !important; }
    .editor-statusbar { color:#666; }
    .editor-preview, .editor-preview-side { background:#0a0a0a; color:#ddd; border-color:#333; }
    .editor-preview h1, .editor-preview h2, .editor-preview-side h1, .editor-preview-side h2 { color:#e8b923; border-bottom:1px solid #444; }
    .session-row { padding:8px 10px; border-radius:4px; cursor:pointer; margin-bottom:2px; border:1px solid transparent; }
    .session-row:hover { background:#2a2a2a; }
    .session-row.active { background:#2d4a7a; border-color:#4a6a9a; }
    .session-row strong { color:#e8b923; }
    .session-row.draft strong::after { content:" [DRAFT]"; color:#c66; font-size:0.7rem; font-weight:normal; }
    .session-row .meta { color:#888; font-size:0.75rem; margin-top:2px; }
    .progress-bar-indeterminate {
      position:absolute; top:0; left:0; height:100%; width:40%;
      background:linear-gradient(90deg, transparent, #e8b923 50%, transparent);
      animation: hotd-progress-slide 1.2s linear infinite;
    }
    @keyframes hotd-progress-slide {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(350%); }
    }
    @media (max-width:900px) {
      #sessions-workspace { grid-template-columns:1fr !important; height:auto !important; }
      #sessions-workspace aside { max-height:300px; }
    }
  </style>

  <script>
  (function() {
    var STARTER_MD = "# Session Notes\\n\\n_Raw DM notes go here. Bullet points, ad-libs, anything you want the AI to read when generating the summary._\\n\\n# Session Summary\\n\\n_This is what players will see when you click Publish Summary. You can write it by hand or use Generate Summary to draft it from the notes above._\\n";

    var state = {
      list: [],
      currentId: null,
      dirty: false,
      mde: null,
    };

    var $list = document.getElementById('session-list');
    var $empty = document.getElementById('editor-empty');
    var $active = document.getElementById('editor-active');
    var $status = document.getElementById('status-line');

    function setStatus(msg, isError) {
      $status.textContent = msg || '';
      $status.style.color = isError ? '#f88' : '#888';
    }

    var ACTION_BTN_IDS = ['btn-save','btn-pdf','btn-summary','btn-publish','btn-unpublish','btn-delete','btn-new'];
    var progress = { wrap: null, label: null, timer: null, start: 0, intervalId: null };
    function fmtElapsed(ms) {
      var s = Math.floor(ms / 1000);
      if (s < 60) return s + 's';
      var m = Math.floor(s / 60);
      var rem = s % 60;
      return m + 'm ' + (rem < 10 ? '0' : '') + rem + 's';
    }
    function setActionsDisabled(disabled) {
      ACTION_BTN_IDS.forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.disabled = disabled;
        el.style.opacity = disabled ? '0.5' : '';
        el.style.cursor = disabled ? 'wait' : 'pointer';
      });
    }
    function startProgress(label) {
      if (!progress.wrap) {
        progress.wrap = document.getElementById('progress-wrap');
        progress.label = document.getElementById('progress-label');
        progress.timer = document.getElementById('progress-timer');
      }
      progress.label.textContent = label || 'Working...';
      progress.timer.textContent = '0s';
      progress.wrap.style.display = '';
      progress.start = Date.now();
      if (progress.intervalId) clearInterval(progress.intervalId);
      progress.intervalId = setInterval(function() {
        progress.timer.textContent = fmtElapsed(Date.now() - progress.start);
      }, 500);
      setActionsDisabled(true);
    }
    function stopProgress() {
      if (progress.intervalId) { clearInterval(progress.intervalId); progress.intervalId = null; }
      if (progress.wrap) progress.wrap.style.display = 'none';
      setActionsDisabled(false);
    }
    function runWithProgress(label, fn) {
      startProgress(label);
      var p;
      try { p = Promise.resolve(fn()); }
      catch (e) { stopProgress(); return Promise.reject(e); }
      return p.then(function(v) {
        var elapsed = fmtElapsed(Date.now() - progress.start);
        stopProgress();
        return { value: v, elapsed: elapsed };
      }, function(err) {
        stopProgress();
        throw err;
      });
    }

    function fmtDate(iso) {
      if (!iso) return '';
      try { return new Date(iso).toLocaleString(); } catch(_) { return iso; }
    }

    function renderList() {
      if (state.list.length === 0) {
        $list.innerHTML = '<p style="color:#888;padding:12px;font-size:0.85rem;">No sessions yet. Click + New.</p>';
        return;
      }
      $list.innerHTML = state.list.map(function(s) {
        var cls = 'session-row' + (s.id === state.currentId ? ' active' : '') + (s.published ? '' : ' draft');
        var safeTitle = String(s.title || 'Untitled').replace(/[<>&"']/g, function(c){return '&#' + c.charCodeAt(0) + ';';});
        var meta = [];
        if (s.game_date) meta.push('In-game: ' + String(s.game_date).replace(/[<>&"']/g, function(c){return '&#' + c.charCodeAt(0) + ';';}));
        if (s.play_date) meta.push('Played: ' + new Date(s.play_date).toLocaleDateString());
        return '<div class="' + cls + '" data-id="' + s.id + '">' +
          '<strong>#' + s.session_number + ' &mdash; ' + safeTitle + '</strong>' +
          (meta.length ? '<div class="meta">' + meta.join(' &middot; ') + '</div>' : '') +
          '</div>';
      }).join('');
      Array.prototype.forEach.call($list.querySelectorAll('.session-row'), function(el) {
        el.addEventListener('click', function() { loadSession(parseInt(el.getAttribute('data-id'), 10)); });
      });
    }

    function refreshList(selectId) {
      return fetch('/api/dm-admin/sessions').then(function(r) { return r.json(); }).then(function(d) {
        state.list = d.sessions || [];
        if (selectId != null) state.currentId = selectId;
        renderList();
      });
    }

    function ensureMDE() {
      if (state.mde) return state.mde;
      state.mde = new EasyMDE({
        element: document.getElementById('md-editor'),
        autofocus: false,
        spellChecker: false,
        status: ['lines', 'words'],
        sideBySideFullscreen: false,
        previewClass: ['editor-preview', 'editor-preview-side'],
        renderingConfig: { singleLineBreaks: false },
        previewRender: function(plainText) {
          try {
            var html = marked.parse(plainText || '');
            return DOMPurify.sanitize(html);
          } catch(e) { return '<pre>' + e.message + '</pre>'; }
        },
      });
      state.mde.codemirror.on('change', function() { state.dirty = true; });
      return state.mde;
    }

    function fillMeta(s) {
      document.getElementById('f-session-number').value = s.session_number == null ? '' : s.session_number;
      document.getElementById('f-title').value = s.title || '';
      document.getElementById('f-game-date').value = s.game_date || '';
      document.getElementById('f-play-date').value = s.play_date ? new Date(s.play_date).toISOString().slice(0,16) : '';
      var pub = document.getElementById('badge-published');
      if (s.published) {
        pub.innerHTML = '<span style="background:#2d7a2d;color:#fff;padding:2px 8px;border-radius:3px;">PUBLISHED</span> <span style="color:#aaa;">' + fmtDate(s.published_at) + '</span>';
        document.getElementById('btn-unpublish').style.display = '';
      } else {
        pub.innerHTML = '<span style="background:#7a2222;color:#fff;padding:2px 8px;border-radius:3px;">DRAFT</span>';
        document.getElementById('btn-unpublish').style.display = 'none';
      }
      var pdf = document.getElementById('badge-pdf');
      if (s.pdf_path && s.id) {
        pdf.innerHTML = '<a href="/api/dm-admin/sessions/' + s.id + '/pdf" target="_blank" style="background:#5a3a7a;color:#fff;padding:2px 8px;border-radius:3px;text-decoration:none;">&#128196; Download PDF</a> <span style="color:#aaa;">' + fmtDate(s.pdf_generated_at) + '</span>';
      } else {
        pdf.innerHTML = '<span style="color:#666;">No PDF yet</span>';
      }
      document.getElementById('badge-updated').textContent = s.updated_at ? ('Updated ' + fmtDate(s.updated_at)) : '';
    }

    function showEditor() {
      $empty.style.display = 'none';
      $active.style.display = 'flex';
      ensureMDE();
    }

    function loadSession(id) {
      if (state.dirty && !confirm('You have unsaved changes. Discard and load another session?')) return;
      setStatus('Loading...');
      fetch('/api/dm-admin/sessions/' + id).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function(s) {
        state.currentId = s.id;
        showEditor();
        fillMeta(s);
        state.mde.value(s.markdown || '');
        state.dirty = false;
        renderList();
        setStatus('Loaded session ' + s.session_number);
      }).catch(function(e) { setStatus('Load failed: ' + e.message, true); });
    }

    function newSession() {
      if (state.dirty && !confirm('Discard unsaved changes?')) return;
      var nextNum = state.list.length ? (Math.max.apply(null, state.list.map(function(s){return s.session_number||0;})) + 1) : 0;
      showEditor();
      state.currentId = null;
      fillMeta({ session_number: nextNum, title: '', game_date: '', play_date: null, published: false, pdf_path: '' });
      state.mde.value(STARTER_MD);
      state.dirty = true;
      setStatus('New session (unsaved)');
      renderList();
    }

    function collectMeta() {
      return {
        session_number: parseInt(document.getElementById('f-session-number').value, 10),
        title: document.getElementById('f-title').value.trim(),
        game_date: document.getElementById('f-game-date').value.trim(),
        play_date: document.getElementById('f-play-date').value || null,
        markdown: state.mde.value(),
      };
    }

    function save() {
      var meta = collectMeta();
      if (!Number.isFinite(meta.session_number)) { alert('Session # is required'); return; }
      if (!meta.title) { alert('Title is required'); return; }
      setStatus('Saving...');
      var url = state.currentId ? ('/api/dm-admin/sessions/' + state.currentId) : '/api/dm-admin/sessions';
      var method = state.currentId ? 'PUT' : 'POST';
      return fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) })
        .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); })
        .then(function(res) {
          if (!res.ok) throw new Error(res.d.error || 'Save failed');
          state.dirty = false;
          var newId = state.currentId || res.d.id;
          setStatus('Saved.');
          return refreshList(newId).then(function() { return loadSession(newId); });
        })
        .catch(function(e) { setStatus('Save failed: ' + e.message, true); });
    }

    function withSave(label, fn) {
      var p = state.dirty ? save() : Promise.resolve();
      return p.then(function() {
        if (!state.currentId) { setStatus('Save first', true); return; }
        setStatus(label + '...');
        return fn(state.currentId);
      });
    }

    function createPdf() {
      withSave('Building PDF', function(id) {
        return runWithProgress('Building PDF (pandoc + WeasyPrint)...', function() {
          return fetch('/api/dm-admin/sessions/' + id + '/pdf', { method: 'POST' })
            .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); });
        })
          .then(function(result) {
            var res = result.value;
            if (!res.ok) throw new Error(res.d.error || 'PDF failed');
            setStatus('PDF ready in ' + result.elapsed + '.');
            return refreshList(id).then(function() { return loadSession(id); });
          })
          .catch(function(e) { setStatus('PDF failed: ' + e.message, true); });
      });
    }

    function generateSummary() {
      if (!confirm('Generate a new summary from the # Session Notes section? This will overwrite the # Session Summary section.')) return;
      withSave('Generating summary', function(id) {
        return runWithProgress('Generating summary with AI...', function() {
          return fetch('/api/dm-admin/sessions/' + id + '/generate-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
            .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); });
        })
          .then(function(result) {
            var res = result.value;
            if (!res.ok) throw new Error(res.d.error || 'Generation failed');
            state.mde.value(res.d.markdown || '');
            state.dirty = false;
            var tokenInfo = res.d.usage ? res.d.usage.total_tokens + ' tokens' : 'ok';
            setStatus('Summary generated in ' + result.elapsed + ' (' + tokenInfo + '). Review, then click Publish Summary.');
          })
          .catch(function(e) { setStatus('Generation failed: ' + e.message, true); });
      });
    }

    function publishSummary() {
      if (!confirm('Publish the # Session Summary to players?\\n\\nThis will also auto-extract NPC/PC/calendar updates and reindex RAG. Takes 30-60s.')) return;
      withSave('Publishing', function(id) {
        return runWithProgress('Publishing summary, extracting canon, reindexing RAG...', function() {
          return fetch('/api/dm-admin/sessions/' + id + '/publish', { method: 'POST' })
            .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); });
        })
          .then(function(result) {
            var res = result.value;
            if (!res.ok) throw new Error(res.d.error || 'Publish failed');
            var msg = 'Published in ' + result.elapsed + '.';
            if (res.d.canon) {
              var c = res.d.canon;
              var bits = [];
              if (c.summary.npcs_created.length) bits.push(c.summary.npcs_created.length + ' NPC(s) created');
              if (c.summary.npcs_updated.length) bits.push(c.summary.npcs_updated.length + ' NPC(s) updated');
              if (c.summary.pc_notes_appended.length) bits.push(c.summary.pc_notes_appended.length + ' PC note(s) appended');
              if (c.summary.calendar_events_created.length) bits.push(c.summary.calendar_events_created.length + ' calendar event(s) added');
              if (bits.length) msg += ' Canon: ' + bits.join(', ') + '.';
              else msg += ' Canon: no changes proposed.';
              if (c.errors && c.errors.length) msg += ' (' + c.errors.length + ' canon error(s) logged to server.)';
              var reindexFailed = (c.reindex || []).filter(function(x){return !x.ok;});
              if (reindexFailed.length) msg += ' RAG reindex: ' + reindexFailed.length + ' source(s) failed.';
              else if (c.reindex && c.reindex.length) msg += ' RAG reindexed (' + c.reindex.length + ' source(s)).';
            } else if (res.d.canon_error) {
              msg += ' Canon pipeline failed: ' + res.d.canon_error;
            }
            setStatus(msg);
            return refreshList(id).then(function() { return loadSession(id); });
          })
          .catch(function(e) { setStatus('Publish failed: ' + e.message, true); });
      });
    }

    function unpublish() {
      if (!confirm('Unpublish? Players will no longer see this session.')) return;
      fetch('/api/dm-admin/sessions/' + state.currentId + '/unpublish', { method: 'POST' })
        .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); })
        .then(function(res) {
          if (!res.ok) throw new Error(res.d.error || 'Unpublish failed');
          setStatus('Unpublished.');
          return refreshList(state.currentId).then(function() { return loadSession(state.currentId); });
        })
        .catch(function(e) { setStatus('Unpublish failed: ' + e.message, true); });
    }

    function del() {
      if (!state.currentId) return;
      var s = state.list.find(function(x){return x.id===state.currentId;});
      if (!s) return;
      if (!confirm('Delete session #' + s.session_number + ' "' + s.title + '"? This cannot be undone.')) return;
      fetch('/api/dm-admin/sessions/' + state.currentId, { method: 'DELETE' })
        .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); })
        .then(function(res) {
          if (!res.ok) throw new Error(res.d.error || 'Delete failed');
          state.currentId = null;
          state.dirty = false;
          $empty.style.display = 'flex';
          $active.style.display = 'none';
          setStatus('Deleted.');
          return refreshList();
        })
        .catch(function(e) { setStatus('Delete failed: ' + e.message, true); });
    }

    document.getElementById('btn-new').addEventListener('click', newSession);
    document.getElementById('btn-save').addEventListener('click', save);
    document.getElementById('btn-pdf').addEventListener('click', createPdf);
    document.getElementById('btn-summary').addEventListener('click', generateSummary);
    document.getElementById('btn-publish').addEventListener('click', publishSummary);
    document.getElementById('btn-unpublish').addEventListener('click', unpublish);
    document.getElementById('btn-delete').addEventListener('click', del);
    window.addEventListener('beforeunload', function(e) {
      if (state.dirty) { e.preventDefault(); e.returnValue = 'You have unsaved changes.'; return e.returnValue; }
    });

    refreshList().then(function() {
      // Auto-load most recent (top of list, since DESC).
      if (state.list.length > 0) loadSession(state.list[0].id);
    });
  })();
  </script>`;
  return embed
    ? embedShell("Sessions Workspace", body)
    : pageShell("Sessions Workspace — Halls of the Damned", "/sessions", body, session);
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
            <option value="dusk_elves">Dusk Elves</option>
            <option value="kezk">Kezk</option>
            <option value="party">Party</option>
            <option value="poi">❗ Point of Interest</option>
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
            <div><img src="/images/icons/duskElvesShield.png" style="width:18px;height:18px;vertical-align:middle;object-fit:contain;" /> <strong>Dusk Elves</strong></div>
            <div><img src="/images/icons/KezkShield.png" style="width:18px;height:18px;vertical-align:middle;object-fit:contain;" /> <strong>Kezk</strong></div>
            <div><img src="/images/icons/partyShield.png" style="width:18px;height:18px;vertical-align:middle;object-fit:contain;" /> <strong>Party</strong></div>
            <div>❗ <strong>Point of Interest</strong></div>
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
          <div id="markersTableContainer"></div>
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
      dusk_elves: '/images/icons/duskElvesShield.png',
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

    function renderMarkersTable() {
      var tc = document.getElementById('markersTableContainer');
      if (!tc) return;
      if (markers.length === 0) {
        tc.innerHTML = '<h3 style="color:#e8b923;margin:0 0 12px 0;font-size:1rem;">Placed Markers (0)</h3><p style="color:#888;font-size:0.85rem;">No markers placed yet.</p>';
        return;
      }
      var html = '<h3 style="color:#e8b923;margin:0 0 12px 0;font-size:1rem;">Placed Markers (' + markers.length + ')</h3>';
      html += '<table class="admin-table" style="width:100%;font-size:0.8rem;"><thead><tr><th>ID</th><th>Type</th><th>Label</th><th>Pos</th><th>Size</th><th></th></tr></thead><tbody>';
      markers.forEach(function(m) {
        html += '<tr><td>' + m.id + '</td><td>' + m.type + '</td><td>' + (m.label||'').replace(/</g,'&lt;') + '</td><td>' + Math.round(m.x) + ', ' + Math.round(m.y) + '</td><td>' + Math.round(m.size||54) + '</td><td><button class="delete-btn-inline" data-delete-id="' + m.id + '">Delete</button></td></tr>';
      });
      html += '</tbody></table>';
      tc.innerHTML = html;
      tc.querySelectorAll('[data-delete-id]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var mid = parseInt(this.dataset.deleteId);
          if (!confirm('Delete this marker?')) return;
          fetch('/api/map-markers/' + mid, { method: 'DELETE' }).then(function(r) { return r.json(); }).then(function(data) {
            if (data.error) { alert(data.error); return; }
            markers = markers.filter(function(x) { return x.id !== mid; });
            if (selectedId === mid) { selectedId = null; document.getElementById('selectedMarkerPanel').style.display = 'none'; }
            renderMarkers();
          }).catch(function(err) { alert('Error: ' + err.message); });
        });
      });
    }

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
          icon.textContent = m.type === 'battle' ? '\u2694\uFE0F' : m.type === 'poi' ? '\u2757' : '\u{1F4CD}';
          icon.style.lineHeight = '1';
        }
        div.appendChild(icon);

        if (m.label && m.type === 'battle') {
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
      renderMarkersTable();
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
      didDrag = false;
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

// ── GM Player Workspace ───────────────────────────────────────
// Two-pane GM-only character workbench. Mirrors the Sessions Workspace
// layout but enforces the read-only-except-dm_notes contract:
//   * All DDB-sourced fields (identity, stats, equipment, spells, attacks,
//     features, backstory, ideals, bonds, flaws, DDB Other Notes) render
//     display-only.
//   * Only the `dm_notes` column is editable in this UI.
//   * The single PUBLISH button persists dm_notes AND triggers
//     `embed-pipeline.js --source character --mode incremental` so the RAG
//     vector store catches up with both the new GM notes and any
//     DDB-synced mechanical changes for the selected character.
//   * "Sync from DDB" is a separate action that pulls fresh mechanical data
//     from D&D Beyond; it does not write to dm_notes and does not reindex
//     (the GM still has to click PUBLISH to push the new sheet into RAG).
async function renderCharactersAdminPage(session) {
  if (!session || session.role !== "admin") return null;

  const body = `
  <div class="content" style="max-width:none;width:100%;padding:0 16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <h2 class="section-title" style="margin:0;">&#9876; GM Player Workspace</h2>
      <a href="/characters" style="color:#e8b923;text-decoration:none;font-size:0.9rem;">&larr; Back to Characters</a>
    </div>
    <p style="color:#888;font-size:0.85rem;margin:0 0 12px 0;">All D&amp;D Beyond data is <strong>read-only</strong> here (DDB sync owns those fields). Edit your campaign notes below, then click <strong>PUBLISH</strong> to save and refresh the RAG index.</p>

    <div id="chars-workspace" style="display:grid;grid-template-columns:30% 70%;gap:12px;height:calc(100vh - 200px);min-height:600px;">

      <!-- LEFT: roster -->
      <aside style="background:#1a1a1a;border:1px solid #333;border-radius:6px;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:10px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center;">
          <strong style="color:#e8b923;">Player Characters</strong>
          <button id="btn-sync-all" type="button" style="background:#2d4a7a;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:0.8rem;" title="Pull fresh mechanical data from D&amp;D Beyond for every PC. Does not reindex RAG.">&#128260; Sync All DDB</button>
        </div>
        <div id="char-list" style="flex:1;overflow-y:auto;padding:4px;">
          <p style="color:#888;padding:12px;font-size:0.85rem;">Loading...</p>
        </div>
      </aside>

      <!-- RIGHT: editor -->
      <section id="editor-pane" style="background:#1a1a1a;border:1px solid #333;border-radius:6px;display:flex;flex-direction:column;overflow:hidden;">
        <div id="editor-empty" style="flex:1;display:flex;align-items:center;justify-content:center;color:#666;text-align:center;padding:40px;">
          <div>
            <div style="font-size:3rem;margin-bottom:12px;">&#9876;</div>
            <p>Select a character from the left.</p>
          </div>
        </div>

        <div id="editor-active" style="display:none;flex:1;flex-direction:column;overflow:hidden;">
          <div id="char-header" style="padding:10px 14px;border-bottom:1px solid #333;background:#202020;display:flex;gap:12px;align-items:center;">
            <img id="char-avatar" src="" alt="" style="width:64px;height:64px;border-radius:6px;object-fit:cover;background:#0a0a0a;border:1px solid #444;display:none;" />
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">
                <h3 id="char-name" style="margin:0;color:#e8b923;font-size:1.1rem;"></h3>
                <span id="char-summary" style="color:#bbb;font-size:0.85rem;"></span>
              </div>
              <div style="display:flex;gap:12px;align-items:center;margin-top:4px;font-size:0.75rem;color:#888;flex-wrap:wrap;">
                <span id="char-player"></span>
                <span id="char-ddb-id"></span>
                <span id="char-updated"></span>
              </div>
            </div>
            <button id="btn-sync-one" type="button" style="background:#2d4a7a;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:0.8rem;" title="Pull this character's mechanical data from D&amp;D Beyond.">&#128260; Sync from DDB</button>
          </div>

          <div id="char-body" style="flex:1;overflow-y:auto;padding:12px 14px;">
            <!-- Read-only display sections render into here, followed by the
                 dm_notes editor and the audit panel. -->
          </div>

          <div id="editor-buttons" style="padding:10px 14px;border-top:1px solid #333;background:#202020;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <span id="dirty-flag" style="color:#c66;font-size:0.78rem;display:none;">&#9679; Unsaved changes</span>
            <span style="flex:1;"></span>
            <button id="btn-publish" type="button" style="background:#2d7a2d;color:#fff;border:none;padding:10px 22px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:0.95rem;" title="Save DM Notes and refresh the RAG index for this character.">&#128226; PUBLISH</button>
          </div>

          <div id="progress-wrap" style="display:none;padding:6px 12px;background:#0e0e0e;border-top:1px solid #222;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;font-size:0.78rem;color:#ddd;">
              <span id="progress-label">Working...</span>
              <span id="progress-timer" style="color:#888;">0s</span>
              <span style="flex:1;"></span>
              <span style="color:#666;font-size:0.72rem;">RAG reindex runs after save</span>
            </div>
            <div id="progress-bar-track" style="position:relative;height:6px;background:#1a1a1a;border-radius:3px;overflow:hidden;">
              <div id="progress-bar-fill" class="progress-bar-indeterminate"></div>
            </div>
          </div>
          <div id="status-line" style="padding:6px 12px;background:#0e0e0e;color:#888;font-size:0.78rem;min-height:24px;border-top:1px solid #222;"></div>
        </div>
      </section>
    </div>
  </div>

  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/easymde@2.18.0/dist/easymde.min.css">
  <script src="https://cdn.jsdelivr.net/npm/easymde@2.18.0/dist/easymde.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked@15.0.4/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"></script>

  <style>
    .EasyMDEContainer .CodeMirror { background:#0e0e0e; color:#eee; border-color:#333; min-height:280px; }
    .EasyMDEContainer .CodeMirror-cursor { border-color:#e8b923; }
    .editor-toolbar { background:#1a1a1a; border-color:#333; }
    .editor-toolbar button { color:#bbb !important; }
    .editor-toolbar button:hover, .editor-toolbar button.active { background:#333 !important; border-color:#444 !important; }
    .editor-statusbar { color:#666; }
    .editor-preview, .editor-preview-side { background:#0a0a0a; color:#ddd; border-color:#333; }
    .editor-preview h1, .editor-preview h2 { color:#e8b923; border-bottom:1px solid #444; }
    .char-row { padding:8px 10px; border-radius:4px; cursor:pointer; margin-bottom:2px; border:1px solid transparent; display:flex; gap:8px; align-items:center; }
    .char-row:hover { background:#2a2a2a; }
    .char-row.active { background:#2d4a7a; border-color:#4a6a9a; }
    .char-row img { width:36px; height:36px; border-radius:4px; object-fit:cover; background:#0a0a0a; border:1px solid #333; flex-shrink:0; }
    .char-row .name { color:#e8b923; font-weight:bold; font-size:0.9rem; }
    .char-row .meta { color:#aaa; font-size:0.72rem; }
    .char-section { background:#202020; border:1px solid #2e2e2e; border-radius:5px; margin-bottom:10px; }
    .char-section summary { padding:8px 12px; cursor:pointer; color:#e8b923; font-weight:bold; font-size:0.9rem; user-select:none; }
    .char-section[open] summary { border-bottom:1px solid #2e2e2e; }
    .char-section .body { padding:10px 14px; color:#ddd; font-size:0.85rem; line-height:1.55; }
    .char-section .body p { margin:0 0 8px 0; }
    .char-section .stat-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:6px; text-align:center; margin-bottom:10px; }
    .char-section .stat-grid .cell { background:#0e0e0e; border:1px solid #333; border-radius:4px; padding:6px 4px; }
    .char-section .stat-grid .label { color:#888; font-size:0.65rem; text-transform:uppercase; letter-spacing:0.05em; }
    .char-section .stat-grid .val { color:#e8b923; font-weight:bold; font-size:1.05rem; }
    .char-section .kv-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:6px 12px; }
    .char-section .kv-grid .kv { background:#0e0e0e; border:1px solid #2a2a2a; border-radius:3px; padding:6px 8px; }
    .char-section .kv-grid .kv .k { color:#888; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.04em; }
    .char-section .kv-grid .kv .v { color:#eee; font-size:0.9rem; }
    .char-section ul { margin:4px 0 0 0; padding-left:18px; }
    .char-section li { margin:2px 0; }
    .audit-row { background:#0e0e0e; border:1px solid #2a2a2a; border-radius:3px; padding:8px 10px; margin-bottom:6px; font-size:0.8rem; }
    .audit-row .head { color:#e8b923; font-size:0.78rem; margin-bottom:4px; }
    .audit-row .excerpt { color:#aaa; font-style:italic; }
    .progress-bar-indeterminate {
      position:absolute; top:0; left:0; height:100%; width:40%;
      background:linear-gradient(90deg, transparent, #e8b923 50%, transparent);
      animation: hotd-progress-slide 1.2s linear infinite;
    }
    @keyframes hotd-progress-slide {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(350%); }
    }
    @media (max-width:900px) {
      #chars-workspace { grid-template-columns:1fr !important; height:auto !important; }
      #chars-workspace aside { max-height:300px; }
    }
  </style>

  <script>
  (function() {
    var state = {
      list: [],
      currentId: null,
      current: null,
      audit: [],
      dirty: false,
      mde: null,
    };

    var $list = document.getElementById('char-list');
    var $empty = document.getElementById('editor-empty');
    var $active = document.getElementById('editor-active');
    var $status = document.getElementById('status-line');
    var $dirty = document.getElementById('dirty-flag');

    function setStatus(msg, isError) {
      $status.textContent = msg || '';
      $status.style.color = isError ? '#f88' : '#888';
    }

    var ACTION_BTN_IDS = ['btn-publish','btn-sync-one','btn-sync-all'];
    var progress = { wrap: null, label: null, timer: null, start: 0, intervalId: null };
    function fmtElapsed(ms) {
      var s = Math.floor(ms / 1000);
      if (s < 60) return s + 's';
      var m = Math.floor(s / 60);
      var rem = s % 60;
      return m + 'm ' + (rem < 10 ? '0' : '') + rem + 's';
    }
    function setActionsDisabled(disabled) {
      ACTION_BTN_IDS.forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.disabled = disabled;
        el.style.opacity = disabled ? '0.5' : '';
        el.style.cursor = disabled ? 'wait' : 'pointer';
      });
    }
    function startProgress(label) {
      if (!progress.wrap) {
        progress.wrap = document.getElementById('progress-wrap');
        progress.label = document.getElementById('progress-label');
        progress.timer = document.getElementById('progress-timer');
      }
      progress.label.textContent = label || 'Working...';
      progress.timer.textContent = '0s';
      progress.wrap.style.display = '';
      progress.start = Date.now();
      if (progress.intervalId) clearInterval(progress.intervalId);
      progress.intervalId = setInterval(function() {
        progress.timer.textContent = fmtElapsed(Date.now() - progress.start);
      }, 500);
      setActionsDisabled(true);
    }
    function stopProgress() {
      if (progress.intervalId) { clearInterval(progress.intervalId); progress.intervalId = null; }
      if (progress.wrap) progress.wrap.style.display = 'none';
      setActionsDisabled(false);
    }

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
      });
    }

    // JSONB fields from DDB come back already-parsed by node-postgres; older
    // rows may still be raw strings, so be defensive.
    function jsonArray(v) {
      if (!v) return [];
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') {
        try { var p = JSON.parse(v); return Array.isArray(p) ? p : []; }
        catch (_) { return []; }
      }
      return [];
    }
    function itemName(x) {
      if (typeof x === 'string') return x;
      if (x && typeof x === 'object') return x.name || x.title || x.label || JSON.stringify(x);
      return String(x);
    }
    function jsonObject(v) {
      if (!v) return {};
      if (typeof v === 'object' && !Array.isArray(v)) return v;
      if (typeof v === 'string') { try { var p = JSON.parse(v); return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {}; } catch (_) { return {}; } }
      return {};
    }

    function setDirty(d) {
      state.dirty = !!d;
      $dirty.style.display = d ? '' : 'none';
    }

    window.addEventListener('beforeunload', function(e) {
      if (state.dirty) { e.preventDefault(); e.returnValue = ''; return ''; }
    });

    // ── Roster ────────────────────────────────────────────────
    function renderList() {
      if (!state.list.length) {
        $list.innerHTML = '<p style="color:#888;padding:12px;font-size:0.85rem;">No characters found. Use Sync All DDB to import.</p>';
        return;
      }
      var html = state.list.map(function(c) {
        var avatar = c.avatar_url ? '<img src="' + esc(c.avatar_url) + '" alt="">' : '<div style="width:36px;height:36px;background:#0a0a0a;border:1px solid #333;border-radius:4px;flex-shrink:0;"></div>';
        var meta = 'L' + (c.level || '?') + ' ' + esc(c.race || '') + ' ' + esc(c.class_summary || '');
        return '<div class="char-row' + (c.id === state.currentId ? ' active' : '') + '" data-id="' + c.id + '">' +
          avatar +
          '<div style="min-width:0;flex:1;">' +
            '<div class="name">' + esc(c.character_name || '(unnamed)') + '</div>' +
            '<div class="meta">' + meta + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
      $list.innerHTML = html;
      Array.prototype.forEach.call($list.querySelectorAll('.char-row'), function(el) {
        el.addEventListener('click', function() {
          var id = parseInt(el.getAttribute('data-id'), 10);
          selectCharacter(id);
        });
      });
    }

    async function loadList() {
      try {
        var r = await fetch('/api/dm-admin/characters');
        var j = await r.json();
        state.list = j.characters || [];
        renderList();
      } catch (e) {
        $list.innerHTML = '<p style="color:#f88;padding:12px;">Failed to load: ' + esc(e.message) + '</p>';
      }
    }

    // ── Detail rendering ──────────────────────────────────────
    function renderHeader(c) {
      var img = document.getElementById('char-avatar');
      if (c.avatar_url) { img.src = c.avatar_url; img.style.display = ''; }
      else img.style.display = 'none';
      document.getElementById('char-name').textContent = c.character_name || '(unnamed)';
      var sub = 'Level ' + (c.level || '?') + ' ' + (c.race || '') + ' ' + (c.class_summary || '');
      if (c.subclass) sub += ' (' + c.subclass + ')';
      document.getElementById('char-summary').textContent = sub;
      document.getElementById('char-player').textContent = c.player_name ? 'Player: ' + c.player_name : '';
      document.getElementById('char-ddb-id').textContent = c.ddb_character_id ? 'DDB #' + c.ddb_character_id : 'No DDB ID';
      document.getElementById('char-updated').textContent = c.updated_at ? 'Last sync: ' + new Date(c.updated_at).toLocaleString() : '';
    }

    function sectionStats(c) {
      var stats = ['strength','dexterity','constitution','intelligence','wisdom','charisma'];
      var labels = ['STR','DEX','CON','INT','WIS','CHA'];
      var grid = '<div class="stat-grid">' + stats.map(function(k, i) {
        var v = c[k] != null ? c[k] : '-';
        return '<div class="cell"><div class="label">' + labels[i] + '</div><div class="val">' + esc(v) + '</div></div>';
      }).join('') + '</div>';
      var kv = '<div class="kv-grid">' +
        '<div class="kv"><div class="k">Armor Class</div><div class="v">' + esc(c.armor_class || '-') + '</div></div>' +
        '<div class="kv"><div class="k">Hit Points</div><div class="v">' + esc((c.hit_points != null ? c.hit_points : '-') + ' / ' + (c.max_hit_points != null ? c.max_hit_points : '-')) + '</div></div>' +
        '<div class="kv"><div class="k">Speed</div><div class="v">' + esc(c.speed || '-') + '</div></div>' +
        '<div class="kv"><div class="k">Proficiency</div><div class="v">' + esc(c.proficiency_bonus ? '+' + c.proficiency_bonus : '-') + '</div></div>' +
        '<div class="kv"><div class="k">Background</div><div class="v">' + esc(c.background || '-') + '</div></div>' +
        '<div class="kv"><div class="k">Alignment</div><div class="v">' + esc(c.alignment || '-') + '</div></div>' +
        '<div class="kv"><div class="k">Faith</div><div class="v">' + esc(c.faith || '-') + '</div></div>' +
        '<div class="kv"><div class="k">Languages</div><div class="v">' + esc(c.languages || '-') + '</div></div>' +
        '</div>';
      return '<details class="char-section" open><summary>Identity &amp; Mechanics</summary><div class="body">' + grid + kv + '</div></details>';
    }

    function paraBlock(label, text) {
      if (!text || !String(text).trim()) return '';
      return '<p><strong style="color:#e8b923;">' + esc(label) + ':</strong><br>' + esc(text).replace(/\\n/g, '<br>') + '</p>';
    }
    function sectionStory(c) {
      var inner = '' +
        paraBlock('Backstory', c.backstory) +
        paraBlock('Personality', c.personality_traits) +
        paraBlock('Ideals', c.ideals) +
        paraBlock('Bonds', c.bonds) +
        paraBlock('Flaws', c.flaws);
      if (!inner) inner = '<p style="color:#666;">No story fields synced from DDB.</p>';
      return '<details class="char-section"><summary>Story (read-only, from DDB)</summary><div class="body">' + inner + '</div></details>';
    }

    function listBlock(label, arr) {
      if (!arr.length) return '';
      return '<p><strong style="color:#e8b923;">' + esc(label) + ':</strong></p><ul>' +
        arr.map(function(x) { return '<li>' + esc(itemName(x)) + '</li>'; }).join('') +
        '</ul>';
    }

    // ── Combat State (spell slots, hit dice, wealth, etc) ────
    // These all come from D&D Beyond on every sync and reflect the
    // player's last save state. Read-only by GM/Admin per the
    // DDB-owned contract; only dm_notes is editable.
    function sectionCombatState(c) {
      var inner = '';

      // Quick combat readouts.
      var quick = '<div class="kv-grid">' +
        '<div class="kv"><div class="k">Initiative</div><div class="v">' + esc(c.initiative != null ? (c.initiative >= 0 ? '+' + c.initiative : c.initiative) : '-') + '</div></div>' +
        '<div class="kv"><div class="k">Temp HP</div><div class="v">' + esc(c.temp_hit_points || 0) + '</div></div>' +
        '<div class="kv"><div class="k">Passive Perception</div><div class="v">' + esc(c.passive_perception || '-') + '</div></div>' +
        '<div class="kv"><div class="k">Passive Investigation</div><div class="v">' + esc(c.passive_investigation || '-') + '</div></div>' +
        '<div class="kv"><div class="k">Passive Insight</div><div class="v">' + esc(c.passive_insight || '-') + '</div></div>' +
        '<div class="kv"><div class="k">Senses</div><div class="v">' + esc(c.senses || '-') + '</div></div>' +
        '</div>';
      inner += quick;

      // Spell slots.
      var slots = jsonArray(c.spell_slots);
      if (slots.length) {
        inner += '<p style="margin-top:10px;"><strong style="color:#e8b923;">Spell Slots:</strong></p>';
        inner += '<div class="stat-grid">' + slots.map(function(s) {
          var rem = s.remaining != null ? s.remaining : (s.max - (s.used || 0));
          return '<div class="cell"><div class="label">L' + esc(s.level) + (s.pact ? ' Pact' : '') + '</div><div class="val">' + esc(rem) + '/' + esc(s.max) + '</div></div>';
        }).join('') + '</div>';
      }

      // Hit dice per class.
      var hd = jsonArray(c.hit_dice);
      if (hd.length) {
        inner += '<p style="margin-top:10px;"><strong style="color:#e8b923;">Hit Dice:</strong></p><ul>';
        inner += hd.map(function(h) {
          var rem = h.remaining != null ? h.remaining : (h.max - (h.used || 0));
          return '<li>' + esc(h.class) + ' ' + esc(h.die) + ': ' + esc(rem) + '/' + esc(h.max) + '</li>';
        }).join('') + '</ul>';
      }

      // Currencies.
      var cur = jsonObject(c.currencies);
      var coinage = [];
      ['pp','gp','ep','sp','cp'].forEach(function(k) { if (cur[k]) coinage.push(cur[k] + ' ' + k); });
      if (coinage.length) {
        inner += '<p style="margin-top:10px;"><strong style="color:#e8b923;">Wealth:</strong> ' + esc(coinage.join(', ')) + '</p>';
      }

      // Death saves.
      var ds = jsonObject(c.death_saves);
      if ((ds.success || 0) + (ds.fail || 0) > 0) {
        inner += '<p><strong style="color:#e8b923;">Death Saves:</strong> ' + esc(ds.success || 0) + ' successes, ' + esc(ds.fail || 0) + ' failures</p>';
      }

      // Active conditions.
      if (c.conditions && String(c.conditions).trim()) {
        inner += '<p><strong style="color:#e8b923;">Active Conditions:</strong> ' + esc(c.conditions) + '</p>';
      }

      return '<details class="char-section"><summary>Combat State (read-only, from DDB)</summary><div class="body">' + inner + '</div></details>';
    }

    function spellLine(s) {
      if (typeof s !== 'object' || !s) return esc(itemName(s));
      var bits = [esc(s.name || '?')];
      if (s.level != null) bits.push('<span style="color:#888;">(' + (s.level === 0 ? 'cantrip' : 'L' + s.level) + (s.school ? ' ' + esc(s.school) : '') + ')</span>');
      var meta = [];
      if (s.prepared || s.alwaysPrepared) meta.push(s.alwaysPrepared ? 'always prepared' : 'prepared');
      if (s.concentration) meta.push('concentration');
      if (s.ritual) meta.push('ritual');
      if (meta.length) bits.push('<em style="color:#999;">' + esc(meta.join(', ')) + '</em>');
      return bits.join(' ');
    }
    function equipmentLine(item) {
      if (typeof item !== 'object' || !item) return esc(itemName(item));
      var bits = [esc(item.name || '?')];
      if (item.quantity && item.quantity > 1) bits.push('<span style="color:#888;">x' + esc(item.quantity) + '</span>');
      if (item.type) bits.push('<span style="color:#888;">[' + esc(item.type) + ']</span>');
      if (item.equipped) bits.push('<em style="color:#9c9;">equipped</em>');
      if (item.attuned) bits.push('<em style="color:#c9c;">attuned</em>');
      if (item.magical && !item.attuned) bits.push('<em style="color:#999;">magical</em>');
      return bits.join(' ');
    }
    function sectionInventory(c) {
      var equip = jsonArray(c.equipment);
      var atks = jsonArray(c.attacks);
      var spells = jsonArray(c.spells);
      var feats = jsonArray(c.features);
      var inner = '';
      if (equip.length) {
        inner += '<p><strong style="color:#e8b923;">Equipment:</strong></p><ul>' +
          equip.map(function(x) { return '<li>' + equipmentLine(x) + '</li>'; }).join('') + '</ul>';
      }
      if (atks.length) inner += listBlock('Attacks', atks);
      if (spells.length) {
        inner += '<p><strong style="color:#e8b923;">Spells:</strong></p><ul>' +
          spells.map(function(x) { return '<li>' + spellLine(x) + '</li>'; }).join('') + '</ul>';
      }
      if (feats.length) inner += listBlock('Features', feats);
      if (!inner) inner = '<p style="color:#666;">No inventory data synced from DDB.</p>';
      return '<details class="char-section"><summary>Inventory &amp; Abilities (read-only, from DDB)</summary><div class="body">' + inner + '</div></details>';
    }

    function sectionDdbNotes(c) {
      var t = (c.notes || '').trim();
      if (!t) return '';
      // DDB "Other Notes" lives here; it gets overwritten on every DDB sync,
      // so the GM should mirror anything they want to keep into DM Notes.
      return '<details class="char-section"><summary>Player Notes (read-only, from D&amp;D Beyond)</summary><div class="body" style="white-space:pre-wrap;">' + esc(t) + '</div></details>';
    }

    function sectionDmNotes(c) {
      // The single editable field. EasyMDE is mounted into the textarea
      // below once the section is in the DOM.
      return '<details class="char-section" open><summary>&#9999; DM Notes (editable, GM-only, DDB-safe)</summary>' +
        '<div class="body">' +
          '<p style="color:#888;font-size:0.78rem;margin:0 0 8px 0;">' +
            'These notes are written by the canon auto-applier when you Publish a session, and you can edit them directly here. ' +
            'D&amp;D Beyond sync never touches this column.' +
          '</p>' +
          '<textarea id="dm-notes-editor">' + esc(c.dm_notes || '') + '</textarea>' +
        '</div></details>';
    }

    function sectionAudit() {
      if (!state.audit.length) {
        return '<details class="char-section"><summary>Canon Audit Log</summary><div class="body"><p style="color:#666;">No canon-applied changes recorded for this character.</p></div></details>';
      }
      var rows = state.audit.map(function(a) {
        var when = a.applied_at ? new Date(a.applied_at).toLocaleString() : '';
        var sess = a.session_number != null
          ? 'Session ' + a.session_number + (a.session_title ? ' — ' + a.session_title : '')
          : (a.session_id ? 'Session #' + a.session_id : 'Unknown session');
        return '<div class="audit-row">' +
          '<div class="head">' + esc(sess) + ' &middot; ' + esc(a.operation || '') + ' (' + esc(a.field || '') + ') &middot; ' + esc(when) + '</div>' +
          (a.rationale ? '<div style="color:#bbb;margin-bottom:4px;">' + esc(a.rationale) + '</div>' : '') +
          (a.source_excerpt ? '<div class="excerpt">&ldquo;' + esc(a.source_excerpt) + '&rdquo;</div>' : '') +
        '</div>';
      }).join('');
      return '<details class="char-section"><summary>Canon Audit Log (' + state.audit.length + ')</summary><div class="body">' + rows + '</div></details>';
    }

    function mountEditor(initial) {
      if (state.mde) { try { state.mde.toTextArea(); } catch (_) {} state.mde = null; }
      var ta = document.getElementById('dm-notes-editor');
      if (!ta) return;
      state.mde = new EasyMDE({
        element: ta,
        autoDownloadFontAwesome: true,
        spellChecker: false,
        status: ['lines','words'],
        minHeight: '280px',
        previewRender: function(plain) {
          try { return DOMPurify.sanitize(marked.parse(plain)); }
          catch (_) { return esc(plain); }
        },
        toolbar: ['bold','italic','heading','|','quote','unordered-list','ordered-list','|','link','preview','side-by-side','fullscreen','|','guide'],
      });
      state.mde.value(initial || '');
      state.mde.codemirror.on('change', function() { setDirty(true); });
      setDirty(false);
    }

    function renderDetail(c) {
      var body = document.getElementById('char-body');
      body.innerHTML =
        sectionStats(c) +
        sectionCombatState(c) +
        sectionStory(c) +
        sectionInventory(c) +
        sectionDdbNotes(c) +
        sectionDmNotes(c) +
        sectionAudit();
      mountEditor(c.dm_notes || '');
    }

    async function selectCharacter(id) {
      if (state.dirty && !confirm('You have unsaved DM Notes. Discard them?')) return;
      setStatus('Loading character...');
      state.currentId = id;
      renderList();
      try {
        var [detailRes, auditRes] = await Promise.all([
          fetch('/api/dm-admin/characters/' + id).then(function(r){ return r.json(); }),
          fetch('/api/dm-admin/characters/' + id + '/audit').then(function(r){ return r.json(); }),
        ]);
        if (detailRes.error) throw new Error(detailRes.error);
        state.current = detailRes.character;
        state.audit = auditRes.audit || [];
        $empty.style.display = 'none';
        $active.style.display = 'flex';
        renderHeader(state.current);
        renderDetail(state.current);
        setStatus('Loaded ' + state.current.character_name + '.');
      } catch (e) {
        setStatus('Load failed: ' + e.message, true);
      }
    }

    // ── Publish (save dm_notes + reindex RAG) ────────────────
    async function publish() {
      if (!state.current) return;
      var dm = state.mde ? state.mde.value() : '';
      startProgress('Saving DM Notes and reindexing RAG...');
      setStatus('Publishing ' + state.current.character_name + '...');
      try {
        var r = await fetch('/api/dm-admin/characters/' + state.currentId + '/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dm_notes: dm }),
        });
        var j = await r.json();
        if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
        state.current.dm_notes = dm;
        setDirty(false);
        var elapsed = fmtElapsed(j.elapsed_ms || 0);
        var reindexInfo = '';
        if (Array.isArray(j.reindex) && j.reindex.length) {
          var ok = j.reindex.filter(function(x){ return x.ok; }).length;
          var total = j.reindex.length;
          reindexInfo = ' RAG reindex: ' + ok + '/' + total + ' source' + (total === 1 ? '' : 's') + ' OK.';
          var failed = j.reindex.filter(function(x){ return !x.ok; });
          if (failed.length) {
            reindexInfo += ' Failed: ' + failed.map(function(f){ return f.source + ' (exit ' + f.exitCode + ')'; }).join(', ');
          }
        }
        setStatus('Published ' + j.character_name + ' in ' + elapsed + '.' + reindexInfo);
        // Refresh audit log (canon-applier may have written rows since load).
        try {
          var ar = await fetch('/api/dm-admin/characters/' + state.currentId + '/audit');
          var aj = await ar.json();
          state.audit = aj.audit || [];
          var auditEl = document.querySelector('#char-body details:last-child');
          if (auditEl) {
            var wasOpen = auditEl.open;
            auditEl.outerHTML = sectionAudit();
            if (wasOpen) document.querySelector('#char-body details:last-child').open = true;
          }
        } catch (_) {}
      } catch (e) {
        setStatus('Publish failed: ' + e.message, true);
      } finally {
        stopProgress();
      }
    }

    // ── DDB sync (single + bulk) ─────────────────────────────
    async function syncOne() {
      if (!state.current) return;
      if (!state.current.ddb_character_id) {
        setStatus('No DDB character ID set for this PC.', true);
        return;
      }
      if (state.dirty && !confirm('You have unsaved DM Notes. DDB sync only touches mechanical fields, your DM Notes will be preserved. Continue?')) return;
      startProgress('Syncing ' + state.current.character_name + ' from D&D Beyond...');
      setStatus('');
      try {
        var r = await fetch('/api/dm-admin/characters/' + state.currentId + '/sync', { method: 'POST' });
        var j = await r.json();
        if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
        setStatus(j.message + ' Click PUBLISH to push the updated sheet into RAG.');
        // Reload roster and current detail so the new stats show.
        await loadList();
        var dmDraft = state.mde ? state.mde.value() : null;
        await selectCharacter(state.currentId);
        if (dmDraft != null && state.mde) {
          state.mde.value(dmDraft);
          setDirty(dmDraft !== (state.current && state.current.dm_notes || ''));
        }
      } catch (e) {
        setStatus('Sync failed: ' + e.message, true);
      } finally {
        stopProgress();
      }
    }

    async function syncAll() {
      if (!confirm('Sync every PC with a DDB ID? This pulls fresh mechanical data from D&D Beyond. RAG is not reindexed until you PUBLISH each character.')) return;
      startProgress('Syncing all characters from D&D Beyond...');
      setStatus('');
      try {
        var r = await fetch('/api/dm-admin/characters/sync-all', { method: 'POST' });
        var j = await r.json();
        if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
        setStatus(j.message + ' Click PUBLISH on any updated PC to push the changes into RAG.');
        await loadList();
        if (state.currentId) {
          var dmDraft = state.mde ? state.mde.value() : null;
          await selectCharacter(state.currentId);
          if (dmDraft != null && state.mde) {
            state.mde.value(dmDraft);
            setDirty(dmDraft !== (state.current && state.current.dm_notes || ''));
          }
        }
      } catch (e) {
        setStatus('Sync All failed: ' + e.message, true);
      } finally {
        stopProgress();
      }
    }

    document.getElementById('btn-publish').addEventListener('click', publish);
    document.getElementById('btn-sync-one').addEventListener('click', syncOne);
    document.getElementById('btn-sync-all').addEventListener('click', syncAll);

    loadList();
  })();
  </script>`;
  return pageShell("GM Player Workspace — Halls of the Damned", "/", body, session);
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
  renderCharactersAdminPage,
};
