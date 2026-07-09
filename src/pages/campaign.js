// ══════════════════════════════════════════════════════════════
// ── CAMPAIGN PAGES ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

const path = require("path");
const fs = require("fs");
const { pgPool } = require("../db/pool");
const { esc, safeJson } = require("../lib/utils");
const { HARPTOS_MONTHS, ordinal } = require("../config");
const { pageShell } = require("../components/shell");
const { mapOverlayBlock, artifactOverlayBlock } = require("../components/overlays");
const { renderRichTextBlock, markdownToHtml } = require("../lib/markdown");
const { listSessionPages, getLatestPublishedSession, nextSessionNumber } = require("../lib/sessions");

// Format a session play-date (stored as a metadata string) for display.
function fmtPlayDate(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

// ── House Rules Page ──────────────────────────────────────────
async function getNotebookContent(notebookPath) {
  try {
    const { rows } = await pgPool.query(
      "SELECT content FROM hotd_notebook_pages WHERE path = $1 AND type = 'file'",
      [notebookPath]
    );
    return rows.length ? rows[0].content : null;
  } catch (_) { return null; }
}
async function listNotebookFiles(parentPath) {
  try {
    const { rows } = await pgPool.query(
      "SELECT name, content FROM hotd_notebook_pages WHERE parent_path = $1 AND type = 'file' ORDER BY name",
      [parentPath]
    );
    return rows;
  } catch (_) { return []; }
}

async function renderHouseRulesPage(session) {
  const content = await getNotebookContent("Campaign Data/houserules.md");
  const htmlContent = content ? markdownToHtml(content) : '<p style="color:#888;">Content not yet available.</p>';
  const body = `
  <div class="content">
    <div class="history-content">${htmlContent}</div>
  </div>`;
  return pageShell("House Rules — Halls of the Damned", "/house-rules", body, session);
}

// ── Overcasting Page ──────────────────────────────────────────
async function renderOvercastingPage(session) {
  const content = await getNotebookContent("Campaign Data/over-casting.md");
  const htmlContent = content ? markdownToHtml(content) : '<p style="color:#888;">Content not yet available.</p>';
  const body = `
  <div class="content">
    <a href="/house-rules" style="color:#e8b923;text-decoration:none;font-size:0.9rem;">&larr; Back to House Rules</a>
    <div class="history-content" style="margin-top:16px;">${htmlContent}</div>
  </div>`;
  return pageShell("Overcasting — Halls of the Damned", "/overcasting", body, session);
}

// ── Circle Magic Page ─────────────────────────────────────────
async function renderCircleMagicPage(session) {
  const content = await getNotebookContent("Campaign Data/casting_circle.md");
  const htmlContent = content ? markdownToHtml(content) : '<p style="color:#888;">Content not yet available.</p>';
  const body = `
  <div class="content">
    <a href="/house-rules" style="color:#e8b923;text-decoration:none;font-size:0.9rem;">&larr; Back to House Rules</a>
    <div class="history-content" style="margin-top:16px;">${htmlContent}</div>
  </div>`;
  return pageShell("Circle Magic — Halls of the Damned", "/circle-magic", body, session);
}

// ── Home / Landing Page ───────────────────────────────────────
async function renderHomePage(session) {
  // Latest PUBLISHED session for the "Last Session" display block.
  // Drafts are intentionally excluded so the home page never surfaces
  // unfinished session writeups to players (or to the DM landing on /).
  // nextSessionNum is derived from the highest session_number across
  // ALL rows (drafts included) so a draft of Session N doesn't collide
  // with itself when the DM schedules the next game.
  let lastSession = null, nextSessionNum = 1;
  try { lastSession = await getLatestPublishedSession(); } catch (_) {}
  try { nextSessionNum = await nextSessionNumber(); } catch (_) {}

  // Fetch next scheduled game from config
  let nextGameDate = "", partyLocation = "";
  try {
    const cfgRes = await pgPool.query("SELECT key, value FROM hotd_config WHERE key IN ('next_game_date','party_location')");
    for (const r of cfgRes.rows) {
      if (r.key === "next_game_date") nextGameDate = r.value;
      if (r.key === "party_location") partyLocation = r.value;
    }
  } catch (_) {}

  // Fetch in-game calendar date
  let currentMonth = 6, currentDay = 21, currentYear = 1497;
  try {
    const cfgRes = await pgPool.query("SELECT key, value FROM hotd_config WHERE key IN ('current_month','current_day','current_year')");
    for (const r of cfgRes.rows) {
      if (r.key === "current_month") currentMonth = parseInt(r.value, 10);
      if (r.key === "current_day") currentDay = parseInt(r.value, 10);
      if (r.key === "current_year") currentYear = parseInt(r.value, 10);
    }
  } catch (_) {}
  const monthName = (HARPTOS_MONTHS.find(m => m.idx === currentMonth) || {}).name || "Unknown";

  // Build view-only calendar grid for current month
  // Fetch player characters from hotd_player_characters
  let players = [];
  try {
    const r = await pgPool.query("SELECT * FROM hotd_player_characters ORDER BY character_name");
    players = r.rows;
  } catch (_) {}

  // Next game display
  let nextGameHtml = '<span style="color:#888;">TBD</span>';
  if (nextGameDate) {
    try {
      const d = new Date(nextGameDate);
      nextGameHtml = `<span style="color:#e8b923;font-weight:700;">${d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>`;
      const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      if (timeStr && !timeStr.startsWith("12:00 AM")) nextGameHtml += ` <span style="color:#ccc;">at ${timeStr}</span>`;
    } catch (_) { nextGameHtml = `<span style="color:#e8b923;">${esc(nextGameDate)}</span>`; }
  }

  // Last session summary (truncated)
  let lastSessionHtml = '<p style="color:#888;">No sessions recorded yet.</p>';
  if (lastSession) {
    const playDateStr = fmtPlayDate(lastSession.playDate);
    const summaryText = lastSession.summary || "Summary pending...";
    lastSessionHtml = `
      <div style="margin-top:8px;">
        <strong style="color:#e8b923;">Session ${lastSession.sessionNumber} &mdash; ${esc(lastSession.title)}</strong>
        ${lastSession.gameDate ? `<div style="color:#aaa;font-size:0.8rem;margin-top:4px;">&#128197; In-Game: ${esc(lastSession.gameDate)}</div>` : ""}
        ${playDateStr ? `<div style="color:#666;font-size:0.75rem;margin-top:2px;">&#128197; Played: ${esc(playDateStr)}</div>` : ""}
        ${renderRichTextBlock(summaryText, "", "color:#aaa;margin-top:8px;line-height:1.6;font-size:0.9rem;")}
        <a href="/sessions" style="color:#e8b923;font-size:0.85rem;text-decoration:none;">&rarr; View all sessions</a>
      </div>`;
  }

  // Player character cards
  const playerCards = players.length > 0 ? players.map(p => {
    const classesDetail = safeJson(p.classes_detail);
    const classParts = classesDetail.map(cl => cl.subclass ? `${cl.name} / ${cl.subclass}` : cl.name).join(" · ");
    return `
    <a href="/characters/${p.id}" style="display:flex;gap:12px;align-items:center;background:#1e1e1e;border:1px solid #333;border-radius:8px;padding:12px;text-decoration:none;transition:border-color 0.2s;min-height:80px;">
      <div style="width:56px;height:56px;border-radius:8px;overflow:hidden;flex-shrink:0;background:#2a2a2a;display:flex;align-items:center;justify-content:center;">
        ${p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="${esc(p.character_name)}" style="width:100%;height:100%;object-fit:cover;" />` : '<span style="font-size:1.6rem;">&#9876;</span>'}
      </div>
      <div>
        <div style="color:#e8b923;font-weight:700;font-size:0.95rem;">${esc(p.character_name)}</div>
        <div style="color:#aaa;font-size:0.8rem;">Lvl ${p.level} | ${esc(p.race || "Unknown")} | ${esc(classParts || p.class_summary || "Unknown")}</div>
        <div style="color:#666;font-size:0.75rem;">Player: ${esc(p.player_name || "Unknown")}</div>
      </div>
    </a>`;
  }).join("") : '<p style="color:#888;">Player characters will appear here once imported.</p>';

  const body = `
  <div class="content" style="width:95%;max-width:95%;margin:0 auto;">

    <div class="home-grid" style="display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-bottom:28px;align-items:start;">
      <!-- LEFT COLUMN (2/3) -->
      <div style="display:flex;flex-direction:column;gap:20px;">
        <!-- Top row: Next Game + Party Location -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
          <div style="background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:20px;">
            <h3 style="color:#e8b923;margin:0 0 12px 0;font-size:1rem;">&#128197; Next Game</h3>
            <div style="font-size:1.05rem;">${nextGameHtml}</div>
            <div style="color:#888;font-size:0.85rem;margin-top:8px;">Session #${nextSessionNum}</div>
          </div>
          <div style="background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:20px;">
            <h3 style="color:#e8b923;margin:0 0 12px 0;font-size:1rem;">&#127759; Party Location</h3>
            <div style="font-size:1.05rem;color:#ccc;">${partyLocation ? esc(partyLocation) : '<span style="color:#888;">Unknown</span>'}</div>
            <div style="color:#888;font-size:0.85rem;margin-top:8px;">${ordinal(currentDay)} of ${esc(monthName)}, ${currentYear} DR</div>
          </div>
        </div>
        <!-- Map of Barovia -->
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:20px;">
          <h3 style="color:#e8b923;margin:0 0 12px 0;font-size:1rem;">&#128506; Map of Barovia</h3>
          <div id="mapContainer" style="width:100%;aspect-ratio:5025/3225;overflow:hidden;cursor:grab;border-radius:8px;position:relative;background:#111;">
            <img id="baroviaMap" src="/hotd-content/images/main_map.jpeg" alt="Map of Barovia" draggable="false" style="position:absolute;top:0;left:0;transform-origin:0 0;max-width:none;user-select:none;width:5025px;height:3225px;" />
            <div id="homeMapMarkers" style="position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;"></div>
          </div>
          <div style="color:#666;font-size:0.75rem;margin-top:8px;text-align:center;">Scroll to zoom &middot; Click and drag to pan</div>
        </div>
        <!-- The Party -->
        <div>
          <h3 style="color:#e8b923;margin:0 0 16px 0;font-size:1rem;">&#9876; The Party</h3>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
            ${playerCards}
          </div>
          <div style="margin-top:12px;"><a href="/characters" style="color:#e8b923;font-size:0.85rem;text-decoration:none;">&rarr; View all characters</a></div>
        </div>
      </div>

      <!-- RIGHT COLUMN (1/3) -->
      <div style="display:flex;flex-direction:column;gap:20px;">
        <!-- Search Box -->
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:20px;">
          <h3 style="color:#e8b923;margin:0 0 12px 0;font-size:1rem;">&#128269; Search Campaign</h3>
          <div style="display:flex;gap:0;">
            <input type="text" id="homeSearchInput" placeholder="Search campaign..." autocomplete="off" style="flex:1;padding:10px 14px;border:2px solid #333;border-radius:8px 0 0 8px;font-size:0.9rem;background:#111;color:#e0ddd5;outline:none;font-family:inherit;" />
            <button id="homeSearchBtn" style="padding:10px 18px;border:2px solid #e8b923;border-left:none;background:#e8b923;color:#1a1a1a;font-weight:700;cursor:pointer;border-radius:0 8px 8px 0;font-size:0.85rem;text-transform:uppercase;">Search</button>
          </div>
        </div>
        <!-- Last Session -->
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:20px;overflow-y:auto;">
          <h3 style="color:#e8b923;margin:0 0 8px 0;font-size:1rem;">&#128220; Last Session</h3>
          ${lastSessionHtml}
        </div>
      </div>
    </div>
  </div>
  <style>
    @media (max-width: 768px) {
      .home-grid { grid-template-columns: 1fr !important; }
      .home-grid > div:first-child > div:first-child { grid-template-columns: 1fr !important; }
    }
  </style>
  <script>
  (function() {
    var container = document.getElementById('mapContainer');
    var img = document.getElementById('baroviaMap');
    var markersEl = document.getElementById('homeMapMarkers');
    if (!container || !img) return;
    var IMG_W = 5025, IMG_H = 3225;
    var ICON_PATHS = {
      allied_werewolves: '/hotd-content/images/icons/AlliedWerewolvesShield.png',
      barovia: '/hotd-content/images/icons/baroviaShield.png',
      dusk_elves: '/hotd-content/images/icons/duskElvesShield.png',
      kezk: '/hotd-content/images/icons/KezkShield.png',
      party: '/hotd-content/images/icons/partyShield.png',
      ravenkind: '/hotd-content/images/icons/RavenKindSheild.png',
      strahd_abbot: '/hotd-content/images/icons/strahdAbbotShield.png',
      strahd_demon_army: '/hotd-content/images/icons/strahdDemonArmySheild.png',
      strahd: '/hotd-content/images/icons/strahdShield.png',
      strahd_werewolves: '/hotd-content/images/icons/strahdWerewolvesShield.png',
      villaki: '/hotd-content/images/icons/VillakiShield.png',
      vistani: '/hotd-content/images/icons/vistaniShield.png'
    };
    var cw = container.clientWidth, ch = container.clientHeight;
    var scale = Math.min(cw / IMG_W, ch / IMG_H);
    var minScale = scale * 0.5, maxScale = 5;
    var panX = (cw - IMG_W * scale) / 2, panY = (ch - IMG_H * scale) / 2;
    var isPanning = false, startX = 0, startY = 0;
    function applyTransform() {
      img.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + scale + ')';
      if (markersEl) markersEl.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + scale + ')';
    }
    applyTransform();
    // Fetch and render markers
    if (markersEl) {
      fetch('/api/map-markers').then(function(r){return r.json();}).then(function(data) {
        if (!data.markers) return;
        data.markers.forEach(function(m) {
          var mSize = m.size || 54;
          var d = document.createElement('div');
          d.style.cssText = 'position:absolute;width:'+mSize+'px;height:'+mSize+'px;display:flex;align-items:center;justify-content:center;flex-direction:column;font-size:'+(mSize*0.55)+'px;pointer-events:auto;cursor:default;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.9));user-select:none;';
          d.style.left = (m.x - mSize/2) + 'px';
          d.style.top = (m.y - mSize/2) + 'px';
          d.title = m.label + ' (' + m.type + ')';
          var icon;
          if (ICON_PATHS[m.type]) {
            icon = document.createElement('img');
            icon.src = ICON_PATHS[m.type];
            icon.alt = m.type;
            icon.style.cssText = 'width:'+(mSize*0.85)+'px;height:'+(mSize*0.85)+'px;pointer-events:none;object-fit:contain;';
          } else {
            icon = document.createElement('span');
            icon.textContent = m.type === 'battle' ? '\u2694\uFE0F' : m.type === 'poi' ? '\u2757' : '\u{1F4CD}';
            icon.style.lineHeight = '1';
          }
          d.appendChild(icon);
          if (m.label && m.type === 'battle') {
            var lbl = document.createElement('span');
            lbl.textContent = m.label;
            lbl.style.cssText = 'font-size:'+Math.max(8,mSize*0.18)+'px;color:#fff;background:rgba(0,0,0,0.7);padding:1px 4px;border-radius:3px;white-space:nowrap;margin-top:2px;max-width:'+(mSize*2)+'px;overflow:hidden;text-overflow:ellipsis;';
            d.appendChild(lbl);
          }
          markersEl.appendChild(d);
        });
      }).catch(function(){});
    }
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
    container.addEventListener('mousedown', function(e) { isPanning = true; startX = e.clientX - panX; startY = e.clientY - panY; container.style.cursor = 'grabbing'; });
    window.addEventListener('mousemove', function(e) { if (!isPanning) return; panX = e.clientX - startX; panY = e.clientY - startY; applyTransform(); });
    window.addEventListener('mouseup', function() { isPanning = false; container.style.cursor = 'grab'; });
    var lastTouchDist = 0, lastTouchX = 0, lastTouchY = 0;
    container.addEventListener('touchstart', function(e) {
      if (e.touches.length === 1) { isPanning = true; startX = e.touches[0].clientX - panX; startY = e.touches[0].clientY - panY; }
      if (e.touches.length === 2) { isPanning = false; lastTouchDist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY); lastTouchX = (e.touches[0].clientX + e.touches[1].clientX) / 2; lastTouchY = (e.touches[0].clientY + e.touches[1].clientY) / 2; }
    }, { passive: false });
    container.addEventListener('touchmove', function(e) {
      e.preventDefault();
      if (e.touches.length === 1 && isPanning) { panX = e.touches[0].clientX - startX; panY = e.touches[0].clientY - startY; applyTransform(); }
      if (e.touches.length === 2) {
        var dist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
        var rect = container.getBoundingClientRect();
        var mx = lastTouchX - rect.left, my = lastTouchY - rect.top;
        var oldScale = scale; scale *= dist / lastTouchDist;
        scale = Math.max(minScale, Math.min(maxScale, scale));
        panX = mx - (mx - panX) * (scale / oldScale); panY = my - (my - panY) * (scale / oldScale);
        lastTouchDist = dist; applyTransform();
      }
    }, { passive: false });
    container.addEventListener('touchend', function() { isPanning = false; });
  })();
  (function() {
    var input = document.getElementById('homeSearchInput');
    var btn = document.getElementById('homeSearchBtn');
    if (!input || !btn) return;
    function doSearch() { var q = input.value.trim(); if (q.length >= 2) window.location.href = '/search?q=' + encodeURIComponent(q); }
    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
  })();
  </script>`;
  return pageShell("Halls of the Damned — KnoxRPG Campaign", "/", body, session);
}

// ── Calendar Page (DB-backed, grid layout) ────────────────────
async function renderCalendarPage(session, monthParam) {
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
  const monthData = HARPTOS_MONTHS.find(m => m.idx === viewMonth) || HARPTOS_MONTHS[0];

  let events = [];
  try {
    const res = await pgPool.query("SELECT * FROM hotd_calendar_events WHERE month_idx = $1 ORDER BY day, id", [viewMonth]);
    events = res.rows;
  } catch (_) {}

  const eventsByDay = {};
  for (const ev of events) { if (!eventsByDay[ev.day]) eventsByDay[ev.day] = []; eventsByDay[ev.day].push(ev); }

  let gridHtml = "";
  for (let d = 1; d <= 30; d++) {
    const isToday = viewMonth === currentMonth && d === currentDay;
    const dayEvs = eventsByDay[d] || [];
    const evsHtml = dayEvs.map(ev =>
      `<div class="cal-event" title="${esc(ev.description || ev.title)}">${esc(ev.title)}</div>`
    ).join("");
    gridHtml += `<div class="cal-day${isToday ? " today" : ""}"><div class="cal-day-num">${d}</div>${evsHtml}</div>`;
  }
  const rem = 7 - (30 % 7);
  if (rem < 7) for (let i = 0; i < rem; i++) gridHtml += '<div class="cal-day empty"></div>';

  const prevMonth = viewMonth > 1 ? viewMonth - 1 : 12;
  const nextMonth = viewMonth < 12 ? viewMonth + 1 : 1;
  const curMonthName = HARPTOS_MONTHS.find(m => m.idx === currentMonth)?.name || "?";

  const body = `
  <div class="content">
    <h2 class="section-title">&#128197; Campaign Calendar</h2>
    <p style="color:#888;margin-bottom:16px;">The Calendar of Harptos &mdash; the standard reckoning of Faer&ucirc;n. Current date:
      <strong style="color:#e8b923;">${ordinal(currentDay)} of ${esc(curMonthName)}, ${currentYear} DR</strong></p>
    <div class="cal-month-nav">
      <a href="/calendar?month=${prevMonth}">&larr; ${esc(HARPTOS_MONTHS.find(m=>m.idx===prevMonth)?.name || "")}</a>
      <h2>${esc(monthData.name)} &mdash; ${esc(monthData.nickname)}</h2>
      <a href="/calendar?month=${nextMonth}">${esc(HARPTOS_MONTHS.find(m=>m.idx===nextMonth)?.name || "")} &rarr;</a>
    </div>
    <div class="cal-month-info">
      <div class="cal-weather">&#127326; ${esc(monthData.weather)}</div>
      <div class="cal-desc">${esc(monthData.description)}</div>
    </div>
    <div class="cal-grid">${gridHtml}</div>
  </div>`;
  return pageShell("Calendar — Halls of the Damned", "/calendar", body, session);
}

// ── Pagination control (server-side, ?page=N) ────────────────
function renderPager(basePath, page, totalPages) {
  if (totalPages <= 1) return "";
  const link = (p, label, extra) => `<a href="${basePath}?page=${p}" class="pager-btn${extra || ""}">${label}</a>`;
  const parts = [];
  parts.push(page > 1 ? link(page - 1, "&larr; Prev") : '<span class="pager-btn disabled">&larr; Prev</span>');
  const start = Math.max(1, page - 2), end = Math.min(totalPages, page + 2);
  if (start > 1) parts.push(link(1, "1"));
  if (start > 2) parts.push('<span class="pager-gap">&hellip;</span>');
  for (let p = start; p <= end; p++) parts.push(p === page ? `<span class="pager-btn active">${p}</span>` : link(p, String(p)));
  if (end < totalPages - 1) parts.push('<span class="pager-gap">&hellip;</span>');
  if (end < totalPages) parts.push(link(totalPages, String(totalPages)));
  parts.push(page < totalPages ? link(page + 1, "Next &rarr;") : '<span class="pager-btn disabled">Next &rarr;</span>');
  return `<div class="pager">${parts.join("")}</div>`;
}

// ── Maps Page (DB-backed, overlay with zoom/pan, paginated) ───
async function renderMapsPage(session, pageParam) {
  let maps = [];
  try { const r = await pgPool.query("SELECT * FROM hotd_maps ORDER BY sort_order, id"); maps = r.rows; } catch (_) {}

  const PER = 20;
  const totalPages = Math.max(1, Math.ceil(maps.length / PER));
  const page = Math.min(totalPages, Math.max(1, parseInt(pageParam, 10) || 1));
  const pageMaps = maps.slice((page - 1) * PER, page * PER);

  const mapCards = maps.length > 0 ? pageMaps.map(m =>
    `<div class="map-card" onclick="openMapOverlay('${esc(m.image_url)}','${esc(m.name)}')" style="cursor:pointer;">
      <img src="${esc(m.image_url)}" alt="${esc(m.name)}" loading="lazy" onerror="this.outerHTML='<div class=\\'map-placeholder\\'>&#128506;</div>'" />
      <div class="map-card-body"><h3>${esc(m.name)}</h3>${renderRichTextBlock(m.description, "", "color:#aaa;font-size:0.9rem;line-height:1.5;")}</div>
    </div>`
  ).join("") : `<div class="map-card"><div class="map-placeholder">&#128506;</div><div class="map-card-body"><h3>Maps Coming Soon</h3><p>As the party explores, acquired maps will appear here.</p></div></div>`;

  const body = `
  <div class="content content-wide">
    <h2 class="section-title">&#128506; Acquired Maps</h2>
    <p style="color:#888;margin-bottom:24px;">Maps the party has found, purchased, or otherwise acquired. Click a map to view it in detail with zoom and pan.${maps.length ? ` <span style="color:#666;">(${maps.length} maps)</span>` : ""}</p>
    <div class="map-grid">${mapCards}</div>
    ${renderPager("/maps", page, totalPages)}
  </div>
  ${mapOverlayBlock()}`;
  return pageShell("Maps — Halls of the Damned", "/maps", body, session);
}

// ── Helper: truncate text to N sentences ──────────────────────
function truncateSentences(text, max) {
  if (!text) return "";
  const clean = text.replace(/\r\n?/g, "\n").trim();
  const sentences = clean.match(/[^.!?\n]+[.!?]+/g);
  if (!sentences || sentences.length <= max) return clean;
  return sentences.slice(0, max).join("").trim() + "…";
}

// ── NPCs Page (DB-backed, image left / info right) ────────────
async function renderNpcsPage(session) {
  let npcs = [];
  const isAdmin = session && session.role === "admin";
  try {
    const q = isAdmin ? "SELECT * FROM hotd_npcs ORDER BY sort_order, name" : "SELECT * FROM hotd_npcs WHERE is_hidden = false ORDER BY sort_order, name";
    const r = await pgPool.query(q); npcs = r.rows;
  } catch (_) {}

  // Collect unique values for filters
  const alignments = [...new Set(npcs.map(n => n.alignment_tag || "").filter(Boolean))].sort();
  const locations = [...new Set(npcs.map(n => n.location || "").filter(Boolean))].sort();
  const statuses = [...new Set(npcs.map(n => n.status || "").filter(Boolean))].sort();

  const filterBar = npcs.length > 0 ? `
    <div class="npc-filters" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;align-items:center;">
      <select id="filterAlignment" onchange="filterNpcs()" style="background:#1a1a1a;color:#ccc;border:1px solid #444;border-radius:6px;padding:6px 12px;font-size:0.85rem;">
        <option value="">All (Enemy/Ally)</option>
        ${alignments.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join("")}
      </select>
      <select id="filterLocation" onchange="filterNpcs()" style="background:#1a1a1a;color:#ccc;border:1px solid #444;border-radius:6px;padding:6px 12px;font-size:0.85rem;">
        <option value="">All Locations</option>
        ${locations.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join("")}
      </select>
      <select id="filterStatus" onchange="filterNpcs()" style="background:#1a1a1a;color:#ccc;border:1px solid #444;border-radius:6px;padding:6px 12px;font-size:0.85rem;">
        <option value="">All Statuses</option>
        ${statuses.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}
      </select>
      <button onclick="document.getElementById('filterAlignment').value='';document.getElementById('filterLocation').value='';document.getElementById('filterStatus').value='';filterNpcs();" style="background:transparent;color:#e8b923;border:1px solid #e8b923;border-radius:6px;padding:6px 12px;font-size:0.85rem;cursor:pointer;">Clear</button>
    </div>` : "";

  const npcRows = npcs.length > 0 ? npcs.map(npc => {
    const shortDesc = truncateSentences(npc.description, 3);
    return `
    <a class="npc-row" href="/npcs/${npc.id}" data-alignment="${esc(npc.alignment_tag || "")}" data-location="${esc(npc.location || "")}" data-status="${esc(npc.status || "")}" style="display:flex;text-decoration:none;color:inherit;cursor:pointer;transition:border-color 0.2s,transform 0.2s;${npc.is_hidden ? 'opacity:0.5;border:1px dashed #ef4444;' : ''}">
      <div class="npc-portrait">${npc.portrait_url ? `<img src="${esc(npc.portrait_url)}" alt="${esc(npc.name)}" />` : '<div class="npc-placeholder">&#128100;</div>'}</div>
      <div class="npc-info">
        <h3>${esc(npc.name)}${npc.is_hidden ? ' <span style="color:#ef4444;font-size:0.7rem;vertical-align:middle;">&#128065; HIDDEN</span>' : ''}</h3>
        <span class="npc-tag ${esc(npc.alignment_tag)}">${esc(npc.alignment_tag)}</span>
        <div class="npc-details" style="margin-top:8px;">
          <div class="npc-detail-row"><span class="npc-detail-label">Race</span><span class="npc-detail-value">${esc(npc.race || "\u2014")}</span></div>
          <div class="npc-detail-row"><span class="npc-detail-label">Class</span><span class="npc-detail-value">${esc(npc.npc_class || "\u2014")}</span></div>
          <div class="npc-detail-row"><span class="npc-detail-label">Location</span><span class="npc-detail-value">${esc(npc.location || "\u2014")}</span></div>
          <div class="npc-detail-row"><span class="npc-detail-label">Status</span><span class="npc-detail-value">${esc(npc.status || "\u2014")}</span></div>
        </div>
        ${renderRichTextBlock(shortDesc, "", "color:#aaa;font-size:0.9rem;line-height:1.5;margin-top:8px;")}
      </div>
    </a>`;
  }).join("") : `
    <div class="npc-row">
      <div class="npc-portrait"><div class="npc-placeholder">&#128100;</div></div>
      <div class="npc-info">
        <h3>NPCs Coming Soon</h3><span class="npc-tag neutral">Unknown</span>
        <div class="npc-details" style="margin-top:8px;">
          <div class="npc-detail-row"><span class="npc-detail-label">Race</span><span class="npc-detail-value">&mdash;</span></div>
          <div class="npc-detail-row"><span class="npc-detail-label">Class</span><span class="npc-detail-value">&mdash;</span></div>
          <div class="npc-detail-row"><span class="npc-detail-label">Location</span><span class="npc-detail-value">&mdash;</span></div>
          <div class="npc-detail-row"><span class="npc-detail-label">Status</span><span class="npc-detail-value">&mdash;</span></div>
        </div>
        <p>As the campaign progresses, NPCs the party encounters will be catalogued here.</p>
      </div>
    </div>`;

  const body = `
  <div class="content">
    <h2 class="section-title">&#128100; Notable NPCs</h2>
    <p style="color:#888;margin-bottom:24px;">Allies, enemies, and persons of interest the party has encountered. Click an NPC for their full profile.</p>
    ${filterBar}
    <div id="npcList">${npcRows}</div>
  </div>
  <style>
    a.npc-row:hover { border-color:#e8b923 !important; transform:translateY(-2px); }
  </style>
  <script>
  function filterNpcs(){
    var a=document.getElementById('filterAlignment').value,
        l=document.getElementById('filterLocation').value,
        s=document.getElementById('filterStatus').value,
        rows=document.querySelectorAll('#npcList .npc-row');
    rows.forEach(function(r){
      var show=true;
      if(a&&r.dataset.alignment!==a)show=false;
      if(l&&r.dataset.location!==l)show=false;
      if(s&&r.dataset.status!==s)show=false;
      r.style.display=show?'':'none';
    });
  }
  </script>`;
  return pageShell("NPCs — Halls of the Damned", "/npcs", body, session);
}

// ── NPC Detail Page ───────────────────────────────────────────
async function renderNpcDetailPage(npcId, session) {
  try {
    const isAdmin = session && session.role === "admin";
    const q = isAdmin
      ? "SELECT * FROM hotd_npcs WHERE id = $1"
      : "SELECT * FROM hotd_npcs WHERE id = $1 AND is_hidden = false";
    const result = await pgPool.query(q, [npcId]);
    if (result.rows.length === 0) return null;
    const npc = result.rows[0];

    const portraitBlock = npc.portrait_url
      ? `<div class="npc-detail-portrait"><img src="${esc(npc.portrait_url)}" alt="${esc(npc.name)}" /></div>`
      : "";

    // Build associations block
    const assocData = Array.isArray(npc.associations) ? npc.associations : (typeof npc.associations === 'string' ? JSON.parse(npc.associations || '[]') : []);
    const assocBlock = assocData.length > 0
      ? assocData.map(a => {
          const tagClass = a.type === 'npc' ? 'ally' : 'neutral';
          return `<div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:12px 16px;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="color:#e8b923;font-weight:600;">${esc(a.name)}</span>
            </div>
            <p style="color:#aaa;font-size:0.88rem;line-height:1.5;margin:0;">${esc(a.relationship || '')}</p>
          </div>`;
        }).join("")
      : `<p style="color:#555;font-style:italic;">No known associations.</p>`;

    const dmNotesBlock = isAdmin && npc.dm_notes
      ? `<div style="margin-top:32px;border:1px solid #c8323244;border-radius:8px;padding:20px;background:#1a0a0a;">
          <h2 style="color:#c83232;font-size:1.3rem;margin-bottom:12px;">&#128274; DM Notes</h2>
          ${renderRichTextBlock(npc.dm_notes, "", "color:#ccc;font-size:0.95rem;line-height:1.7;")}
        </div>`
      : "";

    const body = `
  <div class="content" style="max-width:900px;margin:0 auto;">
    <p style="margin-bottom:16px;"><a href="/npcs" style="color:#e8b923;text-decoration:none;">&larr; Back to NPCs</a></p>
    <div style="display:flex;gap:32px;flex-wrap:wrap;align-items:flex-start;">
      ${portraitBlock}
      <div style="flex:1;min-width:280px;">
        <h1 style="color:#e8b923;margin:0 0 8px;">${esc(npc.name)}${npc.is_hidden ? ' <span style="color:#ef4444;font-size:0.8rem;">&#128065; HIDDEN</span>' : ''}</h1>
        <span class="npc-tag ${esc(npc.alignment_tag)}" style="font-size:0.9rem;padding:4px 14px;">${esc(npc.alignment_tag)}</span>
        <table style="margin-top:16px;border-collapse:collapse;width:100%;">
          <tr><td style="color:#888;padding:6px 16px 6px 0;font-weight:600;white-space:nowrap;">Race</td><td style="color:#ccc;padding:6px 0;">${esc(npc.race || "\u2014")}</td></tr>
          <tr><td style="color:#888;padding:6px 16px 6px 0;font-weight:600;white-space:nowrap;">Class / Role</td><td style="color:#ccc;padding:6px 0;">${esc(npc.npc_class || "\u2014")}</td></tr>
          <tr><td style="color:#888;padding:6px 16px 6px 0;font-weight:600;white-space:nowrap;">Location</td><td style="color:#ccc;padding:6px 0;">${esc(npc.location || "\u2014")}</td></tr>
          <tr><td style="color:#888;padding:6px 16px 6px 0;font-weight:600;white-space:nowrap;">Status</td><td style="color:#ccc;padding:6px 0;">${esc(npc.status || "\u2014")}</td></tr>
        </table>
      </div>
    </div>

    <div style="margin-top:32px;">
      <h2 style="color:#e8b923;font-size:1.3rem;margin-bottom:12px;">Description</h2>
      ${renderRichTextBlock(npc.description, "No description available.", "color:#ccc;font-size:1rem;line-height:1.7;")}
    </div>

    <div style="margin-top:32px;">
      <h2 style="color:#e8b923;font-size:1.3rem;margin-bottom:12px;">Associations</h2>
      ${assocBlock}
    </div>

    ${dmNotesBlock}
  </div>
  <style>
    .npc-detail-portrait { flex-shrink:0; }
    .npc-detail-portrait img { width:280px; max-width:100%; border-radius:12px; box-shadow:0 4px 24px rgba(0,0,0,0.5); }
  </style>`;
    return pageShell(`${npc.name} — Halls of the Damned`, "/npcs", body, session);
  } catch (err) {
    console.error("NPC detail error:", err);
    return null;
  }
}

// ── Sessions Page (DB-backed) ─────────────────────────────────
async function renderSessionsPage(session) {
  // Admins see every session (drafts + published) so they can navigate to the
  // editor. Everyone else only sees pages that have been explicitly published.
  const isAdmin = session && session.role === "admin";
  let sessions = [];
  try { sessions = await listSessionPages({ publishedOnly: !isAdmin }); } catch (_) {}

  const sessionList = sessions.length > 0 ? sessions.map(s => {
    const playDateStr = fmtPlayDate(s.playDate);
    const draftBadge = (isAdmin && !s.published)
      ? ` <span style="background:#7a2222;color:#fff;font-size:0.65rem;padding:2px 6px;border-radius:3px;vertical-align:middle;">DRAFT</span>`
      : "";
    return `
    <li>
      <strong>Session ${s.sessionNumber} &mdash; ${esc(s.title)}</strong>${draftBadge}
      ${s.gameDate ? `<div style="color:#e8b923;font-size:0.8rem;margin-top:2px;">&#128197; In-Game: ${esc(s.gameDate)}</div>` : ""}
      ${playDateStr ? `<div style="color:#888;font-size:0.75rem;margin-top:2px;">&#128197; Played: ${esc(playDateStr)}</div>` : ""}
      ${renderRichTextBlock(s.summary, "Summary coming soon...", "color:#aaa;margin-top:8px;line-height:1.6;")}
    </li>`;
  }).join("") : `
    <li><strong>Session 0 &mdash; Campaign Kickoff</strong><p>Character creation, world introduction, and the call to adventure. Coming soon...</p></li>`;

  const adminLink = session && session.role === "admin" ?
    `<div style="text-align:right;margin-bottom:16px;"><a href="/dm-admin#notes" style="color:#e8b923;text-decoration:none;font-weight:600;font-size:0.85rem;">&#9881; Admin &rarr;</a></div>` : "";

  const body = `
  <div class="content">
    <h2 class="section-title">&#9876; Session Logs</h2>
    <p style="color:#888;margin-bottom:24px;">Summaries of each session for players to review and catch up on the story.</p>
    ${adminLink}
    <ul class="session-list">${sessionList}</ul>
  </div>`;
  return pageShell("Sessions — Halls of the Damned", "/sessions", body, session);
}

// ── Characters Page (2024 stat block cards — single page) ────
async function renderCharactersPage(session) {
  let chars = [];
  try { const r = await pgPool.query("SELECT * FROM hotd_player_characters ORDER BY character_name"); chars = r.rows; } catch (_) {}

  const mod = v => { const m = Math.floor((v - 10) / 2); return (m >= 0 ? "+" : "") + m; };

  const charBlocks = chars.length > 0 ? chars.map(c => {
    const classesDetail = safeJson(c.classes_detail);
    const classParts = classesDetail.map(cl => cl.subclass ? `${cl.name} / ${cl.subclass}` : cl.name).join(" · ");
    const savingThrows = safeJson(c.saving_throws);
    const skills = safeJson(c.skills);
    const attacks = safeJson(c.attacks);

    const abilities = [
      { label: "STR", value: c.strength }, { label: "DEX", value: c.dexterity },
      { label: "CON", value: c.constitution }, { label: "INT", value: c.intelligence },
      { label: "WIS", value: c.wisdom }, { label: "CHA", value: c.charisma },
    ];

    const stLine = savingThrows.filter(st => st.proficient).map(st => {
      const sign = st.modifier >= 0 ? "+" : "";
      return `${st.name.charAt(0).toUpperCase() + st.name.slice(1)} ${sign}${st.modifier}`;
    }).join(", ") || "None";

    const profSkills = skills.filter(sk => sk.proficient || sk.expertise);
    const skillLine = profSkills.map(sk => {
      const sign = sk.modifier >= 0 ? "+" : "";
      const tag = sk.expertise ? " (E)" : "";
      return `${esc(sk.name)} ${sign}${sk.modifier}${tag}`;
    }).join(", ") || "None";

    const initSign = c.initiative >= 0 ? "+" : "";

    const equippedAttacks = attacks.filter(a => a.equipped);
    const displayAttacks = equippedAttacks.length > 0 ? equippedAttacks : attacks.slice(0, 3);
    const actionsHtml = displayAttacks.length > 0 ? displayAttacks.map(a => `
      <div class="sb-action">
        <span class="sb-action-name">${esc(a.name)}</span>
        <span class="sb-action-detail">${esc(a.range)} · Hit: <strong>${esc(a.hit)}</strong> · ${esc(a.damage)} ${esc(a.damageType || "")}</span>
      </div>`).join("") : '<div class="sb-empty">No actions.</div>';

    return `
    <div class="sb-card" id="character-${c.id}">
      <div class="sb-card-img">
        ${c.avatar_url ? `<img src="${esc(c.avatar_url)}" alt="${esc(c.character_name)}" />` : '<span class="sb-avatar-ph">&#9876;</span>'}
      </div>
      <div class="sb-card-block">
        <div class="sb-border-top"></div>
        <h2 class="sb-name">${esc(c.character_name)}</h2>
        <div class="sb-tagline">${esc(c.race || "Unknown")} · ${esc(classParts || c.class_summary || "Unknown")}</div>
        <div class="sb-tagline-sub">${esc(c.background || "")}${c.alignment ? " · " + esc(c.alignment) : ""}</div>
        <div class="sb-player">Player: ${esc(c.player_name || "Unknown")}</div>
        <div class="sb-divider"></div>
        <div class="sb-core-stats">
          <div class="sb-core"><span class="sb-core-label">AC</span><span class="sb-core-val sb-shield">${c.armor_class}</span></div>
          <div class="sb-core"><span class="sb-core-label">HP</span><span class="sb-core-val">${c.hit_points}/${c.max_hit_points}</span></div>
          <div class="sb-core"><span class="sb-core-label">Speed</span><span class="sb-core-val">${c.speed} ft</span></div>
          <div class="sb-core"><span class="sb-core-label">Init</span><span class="sb-core-val">${initSign}${c.initiative}</span></div>
          <div class="sb-core"><span class="sb-core-label">Prof</span><span class="sb-core-val">+${c.proficiency_bonus}</span></div>
        </div>
        <div class="sb-divider"></div>
        <div class="sb-ability-row">
          ${abilities.map(a => `<div class="sb-ability"><div class="sb-ability-mod">${mod(a.value)}</div><div class="sb-ability-label">${a.label}</div><div class="sb-ability-score">${a.value}</div></div>`).join("")}
        </div>
        <div class="sb-divider"></div>
        <div class="sb-property"><span class="sb-prop-label">Saving Throws</span> ${esc(stLine)}</div>
        <div class="sb-property"><span class="sb-prop-label">Skills</span> ${esc(skillLine)}</div>
        ${c.senses ? `<div class="sb-property"><span class="sb-prop-label">Senses</span> ${esc(c.senses)}</div>` : ""}
        ${c.languages ? `<div class="sb-property"><span class="sb-prop-label">Languages</span> ${esc(c.languages)}</div>` : ""}
        ${c.defenses ? `<div class="sb-property"><span class="sb-prop-label">Defenses</span> ${esc(c.defenses)}</div>` : ""}
        <div class="sb-divider"></div>
        <div class="sb-section-title">Actions</div>
        ${actionsHtml}
        <div class="sb-border-bottom"></div>
      </div>
    </div>`;
  }).join("") : '<p style="color:#888;">No player characters yet.</p>';

  const body = `
  <div class="content">
    <h2 class="section-title">&#9876; Player Characters</h2>
    <p style="color:#888;margin-bottom:24px;">The heroes of the Halls of the Damned campaign.</p>
    <div class="sb-list">${charBlocks}</div>
  </div>
  <style>
    /* ═══ 2024 Stat Block Cards ═══ */
    .sb-list { display:flex; flex-direction:column; gap:32px; }
    .sb-card { display:flex; gap:24px; background:#1e1e1e; border:1px solid #333; border-radius:12px; padding:24px; }
    .sb-card-img { width:200px; flex-shrink:0; display:flex; align-items:flex-start; justify-content:center; }
    .sb-card-img img { width:200px; height:200px; object-fit:cover; border-radius:10px; border:3px solid #c83232; box-shadow:0 0 12px rgba(200,50,50,0.25); }
    .sb-card-block { flex:1; min-width:0; }
    .sb-avatar-ph { font-size:4rem; color:#666; }

    /* ── Ornamental borders ── */
    .sb-border-top, .sb-border-bottom { height:4px; background:linear-gradient(90deg, transparent, #c83232, transparent); border-radius:2px; margin-bottom:12px; }
    .sb-border-bottom { margin-top:12px; margin-bottom:0; }
    .sb-divider { height:2px; background:linear-gradient(90deg, transparent 0%, #c83232 20%, #c83232 80%, transparent 100%); margin:10px 0; opacity:0.6; }

    /* ── Header ── */
    .sb-name { color:#c83232; margin:0 0 4px; font-size:1.5rem; font-weight:700; font-variant:small-caps; letter-spacing:1px; }
    .sb-tagline { color:#ccc; font-size:0.9rem; font-style:italic; }
    .sb-tagline-sub { color:#888; font-size:0.8rem; margin-top:2px; }
    .sb-player { color:#666; font-size:0.75rem; margin-top:4px; }

    /* ── Core stat boxes ── */
    .sb-core-stats { display:flex; gap:8px; flex-wrap:wrap; }
    .sb-core { display:flex; flex-direction:column; align-items:center; min-width:70px; background:#111; border:1px solid #333; border-radius:6px; padding:6px 10px; }
    .sb-core-label { color:#888; font-size:0.6rem; text-transform:uppercase; letter-spacing:1px; }
    .sb-core-val { color:#e8e8e8; font-size:1.1rem; font-weight:700; margin-top:2px; }
    .sb-shield { color:#c83232; }

    /* ── Ability scores ── */
    .sb-ability-row { display:flex; gap:8px; flex-wrap:wrap; }
    .sb-ability { width:60px; text-align:center; background:#111; border:2px solid #c83232; border-radius:8px; padding:6px 0; }
    .sb-ability-mod { color:#fff; font-size:1.2rem; font-weight:700; }
    .sb-ability-label { color:#c83232; font-size:0.6rem; font-weight:700; letter-spacing:1px; text-transform:uppercase; margin-top:1px; }
    .sb-ability-score { color:#666; font-size:0.65rem; margin-top:1px; }

    /* ── Properties ── */
    .sb-property { font-size:0.82rem; color:#ccc; padding:2px 0; line-height:1.4; }
    .sb-prop-label { color:#c83232; font-weight:700; font-style:italic; }
    .sb-prop-label::after { content:" "; }

    /* ── Actions ── */
    .sb-section-title { color:#c83232; font-size:0.8rem; font-weight:700; text-transform:uppercase; letter-spacing:1px; margin-bottom:6px; }
    .sb-action { padding:4px 0; border-bottom:1px solid #222; }
    .sb-action-name { color:#c83232; font-weight:700; font-style:italic; font-size:0.82rem; }
    .sb-action-detail { color:#aaa; font-size:0.78rem; display:block; margin-top:1px; }
    .sb-action-detail strong { color:#ccc; }
    .sb-empty { color:#666; font-size:0.82rem; font-style:italic; }

    @media (max-width: 700px) {
      .sb-card { flex-direction:column; align-items:center; text-align:center; }
      .sb-card-img { width:150px; }
      .sb-card-img img { width:150px; height:150px; }
      .sb-ability-row, .sb-core-stats { justify-content:center; }
      .sb-property, .sb-action { text-align:left; }
    }
  </style>`;
  return pageShell("Characters — Halls of the Damned", "/characters", body, session);
}

// ── History Page (rendered from markdown) ─────────────────────
async function renderHistoryPage(session) {
  const content = await getNotebookContent("Campaign Data/history.md");
  const htmlContent = content ? markdownToHtml(content) : '<p style="color:#888;">Content not yet available.</p>';
  const body = `
  <div class="content">
    <h2 class="section-title">&#128220; Campaign History &amp; Key Events</h2>
    <p style="color:#888;margin-bottom:24px;">A historical breakdown of Faer&ucirc;n and the key events of the Halls of the Damned campaign.</p>
    <div class="history-content">${htmlContent}</div>
  </div>`;
  return pageShell("History — Halls of the Damned", "/history", body, session);
}

// ── Artifacts Page (DB-backed, NPC-style rows) ────────────────
async function renderArtifactsPage(session) {
  let artifacts = [];
  try { const r = await pgPool.query("SELECT * FROM hotd_artifacts ORDER BY is_legendary DESC, name"); artifacts = r.rows; } catch (_) {}

  const artifactRows = artifacts.length > 0 ? artifacts.map(a => `
    <a class="artifact-row" href="/artifacts/${a.id}">
      <div class="artifact-row-img" ${a.image_url ? `onclick='event.preventDefault();event.stopPropagation();openArtifactOverlay(${JSON.stringify(a.image_url || "")}, ${JSON.stringify(a.name || "Artifact")})' style="cursor:zoom-in;"` : ""}>${a.image_url ? `<img src="${esc(a.image_url)}" alt="${esc(a.name)}" />` : '<div class="artifact-placeholder">&#128142;</div>'}</div>
      <div class="artifact-row-info">
        <h3>${esc(a.name)}</h3>
        <div class="artifact-meta"><span class="artifact-tag">${esc(a.rarity)}</span>${a.is_legendary ? '<span class="artifact-tag" style="background:rgba(139,0,0,0.15);color:#ff6b6b;border-color:rgba(139,0,0,0.3);">Legendary</span>' : ""}${a.owner ? `<span style="color:#888;font-size:0.8rem;">Owner: ${esc(a.owner)}</span>` : ""}</div>
        ${renderRichTextBlock(a.description, "No description yet.")}
      </div>
    </a>`).join("") : `
    <div class="artifact-row" style="cursor:default;">
      <div class="artifact-row-img"><div class="artifact-placeholder">&#128142;</div></div>
      <div class="artifact-row-info">
        <h3>Artifacts Coming Soon</h3>
        <div class="artifact-meta"><span class="artifact-tag">Unknown</span></div>
        <p>As the party discovers legendary items and artifacts, they will be documented here.</p>
      </div>
    </div>`;

  const body = `
  <div class="content">
    <h2 class="section-title">&#128142; Artifacts &amp; Legendary Items</h2>
    <p style="color:#888;margin-bottom:24px;">Items of power the party has encountered, acquired, or learned about. Click an artifact for details.</p>
    ${artifactRows}
  </div>
  ${artifactOverlayBlock("Artifact")}`;
  return pageShell("Artifacts — Halls of the Damned", "/artifacts", body, session);
}

// ── Handouts Page (DB-backed, own table) ──────────────────────
async function renderHandoutsPage(session) {
  let handouts = [];
  try { const r = await pgPool.query("SELECT * FROM hotd_handouts ORDER BY name"); handouts = r.rows; } catch (_) {}

  const handoutRows = handouts.length > 0 ? handouts.map(h => `
    <a class="artifact-row handout-row" href="/handouts/${h.id}">
      <div class="artifact-row-img" ${h.image_url ? `onclick='event.preventDefault();event.stopPropagation();openArtifactOverlay(${JSON.stringify(h.image_url || "")}, ${JSON.stringify(h.name || "Handout")})' style="cursor:zoom-in;"` : ""}>${h.image_url ? `<img src="${esc(h.image_url)}" alt="${esc(h.name)}" />` : '<div class="artifact-placeholder">&#128220;</div>'}</div>
      <div class="artifact-row-info">
        <h3>${esc(h.name)}</h3>
        ${renderRichTextBlock(h.description, "No description yet.")}
      </div>
    </a>`).join("") : `
    <div class="artifact-row" style="cursor:default;">
      <div class="artifact-row-img"><div class="artifact-placeholder">&#128220;</div></div>
      <div class="artifact-row-info">
        <h3>Handouts Coming Soon</h3>
        <p>As the party discovers handouts, they will be documented here.</p>
      </div>
    </div>`;

  const body = `
  <div class="content">
    <h2 class="section-title">&#128220; Handouts</h2>
    <p style="color:#888;margin-bottom:24px;">Documents, letters, and notes the party has discovered. Click a handout for details.</p>
    ${handoutRows}
  </div>
  ${artifactOverlayBlock("Handout")}`;
  return pageShell("Handouts — Halls of the Damned", "/handouts", body, session);
}

// ── Art / Images Gallery Page ─────────────────────────────────
async function renderArtGalleryPage(session, pageParam) {
  // Unified gallery: DB-backed art (D&D Beyond book art + admin-added +
  // DMCC-published) + DMCC-generated images, plus legacy filesystem images
  // under /hotd-content/images/ (excluding maps/). Deduped by URL.
  const { HOTD_UPLOADS_DIR, HOTD_CONTENT_DIR } = require("../config");
  const images = [];
  const seen = new Set();
  const add = (url, title, description, source) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ url, title: title || "", description: description || "", source });
  };

  // 1. hotd_art — D&D Beyond book art, admin-added, DMCC-published (newest first)
  try { const r = await pgPool.query("SELECT title, description, image_url FROM hotd_art ORDER BY sort_order, id DESC"); r.rows.forEach((x) => add(x.image_url, x.title, x.description, "art")); } catch (_) {}
  // 2. hotd_generated_images — DMCC image generator (shows up automatically)
  try { const r = await pgPool.query("SELECT prompt, revised_prompt, image_url FROM hotd_generated_images ORDER BY id DESC"); r.rows.forEach((x) => add(x.image_url, (x.prompt || "").slice(0, 60), x.revised_prompt || x.prompt || "", "generated")); } catch (_) {}
  // 3. Legacy filesystem images/** (excluding maps/)
  const imageExts = /\.(png|jpg|jpeg|webp)$/i;
  const collect = (root) => {
    if (!root) return;
    const base = path.join(root, "images");
    (function walk(dir, rel) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) { if (entry.name === "maps") continue; walk(path.join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name); }
        else if (imageExts.test(entry.name)) { add(`/hotd-content/images/${rel ? rel + "/" : ""}${entry.name}`, entry.name.replace(imageExts, ""), "", "file"); }
      }
    })(base, "");
  };
  collect(HOTD_UPLOADS_DIR);
  collect(HOTD_CONTENT_DIR);

  const PER = 20;
  const totalPages = Math.max(1, Math.ceil(images.length / PER));
  const page = Math.min(totalPages, Math.max(1, parseInt(pageParam, 10) || 1));
  const pageItems = images.slice((page - 1) * PER, page * PER);

  const artCards = pageItems.length > 0 ? pageItems.map((im) => `
    <div class="art-card" onclick='openArtifactOverlay(${JSON.stringify(im.url)}, ${JSON.stringify(im.title || "")})' title="${esc(im.title || "")}">
      <img src="${esc(im.url)}" alt="${esc(im.title || "")}" loading="lazy" />
    </div>`).join("") : `<p style="color:#888;text-align:center;grid-column:1/-1;">No images found.</p>`;

  const body = `
  <div class="content content-wide">
    <h2 class="section-title">&#127912; Art &amp; Images</h2>
    <p style="color:#888;margin-bottom:16px;">Campaign art, character portraits, scene illustrations, D&amp;D Beyond book art, and AI-generated images. Click to enlarge.${images.length ? ` <span style="color:#666;">(${images.length} images)</span>` : ""}</p>
    <div class="art-grid">${artCards}</div>
    ${renderPager("/art", page, totalPages)}
  </div>
  ${artifactOverlayBlock("Art")}`;
  return pageShell("Art & Images — Halls of the Damned", "/art", body, session);
}

