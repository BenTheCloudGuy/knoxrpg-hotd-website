// ══════════════════════════════════════════════════════════════
// ── CSS ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

function navCss() {
  return `
    .site-header { position: sticky; top: 0; z-index: 1000; }
    .site-nav {
      background: #1a1a1a; color: #fff;
      display: grid; grid-template-columns: 1fr 1fr 1fr;
      align-items: end; padding: 0 24px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.4);
      border-bottom: 3px solid #8b0000;
    }
    .site-brand {
      grid-column: 2; display: flex; align-items: center; justify-content: center;
      text-decoration: none; padding: 4px 0;
    }
    .site-brand img {
      display: block; width: 100%;
      height: auto; object-fit: contain;
    }
    .site-brand:hover img { opacity: 0.85; }
    .site-nav .nav-links {
      grid-column: 1; grid-row: 1;
      display: flex; gap: 0; align-items: flex-end; padding-bottom: 4px;
    }
    .site-nav .nav-right {
      grid-column: 3; grid-row: 1;
      display: flex; align-items: flex-end; justify-content: flex-end;
      padding-bottom: 4px; gap: 0;
    }
    .site-nav .nav-right a {
      color: #ccc; text-decoration: none; font-size: 0.82rem; font-weight: 600;
      padding: 0 20px; transition: color 0.15s;
      letter-spacing: 0.5px; text-transform: uppercase;
    }
    .site-nav .nav-right a:hover { color: #e8b923; }
    .site-nav a {
      color: #ccc; text-decoration: none; font-size: 0.82rem; font-weight: 600;
      padding: 0 20px; transition: color 0.15s, background 0.15s;
      letter-spacing: 0.5px; text-transform: uppercase;
    }
    .site-nav a:hover { color: #fff; background: rgba(255,255,255,0.08); }
    .site-nav a.active { color: #e8b923; border-bottom: 3px solid #e8b923; }
    /* ── Dropdowns ── */
    .nav-dropdown { position: relative; }
    .nav-dropdown > a { cursor: default; }
    .nav-dropdown > a::after { content: ' ▾'; font-size: 0.65rem; vertical-align: middle; }
    .nav-dropdown-menu {
      display: none; position: absolute; top: 100%; left: 0;
      background: #1a1a1a; border: 1px solid #333; border-top: 2px solid #8b0000;
      min-width: 200px; z-index: 2000;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5); border-radius: 0 0 6px 6px;
    }
    .nav-dropdown:hover .nav-dropdown-menu { display: block; }
    .nav-dropdown-menu a {
      display: block; padding: 10px 20px; font-size: 0.82rem;
      white-space: nowrap; border-bottom: 1px solid #2a2a2a;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .nav-dropdown-menu a:last-child { border-bottom: none; }
    .nav-dropdown-menu a:hover { background: rgba(255,255,255,0.08); color: #e8b923; }
    /* ── Search bar in nav ── */
    .nav-search {
      position: relative; display: flex; align-items: center; margin-right: 8px;
    }
    .nav-search-input {
      background: #2a2a2a; border: 1px solid #444; border-radius: 4px;
      color: #eee; font-size: 0.8rem; padding: 5px 32px 5px 10px;
      width: 180px; outline: none; transition: border-color 0.2s, width 0.3s;
    }
    .nav-search-input::placeholder { color: #888; }
    .nav-search-input:focus { border-color: #e8b923; width: 220px; }
    .nav-search-btn {
      position: absolute; right: 2px; top: 50%; transform: translateY(-50%);
      background: none; border: none; color: #e8b923; cursor: pointer;
      font-size: 0.9rem; padding: 4px 6px; line-height: 1;
    }
    .nav-search-btn:hover { color: #fff; }
    /* ── Typeahead dropdown ── */
    .search-dropdown {
      display: none; position: absolute; top: 100%; right: 0;
      background: #1e1e1e; border: 1px solid #444; border-top: 2px solid #e8b923;
      border-radius: 0 0 8px 8px; width: 400px; max-height: 420px;
      overflow-y: auto; z-index: 3000; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    }
    .search-dropdown.active { display: block; }
    .search-dd-item {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 10px 14px; border-bottom: 1px solid #333;
      text-decoration: none; color: #ddd; transition: background 0.1s;
    }
    .search-dd-item:hover { background: #2a2a2a; }
    .search-dd-type {
      font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.5px;
      color: #e8b923; background: rgba(232,185,35,0.12);
      padding: 2px 6px; border-radius: 3px; white-space: nowrap; margin-top: 2px;
    }
    .search-dd-info { flex: 1; min-width: 0; }
    .search-dd-title {
      font-size: 0.85rem; font-weight: 600; color: #fff;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .search-dd-cat {
      font-size: 0.7rem; color: #999; margin-top: 1px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .search-dd-empty { padding: 14px; color: #888; font-size: 0.85rem; text-align: center; }
    .search-dd-footer { padding: 10px 14px; text-align: center; color: #e8b923; font-size: 0.8rem; cursor: pointer; border-top: 1px solid #333; }
    .search-dd-footer:hover { background: rgba(255,255,255,0.06); }
    /* ── Hamburger ── */
    .nav-hamburger {
      display: none; background: none; border: none; color: #e8b923;
      cursor: pointer; font-size: 1.6rem; padding: 6px 8px; line-height: 1;
      align-self: center;
    }
    .nav-hamburger:hover { color: #fff; }
    /* ── Mobile drawer ── */
    .nav-mobile-drawer { display: none; background: #1a1a1a; border-top: 1px solid #333; padding: 12px 0; }
    .nav-mobile-drawer.open { display: block; }
    .nav-mobile-drawer a {
      display: block; color: #ccc; text-decoration: none; font-size: 0.95rem;
      font-weight: 600; padding: 12px 24px; text-transform: uppercase;
      letter-spacing: 0.5px; transition: background 0.15s, color 0.15s;
      border-bottom: 1px solid #2a2a2a;
    }
    .nav-mobile-drawer a:hover { background: rgba(255,255,255,0.08); color: #fff; }
    .nav-mobile-drawer a.active { color: #e8b923; background: rgba(232,185,35,0.08); border-left: 3px solid #e8b923; }
    .nav-mobile-drawer .mobile-dropdown-label {
      color: #888; font-size: 0.78rem; text-transform: uppercase;
      letter-spacing: 0.8px; padding: 10px 24px 4px; display: block;
      border-bottom: none; cursor: default;
    }
    .nav-mobile-drawer .mobile-dropdown-child { padding-left: 44px; }
    .nav-mobile-drawer .nav-mobile-search { padding: 12px 24px; }
    .nav-mobile-drawer .nav-mobile-search input {
      background: #2a2a2a; border: 1px solid #444; border-radius: 4px;
      color: #eee; font-size: 0.9rem; padding: 8px 12px; width: 100%;
      outline: none; box-sizing: border-box;
    }
    .nav-mobile-drawer .nav-mobile-search input:focus { border-color: #e8b923; }
    /* ── Responsive ── */
    @media (max-width: 768px) {
      .site-nav { grid-template-columns: auto 1fr auto; padding: 0 12px; }
      .nav-hamburger { display: block; order: -1; }
      .site-brand { justify-self: center; }
      .site-brand img { max-height: 48px; max-width: none; width: auto; }
      .nav-links { display: none !important; }
      .nav-right { display: none !important; }
      .nav-dropdown-menu { display: none !important; }
      .nav-search-input { width: 120px; }
      .nav-search-input:focus { width: 160px; }
      .search-dropdown { width: 90vw; max-width: 360px; right: -12px; }
    }
    @media (min-width: 769px) { .nav-mobile-drawer { display: none !important; } }`;
}

