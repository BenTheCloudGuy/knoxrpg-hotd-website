// ══════════════════════════════════════════════════════════════
// ── CAMPAIGN PAGES ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

const path = require("path");
const fs = require("fs");
const { pgPool } = require("../db/pool");
const { esc, safeJson } = require("../lib/utils");
const { HARPTOS_MONTHS, ordinal, STATIC_ROOT } = require("../config");
const { pageShell } = require("../components/shell");
const { mapOverlayBlock, artifactOverlayBlock } = require("../components/overlays");
const { renderMarkdownFile, renderRichTextBlock, markdownToHtml } = require("../lib/markdown");

// ── House Rules Page ──────────────────────────────────────────
function renderHouseRulesPage(session) {
  const rulesPath = path.join(STATIC_ROOT, "data", "houserules.md");
  const htmlContent = renderMarkdownFile(rulesPath);
  const body = `
  <div class="content">
    <div class="history-content">${htmlContent}</div>
  </div>`;
  return pageShell("House Rules — Halls of the Damned", "/house-rules", body, session);
}

// ── Overcasting Page ──────────────────────────────────────────
function renderOvercastingPage(session) {
  const mdPath = path.join(STATIC_ROOT, "data", "over-casting.md");
  const htmlContent = renderMarkdownFile(mdPath);
  const body = `
  <div class="content">
    <a href="/house-rules" style="color:#e8b923;text-decoration:none;font-size:0.9rem;">&larr; Back to House Rules</a>
    <div class="history-content" style="margin-top:16px;">${htmlContent}</div>
  </div>`;
  return pageShell("Overcasting — Halls of the Damned", "/overcasting", body, session);
}