// ── Artifact Detail Page ──────────────────────────────────────
async function renderArtifactDetailPage(artifactId, session) {
  try {
    const result = await pgPool.query("SELECT * FROM hotd_artifacts WHERE id = $1", [artifactId]);
    if (result.rows.length === 0) return null;
    const a = result.rows[0];
    const body = `
    <div class="artifact-detail">
      <div class="artifact-detail-header">
        <h1>${esc(a.name)}</h1>
        <div class="artifact-meta"><span class="artifact-tag">${esc(a.rarity)}</span>${a.is_legendary ? '<span class="artifact-tag" style="background:rgba(139,0,0,0.15);color:#ff6b6b;border-color:rgba(139,0,0,0.3);">Legendary</span>' : ""}${a.owner ? ` &mdash; Currently held by <strong style="color:#e8b923;">${esc(a.owner)}</strong>` : ""}</div>
      </div>
      <div class="artifact-detail-body">
        <div class="artifact-detail-img" ${a.image_url ? `onclick='openArtifactOverlay(${JSON.stringify(a.image_url || "")}, ${JSON.stringify(a.name || "Artifact")})' style="cursor:zoom-in;"` : ""}>${a.image_url ? `<img src="${esc(a.image_url)}" alt="${esc(a.name)}" />` : '<div class="artifact-placeholder">&#128142;</div>'}</div>
        <div class="artifact-detail-info"><h3>Description</h3>${renderRichTextBlock(a.description, "No description available.", "color:#aaa;font-size:0.95rem;line-height:1.7;")}</div>
      </div>
      ${a.lore ? `<div class="artifact-detail-lore"><h3>Lore</h3>${renderRichTextBlock(a.lore, "", "color:#aaa;font-size:0.95rem;line-height:1.7;")}</div>` : ""}
      <div style="margin-top:24px;text-align:center;"><a href="/artifacts" style="color:#e8b923;text-decoration:none;font-weight:600;">&larr; Back to All Artifacts</a></div>
    </div>
    ${artifactOverlayBlock("Artifact")}`;
    return pageShell(a.name + " — Artifacts — Halls of the Damned", "/artifacts", body, session);
  } catch (err) { console.error("Artifact detail error:", err); return null; }
}

