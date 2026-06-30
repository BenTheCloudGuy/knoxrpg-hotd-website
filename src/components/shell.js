// ══════════════════════════════════════════════════════════════
// ── PAGE SHELL & FOOTER ───────────────────────────────────────
// ══════════════════════════════════════════════════════════════

const { MAIN_SITE } = require("../config");
const { esc } = require("../lib/utils");
const { pageCss } = require("./css");
const { renderNav } = require("./nav");

function renderFooter() {
  return `<footer class="site-footer">
    &copy; ${new Date().getFullYear()} KnoxRPG &mdash;
    <a href="${esc(MAIN_SITE)}">web.knoxrpg.com</a> |
    <a href="/">Halls of the Damned</a>
  </footer>`;
}

function pageShell(title, activePath, bodyHtml, session) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <style>${pageCss()}</style>
</head>
<body>
  ${renderNav(activePath, session)}
  ${bodyHtml}
  ${renderFooter()}
</body>
</html>`;
}

// Minimal chrome-free shell for content embedded in an iframe (e.g. the
// Sessions Workspace mounted inside the DM Command Center). Keeps the shared
// page CSS so component classes still match, but drops the site nav + footer.
function embedShell(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <style>${pageCss()}</style>
  <style>html,body{margin:0;padding:0;background:#111;min-height:100%;}</style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}

module.exports = { pageShell, embedShell, renderFooter };
