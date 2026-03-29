// ══════════════════════════════════════════════════════════════
// ── SPECIAL / STANDALONE PAGES ────────────────────────────────
// ══════════════════════════════════════════════════════════════

const { esc } = require("../lib/utils");
const { navCss } = require("../components/css");
const { renderNav } = require("../components/nav");
const { pageShell, renderFooter } = require("../components/shell");

// ── DM AI — STANDALONE (does NOT use pageShell) ──────────────
function renderDungeonMasterPage(session) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DM AI — Halls of the Damned</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0d0d0d; color: #e0ddd5; min-height: 100vh;
      display: flex; flex-direction: column;
    }
    ${navCss()}
    .dm-hero {
      max-width: 900px; margin: 0 auto; padding: 48px 32px 24px; text-align: center;
    }
    .dm-hero h1 { font-size: 2.2rem; font-weight: 900; color: #e8b923; margin-bottom: 8px; }
    .dm-hero p { color: #a09d94; font-size: 1.05rem; line-height: 1.5; margin-bottom: 32px; }
    .chat-container {
      max-width: 800px; width: 100%; margin: 0 auto; padding: 0 32px 48px;
      flex: 1; display: flex; flex-direction: column;
    }
    .chat-messages {
      flex: 1; min-height: 320px; max-height: 520px; overflow-y: auto;
      background: #1a1a1a; border: 2px solid #333; border-radius: 12px 12px 0 0;
      padding: 20px; display: flex; flex-direction: column; gap: 16px;
    }
    .chat-msg { display: flex; gap: 10px; max-width: 85%; }
    .chat-msg.user { align-self: flex-end; flex-direction: row-reverse; }
    .chat-msg.assistant { align-self: flex-start; }
    .chat-avatar {
      width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 0.8rem; color: #fff;
    }
    .chat-msg.user .chat-avatar { background: #3b82f6; }
    .chat-msg.assistant .chat-avatar { background: #8b0000; }
    .chat-bubble {
      padding: 10px 14px; border-radius: 12px; font-size: 0.9rem; line-height: 1.5;
    }
    .chat-msg.user .chat-bubble { background: #1e3a5f; color: #dbeafe; border-bottom-right-radius: 4px; }
    .chat-msg.assistant .chat-bubble { background: #2a2a2a; color: #e0ddd5; border-bottom-left-radius: 4px; }
    .chat-bubble p { margin-bottom: 8px; }
    .chat-bubble p:last-child { margin-bottom: 0; }
    .chat-bubble code { background: rgba(255,255,255,0.07); padding: 1px 4px; border-radius: 3px; font-size: 0.85em; }
    .chat-bubble strong { font-weight: 700; }
    .chat-bubble ul, .chat-bubble ol { margin: 4px 0 4px 20px; }
    .typing-indicator { color: #888; font-style: italic; font-size: 0.85rem; padding: 4px 0; }
    .chat-input-row {
      display: flex; gap: 0; background: #1a1a1a;
      border: 2px solid #333; border-top: none; border-radius: 0 0 12px 12px;
    }
    .chat-input {
      flex: 1; padding: 14px 16px; border: none; font-size: 0.95rem;
      outline: none; background: transparent; border-radius: 0 0 0 12px;
      font-family: inherit; color: #e0ddd5;
    }
    .chat-input::placeholder { color: #666; }
    .chat-send {
      padding: 14px 20px; border: none; background: #e8b923; color: #1a1a1a;
      font-size: 0.9rem; font-weight: 700; cursor: pointer;
      border-radius: 0 0 12px 0; transition: background 0.15s;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .chat-send:hover { background: #f0c83d; }
    .chat-send:disabled { background: #555; color: #888; cursor: not-allowed; }
    .chat-disclaimer {
      max-width: 800px; margin: 0 auto; padding: 8px 32px 32px;
      font-size: 0.75rem; color: #555; text-align: center;
    }
    .site-footer { text-align: center; padding: 24px; color: #555; border-top: 1px solid #222; font-size: 0.8rem; }
    .site-footer a { color: #e8b923; text-decoration: none; }
    .site-footer a:hover { text-decoration: underline; }
    @media (max-width: 600px) {
      .dm-hero { padding: 24px 16px 16px; }
      .chat-container { padding: 0 16px 32px; }
      .chat-messages { min-height: 240px; max-height: 400px; }
    }
  </style>
</head>
<body>
  ${renderNav("/dungeon-master", session)}
  <div class="dm-hero">
    <h1>DM AI</h1>
    <p>Your D&amp;D companion grounded in <strong>Halls of the Damned</strong> campaign data.
       Ask about your party, NPCs, session events, artifacts, and D&amp;D rules.</p>
  </div>
  <div class="chat-container">
    <div class="chat-messages" id="chatMessages">
      <div class="chat-msg assistant">
        <div class="chat-avatar">DM</div>
        <div class="chat-bubble"><p>Welcome, adventurer! I am your DM AI, grounded in the <strong>Halls of the Damned</strong> campaign. Ask me about your party, NPCs, past sessions, artifacts, handouts, or general D&amp;D 5e rules. What would you like to know?</p></div>
      </div>
    </div>
    <div class="chat-input-row">
      <input type="text" class="chat-input" id="chatInput" placeholder="Ask the DM AI..." autocomplete="off">
      <button class="chat-send" id="chatSend">Send</button>
    </div>
  </div>
  <div class="chat-disclaimer">AI responses are generated and may contain errors. Always verify rules with official source books.</div>
  ${renderFooter()}
  <script>
  (function() {
    var msgs = document.getElementById('chatMessages');
    var input = document.getElementById('chatInput');
    var sendBtn = document.getElementById('chatSend');
    var history = [];

    function addMessage(role, text) {
      var div = document.createElement('div');
      div.className = 'chat-msg ' + role;
      var avatar = role === 'user' ? 'You' : 'DM';
      var html = text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
        .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
        .replace(/\\n/g, '<br>');
      var paragraphs = html.split(/<br>\\s*<br>/).map(function(p) { return '<p>' + p + '</p>'; }).join('');
      div.innerHTML = '<div class="chat-avatar">' + avatar + '</div><div class="chat-bubble">' + paragraphs + '</div>';
      msgs.appendChild(div); msgs.scrollTop = msgs.scrollHeight;
    }

    function showTyping() {
      var div = document.createElement('div');
      div.className = 'typing-indicator'; div.id = 'typingIndicator';
      div.textContent = 'The DM AI is thinking...';
      msgs.appendChild(div); msgs.scrollTop = msgs.scrollHeight;
    }

    function removeTyping() { var el = document.getElementById('typingIndicator'); if (el) el.remove(); }

    async function sendMessage() {
      var text = input.value.trim(); if (!text) return;
      input.value = ''; sendBtn.disabled = true;
      addMessage('user', text); history.push({ role: 'user', content: text });
      showTyping();
      try {
        var res = await fetch('/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history.slice(-10) })
        });
        var data = await res.json(); removeTyping();
        if (data.error) { addMessage('assistant', 'Sorry, I encountered an error: ' + data.error); }
        else { addMessage('assistant', data.reply); history.push({ role: 'assistant', content: data.reply }); }
      } catch (err) { removeTyping(); addMessage('assistant', 'Sorry, I could not reach the server. Please try again.'); }
      sendBtn.disabled = false; input.focus();
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    input.focus();
  })();
  </script>
</body>
</html>`;
}

// ── Search — STANDALONE (does NOT use pageShell) ─────────────
function renderSearchPage(session, query) {
  const q = esc(query || "");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Search${q ? " — " + q : ""} | Halls of the Damned</title>
  <style>
    ${navCss()}
    body { margin: 0; background: #0d0d0d; color: #e0ddd5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .search-page { max-width: 960px; margin: 0 auto; padding: 32px 24px 64px; }
    .search-header { margin-bottom: 28px; }
    .search-header h1 { color: #e8b923; font-size: 1.8rem; font-weight: 900; margin-bottom: 12px; }
    .search-bar { display: flex; gap: 0; margin-bottom: 24px; }
    .search-bar input {
      flex: 1; padding: 12px 16px; border: 2px solid #333; border-radius: 8px 0 0 8px;
      font-size: 1rem; background: #1a1a1a; color: #e0ddd5; outline: none;
    }
    .search-bar input:focus { border-color: #e8b923; }
    .search-bar button {
      padding: 12px 20px; border: 2px solid #e8b923; border-left: none;
      background: #e8b923; color: #1a1a1a; font-weight: 700; cursor: pointer;
      border-radius: 0 8px 8px 0; font-size: 0.9rem; text-transform: uppercase;
    }
    .search-bar button:hover { background: #f0c83d; }
    .search-results { list-style: none; padding: 0; }
    .search-results li {
      background: #1a1a1a; border: 1px solid #333; border-radius: 8px;
      padding: 16px 20px; margin-bottom: 10px; transition: border-color 0.15s;
    }
    .search-results li:hover { border-color: #e8b923; }
    .search-results a { color: #e8b923; text-decoration: none; font-weight: 600; font-size: 1rem; }
    .search-results a:hover { text-decoration: underline; }
    .search-results .sr-cat { color: #888; font-size: 0.78rem; text-transform: uppercase; margin-top: 2px; }
    .search-results .sr-body { color: #aaa; font-size: 0.88rem; margin-top: 4px; }
    .search-empty { color: #888; text-align: center; padding: 48px 24px; }
    .site-footer { text-align: center; padding: 24px; color: #555; border-top: 1px solid #222; font-size: 0.8rem; }
    .site-footer a { color: #e8b923; text-decoration: none; }
  </style>
</head>
<body>
  ${renderNav("/search", session)}
  <div class="search-page">
    <div class="search-header"><h1>Search</h1></div>
    <div class="search-bar">
      <input type="text" id="searchInput" value="${q}" placeholder="Search campaign content..." autocomplete="off">
      <button id="searchBtn">Search</button>
    </div>
    <div id="aiSummary"></div>
    <ul class="search-results" id="searchResults"></ul>
    <div class="search-empty" id="searchEmpty" style="display:none;">No results found.</div>
  </div>
  ${renderFooter()}
  <script>
  (function() {
    var input = document.getElementById('searchInput');
    var btn = document.getElementById('searchBtn');
    var resultsList = document.getElementById('searchResults');
    var emptyMsg = document.getElementById('searchEmpty');

    async function doSearch(q) {
      if (!q || q.length < 2) return;
      resultsList.innerHTML = '<li style="color:#888;">Searching...</li>';
      emptyMsg.style.display = 'none';
      try {
        var resp = await fetch('/api/search?q=' + encodeURIComponent(q));
        var data = await resp.json();
        if (!data.results || data.results.length === 0) {
          resultsList.innerHTML = ''; emptyMsg.style.display = 'block'; return;
        }
        emptyMsg.style.display = 'none';
        resultsList.innerHTML = data.results.map(function(r) {
          return '<li><a href="' + (r.href || '#') + '">' + (r.title || 'Untitled') + '</a>' +
            '<div class="sr-cat">' + (r.category || '') + '</div>' +
            (r.body ? '<div class="sr-body">' + r.body.substring(0, 200) + '...</div>' : '') + '</li>';
        }).join('');
      } catch(e) { resultsList.innerHTML = '<li style="color:#ef4444;">Search failed.</li>'; }
    }

    btn.addEventListener('click', function() { doSearch(input.value.trim()); });
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') doSearch(input.value.trim()); });
    var initQ = new URLSearchParams(window.location.search).get('q');
    if (initQ) { input.value = initQ; doSearch(initQ); }
  })();
  </script>
</body>
</html>`;
}

// ── 404 page ──────────────────────────────────────────────────
function render404Page() {
  const body = `
  <div class="content" style="text-align:center;padding-top:80px;">
    <h1 style="color:#e8b923;font-size:4rem;">404</h1>
    <p>The path you seek does not exist in these halls.</p>
    <p style="margin-top:16px;"><a href="/" style="color:#e8b923;">Return Home</a></p>
  </div>`;
  return pageShell("404 — Halls of the Damned", "", body);
}

module.exports = {
  renderDungeonMasterPage,
  renderSearchPage,
  render404Page,
};