// ── Handout Detail Page ───────────────────────────────────────
async function renderHandoutDetailPage(handoutId, session) {
  try {
    const result = await pgPool.query("SELECT * FROM hotd_handouts WHERE id = $1", [handoutId]);
    if (result.rows.length === 0) return null;
    const h = result.rows[0];
    const body = `
    <div class="artifact-detail handout-detail">
      <div class="artifact-detail-header">
        <h1>${esc(h.name)}</h1>
      </div>
      <div class="artifact-detail-body">
        <div class="artifact-detail-img" ${h.image_url ? `onclick='openArtifactOverlay(${JSON.stringify(h.image_url || "")}, ${JSON.stringify(h.name || "Handout")})' style="cursor:zoom-in;"` : ""}>${h.image_url ? `<img src="${esc(h.image_url)}" alt="${esc(h.name)}" />` : '<div class="artifact-placeholder">&#128220;</div>'}</div>
        <div class="artifact-detail-info"><h3>Description</h3>${renderRichTextBlock(h.description, "No description available.", "color:#aaa;font-size:0.95rem;line-height:1.7;")}</div>
      </div>
      ${h.about ? `<div class="artifact-detail-lore"><h3>About</h3>${renderRichTextBlock(h.about, "", "color:#aaa;font-size:0.95rem;line-height:1.7;")}</div>` : ""}
      <div style="margin-top:24px;text-align:center;"><a href="/handouts" style="color:#e8b923;text-decoration:none;font-weight:600;">&larr; Back to All Handouts</a></div>
    </div>
    ${artifactOverlayBlock("Handout")}`;
    return pageShell(h.name + " — Handouts — Halls of the Damned", "/handouts", body, session);
  } catch (err) { console.error("Handout detail error:", err); return null; }
}

