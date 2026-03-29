// ══════════════════════════════════════════════════════════════
// ── NAV, SEARCH TYPEAHEAD, TELEPORT OVERLAY ───────────────────
// ══════════════════════════════════════════════════════════════

const { NAV_ITEMS, NAV_RIGHT_ITEMS } = require("../config");
const { esc } = require("../lib/utils");

function searchTypeaheadJs() {
  return `<script>
(function() {
  var input = document.getElementById('navSearchInput');
  var btn = document.getElementById('navSearchBtn');
  var dropdown = document.getElementById('searchDropdown');
  if (!input || !dropdown) return;
  var debounceTimer, lastQuery = '';

  function renderDropdown(data, q) {
    if (!data.results || data.results.length === 0) {
      dropdown.innerHTML = '<div class="search-dd-empty">No results for "' + q + '"</div>';
      dropdown.classList.add('active');
      return;
    }
    var items = data.results.slice(0, 8).map(function(r) {
      var href = r.href || '#';
      return '<a class="search-dd-item" href="' + href + '">' +
        '<div class="search-dd-info">' +
        '<div class="search-dd-title">' + r.title + '</div>' +
        '<div class="search-dd-cat">' + (r.category || '') + '</div>' +
        '</div></a>';
    }).join('');
    var footer = data.total > 8
      ? '<div class="search-dd-footer" id="searchDdMore">View all ' + data.total + ' results \\u2192</div>'
      : '';
    dropdown.innerHTML = items + footer;
    dropdown.classList.add('active');
    var moreBtn = document.getElementById('searchDdMore');
    if (moreBtn) {
      moreBtn.addEventListener('click', function() { window.location.href = '/search?q=' + encodeURIComponent(q); });
    }
  }

  async function fetchResults(q) {
    if (q.length < 2) { dropdown.classList.remove('active'); return; }
    try {
      var resp = await fetch('/api/search?q=' + encodeURIComponent(q));
      var data = await resp.json();
      if (q === input.value.trim()) renderDropdown(data, q);
    } catch (e) {
      dropdown.innerHTML = '<div class="search-dd-empty">Search error</div>';
      dropdown.classList.add('active');
    }
  }

  input.addEventListener('input', function() {
    var q = input.value.trim();
    if (q === lastQuery) return; lastQuery = q;
    clearTimeout(debounceTimer);
    if (q.length < 2) { dropdown.classList.remove('active'); return; }
    debounceTimer = setTimeout(function() { fetchResults(q); }, 300);
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); var q = input.value.trim(); if (q.length >= 2) window.location.href = '/search?q=' + encodeURIComponent(q); }
    if (e.key === 'Escape') dropdown.classList.remove('active');
  });
  if (btn) btn.addEventListener('click', function() { var q = input.value.trim(); if (q.length >= 2) window.location.href = '/search?q=' + encodeURIComponent(q); });
  document.addEventListener('click', function(e) { if (!e.target.closest('.nav-search')) dropdown.classList.remove('active'); });
})();
</script>`;
}

