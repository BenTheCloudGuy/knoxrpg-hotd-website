// ══════════════════════════════════════════════════════════════
// ── ADMIN API TEST PAGE ───────────────────────────────────────
// ══════════════════════════════════════════════════════════════

const { esc } = require("../lib/utils");
const { navCss } = require("../components/css");
const { renderNav } = require("../components/nav");
const { renderFooter } = require("../components/shell");

function renderApiTestPage(session) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>API Test Console — Halls of the Damned</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0d0d0d; color: #e0ddd5; min-height: 100vh;
      display: flex; flex-direction: column;
    }
    ${navCss()}
    .api-console { max-width: 1400px; width: 100%; margin: 0 auto; padding: 24px 32px 48px; flex: 1; }
    .api-console h1 { color: #e8b923; font-size: 1.8rem; font-weight: 900; margin-bottom: 8px; }
    .api-console .subtitle { color: #888; font-size: 0.9rem; margin-bottom: 24px; }

    /* Tabs */
    .tab-bar { display: flex; gap: 0; margin-bottom: 24px; border-bottom: 2px solid #333; }
    .tab-btn {
      padding: 10px 24px; border: none; background: transparent; color: #888;
      font-size: 0.9rem; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent;
      margin-bottom: -2px; transition: all 0.15s; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .tab-btn:hover { color: #ccc; }
    .tab-btn.active { color: #e8b923; border-bottom-color: #e8b923; }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }

    /* Panels */
    .test-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .panel {
      background: #1a1a1a; border: 1px solid #333; border-radius: 10px; padding: 20px;
      display: flex; flex-direction: column;
    }
    .panel h3 { color: #e8b923; font-size: 0.95rem; margin-bottom: 12px; }
    .panel label { color: #aaa; font-size: 0.8rem; margin-bottom: 4px; display: block; text-transform: uppercase; letter-spacing: 0.5px; }

    /* Inputs */
    textarea, input[type="text"], select {
      width: 100%; padding: 10px 12px; border: 1px solid #333; border-radius: 6px;
      background: #111; color: #e0ddd5; font-family: 'Consolas', 'Monaco', monospace;
      font-size: 0.85rem; outline: none; transition: border-color 0.15s;
    }
    textarea:focus, input[type="text"]:focus, select:focus { border-color: #e8b923; }
    textarea { resize: vertical; min-height: 100px; }

    .input-row { display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-end; }
    .input-row .field { flex: 1; }
    .input-row .field-sm { width: 120px; flex-shrink: 0; }

    /* Buttons */
    .btn {
      padding: 10px 20px; border: none; font-size: 0.85rem; font-weight: 700;
      cursor: pointer; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px;
      transition: background 0.15s;
    }
    .btn-primary { background: #e8b923; color: #1a1a1a; }
    .btn-primary:hover { background: #f0c83d; }
    .btn-primary:disabled { background: #555; color: #888; cursor: not-allowed; }
    .btn-secondary { background: #333; color: #ccc; }
    .btn-secondary:hover { background: #444; }
    .btn-row { display: flex; gap: 8px; margin-top: 12px; }

    /* Response output */
    .response-area {
      flex: 1; min-height: 300px; max-height: 600px; overflow-y: auto;
      background: #111; border: 1px solid #333; border-radius: 6px; padding: 16px;
      font-family: 'Consolas', 'Monaco', monospace; font-size: 0.82rem;
      line-height: 1.5; white-space: pre-wrap; word-break: break-word;
    }
    .response-area .meta { color: #888; margin-bottom: 8px; border-bottom: 1px solid #222; padding-bottom: 8px; }
    .response-area .meta span { color: #e8b923; }
    .response-area .error { color: #ef4444; }
    .response-area .success { color: #22c55e; }

    /* Rendered markdown preview */
    .md-preview {
      flex: 1; min-height: 200px; max-height: 400px; overflow-y: auto;
      background: #1e1e1e; border: 1px solid #333; border-radius: 6px; padding: 16px;
      font-size: 0.9rem; line-height: 1.6;
    }
    .md-preview table { border-collapse: collapse; margin: 8px 0; }
    .md-preview th, .md-preview td { border: 1px solid #444; padding: 6px 10px; text-align: left; }
    .md-preview th { background: #2a2a2a; color: #e8b923; }
    .md-preview img { max-width: 200px; border-radius: 6px; margin: 8px 0; }
    .md-preview a { color: #e8b923; }
    .md-preview strong { color: #e8b923; }
    .md-preview code { background: rgba(255,255,255,0.07); padding: 1px 4px; border-radius: 3px; font-size: 0.85em; }
    .md-preview pre { background: #111; padding: 12px; border-radius: 6px; overflow-x: auto; }
    .md-preview h1, .md-preview h2, .md-preview h3 { color: #e8b923; margin: 12px 0 8px; }
    .md-preview p { margin-bottom: 8px; }
    .md-preview ul, .md-preview ol { margin: 4px 0 8px 20px; }

    /* Debug context collapsible */
    .debug-toggle {
      background: #222; border: 1px solid #333; border-radius: 6px;
      padding: 8px 12px; color: #888; cursor: pointer; font-size: 0.8rem;
      margin-top: 12px; display: flex; justify-content: space-between; align-items: center;
    }
    .debug-toggle:hover { border-color: #555; }
    .debug-content {
      display: none; background: #111; border: 1px solid #333; border-top: none;
      border-radius: 0 0 6px 6px; padding: 12px; max-height: 300px; overflow-y: auto;
      font-family: 'Consolas', 'Monaco', monospace; font-size: 0.78rem;
      white-space: pre-wrap; word-break: break-word; color: #888;
    }
    .debug-content.open { display: block; }

    .status-badge {
      display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;
      font-weight: 600; text-transform: uppercase;
    }
    .status-badge.ok { background: #14532d; color: #22c55e; }
    .status-badge.err { background: #450a0a; color: #ef4444; }
    .status-badge.pending { background: #422006; color: #f59e0b; }

    .site-footer { text-align: center; padding: 24px; color: #555; border-top: 1px solid #222; font-size: 0.8rem; }
    .site-footer a { color: #e8b923; text-decoration: none; }
    .site-footer a:hover { text-decoration: underline; }

    @media (max-width: 900px) {
      .test-grid { grid-template-columns: 1fr; }
      .api-console { padding: 16px; }
    }
  </style>
</head>
<body>
  ${renderNav("", session)}
  <div class="api-console">
    <h1>&#9881; API Test Console</h1>
    <p class="subtitle">Admin-only testing interface for DM AI Chat and Campaign Search APIs. Responses include debug metadata.</p>

    <div class="tab-bar">
      <button class="tab-btn active" data-tab="chat">DM AI Chat</button>
      <button class="tab-btn" data-tab="search">Search</button>
      <button class="tab-btn" data-tab="image">Image Gen (DALL-E)</button>
    </div>

    <!-- ═══════════════════════════════════════════════════════ -->
    <!-- DM AI CHAT TAB                                          -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <div class="tab-panel active" id="tab-chat">
      <div class="test-grid">
        <div class="panel">
          <h3>&#9997; Request</h3>
          <label>User Message</label>
          <textarea id="chatInput" rows="4" placeholder="Ask the DM AI anything...">Tell me about Ireena Kolyana</textarea>

          <div class="input-row" style="margin-top:12px;">
            <div class="field">
              <label>Model</label>
              <input type="text" id="chatModel" value="" placeholder="(default from server)">
            </div>
            <div class="field-sm">
              <label>Max Tokens</label>
              <input type="text" id="chatMaxTokens" value="2048">
            </div>
            <div class="field-sm">
              <label>Temperature</label>
              <input type="text" id="chatTemp" value="0.7">
            </div>
          </div>

          <div class="input-row">
            <div class="field">
              <label>Chat History (JSON array, optional)</label>
              <textarea id="chatHistory" rows="3" placeholder='[{"role":"user","content":"Previous message"},{"role":"assistant","content":"Previous reply"}]'></textarea>
            </div>
          </div>

          <div class="btn-row">
            <button class="btn btn-primary" id="chatSendBtn">Send Request</button>
            <button class="btn btn-secondary" id="chatClearBtn">Clear</button>
          </div>
        </div>

        <div class="panel">
          <h3>&#128229; Response</h3>
          <div style="display:flex;gap:8px;margin-bottom:12px;">
            <span class="status-badge pending" id="chatStatus">idle</span>
            <span id="chatTiming" style="color:#888;font-size:0.8rem;"></span>
          </div>

          <label>Rendered Output</label>
          <div class="md-preview" id="chatRendered"><span style="color:#555;">Response will appear here...</span></div>

          <label style="margin-top:12px;">Raw JSON</label>
          <div class="response-area" id="chatRaw" style="min-height:150px;max-height:250px;"><span style="color:#555;">Raw API response...</span></div>

          <div class="debug-toggle" id="chatDebugToggle">
            &#128270; Debug: System Prompt &amp; Context <span>&#9660;</span>
          </div>
          <div class="debug-content" id="chatDebugContent"></div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════ -->
    <!-- SEARCH TAB                                              -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <div class="tab-panel" id="tab-search">
      <div class="test-grid">
        <div class="panel">
          <h3>&#128269; Request</h3>
          <label>Search Query</label>
          <input type="text" id="searchInput" placeholder="Search campaign content..." value="Ireena">

          <div class="input-row" style="margin-top:12px;">
            <div class="field-sm">
              <label>Limit</label>
              <input type="text" id="searchLimit" value="20">
            </div>
            <div class="field">
              <label>Source</label>
              <select id="searchSource">
                <option value="all">All (Local + DB + RAG)</option>
                <option value="db">Database Only</option>
                <option value="local">Local Index Only</option>
              </select>
            </div>
          </div>

          <div class="btn-row">
            <button class="btn btn-primary" id="searchSendBtn">Search</button>
            <button class="btn btn-secondary" id="searchClearBtn">Clear</button>
          </div>
        </div>

        <div class="panel">
          <h3>&#128229; Response</h3>
          <div style="display:flex;gap:8px;margin-bottom:12px;">
            <span class="status-badge pending" id="searchStatus">idle</span>
            <span id="searchTiming" style="color:#888;font-size:0.8rem;"></span>
          </div>

          <label>Results</label>
          <div class="response-area" id="searchResults" style="min-height:200px;"><span style="color:#555;">Search results will appear here...</span></div>

          <label style="margin-top:12px;">Raw JSON</label>
          <div class="response-area" id="searchRaw" style="min-height:100px;max-height:200px;"><span style="color:#555;">Raw API response...</span></div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════ -->
    <!-- IMAGE GEN TAB                                           -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <div class="tab-panel" id="tab-image">
      <div class="test-grid">
        <div class="panel">
          <h3>&#127912; DALL-E 3 Request</h3>
          <label>Image Prompt</label>
          <textarea id="imagePrompt" rows="4" placeholder="Describe the image to generate...">A dark medieval castle perched on a cliff above misty forests, gothic architecture, dramatic lightning, D&amp;D fantasy art style</textarea>

          <div class="input-row" style="margin-top:12px;">
            <div class="field">
              <label>Size</label>
              <select id="imageSize">
                <option value="1024x1024" selected>1024x1024 (Square)</option>
                <option value="1792x1024">1792x1024 (Landscape)</option>
                <option value="1024x1792">1024x1792 (Portrait)</option>
              </select>
            </div>
            <div class="field">
              <label>Quality</label>
              <select id="imageQuality">
                <option value="standard" selected>Standard</option>
                <option value="hd">HD</option>
              </select>
            </div>
            <div class="field">
              <label>Style</label>
              <select id="imageStyle">
                <option value="vivid" selected>Vivid</option>
                <option value="natural">Natural</option>
              </select>
            </div>
          </div>

          <div class="btn-row">
            <button class="btn btn-primary" id="imageSendBtn">Generate Image</button>
            <button class="btn btn-secondary" id="imageClearBtn">Clear</button>
          </div>
        </div>

        <div class="panel">
          <h3>&#128229; Response</h3>
          <div style="display:flex;gap:8px;margin-bottom:12px;">
            <span class="status-badge pending" id="imageStatus">idle</span>
            <span id="imageTiming" style="color:#888;font-size:0.8rem;"></span>
          </div>

          <label>Generated Image</label>
          <div id="imagePreview" style="min-height:200px;background:#111;border:1px solid #333;border-radius:6px;padding:16px;display:flex;align-items:center;justify-content:center;">
            <span style="color:#555;">Image will appear here...</span>
          </div>

          <label style="margin-top:12px;">Revised Prompt</label>
          <div class="response-area" id="imageRevised" style="min-height:60px;max-height:150px;"><span style="color:#555;">DALL-E's revised prompt...</span></div>

          <label style="margin-top:12px;">Raw JSON</label>
          <div class="response-area" id="imageRaw" style="min-height:60px;max-height:150px;"><span style="color:#555;">Raw API response...</span></div>
        </div>
      </div>
    </div>
  </div>

  ${renderFooter()}

  <script>
  (function() {
    // ── Tab switching ──────────────────────────────────────────
    document.querySelectorAll('.tab-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
        document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      });
    });

    // ── Debug toggle ───────────────────────────────────────────
    document.getElementById('chatDebugToggle').addEventListener('click', function() {
      document.getElementById('chatDebugContent').classList.toggle('open');
    });

    // ── Helper: set status badge ───────────────────────────────
    function setStatus(el, state, text) {
      el.className = 'status-badge ' + (state === 'ok' ? 'ok' : state === 'err' ? 'err' : 'pending');
      el.textContent = text || state;
    }

    // ── Helper: escape HTML ────────────────────────────────────
    function escH(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    // ── Helper: basic markdown to HTML ─────────────────────────
    function renderMd(text) {
      var html = escH(text);
      // Images
      html = html.replace(/!\\[([^\\]]*)\\]\\(([^)]+)\\)/g, '<img src="$2" alt="$1" style="max-width:200px;border-radius:6px;">');
      // Links
      html = html.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank">$1</a>');
      // Bold
      html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
      // Italic
      html = html.replace(/\\*(.+?)\\*/g, '<em>$1</em>');
      // Inline code
      html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
      // Headings
      html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
      html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
      html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
      // Tables
      html = html.replace(/((?:^\\|.+\\|\\n?)+)/gm, function(block) {
        var rows = block.trim().split('\\n').filter(function(r) { return r.trim(); });
        if (rows.length < 2) return block;
        var tableHtml = '<table>';
        rows.forEach(function(row, i) {
          if (row.match(/^\\|[\\s-|:]+\\|$/)) return; // skip separator
          var cells = row.split('|').filter(function(c, idx, arr) { return idx > 0 && idx < arr.length - 1; });
          var tag = i === 0 ? 'th' : 'td';
          tableHtml += '<tr>' + cells.map(function(c) { return '<' + tag + '>' + c.trim() + '</' + tag + '>'; }).join('') + '</tr>';
        });
        tableHtml += '</table>';
        return tableHtml;
      });
      // Line breaks → paragraphs
      html = html.split(/\\n\\n+/).map(function(p) {
        p = p.trim();
        if (!p || p.startsWith('<h') || p.startsWith('<table') || p.startsWith('<img')) return p;
        return '<p>' + p.replace(/\\n/g, '<br>') + '</p>';
      }).join('\\n');
      return html;
    }

    // ══════════════════════════════════════════════════════════
    // ── CHAT ─────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════
    var chatSendBtn = document.getElementById('chatSendBtn');
    var chatClearBtn = document.getElementById('chatClearBtn');

    chatSendBtn.addEventListener('click', async function() {
      var msg = document.getElementById('chatInput').value.trim();
      if (!msg) return;
      chatSendBtn.disabled = true;
      setStatus(document.getElementById('chatStatus'), 'pending', 'sending...');
      document.getElementById('chatRendered').innerHTML = '<span style="color:#888;">Loading...</span>';
      document.getElementById('chatRaw').textContent = '';
      document.getElementById('chatDebugContent').textContent = '';
      document.getElementById('chatTiming').textContent = '';

      var historyRaw = document.getElementById('chatHistory').value.trim();
      var history = [];
      if (historyRaw) { try { history = JSON.parse(historyRaw); } catch(e) { history = []; } }
      history.push({ role: 'user', content: msg });

      var params = {};
      var model = document.getElementById('chatModel').value.trim();
      var maxTokens = parseInt(document.getElementById('chatMaxTokens').value, 10);
      var temp = parseFloat(document.getElementById('chatTemp').value);
      if (model) params.model = model;
      if (!isNaN(maxTokens)) params.max_tokens = maxTokens;
      if (!isNaN(temp)) params.temperature = temp;

      var t0 = performance.now();
      try {
        var res = await fetch('/api/admin/test-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history, params: params })
        });
        var elapsed = ((performance.now() - t0) / 1000).toFixed(2);
        document.getElementById('chatTiming').textContent = elapsed + 's | ' + res.status;
        var data = await res.json();

        if (data.error) {
          setStatus(document.getElementById('chatStatus'), 'err', res.status + ' error');
          document.getElementById('chatRendered').innerHTML = '<span class="error">' + escH(data.error) + '</span>';
        } else {
          setStatus(document.getElementById('chatStatus'), 'ok', res.status + ' ok');
          document.getElementById('chatRendered').innerHTML = renderMd(data.reply || '');
        }
        document.getElementById('chatRaw').textContent = JSON.stringify(data, null, 2);
        if (data._debug) {
          document.getElementById('chatDebugContent').textContent = JSON.stringify(data._debug, null, 2);
        }
      } catch(err) {
        setStatus(document.getElementById('chatStatus'), 'err', 'network error');
        document.getElementById('chatRendered').innerHTML = '<span class="error">' + escH(err.message) + '</span>';
      }
      chatSendBtn.disabled = false;
    });

    chatClearBtn.addEventListener('click', function() {
      document.getElementById('chatInput').value = '';
      document.getElementById('chatHistory').value = '';
      document.getElementById('chatRendered').innerHTML = '<span style="color:#555;">Response will appear here...</span>';
      document.getElementById('chatRaw').textContent = '';
      document.getElementById('chatDebugContent').textContent = '';
      setStatus(document.getElementById('chatStatus'), 'pending', 'idle');
      document.getElementById('chatTiming').textContent = '';
    });

    // ══════════════════════════════════════════════════════════
    // ── SEARCH ───────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════
    var searchSendBtn = document.getElementById('searchSendBtn');
    var searchClearBtn = document.getElementById('searchClearBtn');

    searchSendBtn.addEventListener('click', async function() {
      var q = document.getElementById('searchInput').value.trim();
      if (!q) return;
      searchSendBtn.disabled = true;
      setStatus(document.getElementById('searchStatus'), 'pending', 'searching...');
      document.getElementById('searchResults').innerHTML = '<span style="color:#888;">Searching...</span>';
      document.getElementById('searchRaw').textContent = '';
      document.getElementById('searchTiming').textContent = '';

      var limit = parseInt(document.getElementById('searchLimit').value, 10) || 20;
      var source = document.getElementById('searchSource').value;

      var t0 = performance.now();
      try {
        var res = await fetch('/api/admin/test-search?q=' + encodeURIComponent(q) + '&limit=' + limit + '&source=' + source);
        var elapsed = ((performance.now() - t0) / 1000).toFixed(2);
        document.getElementById('searchTiming').textContent = elapsed + 's | ' + res.status;
        var data = await res.json();

        if (data.error) {
          setStatus(document.getElementById('searchStatus'), 'err', res.status + ' error');
          document.getElementById('searchResults').innerHTML = '<span class="error">' + escH(data.error) + '</span>';
        } else {
          setStatus(document.getElementById('searchStatus'), 'ok', data.total + ' results');
          if (!data.results || data.results.length === 0) {
            document.getElementById('searchResults').innerHTML = '<span style="color:#888;">No results found.</span>';
          } else {
            var html = data.results.map(function(r, i) {
              return '<div style="padding:8px 0;border-bottom:1px solid #222;">' +
                '<div style="display:flex;gap:8px;align-items:baseline;">' +
                  '<span style="color:#555;font-size:0.75rem;width:20px;">' + (i+1) + '</span>' +
                  '<a href="' + escH(r.href || '#') + '" style="color:#e8b923;font-weight:600;text-decoration:none;">' + escH(r.title) + '</a>' +
                  '<span style="color:#555;font-size:0.75rem;">[' + escH(r.category || '?') + ']</span>' +
                  '<span style="color:#444;font-size:0.75rem;">score:' + (r.score || 0) + '</span>' +
                '</div>' +
                (r.body ? '<div style="color:#888;font-size:0.82rem;margin-left:28px;margin-top:2px;">' + escH(r.body).substring(0, 200) + '</div>' : '') +
              '</div>';
            }).join('');
            document.getElementById('searchResults').innerHTML = html;
          }
        }
        document.getElementById('searchRaw').textContent = JSON.stringify(data, null, 2);
      } catch(err) {
        setStatus(document.getElementById('searchStatus'), 'err', 'network error');
        document.getElementById('searchResults').innerHTML = '<span class="error">' + escH(err.message) + '</span>';
      }
      searchSendBtn.disabled = false;
    });

    searchClearBtn.addEventListener('click', function() {
      document.getElementById('searchInput').value = '';
      document.getElementById('searchResults').innerHTML = '<span style="color:#555;">Search results will appear here...</span>';
      document.getElementById('searchRaw').textContent = '';
      setStatus(document.getElementById('searchStatus'), 'pending', 'idle');
      document.getElementById('searchTiming').textContent = '';
    });

    // ══════════════════════════════════════════════════════════
    // ── IMAGE GEN ────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════
    var imageSendBtn = document.getElementById('imageSendBtn');
    var imageClearBtn = document.getElementById('imageClearBtn');

    imageSendBtn.addEventListener('click', async function() {
      var prompt = document.getElementById('imagePrompt').value.trim();
      if (!prompt) return;
      imageSendBtn.disabled = true;
      setStatus(document.getElementById('imageStatus'), 'pending', 'generating...');
      document.getElementById('imagePreview').innerHTML = '<span style="color:#888;">Generating image... this may take 10-30 seconds.</span>';
      document.getElementById('imageRevised').textContent = '';
      document.getElementById('imageRaw').textContent = '';
      document.getElementById('imageTiming').textContent = '';

      var t0 = performance.now();
      try {
        var res = await fetch('/api/admin/test-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: prompt,
            size: document.getElementById('imageSize').value,
            quality: document.getElementById('imageQuality').value,
            style: document.getElementById('imageStyle').value
          })
        });
        var elapsed = ((performance.now() - t0) / 1000).toFixed(2);
        document.getElementById('imageTiming').textContent = elapsed + 's | ' + res.status;
        var data = await res.json();

        if (data.error) {
          setStatus(document.getElementById('imageStatus'), 'err', res.status + ' error');
          document.getElementById('imagePreview').innerHTML = '<span class="error">' + escH(data.error) + '</span>';
        } else {
          setStatus(document.getElementById('imageStatus'), 'ok', res.status + ' ok');
          if (data.image_b64) {
            document.getElementById('imagePreview').innerHTML = '<img src="data:image/png;base64,' + data.image_b64.substring(0, 100) + '..." style="max-width:100%;border-radius:8px;" />';
            // Full image
            document.getElementById('imagePreview').innerHTML = '<img src="data:image/png;base64,' + data.image_b64 + '" style="max-width:100%;border-radius:8px;" />';
          } else if (data.image_url) {
            document.getElementById('imagePreview').innerHTML = '<img src="' + escH(data.image_url) + '" style="max-width:100%;border-radius:8px;" />';
          }
          if (data.revised_prompt) {
            document.getElementById('imageRevised').textContent = data.revised_prompt;
          }
        }
        // Don't include b64 in raw output (too large)
        var rawDisplay = Object.assign({}, data);
        if (rawDisplay.image_b64) rawDisplay.image_b64 = '(base64 data, ' + rawDisplay.image_b64.length + ' chars)';
        document.getElementById('imageRaw').textContent = JSON.stringify(rawDisplay, null, 2);
      } catch(err) {
        setStatus(document.getElementById('imageStatus'), 'err', 'network error');
        document.getElementById('imagePreview').innerHTML = '<span class="error">' + escH(err.message) + '</span>';
      }
      imageSendBtn.disabled = false;
    });

    imageClearBtn.addEventListener('click', function() {
      document.getElementById('imagePrompt').value = '';
      document.getElementById('imagePreview').innerHTML = '<span style="color:#555;">Image will appear here...</span>';
      document.getElementById('imageRevised').textContent = '';
      document.getElementById('imageRaw').textContent = '';
      setStatus(document.getElementById('imageStatus'), 'pending', 'idle');
      document.getElementById('imageTiming').textContent = '';
    });

    // ── Keyboard shortcuts ─────────────────────────────────────
    document.getElementById('chatInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); chatSendBtn.click(); }
    });
    document.getElementById('searchInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); searchSendBtn.click(); }
    });
    document.getElementById('imagePrompt').addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); imageSendBtn.click(); }
    });
  })();
  </script>
</body>
</html>`;
}

module.exports = { renderApiTestPage };