// ── Notable Groups (file-backed from groups/*.md) ─────────────

function parseGroupMeta(mdContent) {
  const lines = mdContent.split("\n");
  const meta = { title: "", type: "", base: "", status: "", alignment: "", image: "" };
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("# ")) meta.title = t.slice(2).trim();
    if (t.startsWith("- **Type:**")) meta.type = t.replace("- **Type:**", "").trim();
    if (t.startsWith("- **Base of Operations:**")) meta.base = t.replace("- **Base of Operations:**", "").trim();
    if (t.startsWith("- **Status:**")) meta.status = t.replace("- **Status:**", "").trim();
    if (t.startsWith("- **Alignment:**")) meta.alignment = t.replace("- **Alignment:**", "").trim();
    const imgMatch = t.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgMatch) meta.image = imgMatch[2].replace(/^\.\.\/images\//, "/hotd-content/images/");
  }
  return meta;
}

// ── Realm Pages ─────────────────────────────────────────────

function parseRealmMeta(content) {
  const meta = { title: '', region: '', image: '', summary: '' };
  const lines = content.split('\n');
  for (const line of lines.slice(0, 10)) {
    const t = line.trim();
    if (t.startsWith('# ') && !meta.title) meta.title = t.slice(2);
    const imgMatch = t.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgMatch) meta.image = imgMatch[2].replace(/^\.\.\/\.\.\/images\//, '/hotd-content/images/');
    const regionMatch = t.match(/\*\*Region:\*\*\s*(.+)/);
    if (regionMatch) meta.region = regionMatch[1];
    const glanceMatch = t.match(/\*\*At a Glance:\*\*\s*(.+)/);
    if (glanceMatch) meta.summary = glanceMatch[1];
  }
  if (!meta.summary) {
    for (const line of lines) {
      const t = line.trim();
      if (t && !t.startsWith('#') && !t.startsWith('!') && !t.startsWith('>') && !t.startsWith('---')) {
        meta.summary = t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
        break;
      }
    }
  }
  return meta;
}