function teleportOverlayHtml() {
  return `<style>
  .teleport-overlay {
    display:none; position:fixed; inset:0; z-index:99999;
    background:rgba(0,0,0,0); justify-content:center; align-items:center;
    flex-direction:column; transition:background 0.4s;
  }
  .teleport-overlay.active { display:flex; background:rgba(0,0,0,0.92); }
  .teleport-ring {
    width:180px; height:180px; border-radius:50%; position:relative;
    background:radial-gradient(circle, rgba(123,45,255,0.15) 0%, transparent 70%);
    box-shadow:0 0 60px 15px rgba(123,45,255,0.4), 0 0 120px 40px rgba(74,0,224,0.2), inset 0 0 40px 10px rgba(123,45,255,0.3);
    animation:tp-pulse 1.8s ease-in-out infinite;
  }
  .teleport-ring::before, .teleport-ring::after {
    content:''; position:absolute; inset:8px; border-radius:50%;
    border:2px solid rgba(180,120,255,0.6);
    animation:tp-spin 3s linear infinite;
  }
  .teleport-ring::after { inset:20px; border-color:rgba(100,200,255,0.4); animation-direction:reverse; animation-duration:2.2s; }
  .teleport-runes {
    position:absolute; width:220px; height:220px; top:50%; left:50%;
    transform:translate(-50%,-50%); border-radius:50%;
    border:1px dashed rgba(200,160,255,0.3);
    animation:tp-spin 8s linear infinite reverse;
  }
  .teleport-text {
    color:#c4a0ff; font-size:1rem; margin-top:28px;
    letter-spacing:3px; text-transform:uppercase; font-weight:600;
    animation:tp-fade 1.2s ease-in-out infinite alternate;
  }
  @keyframes tp-pulse {
    0%,100% { transform:scale(1); box-shadow:0 0 60px 15px rgba(123,45,255,0.4), 0 0 120px 40px rgba(74,0,224,0.2), inset 0 0 40px 10px rgba(123,45,255,0.3); }
    50% { transform:scale(1.08); box-shadow:0 0 80px 25px rgba(123,45,255,0.6), 0 0 160px 60px rgba(74,0,224,0.35), inset 0 0 60px 15px rgba(123,45,255,0.5); }
  }
  @keyframes tp-spin { 0%{transform:translate(-50%,-50%) rotate(0deg)} 100%{transform:translate(-50%,-50%) rotate(360deg)} }
  @keyframes tp-fade { 0%{opacity:0.5} 100%{opacity:1} }
  </style>
  <div class="teleport-overlay" id="teleportOverlay">
    <div style="position:relative;display:flex;align-items:center;justify-content:center">
      <div class="teleport-runes"></div>
      <div class="teleport-ring"></div>
    </div>
    <div class="teleport-text" id="teleportText"></div>
  </div>
  <script>
  function teleportTo(url, label) {
    var o = document.getElementById('teleportOverlay');
    document.getElementById('teleportText').textContent = 'Teleporting to ' + label + '…';
    o.classList.add('active');
    setTimeout(function(){ window.location.href = url; }, 1600);
  }
  </script>`;
}