function pageCss() {
  return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0d0d0d; color: #e0ddd5; min-height: 100vh;
    }
    ${navCss()}
    /* ── Hero ── */
    .hero {
      text-align: center; padding: 80px 24px 48px;
      background: linear-gradient(180deg, #1a0000 0%, #0d0d0d 100%);
      border-bottom: 2px solid #8b0000;
    }
    .hero h1 {
      font-size: 3rem; font-weight: 900; color: #e8b923;
      text-shadow: 0 2px 8px rgba(0,0,0,0.6); margin-bottom: 12px; letter-spacing: 1px;
    }
    .hero p { color: #a09d94; font-size: 1.1rem; max-width: 640px; margin: 0 auto; }
    /* ── Content ── */
    .content { max-width: 960px; margin: 0 auto; padding: 48px 32px; }
    .section-title {
      font-size: 1.6rem; font-weight: 800; color: #e8b923;
      margin-bottom: 24px; padding-bottom: 8px; border-bottom: 2px solid #333;
    }
    .card-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 24px; margin-bottom: 48px;
    }
    .card {
      background: #1a1a1a; border: 1px solid #333; border-radius: 10px;
      padding: 24px; transition: transform 0.15s, box-shadow 0.15s;
    }
    .card:hover { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(139,0,0,0.3); }
    .card h3 { color: #e8b923; font-size: 1.1rem; margin-bottom: 8px; }
    .card p { color: #aaa; font-size: 0.9rem; line-height: 1.5; }
    .card a { color: #e8b923; text-decoration: none; font-weight: 600; }
    .card a:hover { text-decoration: underline; }
    /* ── NPC row (mirrors The Stacks book-row) ── */
    .npc-row {
      display: flex; gap: 24px; background: #1a1a1a; border: 1px solid #333;
      border-radius: 10px; padding: 20px; margin-bottom: 16px;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .npc-row:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(139,0,0,0.25); }
    .npc-portrait { flex-shrink: 0; width: 160px; height: 200px; border-radius: 8px; overflow: hidden; background: #2a2a2a; display: flex; align-items: center; justify-content: center; }
    .npc-portrait img { width: 100%; height: 100%; object-fit: cover; }
    .npc-portrait .npc-placeholder { font-size: 3rem; color: #555; }
    .npc-info { flex: 1; display: flex; flex-direction: column; }
    .npc-info h3 { color: #e8b923; font-size: 1.15rem; margin-bottom: 4px; }
    .npc-info .npc-meta { color: #888; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .npc-info .npc-details { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; margin-bottom: 8px; }
    .npc-detail-row { display: flex; gap: 8px; font-size: 0.85rem; }
    .npc-detail-label { color: #888; font-weight: 600; min-width: 70px; }
    .npc-detail-value { color: #ccc; }
    .npc-info p { color: #aaa; font-size: 0.9rem; line-height: 1.5; }
    .npc-tag { display: inline-block; font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; margin-right: 6px; }
    .npc-tag.ally { background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.3); }
    .npc-tag.enemy { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }
    .npc-tag.neutral { background: rgba(234,179,8,0.15); color: #eab308; border: 1px solid rgba(234,179,8,0.3); }
    /* ── Session log ── */
    .session-list { list-style: none; padding: 0; }
    .session-list li {
      background: #1a1a1a; border-left: 4px solid #8b0000;
      padding: 16px 20px; margin-bottom: 12px; border-radius: 0 8px 8px 0;
    }
    .session-list li strong { color: #e8b923; }
    .session-list li p { color: #aaa; margin-top: 4px; font-size: 0.9rem; }
    /* ── Timeline (history) ── */
    .timeline { position: relative; padding-left: 32px; }
    .timeline::before {
      content: ''; position: absolute; left: 12px; top: 0; bottom: 0;
      width: 3px; background: #8b0000;
    }
    .timeline-entry { position: relative; margin-bottom: 24px; padding-left: 20px; }
    .timeline-entry::before {
      content: ''; position: absolute; left: -26px; top: 6px;
      width: 12px; height: 12px; border-radius: 50%;
      background: #e8b923; border: 2px solid #8b0000;
    }
    .timeline-entry h3 { color: #e8b923; font-size: 1rem; margin-bottom: 4px; }
    .timeline-entry .timeline-date { color: #888; font-size: 0.8rem; margin-bottom: 4px; }
    .timeline-entry p { color: #aaa; font-size: 0.9rem; line-height: 1.5; }
    /* ── Artifact cards ── */
    .artifact-card {
      background: #1a1a1a; border: 1px solid #333; border-left: 4px solid #e8b923;
      border-radius: 0 10px 10px 0; padding: 20px; margin-bottom: 16px;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .artifact-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(232,185,35,0.2); }
    .artifact-card h3 { color: #e8b923; margin-bottom: 4px; }
    .artifact-card .artifact-meta { color: #888; font-size: 0.82rem; margin-bottom: 8px; }
    .artifact-card p { color: #aaa; font-size: 0.9rem; line-height: 1.5; }
    .artifact-tag { display: inline-block; font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; margin-right: 6px; background: rgba(232,185,35,0.15); color: #e8b923; border: 1px solid rgba(232,185,35,0.3); }
    /* ── Calendar Grid ── */
    .cal-month-nav {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 20px; padding: 16px 20px;
      background: #1a1a1a; border: 1px solid #333; border-radius: 10px;
    }
    .cal-month-nav h2 { color: #e8b923; font-size: 1.3rem; margin: 0; }
    .cal-month-nav a {
      color: #e8b923; text-decoration: none; font-size: 1rem;
      padding: 8px 16px; background: rgba(232,185,35,0.1);
      border: 1px solid rgba(232,185,35,0.3); border-radius: 6px;
      transition: background 0.15s;
    }
    .cal-month-nav a:hover { background: rgba(232,185,35,0.25); }
    .cal-month-info {
      background: #1a1a1a; border: 1px solid #333; border-radius: 10px;
      padding: 16px 20px; margin-bottom: 20px;
    }
    .cal-month-info .cal-weather { color: #6bb8e0; font-size: 0.85rem; margin-bottom: 4px; }
    .cal-month-info .cal-desc { color: #aaa; font-size: 0.9rem; }
    .cal-grid {
      display: grid; grid-template-columns: repeat(7, 1fr);
      gap: 3px; margin-bottom: 32px;
    }
    .cal-day {
      background: #1a1a1a; border: 1px solid #2a2a2a;
      aspect-ratio: 1 / 1; overflow: hidden;
      padding: 6px 8px; border-radius: 4px; position: relative;
      transition: border-color 0.15s;
    }
    .cal-day:hover { border-color: #444; }
    .cal-day.empty { background: #111; border-color: #1a1a1a; min-height: 0; padding: 0; }
    .cal-day.today {
      border: 2px solid #e8b923; box-shadow: 0 0 12px rgba(232,185,35,0.25);
      background: rgba(232,185,35,0.04);
    }
    .cal-day-num { font-size: 0.75rem; font-weight: 700; color: #666; margin-bottom: 4px; }
    .cal-day.today .cal-day-num { color: #e8b923; }
    .cal-event {
      display: block; background: rgba(139,0,0,0.25); border-left: 2px solid #8b0000;
      padding: 2px 6px; margin-top: 3px; font-size: 0.68rem; color: #ddd;
      border-radius: 0 3px 3px 0; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; cursor: default; transition: background 0.15s;
    }
    .cal-event:hover { background: rgba(139,0,0,0.45); }
    /* ── Map Overlay ── */
    .map-overlay {
      display: none; position: fixed; inset: 0; z-index: 50000;
      background: rgba(0,0,0,0.95); justify-content: center; align-items: center;
      flex-direction: column;
    }
    .map-overlay.active { display: flex; }
    .map-overlay-header {
      position: absolute; top: 0; left: 0; right: 0; padding: 16px 24px;
      display: flex; justify-content: space-between; align-items: center;
      background: linear-gradient(180deg, rgba(0,0,0,0.8) 0%, transparent 100%);
      z-index: 50002;
    }
    .map-overlay-title { color: #e8b923; font-size: 1.1rem; font-weight: 700; }
    .map-overlay-close {
      background: rgba(255,255,255,0.1); border: 1px solid #666; color: #fff;
      font-size: 1.2rem; cursor: pointer; padding: 6px 12px; border-radius: 6px;
      transition: background 0.15s;
    }
    .map-overlay-close:hover { background: rgba(255,255,255,0.25); }
    .map-overlay-container {
      width: 100%; height: 100%; display: flex; align-items: center;
      justify-content: center; overflow: hidden; position: relative;
    }
    .map-overlay-img {
      max-width: 90vw; max-height: 85vh; cursor: grab;
      transition: transform 0.1s ease-out; user-select: none; -webkit-user-drag: none;
    }
    .map-overlay-img.grabbing { cursor: grabbing; }
    .map-overlay-controls {
      position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 8px; z-index: 50002;
    }
    .map-overlay-controls button {
      background: rgba(255,255,255,0.1); border: 1px solid #666; color: #fff;
      padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 0.9rem;
      transition: background 0.15s;
    }
    .map-overlay-controls button:hover { background: rgba(255,255,255,0.25); }
    /* ── Admin Campaign Forms ── */
    .admin-campaign-form {
      background: #1a1a1a; border: 1px solid #333; border-radius: 10px;
      padding: 24px; margin-top: 32px;
    }
    .admin-campaign-form h3 { color: #e8b923; margin-bottom: 16px; }
    .admin-campaign-form .form-row {
      display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;
    }
    .admin-campaign-form .form-row.full { grid-template-columns: 1fr; }
    .admin-campaign-form label { color: #888; font-size: 0.8rem; font-weight: 600; display: block; margin-bottom: 4px; }
    .admin-campaign-form input, .admin-campaign-form textarea, .admin-campaign-form select {
      width: 100%; padding: 8px 12px; border: 1px solid #444; border-radius: 6px;
      background: #222; color: #e0ddd5; font-size: 0.85rem; outline: none; box-sizing: border-box;
    }
    .admin-campaign-form input:focus, .admin-campaign-form textarea:focus, .admin-campaign-form select:focus { border-color: #e8b923; }
    .admin-campaign-form textarea { resize: vertical; min-height: 60px; font-family: inherit; }
    .admin-campaign-form button[type="submit"] {
      padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer;
      font-size: 0.85rem; font-weight: 700; text-transform: uppercase;
      background: #e8b923; color: #1a1a1a; transition: background 0.15s; margin-top: 8px;
    }
    .admin-campaign-form button[type="submit"]:hover { background: #f0c83d; }
    .delete-btn-inline {
      background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3);
      color: #ef4444; padding: 2px 8px; border-radius: 4px; cursor: pointer;
      font-size: 0.7rem; font-weight: 600; transition: background 0.15s;
    }
    .delete-btn-inline:hover { background: rgba(239,68,68,0.3); }
    .edit-btn-inline {
      background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3);
      color: #3b82f6; padding: 2px 8px; border-radius: 4px; cursor: pointer;
      font-size: 0.7rem; font-weight: 600; transition: background 0.15s; margin-right: 4px;
    }
    .edit-btn-inline:hover { background: rgba(59,130,246,0.3); }
    .edit-row td { background: #111; }
    /* ── Artifact Row (NPC-style layout for list page) ── */
    .artifact-row {
      display: flex; gap: 24px; background: #1a1a1a; border: 1px solid #333;
      border-radius: 10px; padding: 20px; margin-bottom: 16px;
      transition: transform 0.15s, box-shadow 0.15s; cursor: pointer; text-decoration: none; color: inherit;
    }
    .artifact-row:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(232,185,35,0.15); }
    .artifact-row-img {
      flex-shrink: 0; width: 140px; height: 180px; border-radius: 8px;
      overflow: hidden; background: #2a2a2a; display: flex; align-items: center; justify-content: center;
    }
    .artifact-row-img img { width: 100%; height: 100%; object-fit: cover; }
    .artifact-row-img .artifact-placeholder { font-size: 3rem; color: #555; }
    .artifact-row-info { flex: 1; display: flex; flex-direction: column; }
    .artifact-row-info h3 { color: #e8b923; font-size: 1.15rem; margin-bottom: 4px; text-align: center; }
    .artifact-row-info .artifact-meta { color: #888; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; text-align: center; }
    .artifact-row-info p { color: #aaa; font-size: 0.9rem; line-height: 1.5; }
    /* ── Handout Row (fixed height with text cutoff) ── */
    .handout-row { height: 200px; overflow: hidden; }
    .handout-row .artifact-row-info { overflow: hidden; position: relative; }
    .handout-row .artifact-row-info::after {
      content: ''; position: absolute; bottom: 0; left: 0; right: 0;
      height: 40px; background: linear-gradient(transparent, #1a1a1a);
      pointer-events: none;
    }
    /* ── Artifact Detail Page ── */
    .artifact-detail { max-width: 720px; margin: 0 auto; padding: 48px 32px; }
    .artifact-detail-header { text-align: center; margin-bottom: 32px; }
    .artifact-detail-header h1 { color: #e8b923; font-size: 2rem; margin-bottom: 8px; }
    .artifact-detail-header .artifact-meta { color: #888; font-size: 0.9rem; }
    .artifact-detail-body { display: flex; gap: 32px; margin-bottom: 32px; }
    .artifact-detail-img {
      flex-shrink: 0; width: 240px; height: 300px; border-radius: 10px;
      overflow: hidden; background: #1a1a1a; border: 1px solid #333;
      display: flex; align-items: center; justify-content: center;
    }
    .artifact-detail-img img { width: 100%; height: 100%; object-fit: cover; }
    .artifact-detail-img .artifact-placeholder { font-size: 4rem; color: #555; }
    .artifact-detail-info { flex: 1; }
    .artifact-detail-info h3 { color: #e8b923; margin-bottom: 12px; }
    .artifact-detail-info p { color: #aaa; font-size: 0.95rem; line-height: 1.7; }
    .artifact-detail-lore {
      background: #1a1a1a; border: 1px solid #333; border-left: 4px solid #8b0000;
      border-radius: 0 10px 10px 0; padding: 24px; margin-top: 24px;
    }
    .artifact-detail-lore h3 { color: #e8b923; margin-bottom: 12px; }
    .artifact-detail-lore p { color: #aaa; font-size: 0.95rem; line-height: 1.7; font-style: italic; }
    /* ── Handout Detail Page (wider layout) ── */
    .handout-detail { max-width: 75%; }
    .handout-detail .artifact-detail-img {
      flex: 0 0 33.33%; width: auto; height: auto; min-height: 300px;
    }
    .handout-detail .artifact-detail-body { align-items: stretch; }
    /* ── Footer ── */
    .map-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px; margin-bottom: 48px;
    }
    .map-card {
      background: #1a1a1a; border: 1px solid #333; border-radius: 10px;
      overflow: hidden; transition: transform 0.15s, box-shadow 0.15s;
      cursor: pointer;
    }
    .map-card:hover { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(139,0,0,0.3); }
    .map-card img { width: 100%; height: 160px; object-fit: cover; }
    .map-card .map-placeholder { width: 100%; height: 160px; background: #2a2a2a; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; color: #555; }
    .map-card-body { padding: 12px 16px; }
    .map-card-body h3 { color: #e8b923; font-size: 0.95rem; margin-bottom: 4px; }
    .map-card-body p { color: #aaa; font-size: 0.82rem; }
    /* ── Art Gallery Grid ── */
    .art-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 16px; margin-bottom: 48px;
    }
    .art-card {
      background: #1a1a1a; border: 1px solid #333; border-radius: 10px;
      overflow: hidden; transition: transform 0.15s, box-shadow 0.15s;
      cursor: pointer;
    }
    .art-card:hover { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(232,185,35,0.15); }
    .art-card img { width: 100%; height: 200px; object-fit: cover; }
    .art-card-body { padding: 10px 14px; }
    .art-card-body h3 { color: #e8b923; font-size: 0.9rem; margin-bottom: 2px; }
    .art-card-body p { color: #aaa; font-size: 0.78rem; }
    /* ── Calendar ── */
    .calendar-card {
      background: #1a1a1a; border: 1px solid #333; border-radius: 10px;
      padding: 24px; margin-bottom: 16px;
    }
    .calendar-card h3 { color: #e8b923; margin-bottom: 8px; }
    .calendar-card .cal-date { color: #e8b923; font-size: 0.85rem; font-weight: 600; margin-bottom: 4px; }
    .calendar-card p { color: #aaa; font-size: 0.9rem; line-height: 1.5; }
    /* ── Auth pages ── */
    .auth-page {
      max-width: 420px; margin: 0 auto; padding: 48px 24px;
    }
    .auth-page h2 { color: #e8b923; margin-bottom: 24px; text-align: center; }
    .auth-page form { display: flex; flex-direction: column; gap: 12px; }
    .auth-page label { color: #aaa; font-weight: 600; font-size: 0.85rem; }
    .auth-page input {
      padding: 10px 12px; border: 2px solid #333; border-radius: 6px;
      background: #1a1a1a; color: #e0ddd5; font-size: 0.9rem; outline: none;
    }
    .auth-page input:focus { border-color: #e8b923; }
    .auth-btn {
      padding: 12px 20px; border: none; border-radius: 6px;
      cursor: pointer; font-size: 0.9rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.5px; transition: background 0.15s;
    }
    .auth-btn-primary { background: #e8b923; color: #1a1a1a; }
    .auth-btn-primary:hover { background: #f0c83d; }
    .auth-btn-secondary { background: #333; color: #ccc; }
    .auth-btn-secondary:hover { background: #444; }
    .auth-link { color: #e8b923; text-decoration: none; text-align: center; font-size: 0.85rem; }
    .auth-link:hover { text-decoration: underline; }
    .auth-error { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); padding: 10px 14px; border-radius: 6px; font-size: 0.85rem; margin-bottom: 12px; }
    .auth-success { background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.3); padding: 10px 14px; border-radius: 6px; font-size: 0.85rem; margin-bottom: 12px; }
    /* ── Account page ── */
    .account-section { background: #1a1a1a; border: 1px solid #333; border-radius: 10px; padding: 24px; margin-bottom: 24px; }
    .account-section h3 { color: #e8b923; margin-bottom: 16px; }
    .account-table { width: 100%; border-collapse: collapse; }
    .account-table th { text-align: left; color: #888; font-size: 0.8rem; text-transform: uppercase; padding: 8px 12px; border-bottom: 2px solid #333; }
    .account-table td { padding: 10px 12px; border-bottom: 1px solid #2a2a2a; font-size: 0.9rem; color: #ccc; }
    .account-table tr:hover { background: rgba(255,255,255,0.03); }
    .admin-btn {
      padding: 4px 10px; border: none; border-radius: 4px; cursor: pointer;
      font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
      transition: background 0.15s; margin-right: 4px;
    }
    .admin-btn-approve { background: #22c55e; color: #fff; }
    .admin-btn-approve:hover { background: #16a34a; }
    .admin-btn-promote { background: #3b82f6; color: #fff; }
    .admin-btn-promote:hover { background: #2563eb; }
    .admin-btn-demote { background: #eab308; color: #1a1a1a; }
    .admin-btn-demote:hover { background: #ca8a04; }
    .admin-btn-delete { background: #ef4444; color: #fff; }
    .admin-btn-delete:hover { background: #dc2626; }
    /* ── Footer ── */
    .site-footer {
      text-align: center; padding: 24px; color: #555;
      border-top: 1px solid #222; font-size: 0.8rem; margin-top: 48px;
    }
    .site-footer a { color: #e8b923; text-decoration: none; }
    .site-footer a:hover { text-decoration: underline; }
    /* ── Responsive ── */
    @media (max-width: 600px) {
      .hero h1 { font-size: 2rem; }
      .hero { padding: 48px 16px 32px; }
      .content { padding: 32px 16px; }
      .npc-row { flex-direction: column; align-items: center; text-align: center; }
      .npc-portrait { width: 120px; height: 150px; }
      .npc-info .npc-details { grid-template-columns: 1fr; }
    }
  `;
}

module.exports = { navCss, pageCss };