async function renderRealmsPage(session) {
  let realms = [];
  try {
    const files = await listNotebookFiles('Campaign Data/Realms');
    realms = files.map(f => {
      const meta = parseRealmMeta(f.content);
      meta.slug = f.name.replace(/\.md$/, '');
      return meta;
    });
  } catch (_) {}

  const realmRows = realms.length > 0 ? realms.map(r => `
    <a class="npc-row" href="/realms/${esc(r.slug)}" style="display:flex;text-decoration:none;color:inherit;cursor:pointer;transition:border-color 0.2s,transform 0.2s;">
      <div class="npc-portrait">${r.image ? `<img src="${esc(r.image)}" alt="${esc(r.title)}" />` : '<div class="npc-placeholder">&#127758;</div>'}</div>
      <div class="npc-info">
        <h3>${esc(r.title)}</h3>
        ${r.region ? `<span class="npc-tag neutral">${esc(r.region)}</span>` : ''}
        ${r.summary ? `<p style="color:#aaa;font-size:0.85rem;margin-top:8px;line-height:1.5;">${esc(r.summary)}</p>` : ''}
      </div>
    </a>`).join('') : `
    <div class="npc-row" style="cursor:default;">
      <div class="npc-portrait"><div class="npc-placeholder">&#127758;</div></div>
      <div class="npc-info">
        <h3>Realms Coming Soon</h3><span class="npc-tag neutral">Unknown</span>
        <p>As the campaign progresses, realms of Faerun will be documented here.</p>
      </div>
    </div>`;

  const body = `
  <div class="content">
    <h2 class="section-title">&#127758; Realms of Faerun</h2>
    <p style="color:#888;margin-bottom:24px;">Kingdoms, nations, and lands of the Forgotten Realms.</p>
    ${realmRows}
  </div>`;
  return pageShell('Realms of Faerun — Halls of the Damned', '/realms', body, session);
}