// ── Circle Magic Page ─────────────────────────────────────────
function renderCircleMagicPage(session) {
  const mdPath = path.join(STATIC_ROOT, "data", "casting_circle.md");
  const htmlContent = renderMarkdownFile(mdPath);
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
  try {
    const r = await pgPool.query(
      "SELECT * FROM hotd_sessions WHERE published = TRUE ORDER BY session_number DESC LIMIT 1"
    );
    if (r.rows.length > 0) lastSession = r.rows[0];
  } catch (_) {}
  try {
    const r = await pgPool.query(
      "SELECT COALESCE(MAX(session_number), 0) AS max_n FROM hotd_sessions"
    );
    nextSessionNum = (r.rows[0] && r.rows[0].max_n ? r.rows[0].max_n : 0) + 1;
  } catch (_) {}

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
    const playDateStr = lastSession.play_date ? new Date(lastSession.play_date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "";
    const summaryText = lastSession.summary || "Summary pending...";
    lastSessionHtml = `
      <div style="margin-top:8px;">
        <strong style="color:#e8b923;">Session ${lastSession.session_number} &mdash; ${esc(lastSession.title)}</strong>
        ${lastSession.game_date ? `<div style="color:#aaa;font-size:0.8rem;margin-top:4px;">&#128197; In-Game: ${esc(lastSession.game_date)}</div>` : ""}
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

  // Admin config link
  const adminLink = session && session.role === "admin" ?
    `<div style="text-align:right;margin-bottom:4px;"><a href="/home/admin" style="color:#e8b923;text-decoration:none;font-weight:600;font-size:0.85rem;">&#9881; Edit Dashboard &rarr;</a></div>` : "";

  const body = `
  <div class="content" style="width:95%;max-width:95%;margin:0 auto;">
    ${adminLink}

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
            <img id="baroviaMap" src="/images/main_map.jpeg" alt="Map of Barovia" draggable="false" style="position:absolute;top:0;left:0;transform-origin:0 0;max-width:none;user-select:none;width:5025px;height:3225px;" />
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

  const adminLink = session && session.role === "admin" ?
    `<div style="text-align:right;margin-bottom:16px;"><a href="/calendar/admin?month=${viewMonth}" style="color:#e8b923;text-decoration:none;font-weight:600;font-size:0.85rem;">&#9881; Admin &rarr;</a></div>` : "";

  const body = `
  <div class="content">
    <h2 class="section-title">&#128197; Campaign Calendar</h2>
    <p style="color:#888;margin-bottom:16px;">The Calendar of Harptos &mdash; the standard reckoning of Faer&ucirc;n. Current date:
      <strong style="color:#e8b923;">${ordinal(currentDay)} of ${esc(curMonthName)}, ${currentYear} DR</strong></p>
    ${adminLink}
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

// ── Maps Page (DB-backed, overlay with zoom/pan) ──────────────
async function renderMapsPage(session) {
  let maps = [];
  try { const r = await pgPool.query("SELECT * FROM hotd_maps ORDER BY sort_order, id"); maps = r.rows; } catch (_) {}

  const mapCards = maps.length > 0 ? maps.map(m =>
    `<div class="map-card" onclick="openMapOverlay('${esc(m.image_url)}','${esc(m.name)}')" style="cursor:pointer;">
      <img src="${esc(m.image_url)}" alt="${esc(m.name)}" loading="lazy" onerror="this.outerHTML='<div class=\\'map-placeholder\\'>&#128506;</div>'" />
      <div class="map-card-body"><h3>${esc(m.name)}</h3>${renderRichTextBlock(m.description, "", "color:#aaa;font-size:0.9rem;line-height:1.5;")}</div>
    </div>`
  ).join("") : `<div class="map-card"><div class="map-placeholder">&#128506;</div><div class="map-card-body"><h3>Maps Coming Soon</h3><p>As the party explores, acquired maps will appear here.</p></div></div>`;

  const adminLink = session && session.role === "admin" ?
    `<div style="text-align:right;margin-bottom:16px;"><a href="/maps/admin" style="color:#e8b923;text-decoration:none;font-weight:600;font-size:0.85rem;">&#9881; Admin &rarr;</a></div>` : "";

  const body = `
  <div class="content">
    <h2 class="section-title">&#128506; Acquired Maps</h2>
    <p style="color:#888;margin-bottom:24px;">Maps the party has found, purchased, or otherwise acquired. Click a map to view it in detail with zoom and pan.</p>
    ${adminLink}
    <div class="map-grid" style="grid-template-columns:repeat(3,1fr);">${mapCards}</div>
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

  const adminLink = session && session.role === "admin" ?
    `<div style="text-align:right;margin-bottom:16px;"><a href="/npcs/admin" style="color:#e8b923;text-decoration:none;font-weight:600;font-size:0.85rem;">&#9881; Admin &rarr;</a></div>` : "";

  const body = `
  <div class="content">
    <h2 class="section-title">&#128100; Notable NPCs</h2>
    <p style="color:#888;margin-bottom:24px;">Allies, enemies, and persons of interest the party has encountered. Click an NPC for their full profile.</p>
    ${adminLink}
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

    ${isAdmin ? `<div style="margin-top:32px;text-align:right;"><a href="/npcs/admin" style="color:#e8b923;text-decoration:none;font-weight:600;">&#9881; Edit in Admin &rarr;</a></div>` : ""}
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
  // editor. Everyone else only sees rows that have been explicitly published.
  const isAdmin = session && session.role === "admin";
  const sql = isAdmin
    ? "SELECT * FROM hotd_sessions ORDER BY session_number DESC"
    : "SELECT * FROM hotd_sessions WHERE published = TRUE ORDER BY session_number DESC";
  let sessions = [];
  try { const r = await pgPool.query(sql); sessions = r.rows; } catch (_) {}

  const sessionList = sessions.length > 0 ? sessions.map(s => {
    const playDateStr = s.play_date ? new Date(s.play_date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "";
    const draftBadge = (isAdmin && !s.published)
      ? ` <span style="background:#7a2222;color:#fff;font-size:0.65rem;padding:2px 6px;border-radius:3px;vertical-align:middle;">DRAFT</span>`
      : "";
    return `
    <li>
      <strong>Session ${s.session_number} &mdash; ${esc(s.title)}</strong>${draftBadge}
      ${s.game_date ? `<div style="color:#e8b923;font-size:0.8rem;margin-top:2px;">&#128197; In-Game: ${esc(s.game_date)}</div>` : ""}
      ${playDateStr ? `<div style="color:#888;font-size:0.75rem;margin-top:2px;">&#128197; Played: ${esc(playDateStr)}</div>` : ""}
      ${renderRichTextBlock(s.summary, "Summary coming soon...", "color:#aaa;margin-top:8px;line-height:1.6;")}
    </li>`;
  }).join("") : `
    <li><strong>Session 0 &mdash; Campaign Kickoff</strong><p>Character creation, world introduction, and the call to adventure. Coming soon...</p></li>`;

  const adminLink = session && session.role === "admin" ?
    `<div style="text-align:right;margin-bottom:16px;"><a href="/dm-admin#sessions" style="color:#e8b923;text-decoration:none;font-weight:600;font-size:0.85rem;">&#9881; Admin &rarr;</a></div>` : "";

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
  const historyPath = path.join(STATIC_ROOT, "data", "history.md");
  const htmlContent = renderMarkdownFile(historyPath);
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

  const adminLink = session && session.role === "admin" ?
    `<div style="text-align:right;margin-bottom:16px;"><a href="/artifacts/admin" style="color:#e8b923;text-decoration:none;font-weight:600;font-size:0.85rem;">&#9881; Admin &rarr;</a></div>` : "";

  const body = `
  <div class="content">
    <h2 class="section-title">&#128142; Artifacts &amp; Legendary Items</h2>
    <p style="color:#888;margin-bottom:24px;">Items of power the party has encountered, acquired, or learned about. Click an artifact for details.</p>
    ${adminLink}
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

  const adminLink = session && session.role === "admin" ?
    `<div style="text-align:right;margin-bottom:16px;"><a href="/handouts/admin" style="color:#e8b923;text-decoration:none;font-weight:600;font-size:0.85rem;">&#9881; Admin &rarr;</a></div>` : "";

  const body = `
  <div class="content">
    <h2 class="section-title">&#128220; Handouts</h2>
    <p style="color:#888;margin-bottom:24px;">Documents, letters, and notes the party has discovered. Click a handout for details.</p>
    ${adminLink}
    ${handoutRows}
  </div>
  ${artifactOverlayBlock("Handout")}`;
  return pageShell("Handouts — Halls of the Damned", "/handouts", body, session);
}

// ── Art / Images Gallery Page ─────────────────────────────────
async function renderArtGalleryPage(session) {
  // Scan filesystem for images (everything except maps/)
  const imgDir = path.join(STATIC_ROOT, 'images');
  const imageExts = /\.(png|jpg|jpeg|webp)$/i;
  const excludeDirs = new Set(['maps']);

  function collectImages(dir, urlPrefix) {
    let images = [];
    if (!fs.existsSync(dir)) return images;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (excludeDirs.has(entry.name)) continue;
        images = images.concat(collectImages(path.join(dir, entry.name), `${urlPrefix}/${entry.name}`));
      } else if (imageExts.test(entry.name)) {
        images.push(`${urlPrefix}/${entry.name}`);
      }
    }
    return images;
  }

  const allImages = collectImages(imgDir, '/images').sort();

  const artCards = allImages.length > 0 ? allImages.map(url => `
    <div class="art-card" onclick='openArtifactOverlay(${JSON.stringify(url)}, "")'>
      <img src="${esc(url)}" alt="" loading="lazy" />
    </div>`).join("") : `<p style="color:#888;text-align:center;">No images found.</p>`;

  const body = `
  <div class="content">
    <h2 class="section-title">&#127912; Art &amp; Images</h2>
    <p style="color:#888;margin-bottom:24px;">Campaign art, character portraits, scene illustrations, and other images. Click to enlarge.</p>
    <div class="art-grid">${artCards}</div>
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

// ── Shared Adventure Journal Page ──────────────────────────────
async function renderJournalPage(session) {
  // Fetch entries (one per date — take latest updated per date)
  let entries = [];
  try {
    const r = await pgPool.query("SELECT DISTINCT ON (actual_date) * FROM hotd_adventure_journal ORDER BY actual_date DESC, updated_at DESC");
    entries = r.rows;
  } catch (_) {}

  // Fetch current world date from config
  let currentMonth = 6, currentDay = 21, currentYear = 1497;
  try {
    const cfgRes = await pgPool.query("SELECT key, value FROM hotd_config WHERE key IN ('current_month','current_day','current_year')");
    for (const r of cfgRes.rows) {
      if (r.key === "current_month") currentMonth = parseInt(r.value, 10);
      if (r.key === "current_day") currentDay = parseInt(r.value, 10);
      if (r.key === "current_year") currentYear = parseInt(r.value, 10);
    }
  } catch (_) {}
  const monthObj = HARPTOS_MONTHS.find(m => m.idx === currentMonth) || { name: "Unknown" };
  const defaultWorldDate = `${ordinal(currentDay)} Day of ${monthObj.name}, ${currentYear} DR`;

  // Build sidebar cards from entries (one per date)
  const selectedDate = entries.length > 0
    ? (typeof entries[0].actual_date === "string" ? entries[0].actual_date.slice(0, 10) : new Date(entries[0].actual_date).toISOString().slice(0, 10))
    : null;
  const selectedEntry = entries.length > 0 ? entries[0] : null;

  const sidebarHtml = entries.map(e => {
    const dk = typeof e.actual_date === "string" ? e.actual_date.slice(0, 10) : new Date(e.actual_date).toISOString().slice(0, 10);
    const niceDateStr = new Date(dk + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const summary = (e.body || "").replace(/\n/g, " ").slice(0, 120) + ((e.body || "").length > 120 ? "\u2026" : "");
    const isSelected = dk === selectedDate;
    return `<div class="j-sidebar-card${isSelected ? " active" : ""}" data-date="${esc(dk)}">
      <div class="j-card-header">
        <span class="j-card-world">${esc(e.world_date || "")}</span>
        <span class="j-card-session">${esc(niceDateStr)}</span>
      </div>
      <hr class="j-card-hr">
      <div class="j-card-summary">${summary ? esc(summary) : '<em style="color:#555;">Empty entry</em>'}</div>
    </div>`;
  }).join("");

  const selectedBody = selectedEntry ? selectedEntry.body || "" : "";
  const selectedWorldDate = selectedEntry ? selectedEntry.world_date || defaultWorldDate : defaultWorldDate;
  const selectedNiceDate = selectedDate
    ? new Date(selectedDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "";
  const todayStr = new Date().toISOString().slice(0, 10);
  const isAdmin = session && session.role === "admin";
  const harptosJson = JSON.stringify(HARPTOS_MONTHS.map(m => ({ idx: m.idx, name: m.name, nickname: m.nickname })));

  const body = `
  <div class="j-page">
    <h2 class="section-title" style="padding:0 20px;">&#128214; Adventure Journal</h2>
    <div class="j-layout">
      <!-- LEFT SIDEBAR -->
      <div class="j-sidebar">
        <div class="j-sidebar-new">
          <button id="j-new-btn" title="Create new entry for today">+ New Entry</button>
        </div>
        <div id="j-sidebar-list">
          ${sidebarHtml || '<div class="j-sidebar-empty">No entries yet</div>'}
        </div>
      </div>

      <!-- MAIN EDITOR -->
      <div class="j-main">
        <div class="j-editor-header" id="j-editor-header" style="${selectedDate ? "" : "display:none;"}">
          <div class="j-editor-world-date" id="j-display-world-date">${esc(selectedWorldDate)}</div>
          <hr class="j-editor-hr">
          <div class="j-editor-actual-date" id="j-display-actual-date">${esc(selectedNiceDate)}</div>
        </div>

        <!-- New entry form (hidden until + New Entry) -->
        <div id="j-new-form" style="display:none;margin-bottom:20px;background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:16px;">
          <div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap;">
            <div style="flex:1;min-width:140px;">
              <label style="color:#888;font-size:0.78rem;font-weight:600;display:block;margin-bottom:4px;">Session Date</label>
              <input type="date" id="j-date" value="${esc(todayStr)}" style="width:100%;padding:8px 10px;border:1px solid #444;border-radius:6px;background:#222;color:#e0ddd5;font-size:0.85rem;outline:none;">
            </div>
            <div style="flex:2;min-width:200px;position:relative;">
              <label style="color:#888;font-size:0.78rem;font-weight:600;display:block;margin-bottom:4px;">World Date</label>
              <button type="button" id="j-harptos-btn" style="width:100%;padding:8px 10px;border:1px solid #444;border-radius:6px;background:#222;color:#e0ddd5;font-size:0.85rem;outline:none;cursor:pointer;text-align:left;">
                ${esc(defaultWorldDate)} &#9660;
              </button>
              <div id="j-harptos-popout" style="display:none;"></div>
            </div>
            <button id="j-create-btn" style="padding:8px 20px;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem;font-weight:700;background:#e8b923;color:#1a1a1a;">Create</button>
            <button id="j-cancel-new" style="padding:8px 16px;border:1px solid #555;border-radius:6px;cursor:pointer;font-size:0.85rem;background:transparent;color:#888;">Cancel</button>
          </div>
        </div>

        <div id="j-editor-wrap" style="${selectedDate ? "" : "display:none;"}">
          <div style="position:relative;">
            <textarea id="j-body" rows="20" placeholder="Write your adventure notes here...">${esc(selectedBody)}</textarea>
            <div id="j-autocomplete" class="j-autocomplete" style="display:none;"></div>
          </div>
          <div class="j-save-status">
            <span id="j-status"></span>
            ${isAdmin ? '<button id="j-delete-btn" style="padding:4px 12px;border:1px solid #8b0000;border-radius:4px;cursor:pointer;font-size:0.75rem;background:transparent;color:#8b0000;">Delete Entry</button>' : ""}
          </div>
        </div>

        <div id="j-empty-state" style="${selectedDate ? "display:none;" : ""}text-align:center;color:#666;font-size:0.95rem;padding:80px 0;">
          No journal entries yet. Click <strong style="color:#e8b923;">+ New Entry</strong> to begin!
        </div>
      </div>
    </div>
  </div>

  <!-- Entity tooltip -->
  <div id="j-tooltip" class="j-tooltip" style="display:none;"></div>

  <style>
    .j-page { max-width:1400px; margin:0 auto; }
    .j-layout { display:flex; gap:0; min-height:calc(100vh - 200px); border:1px solid #333; border-radius:8px; overflow:hidden; margin:0 20px; }
    .j-sidebar { width:300px; min-width:260px; max-width:340px; background:#111; border-right:1px solid #333; display:flex; flex-direction:column; }
    .j-main { flex:1; padding:24px 28px; overflow-y:auto; max-height:calc(100vh - 200px); }
    .j-sidebar-new { padding:12px; border-bottom:1px solid #333; }
    .j-sidebar-new button { width:100%; padding:10px; border:none; border-radius:6px; cursor:pointer; font-size:0.85rem; font-weight:700; text-transform:uppercase; background:#e8b923; color:#1a1a1a; letter-spacing:0.5px; }
    .j-sidebar-new button:hover { background:#d4a820; }
    #j-sidebar-list { flex:1; overflow-y:auto; padding:8px; }
    .j-sidebar-card { padding:12px; border:1px solid #2a2a2a; border-radius:8px; margin-bottom:8px; cursor:pointer; transition:all 0.15s; background:#1a1a1a; }
    .j-sidebar-card:hover { border-color:#555; background:#1e1e1e; }
    .j-sidebar-card.active { border-color:#e8b923; background:#1e1c14; box-shadow:inset 3px 0 0 #e8b923; }
    .j-card-header { display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin-bottom:6px; }
    .j-card-world { color:#e8b923; font-weight:700; font-size:0.78rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; }
    .j-card-session { color:#888; font-size:0.72rem; white-space:nowrap; }
    .j-card-hr { border:none; border-top:1px solid #8b0000; margin:0 0 6px 0; }
    .j-card-summary { color:#999; font-size:0.78rem; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .j-sidebar-empty { text-align:center; color:#555; font-size:0.85rem; padding:32px 12px; }
    .j-editor-header { text-align:center; margin-bottom:20px; }
    .j-editor-world-date { color:#e8b923; font-size:1.3rem; font-weight:700; letter-spacing:0.5px; }
    .j-editor-hr { border:none; border-top:2px solid #8b0000; margin:6px auto; width:60%; }
    .j-editor-actual-date { color:#888; font-size:0.9rem; }
    #j-body { width:100%; padding:16px; border:1px solid #333; border-radius:8px; background:#1a1a1a; color:#e0ddd5; font-size:0.92rem; outline:none; font-family:inherit; resize:vertical; line-height:1.7; box-sizing:border-box; min-height:300px; }
    #j-body:focus { border-color:#e8b923; }
    .j-save-status { display:flex; justify-content:space-between; align-items:center; margin-top:8px; min-height:24px; }
    #j-status { color:#888; font-size:0.8rem; }
    #j-harptos-popout { position:absolute; top:100%; left:0; right:0; z-index:200; background:#1a1a1a; border:1px solid #e8b923; border-radius:8px; padding:16px; box-shadow:0 8px 24px rgba(0,0,0,0.6); margin-top:4px; min-width:300px; }
    .j-harptos-year { display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:12px; }
    .j-harptos-year button { background:none; border:1px solid #555; color:#e0ddd5; border-radius:4px; padding:4px 10px; cursor:pointer; font-size:0.9rem; }
    .j-harptos-year button:hover { border-color:#e8b923; color:#e8b923; }
    .j-harptos-year span { color:#e8b923; font-weight:700; font-size:1rem; min-width:80px; text-align:center; }
    .j-harptos-months { display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; margin-bottom:12px; }
    .j-month-btn { padding:6px 4px; border:1px solid #333; border-radius:4px; background:#222; color:#ccc; font-size:0.75rem; cursor:pointer; text-align:center; transition:all 0.1s; }
    .j-month-btn:hover { border-color:#e8b923; color:#fff; }
    .j-month-btn.selected { background:#e8b923; color:#1a1a1a; font-weight:700; border-color:#e8b923; }
    .j-harptos-days { display:grid; grid-template-columns:repeat(6, 1fr); gap:4px; margin-bottom:12px; }
    .j-day-btn { padding:6px 2px; border:1px solid #333; border-radius:4px; background:#222; color:#ccc; font-size:0.8rem; cursor:pointer; text-align:center; transition:all 0.1s; }
    .j-day-btn:hover { border-color:#e8b923; color:#fff; }
    .j-day-btn.selected { background:#e8b923; color:#1a1a1a; font-weight:700; border-color:#e8b923; }
    .j-harptos-confirm { width:100%; padding:8px; border:none; border-radius:6px; cursor:pointer; font-weight:700; background:#e8b923; color:#1a1a1a; font-size:0.85rem; }
    .j-harptos-confirm:hover { background:#d4a820; }
    .j-autocomplete {
      position:absolute; bottom:100%; left:0; right:0;
      background:#1e1e1e; border:1px solid #444; border-bottom:none; border-radius:8px 8px 0 0;
      max-height:200px; overflow-y:auto; z-index:100;
      box-shadow:0 -4px 16px rgba(0,0,0,0.4);
    }
    .j-ac-item { padding:8px 14px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; font-size:0.85rem; }
    .j-ac-item:hover, .j-ac-item.active { background:#2a2a2a; }
    .j-ac-name { color:#fff; font-weight:600; }
    .j-ac-type { font-size:0.7rem; color:#e8b923; text-transform:uppercase; background:rgba(232,185,35,0.12); padding:2px 6px; border-radius:3px; }
    .j-tooltip {
      position:fixed; z-index:10000; background:#1a1a1a; border:1px solid #e8b923;
      border-radius:8px; padding:14px 18px; max-width:320px; box-shadow:0 4px 20px rgba(0,0,0,0.6);
      pointer-events:none;
    }
    .j-tooltip .j-tt-name { color:#e8b923; font-weight:700; font-size:0.95rem; margin-bottom:4px; }
    .j-tooltip .j-tt-type { font-size:0.7rem; color:#888; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px; }
    .j-tooltip .j-tt-detail { color:#aaa; font-size:0.82rem; margin-bottom:4px; }
    .j-tooltip .j-tt-desc { color:#999; font-size:0.8rem; line-height:1.4; }
    @media (max-width:768px) {
      .j-layout { flex-direction:column; min-height:auto; }
      .j-sidebar { width:100%; max-width:none; min-width:0; border-right:none; border-bottom:1px solid #333; max-height:200px; }
      .j-main { max-height:none; }
    }
  </style>

  <script>
  (function(){
    var userId = ${session ? session.userId : 0};
    var isAdmin = ${isAdmin ? "true" : "false"};
    if (!userId) return;

    var HARPTOS = ${harptosJson};
    function ordinal(n) { var s=["th","st","nd","rd"],v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }
    function fmtWD(month,day,year) { var m=HARPTOS.find(function(h){return h.idx===month}); return ordinal(day)+" Day of "+(m?m.name:"Unknown")+", "+year+" DR"; }
    function escHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

    var currentDate = ${selectedDate ? JSON.stringify(selectedDate) : "null"};
    var lastSavedBody = ${JSON.stringify(selectedBody)};
    var saveTimer = null;
    var lastPollTs = ${JSON.stringify(new Date().toISOString())};
    var entities = [], entityMap = {};
    var acItems = [], acIndex = -1, acQuery = "", acStart = -1;
    var hMonth = ${currentMonth}, hDay = ${currentDay}, hYear = ${currentYear};

    var sidebarList = document.getElementById("j-sidebar-list");
    var bodyInput = document.getElementById("j-body");
    var statusEl = document.getElementById("j-status");
    var editorHeader = document.getElementById("j-editor-header");
    var displayWorldDate = document.getElementById("j-display-world-date");
    var displayActualDate = document.getElementById("j-display-actual-date");
    var editorWrap = document.getElementById("j-editor-wrap");
    var emptyState = document.getElementById("j-empty-state");
    var newForm = document.getElementById("j-new-form");
    var dateInput = document.getElementById("j-date");
    var harptosBtn = document.getElementById("j-harptos-btn");
    var harptosPopout = document.getElementById("j-harptos-popout");
    var tooltip = document.getElementById("j-tooltip");
    var acDropdown = document.getElementById("j-autocomplete");
    var newBtn = document.getElementById("j-new-btn");
    var createBtn = document.getElementById("j-create-btn");
    var cancelNewBtn = document.getElementById("j-cancel-new");
    var deleteBtn = document.getElementById("j-delete-btn");

    // ── Load entities ──
    fetch("/api/journal/entities").then(function(r){return r.json()}).then(function(data){
      entities = data.entities || [];
      entityMap = {};
      for (var i=0;i<entities.length;i++) entityMap[entities[i].name.toLowerCase()] = entities[i];
    }).catch(function(){});

    // ── Sidebar click → select date ──
    sidebarList.addEventListener("click", function(ev) {
      var card = ev.target.closest(".j-sidebar-card");
      if (!card) return;
      selectDate(card.dataset.date);
    });

    function selectDate(dk) {
      if (dk === currentDate) return;
      // Save current before switching
      if (currentDate && bodyInput.value !== lastSavedBody) doSave();
      currentDate = dk;
      sidebarList.querySelectorAll(".j-sidebar-card").forEach(function(c){c.classList.toggle("active",c.dataset.date===dk)});
      // Load entry from server
      fetch("/api/journal").then(function(r){return r.json()}).then(function(data){
        var entry = null;
        var arr = data.entries || [];
        for (var i=0;i<arr.length;i++) {
          var edk = (typeof arr[i].actual_date==="string" ? arr[i].actual_date : new Date(arr[i].actual_date).toISOString()).slice(0,10);
          if (edk===dk) { entry=arr[i]; break; }
        }
        if (entry) {
          bodyInput.value = entry.body || "";
          lastSavedBody = entry.body || "";
          displayWorldDate.textContent = entry.world_date || "";
        } else {
          bodyInput.value = "";
          lastSavedBody = "";
        }
      }).catch(function(){ bodyInput.value=""; lastSavedBody=""; });
      var niceDate = new Date(dk+"T12:00:00Z").toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
      displayActualDate.textContent = niceDate;
      editorHeader.style.display = "";
      editorWrap.style.display = "";
      emptyState.style.display = "none";
      newForm.style.display = "none";
      statusEl.textContent = "";
    }

    // ── New Entry ──
    newBtn.addEventListener("click", function() {
      newForm.style.display = "";
      dateInput.value = new Date().toISOString().slice(0,10);
    });
    cancelNewBtn.addEventListener("click", function() { newForm.style.display = "none"; });

    createBtn.addEventListener("click", function() {
      var dk = dateInput.value;
      if (!dk) return;
      var wd = harptosBtn.textContent.replace(/\\s*\\u25bc\\s*$/,"").trim();
      // If entry already exists for this date, just select it
      var existing = sidebarList.querySelector('.j-sidebar-card[data-date="'+dk+'"]');
      if (existing) { selectDate(dk); return; }
      fetch("/api/journal/save", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ actual_date: dk, world_date: wd, body: "" })
      }).then(function(r){return r.json()}).then(function(data){
        if (data.entry) {
          addSidebarCard(data.entry);
          currentDate = null; // reset so selectDate will fire
          selectDate(dk);
          bodyInput.focus();
        }
      }).catch(function(err){ console.error(err); });
      newForm.style.display = "none";
    });

    function addSidebarCard(e) {
      var dk = (typeof e.actual_date==="string" ? e.actual_date : new Date(e.actual_date).toISOString()).slice(0,10);
      if (sidebarList.querySelector('.j-sidebar-card[data-date="'+dk+'"]')) return;
      var niceDate = new Date(dk+"T12:00:00Z").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
      var summary = (e.body||"").replace(/\\n/g," ").slice(0,120);
      var card = document.createElement("div");
      card.className = "j-sidebar-card";
      card.dataset.date = dk;
      card.innerHTML = '<div class="j-card-header"><span class="j-card-world">'+escHtml(e.world_date||"")+'</span><span class="j-card-session">'+escHtml(niceDate)+'</span></div><hr class="j-card-hr"><div class="j-card-summary">'+(escHtml(summary)||'<em style="color:#555;">Empty entry</em>')+'</div>';
      var cards = sidebarList.querySelectorAll(".j-sidebar-card");
      var inserted = false;
      for (var i=0;i<cards.length;i++) {
        if (dk > cards[i].dataset.date) { sidebarList.insertBefore(card, cards[i]); inserted=true; break; }
      }
      if (!inserted) sidebarList.appendChild(card);
      var empty = sidebarList.querySelector(".j-sidebar-empty");
      if (empty) empty.remove();
    }

    // ── Autosave (2-second debounce) ──
    bodyInput.addEventListener("input", function() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(doSave, 2000);
      statusEl.textContent = "Unsaved changes\u2026";
      statusEl.style.color = "#888";
      checkAutocomplete();
    });

    function doSave() {
      if (!currentDate) return;
      var b = bodyInput.value;
      var wd = displayWorldDate.textContent || "";
      statusEl.textContent = "Saving\u2026"; statusEl.style.color = "#888";
      fetch("/api/journal/save", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ actual_date: currentDate, world_date: wd, body: b })
      }).then(function(r){return r.json()}).then(function(data){
        if (data.entry) {
          lastSavedBody = b;
          statusEl.textContent = "Saved \u2713"; statusEl.style.color = "#22c55e";
          var card = sidebarList.querySelector('.j-sidebar-card[data-date="'+currentDate+'"]');
          if (card) {
            var sumEl = card.querySelector(".j-card-summary");
            var s = b.replace(/\\n/g," ").slice(0,120) + (b.length>120?"\u2026":"");
            if (sumEl) sumEl.textContent = s || "Empty entry";
          }
        } else {
          statusEl.textContent = data.error || "Save failed"; statusEl.style.color = "#ef4444";
        }
      }).catch(function(){
        statusEl.textContent = "Network error"; statusEl.style.color = "#ef4444";
      });
      setTimeout(function(){ if(statusEl.textContent==="Saved \u2713") statusEl.textContent=""; }, 3000);
    }

    // ── Polling (4 sec) ──
    setInterval(function(){
      if (!currentDate) return;
      fetch("/api/journal?since="+encodeURIComponent(lastPollTs)).then(function(r){return r.json()}).then(function(data){
        if (data.ts) lastPollTs = data.ts;
        if (data.entries && data.entries.length > 0) {
          for (var i=0;i<data.entries.length;i++) {
            var e = data.entries[i];
            var dk = (typeof e.actual_date==="string" ? e.actual_date : new Date(e.actual_date).toISOString()).slice(0,10);
            addSidebarCard(e);
            var card = sidebarList.querySelector('.j-sidebar-card[data-date="'+dk+'"]');
            if (card) {
              var sumEl = card.querySelector(".j-card-summary");
              var wdEl = card.querySelector(".j-card-world");
              if (sumEl) { var s=(e.body||"").replace(/\\n/g," ").slice(0,120); sumEl.textContent=s||"Empty entry"; }
              if (wdEl && e.world_date) wdEl.textContent = e.world_date;
            }
            if (dk===currentDate && bodyInput.value===lastSavedBody) {
              bodyInput.value = e.body || "";
              lastSavedBody = e.body || "";
              if (e.world_date) displayWorldDate.textContent = e.world_date;
            }
          }
        }
      }).catch(function(){});
    }, 4000);

    // ── Delete (admin only) ──
    if (deleteBtn) {
      deleteBtn.addEventListener("click", function() {
        if (!currentDate || !confirm("Delete this journal entry?")) return;
        fetch("/api/journal").then(function(r){return r.json()}).then(function(data){
          var entry = null;
          var arr = data.entries || [];
          for (var j=0;j<arr.length;j++) {
            var edk = (typeof arr[j].actual_date==="string" ? arr[j].actual_date : new Date(arr[j].actual_date).toISOString()).slice(0,10);
            if (edk===currentDate) { entry=arr[j]; break; }
          }
          if (entry) {
            fetch("/api/journal/delete", {
              method:"POST", headers:{"Content-Type":"application/json"},
              body: JSON.stringify({ id: entry.id })
            }).then(function(){
              var card = sidebarList.querySelector('.j-sidebar-card[data-date="'+currentDate+'"]');
              if (card) card.remove();
              currentDate = null;
              bodyInput.value = "";
              lastSavedBody = "";
              editorWrap.style.display = "none";
              editorHeader.style.display = "none";
              emptyState.style.display = "";
              var firstCard = sidebarList.querySelector(".j-sidebar-card");
              if (firstCard) selectDate(firstCard.dataset.date);
            });
          }
        });
      });
    }

    // ── Harptos Calendar Popout ──
    function buildHarptosPopout() {
      var html = '<div class="j-harptos-year">';
      html += '<button type="button" id="j-hy-prev">\u25C0</button>';
      html += '<span id="j-hy-display">'+hYear+' DR</span>';
      html += '<button type="button" id="j-hy-next">\u25B6</button>';
      html += '</div>';
      html += '<div class="j-harptos-months">';
      for (var i=0;i<HARPTOS.length;i++) {
        var m = HARPTOS[i];
        html += '<div class="j-month-btn'+(m.idx===hMonth?' selected':'')+'" data-idx="'+m.idx+'" title="'+escHtml(m.nickname)+'">'+escHtml(m.name)+'</div>';
      }
      html += '</div>';
      html += '<div class="j-harptos-days">';
      for (var d=1;d<=30;d++) {
        html += '<div class="j-day-btn'+(d===hDay?' selected':'')+'" data-day="'+d+'">'+d+'</div>';
      }
      html += '</div>';
      html += '<button type="button" class="j-harptos-confirm">Select: '+fmtWD(hMonth,hDay,hYear)+'</button>';
      harptosPopout.innerHTML = html;
    }

    harptosBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      if (harptosPopout.style.display === "none") {
        buildHarptosPopout();
        harptosPopout.style.display = "";
        attachHarptosListeners();
      } else {
        harptosPopout.style.display = "none";
      }
    });

    function attachHarptosListeners() {
      document.getElementById("j-hy-prev").onclick = function(){ hYear--; buildHarptosPopout(); attachHarptosListeners(); };
      document.getElementById("j-hy-next").onclick = function(){ hYear++; buildHarptosPopout(); attachHarptosListeners(); };
      harptosPopout.querySelectorAll(".j-month-btn").forEach(function(btn){
        btn.onclick = function(){ hMonth=parseInt(this.dataset.idx,10); buildHarptosPopout(); attachHarptosListeners(); };
      });
      harptosPopout.querySelectorAll(".j-day-btn").forEach(function(btn){
        btn.onclick = function(){ hDay=parseInt(this.dataset.day,10); buildHarptosPopout(); attachHarptosListeners(); };
      });
      harptosPopout.querySelector(".j-harptos-confirm").onclick = function(){
        var wd = fmtWD(hMonth,hDay,hYear);
        harptosBtn.innerHTML = escHtml(wd)+" &#9660;";
        harptosPopout.style.display = "none";
      };
    }

    document.addEventListener("click", function(e) {
      if (!harptosPopout.contains(e.target) && e.target !== harptosBtn) harptosPopout.style.display = "none";
    });

    // ── Autocomplete ──
    function checkAutocomplete() {
      var val = bodyInput.value;
      var pos = bodyInput.selectionStart;
      var before = val.slice(0, pos);
      var wordMatch = before.match(/[\\w''-]+$/);
      if (!wordMatch || wordMatch[0].length < 3) { hideAc(); return; }
      acQuery = wordMatch[0].toLowerCase();
      acStart = pos - wordMatch[0].length;
      var matches = entities.filter(function(e){return e.name.toLowerCase().includes(acQuery)}).slice(0,8);
      if (matches.length === 0) { hideAc(); return; }
      acItems = matches;
      acIndex = 0;
      renderAc();
    }

    bodyInput.addEventListener("keydown", function(e) {
      if (acDropdown.style.display !== "none") {
        if (e.key==="ArrowDown") { e.preventDefault(); acIndex=Math.min(acIndex+1,acItems.length-1); highlightAc(); return; }
        if (e.key==="ArrowUp") { e.preventDefault(); acIndex=Math.max(acIndex-1,0); highlightAc(); return; }
        if (e.key==="Enter"||e.key==="Tab") { if(acIndex>=0&&acItems[acIndex]){e.preventDefault();acceptAc(acItems[acIndex]);return;} }
        if (e.key==="Escape") { hideAc(); return; }
      }
    });

    function renderAc() {
      acDropdown.innerHTML = acItems.map(function(item,i){
        return '<div class="j-ac-item'+(i===acIndex?' active':'')+'" data-idx="'+i+'"><span class="j-ac-name">'+escHtml(item.name)+'</span><span class="j-ac-type">'+escHtml(item.type)+'</span></div>';
      }).join("");
      acDropdown.style.display = "block";
      acDropdown.querySelectorAll(".j-ac-item").forEach(function(el){
        el.addEventListener("mousedown", function(ev){
          ev.preventDefault();
          var idx = parseInt(this.dataset.idx,10);
          if (acItems[idx]) acceptAc(acItems[idx]);
        });
      });
    }

    function highlightAc() {
      acDropdown.querySelectorAll(".j-ac-item").forEach(function(el,i){ el.classList.toggle("active",i===acIndex); });
    }

    function acceptAc(item) {
      var val = bodyInput.value;
      var pos = bodyInput.selectionStart;
      var before = val.slice(0,acStart);
      var after = val.slice(pos);
      bodyInput.value = before + item.name + after;
      var newPos = acStart + item.name.length;
      bodyInput.selectionStart = bodyInput.selectionEnd = newPos;
      bodyInput.focus();
      hideAc();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(doSave, 2000);
    }

    function hideAc() { acDropdown.style.display = "none"; acItems=[]; acIndex=-1; }

    // ── Tooltip on entity hover ──
    document.addEventListener("mouseover", function(ev) {
      var el = ev.target.closest(".j-entity");
      if (!el) return;
      var key = el.dataset.entity;
      var ent = entityMap[key];
      if (!ent) return;
      tooltip.innerHTML = '<div class="j-tt-name">'+escHtml(ent.name)+'</div>'+
        '<div class="j-tt-type">'+escHtml(ent.type)+'</div>'+
        (ent.detail?'<div class="j-tt-detail">'+escHtml(ent.detail)+'</div>':'')+
        (ent.description?'<div class="j-tt-desc">'+escHtml(ent.description)+'</div>':'');
      tooltip.style.display = "block";
      var rect = el.getBoundingClientRect();
      tooltip.style.left = Math.min(rect.left,window.innerWidth-340)+"px";
      tooltip.style.top = (rect.bottom+8)+"px";
    });
    document.addEventListener("mouseout", function(ev) {
      if (ev.target.closest(".j-entity")) tooltip.style.display = "none";
    });
  })();
  </script>`;
  return pageShell("Adventure Journal — Halls of the Damned", "/journal", body, session);
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
    if (imgMatch) meta.image = imgMatch[2].replace(/^\.\.\/images\//, "/images/");
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
    if (imgMatch) meta.image = imgMatch[2].replace(/^\.\.\/\.\.\/images\//, '/images/');
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

function renderRealmsPage(session) {
  const realmsDir = path.join(STATIC_ROOT, 'data', 'realms');
  let realms = [];
  try {
    const files = fs.readdirSync(realmsDir).filter(f => f.endsWith('.md')).sort();
    realms = files.map(f => {
      const content = fs.readFileSync(path.join(realmsDir, f), 'utf-8');
      const meta = parseRealmMeta(content);
      meta.slug = f.replace(/\.md$/, '');
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

function renderRealmDetailPage(slug, session) {
  const safeName = slug.replace(/[^a-z0-9_-]/gi, '');
  const filePath = path.join(STATIC_ROOT, 'data', 'realms', `${safeName}.md`);
  if (!fs.existsSync(filePath)) return null;
  let md = fs.readFileSync(filePath, 'utf-8');
  const isAdmin = session && session.role === 'admin';
  if (!isAdmin) {
    md = md.replace(/\n## DM Notes[\s\S]*$/, '');
  }
  const meta = parseRealmMeta(md);
  let htmlContent = markdownToHtml(md);
  htmlContent = htmlContent.replace(/src="\.\.\/\.\.\/images\//g, 'src="/images/');
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

function renderGroupsPage(session) {
  const groupsDir = path.join(STATIC_ROOT, "data", "groups");
  let groups = [];
  try {
    const files = fs.readdirSync(groupsDir).filter(f => f.endsWith(".md")).sort();
    groups = files.map(f => {
      const content = fs.readFileSync(path.join(groupsDir, f), "utf-8");
      const meta = parseGroupMeta(content);
      meta.slug = f.replace(/\.md$/, "");
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

function renderGroupDetailPage(slug, session) {
  const safeName = slug.replace(/[^a-z0-9_-]/gi, "");
  const filePath = path.join(STATIC_ROOT, "data", "groups", `${safeName}.md`);
  if (!fs.existsSync(filePath)) return null;
  let md = fs.readFileSync(filePath, "utf-8");
  const isAdmin = session && session.role === 'admin';
  if (!isAdmin) {
    md = md.replace(/\n## DM Notes[\s\S]*$/, '');
  }
  const meta = parseGroupMeta(md);
  let htmlContent = markdownToHtml(md);
  htmlContent = htmlContent.replace(/src="\.\.\/images\//g, 'src="/images/');
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
  renderJournalPage,
  renderRealmsPage,
  renderRealmDetailPage,
  renderGroupsPage,
  renderGroupDetailPage,
};