function renderNav(activePath, session) {
  // Desktop left links
  const links = NAV_ITEMS.map((item) => {
    if (item.dropdown) {
      const childActive = item.dropdown.some(c =>
        !c.external && (activePath === c.href || (c.href !== "/" && activePath.startsWith(c.href)))
      );
      const ddLinks = item.dropdown.map(c => {
        const cActive = !c.external && (activePath === c.href || (c.href !== "/" && activePath.startsWith(c.href)));
        const isCrossSite = c.external && c.href && c.href.includes("knoxrpg.com");
        const target = c.external && !isCrossSite ? ' target="_blank" rel="noopener"' : "";
        const tp = isCrossSite ? ` onclick="teleportTo('${c.href}','${esc(c.label)}');return false;"` : '';
        return `<a href="${esc(c.href)}"${cActive ? ' class="active"' : ""}${target}${tp}>${esc(c.label)}</a>`;
      }).join("");
      return `<div class="nav-dropdown"><a href="#"${childActive ? ' class="active"' : ""}>${esc(item.label)}</a><div class="nav-dropdown-menu">${ddLinks}</div></div>`;
    }
    const isActive = activePath === item.href || (item.href !== "/" && activePath.startsWith(item.href));
    return `<a href="${item.href}"${isActive ? ' class="active"' : ""}>${esc(item.label)}</a>`;
  }).join("");

  // Right-side items
  const rightItems = NAV_RIGHT_ITEMS.map((item) => {
    const isActive = !item.external && (activePath === item.href || (item.href !== "/" && activePath.startsWith(item.href)));
    const isCrossSite = item.external && item.href && item.href.includes("knoxrpg.com");
    const tp = isCrossSite ? ` onclick="teleportTo('${item.href}','${esc(item.label)}');return false;"` : '';
    return `<a href="${esc(item.href)}"${isActive ? ' class="active"' : ''}${tp}>${esc(item.label)}</a>`;
  }).join("");
  const rightLink = session
    ? `<a href="/account"${activePath === "/account" ? ' class="active"' : ""}>Account</a>`
    : `<a href="/login"${activePath === "/login" ? ' class="active"' : ""}>Login</a>`;
  const searchBar = session ? `<div class="nav-search">
        <input type="text" class="nav-search-input" id="navSearchInput" placeholder="Search campaign..." autocomplete="off" />
        <button class="nav-search-btn" id="navSearchBtn" aria-label="Search">&#128269;</button>
        <div class="search-dropdown" id="searchDropdown"></div>
      </div>` : "";

  // Mobile drawer
  const mobileLinks = NAV_ITEMS.map((item) => {
    if (item.dropdown) {
      const children = item.dropdown.map(c => {
        const cActive = !c.external && (activePath === c.href || (c.href !== "/" && activePath.startsWith(c.href)));
        const isCrossSite = c.external && c.href && c.href.includes("knoxrpg.com");
        const target = c.external && !isCrossSite ? ' target="_blank" rel="noopener"' : "";
        const tp = isCrossSite ? ` onclick="teleportTo('${c.href}','${esc(c.label)}');return false;"` : '';
        return `<a href="${esc(c.href)}" class="mobile-dropdown-child${cActive ? " active" : ""}"${target}${tp}>${esc(c.label)}</a>`;
      }).join("");
      return `<span class="mobile-dropdown-label">${esc(item.label)}</span>${children}`;
    }
    const isActive = activePath === item.href || (item.href !== "/" && activePath.startsWith(item.href));
    return `<a href="${item.href}"${isActive ? ' class="active"' : ""}>${esc(item.label)}</a>`;
  }).join("");
  const mobileRightItems = NAV_RIGHT_ITEMS.map((item) => {
    const isCrossSite = item.external && item.href && item.href.includes("knoxrpg.com");
    const tp = isCrossSite ? ` onclick="teleportTo('${item.href}','${esc(item.label)}');return false;"` : '';
    return `<a href="${esc(item.href)}"${tp}>${esc(item.label)}</a>`;
  }).join("");
  const mobileRightLink = session
    ? `<a href="/account"${activePath === "/account" ? ' class="active"' : ""}>Account</a>`
    : `<a href="/login"${activePath === "/login" ? ' class="active"' : ""}>Login</a>`;
  const mobileSearch = session ? `<div class="nav-mobile-search"><input type="text" id="navSearchInputMobile" placeholder="Search campaign..." autocomplete="off" /></div>` : "";

  return `<header class="site-header">
    <nav class="site-nav">
      <button class="nav-hamburger" id="navHamburger" aria-label="Toggle menu">&#9776;</button>
      <a href="/" class="site-brand"><img src="/siteLogo.png" alt="Halls of the Damned" /></a>
      <div class="nav-links">${links}</div>
      <div class="nav-right">${searchBar}${rightItems}${rightLink}</div>
    </nav>
    <div class="nav-mobile-drawer" id="navMobileDrawer">
      ${mobileSearch}
      ${mobileLinks}
      ${mobileRightItems}
      ${mobileRightLink}
    </div>
  </header>
  <script>
  (function() {
    var btn = document.getElementById('navHamburger');
    var drawer = document.getElementById('navMobileDrawer');
    if (btn && drawer) {
      btn.addEventListener('click', function() {
        drawer.classList.toggle('open');
        btn.innerHTML = drawer.classList.contains('open') ? '&#10005;' : '&#9776;';
      });
    }
  })();
  </script>
  ${teleportOverlayHtml()}
  ${session ? searchTypeaheadJs() : ""}`;
}

module.exports = { renderNav, teleportOverlayHtml, searchTypeaheadJs };