async function renderRealmDetailPage(slug, session) {
  const safeName = slug.replace(/[^a-z0-9_-]/gi, '');
  let md = await getNotebookContent(`Campaign Data/Realms/${safeName}.md`);
  if (md == null) return null;
  const isAdmin = session && session.role === 'admin';
  if (!isAdmin) {
    md = md.replace(/\n## DM Notes[\s\S]*$/, '');
  }
  const meta = parseRealmMeta(md);
  let htmlContent = markdownToHtml(md);
  // Make images clickable for popout overlay
  htmlContent = htmlContent.replace(
    /<img\s+src="([^"]+)"\s+alt="([^"]*)"\s+style="([^"]*)"/g,
    '<img src="$1" alt="$2" style="$3cursor:pointer;" onclick="openArtifactOverlay(\'$1\',\'$2\')"'
  );
  const body = `
  <div class="content">
    <a href="/realms" style="color:#e8b923;text-decoration:none;font-size:0.9rem;">&larr; Back to Realms</a>
    <div class="history-content" style="margin-top:16px;">${htmlContent}</div>
  </div>
  ${artifactOverlayBlock('Realm Map')}`;
  return pageShell(`${meta.title || 'Realm'} — Halls of the Damned`, '/realms', body, session);
}

async function renderGroupsPage(session) {
  let groups = [];
  try {
    const files = await listNotebookFiles("Campaign Data/Groups");
    groups = files.map(f => {
      const meta = parseGroupMeta(f.content);
      meta.slug = f.name.replace(/\.md$/, "");
      return meta;
    });
  } catch (_) {}

  const groupRows = groups.length > 0 ? groups.map(g => {
    const alignClass = g.alignment.toLowerCase().includes("enemy") ? "enemy"
      : g.alignment.toLowerCase().includes("ally") ? "ally" : "neutral";
    return `
    <a class="npc-row" href="/groups/${esc(g.slug)}" style="display:flex;text-decoration:none;color:inherit;cursor:pointer;transition:border-color 0.2s,transform 0.2s;">
      <div class="npc-portrait">${g.image ? `<img src="${esc(g.image)}" alt="${esc(g.title)}" />` : '<div class="npc-placeholder">&#9876;</div>'}</div>
      <div class="npc-info">
        <h3>${esc(g.title)}</h3>
        <span class="npc-tag ${alignClass}">${esc(g.alignment)}</span>
        <div class="npc-details" style="margin-top:8px;">
          <div class="npc-detail-row"><span class="npc-detail-label">Type</span><span class="npc-detail-value">${esc(g.type || "\u2014")}</span></div>
          <div class="npc-detail-row"><span class="npc-detail-label">Base</span><span class="npc-detail-value">${esc(g.base || "\u2014")}</span></div>
          <div class="npc-detail-row"><span class="npc-detail-label">Status</span><span class="npc-detail-value">${esc(g.status || "\u2014")}</span></div>
          <div class="npc-detail-row"><span class="npc-detail-label">Alignment</span><span class="npc-detail-value">${esc(g.alignment || "\u2014")}</span></div>
        </div>
      </div>
    </a>`;
  }).join("") : `
    <div class="npc-row" style="cursor:default;">
      <div class="npc-portrait"><div class="npc-placeholder">&#9876;</div></div>
      <div class="npc-info">
        <h3>Groups Coming Soon</h3><span class="npc-tag neutral">Unknown</span>
        <p>As the campaign progresses, notable groups and organizations will be documented here.</p>
      </div>
    </div>`;

  const body = `
  <div class="content">
    <h2 class="section-title">&#9876; Notable Groups</h2>
    <p style="color:#888;margin-bottom:24px;">Organizations, factions, and groups encountered during the campaign.</p>
    ${groupRows}
  </div>`;
  return pageShell("Notable Groups — Halls of the Damned", "/groups", body, session);
}

async function renderGroupDetailPage(slug, session) {
  const safeName = slug.replace(/[^a-z0-9_-]/gi, "");
  let md = await getNotebookContent(`Campaign Data/Groups/${safeName}.md`);
  if (md == null) return null;
  const isAdmin = session && session.role === 'admin';
  if (!isAdmin) {
    md = md.replace(/\n## DM Notes[\s\S]*$/, '');
  }
  const meta = parseGroupMeta(md);
  let htmlContent = markdownToHtml(md);
  const body = `
  <div class="content">
    <a href="/groups" style="color:#e8b923;text-decoration:none;font-size:0.9rem;">&larr; Back to Notable Groups</a>
    <div class="history-content" style="margin-top:16px;">${htmlContent}</div>
  </div>`;
  return pageShell(`${meta.title || "Group"} — Halls of the Damned`, "/groups", body, session);
}

module.exports = {
  renderHouseRulesPage,
  renderOvercastingPage,
  renderCircleMagicPage,
  renderHomePage,
  renderCalendarPage,
  renderMapsPage,
  renderNpcsPage,
  renderNpcDetailPage,
  renderSessionsPage,
  renderCharactersPage,
  renderHistoryPage,
  renderArtifactsPage,
  renderHandoutsPage,
  renderArtGalleryPage,
  renderArtifactDetailPage,
  renderHandoutDetailPage,
  renderRealmsPage,
  renderRealmDetailPage,
  renderGroupsPage,
  renderGroupDetailPage,
};
