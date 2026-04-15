// ══════════════════════════════════════════════════════════════
// ── DM MANAGEMENT INTERFACE ───────────────────────────────────
// Single-page admin dashboard with tabbed sections for managing
// the entire campaign site, AI, and data.
// ══════════════════════════════════════════════════════════════

const { pgPool } = require("../db/pool");
const { esc } = require("../lib/utils");
const { pageShell } = require("../components/shell");

async function renderDmAdminPage(session) {
  if (!session || session.role !== "admin") return null;

  const body = `
  <div class="content dm-admin">
    <h2 class="section-title">&#9881; DM Management Interface</h2>

    <!-- ═══ TAB BAR ═══ -->
    <div class="dm-tabs">
      <button class="dm-tab active" onclick="switchDmTab('characters')">Characters</button>
      <button class="dm-tab" onclick="switchDmTab('npcs')">NPCs</button>
      <button class="dm-tab" onclick="switchDmTab('sessions')">Sessions</button>
      <button class="dm-tab" onclick="switchDmTab('ai')">AI Config</button>
      <button class="dm-tab" onclick="switchDmTab('search')">Search</button>
      <button class="dm-tab" onclick="switchDmTab('campaign')">Campaign</button>
      <button class="dm-tab" onclick="switchDmTab('users')">Users</button>
      <button class="dm-tab" onclick="switchDmTab('images')">&#127912; Image Studio</button>
    </div>

    <!-- ═══ CHARACTERS TAB ═══ -->
    <div class="dm-panel" id="dm-characters">
      <div class="dm-panel-header">
        <h3>Player Characters</h3>
        <div class="dm-panel-actions">
          <button class="dm-btn dm-btn-primary" onclick="ddbSyncAll()">&#8635; Sync All from D&amp;D Beyond</button>
        </div>
      </div>
      <div id="dm-chars-status" class="dm-status" style="display:none;"></div>
      <table class="dm-table" id="dm-chars-table">
        <thead><tr><th>ID</th><th>Character</th><th>Player Name</th><th>Level</th><th>Race</th><th>Class</th><th>STR</th><th>DEX</th><th>CON</th><th>INT</th><th>WIS</th><th>CHA</th><th>AC</th><th>HP</th><th>Actions</th></tr></thead>
        <tbody id="dm-chars-body"><tr><td colspan="15" class="dm-loading">Loading...</td></tr></tbody>
      </table>

      <div id="dm-char-edit" class="dm-edit-panel" style="display:none;">
        <h4 id="dm-char-edit-title">Edit Character</h4>
        <form id="dm-char-form" onsubmit="saveChar(event)">
          <input type="hidden" id="dm-char-id" />
          <div class="dm-form-grid">
            <label>Character Name<input type="text" id="dm-char-name" /></label>
            <label>Player Name<input type="text" id="dm-char-player" /></label>
            <label>Level<input type="number" id="dm-char-level" min="1" max="20" /></label>
            <label>Race<input type="text" id="dm-char-race" /></label>
            <label>Class Summary<input type="text" id="dm-char-class" /></label>
            <label>Background<input type="text" id="dm-char-background" /></label>
            <label>Alignment<input type="text" id="dm-char-alignment" /></label>
            <label>DDB Character ID<input type="text" id="dm-char-ddb" /></label>
          </div>
          <div class="dm-form-grid dm-form-grid-6">
            <label>STR<input type="number" id="dm-char-str" min="1" max="30" /></label>
            <label>DEX<input type="number" id="dm-char-dex" min="1" max="30" /></label>
            <label>CON<input type="number" id="dm-char-con" min="1" max="30" /></label>
            <label>INT<input type="number" id="dm-char-int" min="1" max="30" /></label>
            <label>WIS<input type="number" id="dm-char-wis" min="1" max="30" /></label>
            <label>CHA<input type="number" id="dm-char-cha" min="1" max="30" /></label>
          </div>
          <div class="dm-form-grid dm-form-grid-4">
            <label>AC<input type="number" id="dm-char-ac" min="0" max="30" /></label>
            <label>HP<input type="number" id="dm-char-hp" min="0" /></label>
            <label>Max HP<input type="number" id="dm-char-maxhp" min="0" /></label>
            <label>Speed<input type="number" id="dm-char-speed" min="0" /></label>
          </div>
          <div class="dm-form-actions">
            <button type="submit" class="dm-btn dm-btn-primary">Save</button>
            <button type="button" class="dm-btn" onclick="closeCharEdit()">Cancel</button>
          </div>
        </form>
      </div>
    </div>

    <!-- ═══ NPCs TAB ═══ -->
    <div class="dm-panel" id="dm-npcs" style="display:none;">
      <div class="dm-panel-header">
        <h3>NPCs</h3>
        <div class="dm-panel-actions">
          <button class="dm-btn dm-btn-primary" onclick="window.open('/npcs/admin','_blank')">Open NPC Admin &#8599;</button>
        </div>
      </div>
      <p class="dm-note">NPC management is available at <a href="/npcs/admin">/npcs/admin</a>. A unified inline editor is coming soon.</p>
      <div id="dm-npcs-status" class="dm-status" style="display:none;"></div>
      <table class="dm-table" id="dm-npcs-table">
        <thead><tr><th>ID</th><th>Name</th><th>Race</th><th>Class</th><th>Location</th><th>Status</th><th>Alignment</th><th>Hidden</th></tr></thead>
        <tbody id="dm-npcs-body"><tr><td colspan="8" class="dm-loading">Loading...</td></tr></tbody>
      </table>
    </div>

    <!-- ═══ SESSIONS TAB ═══ -->
    <div class="dm-panel" id="dm-sessions" style="display:none;">
      <div class="dm-panel-header">
        <h3>Session Logs</h3>
        <div class="dm-panel-actions">
          <button class="dm-btn dm-btn-primary" onclick="window.open('/sessions/admin','_blank')">Open Sessions Admin &#8599;</button>
        </div>
      </div>
      <p class="dm-note">Session log management is available at <a href="/sessions/admin">/sessions/admin</a>. A unified inline editor is coming soon.</p>
      <table class="dm-table" id="dm-sessions-table">
        <thead><tr><th>#</th><th>Title</th><th>Game Date</th><th>Play Date</th><th>Summary</th></tr></thead>
        <tbody id="dm-sessions-body"><tr><td colspan="5" class="dm-loading">Loading...</td></tr></tbody>
      </table>
    </div>

    <!-- ═══ AI CONFIG TAB ═══ -->
    <div class="dm-panel" id="dm-ai" style="display:none;">
      <div class="dm-panel-header">
        <h3>AI Configuration</h3>
        <div class="dm-panel-actions">
          <button class="dm-btn dm-btn-primary" onclick="window.open('/api-test/admin','_blank')">Open AI Test Console &#8599;</button>
        </div>
      </div>
      <form id="dm-ai-form" onsubmit="saveAiConfig(event)">
        <div class="dm-config-section">
          <h4>Chat Model</h4>
          <div class="dm-form-grid">
            <label>Model<select id="dm-ai-model">
              <option value="gpt-4o-mini">gpt-4o-mini (fastest, cheapest)</option>
              <option value="gpt-4o">gpt-4o (balanced)</option>
              <option value="gpt-4-turbo">gpt-4-turbo (most capable)</option>
            </select></label>
            <label>Temperature<input type="number" id="dm-ai-temp" min="0" max="2" step="0.1" value="0.7" /></label>
            <label>Max Tokens<input type="number" id="dm-ai-maxtokens" min="100" max="4096" value="1024" /></label>
          </div>
        </div>
        <div class="dm-config-section">
          <h4>System Prompt</h4>
          <textarea id="dm-ai-prompt" rows="10" class="dm-textarea"></textarea>
        </div>
        <div class="dm-config-section">
          <h4>Function Calling Tools</h4>
          <div id="dm-ai-tools" class="dm-tools-grid"></div>
        </div>
        <div class="dm-config-section">
          <h4>Image Generation (DALL-E 3)</h4>
          <div class="dm-form-grid">
            <label>Default Size<select id="dm-ai-imgsize">
              <option value="1024x1024">1024x1024</option>
              <option value="1792x1024">1792x1024 (landscape)</option>
              <option value="1024x1792">1024x1792 (portrait)</option>
            </select></label>
            <label>Default Style<select id="dm-ai-imgstyle">
              <option value="vivid">Vivid</option>
              <option value="natural">Natural</option>
            </select></label>
          </div>
        </div>
        <div class="dm-form-actions">
          <button type="submit" class="dm-btn dm-btn-primary">Save AI Config</button>
        </div>
      </form>
    </div>

    <!-- ═══ SEARCH CONFIG TAB ═══ -->
    <div class="dm-panel" id="dm-search" style="display:none;">
      <div class="dm-panel-header">
        <h3>Search Configuration</h3>
      </div>
      <form id="dm-search-form" onsubmit="saveSearchConfig(event)">
        <div class="dm-config-section">
          <h4>Search Backend</h4>
          <div class="dm-form-grid">
            <label>Search Mode<select id="dm-search-mode">
              <option value="database">Database Full-Text (PostgreSQL)</option>
              <option value="rag">RAG Semantic Search (dnd-rag pod)</option>
              <option value="hybrid">Hybrid (DB + RAG)</option>
            </select></label>
            <label>Min Score Threshold<input type="number" id="dm-search-threshold" min="0" max="100" value="50" /></label>
            <label>Max Results<input type="number" id="dm-search-limit" min="5" max="100" value="20" /></label>
          </div>
        </div>
        <div class="dm-config-section">
          <h4>RAG Service</h4>
          <div class="dm-form-grid">
            <label>RAG Service URL<input type="text" id="dm-search-ragurl" placeholder="http://dnd-rag.hotd-website.svc.cluster.local:3001" /></label>
            <label>RAG Status<span id="dm-rag-status" class="dm-badge dm-badge-unknown">Checking...</span></label>
          </div>
        </div>
        <div class="dm-config-section">
          <h4>Test Search</h4>
          <div class="dm-form-grid">
            <label>Query<input type="text" id="dm-search-test-q" placeholder="e.g. Vistani" /></label>
          </div>
          <button type="button" class="dm-btn" onclick="testSearch()">Run Test</button>
          <pre id="dm-search-result" class="dm-pre" style="display:none;"></pre>
        </div>
        <div class="dm-form-actions">
          <button type="submit" class="dm-btn dm-btn-primary">Save Search Config</button>
        </div>
      </form>
    </div>

    <!-- ═══ CAMPAIGN DATA TAB ═══ -->
    <div class="dm-panel" id="dm-campaign" style="display:none;">
      <div class="dm-panel-header">
        <h3>Campaign Data</h3>
      </div>
      <div class="dm-campaign-links">
        <a href="/home/admin" class="dm-card-link"><span>&#127968;</span>Home Dashboard<small>Next game date, party location</small></a>
        <a href="/calendar/admin" class="dm-card-link"><span>&#128197;</span>Calendar<small>Harptos calendar events</small></a>
        <a href="/maps/admin" class="dm-card-link"><span>&#128506;</span>Maps<small>Upload and manage maps</small></a>
        <a href="/map/admin" class="dm-card-link"><span>&#128205;</span>Map Markers<small>Interactive marker placement</small></a>
        <a href="/artifacts/admin" class="dm-card-link"><span>&#128142;</span>Artifacts<small>Magical items and relics</small></a>
        <a href="/handouts/admin" class="dm-card-link"><span>&#128220;</span>Handouts<small>Player handouts and documents</small></a>
        <a href="/art/admin" class="dm-card-link"><span>&#127912;</span>Art Gallery<small>Campaign artwork</small></a>
        <a href="/bulk-upload/admin" class="dm-card-link"><span>&#128228;</span>Bulk Upload<small>JSON bulk import</small></a>
      </div>

      <div class="dm-config-section" style="margin-top:24px;">
        <h4>Campaign Settings</h4>
        <form id="dm-campaign-form" onsubmit="saveCampaignConfig(event)">
          <div class="dm-form-grid">
            <label>Next Game Date<input type="datetime-local" id="dm-camp-nextgame" /></label>
            <label>Party Location<input type="text" id="dm-camp-location" /></label>
          </div>
          <div class="dm-form-grid dm-form-grid-3">
            <label>Current Day<input type="number" id="dm-camp-day" min="1" max="30" /></label>
            <label>Current Month<select id="dm-camp-month">
              <option value="1">Hammer</option><option value="2">Alturiak</option><option value="3">Ches</option>
              <option value="4">Tarsakh</option><option value="5">Mirtul</option><option value="6">Kythorn</option>
              <option value="7">Flamerule</option><option value="8">Eleasis</option><option value="9">Eleint</option>
              <option value="10">Marpenoth</option><option value="11">Uktar</option><option value="12">Nightal</option>
            </select></label>
            <label>Current Year<input type="number" id="dm-camp-year" /></label>
          </div>
          <div class="dm-form-actions">
            <button type="submit" class="dm-btn dm-btn-primary">Save Campaign Settings</button>
          </div>
        </form>
      </div>
    </div>

    <!-- ═══ USERS TAB ═══ -->
    <div class="dm-panel" id="dm-users" style="display:none;">
      <div class="dm-panel-header">
        <h3>User Management</h3>
      </div>
      <table class="dm-table" id="dm-users-table">
        <thead><tr><th>ID</th><th>Username</th><th>Name</th><th>Email</th><th>Role</th><th>Approved</th><th>Actions</th></tr></thead>
        <tbody id="dm-users-body"><tr><td colspan="7" class="dm-loading">Loading...</td></tr></tbody>
      </table>
    </div>

    <!-- ═══ IMAGE STUDIO TAB ═══ -->
    <div class="dm-panel" id="dm-images" style="display:none;">
      <div class="dm-panel-header">
        <h3>&#127912; DALL-E 3 Image Studio</h3>
      </div>

      <!-- Generation Form -->
      <div class="dm-config-section">
        <h4>Generate Image</h4>
        <div class="dm-form-grid">
          <label style="grid-column:1/-1;">Prompt<textarea id="img-prompt" rows="3" class="dm-textarea" placeholder="Describe what you want to generate..."></textarea></label>
        </div>
        <div class="dm-form-grid dm-form-grid-4">
          <label>Size<select id="img-size">
            <option value="1024x1024">1024x1024 (Square)</option>
            <option value="1792x1024">1792x1024 (Landscape)</option>
            <option value="1024x1792">1024x1792 (Portrait)</option>
          </select></label>
          <label>Style<select id="img-style">
            <option value="vivid">Vivid</option>
            <option value="natural">Natural</option>
          </select></label>
          <label>Quality<select id="img-quality">
            <option value="standard">Standard</option>
            <option value="hd">HD</option>
          </select></label>
          <label>Folder<input type="text" id="img-folder" placeholder="e.g. NPCs, Scenes, Items" list="img-folder-list" /><datalist id="img-folder-list"></datalist></label>
        </div>
        <div class="dm-form-grid">
          <label>Tags (comma separated)<input type="text" id="img-tags" placeholder="e.g. vampire, castle, barovia" /></label>
        </div>
        <div class="dm-form-actions">
          <button class="dm-btn dm-btn-primary" id="img-gen-btn" onclick="generateImage()">&#9889; Generate</button>
          <span id="img-gen-status" style="color:#888;font-size:0.82rem;align-self:center;"></span>
        </div>
      </div>

      <!-- Preview area for latest generation -->
      <div id="img-preview" class="img-preview" style="display:none;">
        <div class="img-preview-img"><img id="img-preview-src" src="" alt="Generated" /></div>
        <div class="img-preview-info">
          <p id="img-preview-prompt" style="color:#e8b923;font-weight:600;"></p>
          <p id="img-preview-revised" style="color:#888;font-size:0.8rem;font-style:italic;"></p>
          <div class="dm-form-actions">
            <button class="dm-btn dm-btn-primary" onclick="publishPreview()">Publish to Art Gallery</button>
            <button class="dm-btn" onclick="document.getElementById('img-preview').style.display='none'">Dismiss</button>
          </div>
        </div>
      </div>

      <!-- Folder filter bar -->
      <div class="dm-config-section" style="margin-top:20px;">
        <h4>Gallery</h4>
        <div class="img-folder-bar" id="img-folder-bar">
          <button class="dm-btn dm-btn-sm img-folder-btn active" onclick="filterFolder(null, this)">All</button>
        </div>
      </div>

      <!-- Gallery grid -->
      <div class="img-gallery" id="img-gallery">
        <p class="dm-loading">Loading gallery...</p>
      </div>

      <!-- Image detail modal -->
      <div class="img-modal" id="img-modal" style="display:none;" onclick="if(event.target===this)closeImgModal()">
        <div class="img-modal-content">
          <img id="img-modal-src" src="" alt="Image" />
          <div class="img-modal-info">
            <p id="img-modal-prompt" style="color:#e8b923;font-weight:600;"></p>
            <p id="img-modal-revised" style="color:#888;font-size:0.8rem;font-style:italic;"></p>
            <div class="img-modal-meta">
              <span id="img-modal-size"></span>
              <span id="img-modal-style"></span>
              <span id="img-modal-quality"></span>
              <span id="img-modal-folder" style="color:#e8b923;"></span>
              <span id="img-modal-date"></span>
            </div>
            <div class="dm-form-grid dm-form-grid-3" style="margin-top:12px;">
              <label>Folder<input type="text" id="img-modal-edit-folder" list="img-folder-list" /></label>
              <label>Tags<input type="text" id="img-modal-edit-tags" /></label>
              <label>&nbsp;<button class="dm-btn dm-btn-primary dm-btn-sm" onclick="updateImageMeta()">Update</button></label>
            </div>
            <div class="dm-form-actions" style="margin-top:12px;">
              <button class="dm-btn dm-btn-primary" onclick="publishModal()">Publish to Art Gallery</button>
              <button class="dm-btn dm-btn-danger" onclick="deleteModalImage()">Delete</button>
              <button class="dm-btn" onclick="closeImgModal()">Close</button>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>

  <style>
    /* ═══ DM Admin Interface ═══ */
    .dm-admin { max-width:1200px; margin:0 auto; }

    /* ── Tabs ── */
    .dm-tabs { display:flex; gap:0; border-bottom:2px solid #c83232; margin-bottom:0; overflow-x:auto; }
    .dm-tab { background:none; border:none; color:#888; font-size:0.8rem; font-weight:600; padding:10px 16px; cursor:pointer; text-transform:uppercase; letter-spacing:0.5px; border-bottom:2px solid transparent; margin-bottom:-2px; white-space:nowrap; }
    .dm-tab:hover { color:#ccc; }
    .dm-tab.active { color:#c83232; border-bottom-color:#c83232; }

    /* ── Panels ── */
    .dm-panel { background:#1e1e1e; border:1px solid #333; border-top:none; border-radius:0 0 8px 8px; padding:20px; }
    .dm-panel-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:8px; }
    .dm-panel-header h3 { color:#c83232; margin:0; font-size:1.2rem; }

    /* ── Tables ── */
    .dm-table { width:100%; border-collapse:collapse; font-size:0.8rem; }
    .dm-table th { color:#888; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.5px; text-align:left; padding:8px 6px; border-bottom:2px solid #c83232; position:sticky; top:0; background:#1e1e1e; }
    .dm-table td { padding:6px; color:#ccc; border-bottom:1px solid #2a2a2a; }
    .dm-table tr:hover td { background:#252525; }
    .dm-table .dm-loading { text-align:center; color:#666; padding:24px; font-style:italic; }
    .dm-table-wrap { max-height:500px; overflow-y:auto; }

    /* ── Buttons ── */
    .dm-btn { background:#2a2a2a; color:#aaa; border:1px solid #444; border-radius:6px; padding:6px 14px; font-size:0.78rem; cursor:pointer; transition:all 0.2s; }
    .dm-btn:hover { color:#fff; border-color:#888; }
    .dm-btn-primary { background:#c83232; color:#fff; border-color:#c83232; }
    .dm-btn-primary:hover { background:#a82828; }
    .dm-btn-sm { padding:3px 8px; font-size:0.7rem; }
    .dm-btn-danger { color:#f44; border-color:#f44; }
    .dm-btn-danger:hover { background:#f44; color:#fff; }
    .dm-panel-actions { display:flex; gap:8px; }

    /* ── Forms ── */
    .dm-form-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:12px; margin-bottom:16px; }
    .dm-form-grid-6 { grid-template-columns:repeat(6, 1fr); }
    .dm-form-grid-4 { grid-template-columns:repeat(4, 1fr); }
    .dm-form-grid-3 { grid-template-columns:repeat(3, 1fr); }
    .dm-form-grid label { display:flex; flex-direction:column; gap:4px; color:#aaa; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.5px; }
    .dm-form-grid input, .dm-form-grid select { background:#111; border:1px solid #333; border-radius:4px; padding:6px 8px; color:#ccc; font-size:0.85rem; }
    .dm-form-grid input:focus, .dm-form-grid select:focus, .dm-textarea:focus { border-color:#c83232; outline:none; }
    .dm-textarea { width:100%; background:#111; border:1px solid #333; border-radius:4px; padding:8px; color:#ccc; font-size:0.82rem; font-family:monospace; resize:vertical; box-sizing:border-box; }
    .dm-form-actions { display:flex; gap:8px; margin-top:12px; }

    /* ── Config sections ── */
    .dm-config-section { margin-bottom:24px; }
    .dm-config-section h4 { color:#e8b923; font-size:0.85rem; margin:0 0 10px; text-transform:uppercase; letter-spacing:0.5px; }

    /* ── Edit panel ── */
    .dm-edit-panel { background:#151515; border:1px solid #c83232; border-radius:8px; padding:20px; margin-top:16px; }
    .dm-edit-panel h4 { color:#c83232; margin:0 0 16px; }

    /* ── Status messages ── */
    .dm-status { padding:8px 12px; border-radius:6px; font-size:0.82rem; margin-bottom:12px; }
    .dm-status.success { background:#16a34a22; color:#4ade80; border:1px solid #16a34a44; }
    .dm-status.error { background:#dc262622; color:#f87171; border:1px solid #dc262644; }
    .dm-status.info { background:#2563eb22; color:#60a5fa; border:1px solid #2563eb44; }

    /* ── Notes ── */
    .dm-note { color:#888; font-size:0.82rem; font-style:italic; margin-bottom:16px; }
    .dm-note a { color:#e8b923; }

    /* ── Badges ── */
    .dm-badge { padding:2px 8px; border-radius:10px; font-size:0.7rem; font-weight:600; }
    .dm-badge-ok { background:#16a34a33; color:#4ade80; }
    .dm-badge-err { background:#dc262633; color:#f87171; }
    .dm-badge-unknown { background:#333; color:#888; }

    /* ── Campaign data cards ── */
    .dm-campaign-links { display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:12px; }
    .dm-card-link { display:flex; flex-direction:column; background:#111; border:1px solid #333; border-radius:8px; padding:16px; text-decoration:none; color:#ccc; transition:border-color 0.2s; }
    .dm-card-link:hover { border-color:#e8b923; }
    .dm-card-link span { font-size:1.5rem; margin-bottom:8px; }
    .dm-card-link small { color:#666; font-size:0.75rem; margin-top:4px; }

    /* ── Tools grid ── */
    .dm-tools-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:8px; }
    .dm-tool-item { display:flex; align-items:center; gap:8px; padding:8px; background:#111; border:1px solid #333; border-radius:6px; }
    .dm-tool-item label { color:#ccc; font-size:0.82rem; cursor:pointer; display:flex; align-items:center; gap:6px; }

    /* ── Pre/code ── */
    .dm-pre { background:#111; border:1px solid #333; border-radius:6px; padding:12px; font-size:0.78rem; color:#aaa; overflow-x:auto; margin-top:12px; max-height:300px; overflow-y:auto; white-space:pre-wrap; }

    /* ── Image Studio ── */
    .img-preview { display:flex; gap:20px; background:#151515; border:1px solid #c83232; border-radius:8px; padding:16px; margin-top:16px; }
    .img-preview-img { flex:0 0 300px; }
    .img-preview-img img { width:100%; border-radius:6px; }
    .img-preview-info { flex:1; }
    .img-folder-bar { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
    .img-folder-btn.active { background:#c83232; color:#fff; border-color:#c83232; }
    .img-gallery { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px; }
    .img-card { background:#111; border:1px solid #333; border-radius:8px; overflow:hidden; cursor:pointer; transition:border-color 0.2s; position:relative; }
    .img-card:hover { border-color:#e8b923; }
    .img-card img { width:100%; aspect-ratio:1; object-fit:cover; display:block; }
    .img-card-info { padding:8px 10px; }
    .img-card-info p { margin:0; font-size:0.78rem; color:#aaa; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .img-card-info small { color:#666; font-size:0.7rem; }
    .img-card .img-published { position:absolute; top:6px; right:6px; background:#16a34a; color:#fff; font-size:0.65rem; padding:2px 6px; border-radius:10px; }
    .img-modal { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.85); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; }
    .img-modal-content { display:flex; gap:20px; max-width:1100px; width:100%; max-height:90vh; background:#1e1e1e; border:1px solid #444; border-radius:10px; padding:20px; overflow-y:auto; }
    .img-modal-content img { max-width:500px; max-height:70vh; border-radius:6px; object-fit:contain; }
    .img-modal-info { flex:1; }
    .img-modal-meta { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
    .img-modal-meta span { background:#2a2a2a; padding:2px 8px; border-radius:10px; font-size:0.72rem; color:#aaa; }

    @media (max-width: 700px) {
      .img-preview { flex-direction:column; }
      .img-preview-img { flex:none; }
      .img-modal-content { flex-direction:column; }
      .img-modal-content img { max-width:100%; }
      .img-gallery { grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); }
    }

    @media (max-width: 700px) {
      .dm-form-grid-6 { grid-template-columns:repeat(3, 1fr); }
      .dm-form-grid-4, .dm-form-grid-3 { grid-template-columns:repeat(2, 1fr); }
      .dm-tabs { flex-wrap:wrap; }
    }
  </style>

  <script>
  // ═══ TAB SWITCHING ═══
  function switchDmTab(tab) {
    document.querySelectorAll('.dm-panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.dm-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('dm-' + tab).style.display = 'block';
    event.target.classList.add('active');
    // Load data on first visit
    if (!window['_loaded_' + tab]) { window['_loaded_' + tab] = true; loadTabData(tab); }
  }

  function loadTabData(tab) {
    switch(tab) {
      case 'characters': loadCharacters(); break;
      case 'npcs': loadNpcs(); break;
      case 'sessions': loadSessions(); break;
      case 'ai': loadAiConfig(); break;
      case 'search': loadSearchConfig(); break;
      case 'campaign': loadCampaignConfig(); break;
      case 'users': loadUsers(); break;
      case 'images': loadImageStudio(); break;
    }
  }

  function showStatus(el, msg, type) {
    el.style.display = 'block';
    el.className = 'dm-status ' + type;
    el.textContent = msg;
    if (type === 'success') setTimeout(() => el.style.display = 'none', 4000);
  }

  // ═══ CHARACTERS ═══
  async function loadCharacters() {
    const r = await fetch('/api/dm-admin/characters');
    const data = await r.json();
    const tbody = document.getElementById('dm-chars-body');
    if (!data.characters || data.characters.length === 0) {
      tbody.innerHTML = '<tr><td colspan="15" class="dm-loading">No characters found.</td></tr>';
      return;
    }
    tbody.innerHTML = data.characters.map(c => '<tr>' +
      '<td>' + c.id + '</td>' +
      '<td style="color:#e8b923;font-weight:600;">' + esc(c.character_name) + '</td>' +
      '<td>' + esc(c.player_name) + '</td>' +
      '<td>' + c.level + '</td>' +
      '<td>' + esc(c.race) + '</td>' +
      '<td style="font-size:0.75rem;">' + esc(c.class_summary) + '</td>' +
      '<td>' + c.strength + '</td><td>' + c.dexterity + '</td><td>' + c.constitution + '</td>' +
      '<td>' + c.intelligence + '</td><td>' + c.wisdom + '</td><td>' + c.charisma + '</td>' +
      '<td>' + c.armor_class + '</td><td>' + c.hit_points + '/' + c.max_hit_points + '</td>' +
      '<td><button class="dm-btn dm-btn-sm" onclick="editChar(' + c.id + ')">Edit</button> ' +
      (c.ddb_character_id ? '<button class="dm-btn dm-btn-sm" onclick="ddbSync(' + c.id + ')">Sync</button>' : '') +
      '</td></tr>').join('');
  }

  let _charsCache = [];
  async function editChar(id) {
    if (!_charsCache.length) {
      const r = await fetch('/api/dm-admin/characters');
      _charsCache = (await r.json()).characters;
    }
    const c = _charsCache.find(x => x.id === id);
    if (!c) return;
    document.getElementById('dm-char-edit').style.display = 'block';
    document.getElementById('dm-char-edit-title').textContent = 'Edit: ' + c.character_name;
    document.getElementById('dm-char-id').value = c.id;
    document.getElementById('dm-char-name').value = c.character_name || '';
    document.getElementById('dm-char-player').value = c.player_name || '';
    document.getElementById('dm-char-level').value = c.level || 1;
    document.getElementById('dm-char-race').value = c.race || '';
    document.getElementById('dm-char-class').value = c.class_summary || '';
    document.getElementById('dm-char-background').value = c.background || '';
    document.getElementById('dm-char-alignment').value = c.alignment || '';
    document.getElementById('dm-char-ddb').value = c.ddb_character_id || '';
    document.getElementById('dm-char-str').value = c.strength;
    document.getElementById('dm-char-dex').value = c.dexterity;
    document.getElementById('dm-char-con').value = c.constitution;
    document.getElementById('dm-char-int').value = c.intelligence;
    document.getElementById('dm-char-wis').value = c.wisdom;
    document.getElementById('dm-char-cha').value = c.charisma;
    document.getElementById('dm-char-ac').value = c.armor_class;
    document.getElementById('dm-char-hp').value = c.hit_points;
    document.getElementById('dm-char-maxhp').value = c.max_hit_points;
    document.getElementById('dm-char-speed').value = c.speed;
  }

  function closeCharEdit() { document.getElementById('dm-char-edit').style.display = 'none'; }

  async function saveChar(e) {
    e.preventDefault();
    const id = document.getElementById('dm-char-id').value;
    const body = {
      character_name: document.getElementById('dm-char-name').value,
      player_name: document.getElementById('dm-char-player').value,
      level: parseInt(document.getElementById('dm-char-level').value),
      race: document.getElementById('dm-char-race').value,
      class_summary: document.getElementById('dm-char-class').value,
      background: document.getElementById('dm-char-background').value,
      alignment: document.getElementById('dm-char-alignment').value,
      ddb_character_id: document.getElementById('dm-char-ddb').value || null,
      strength: parseInt(document.getElementById('dm-char-str').value),
      dexterity: parseInt(document.getElementById('dm-char-dex').value),
      constitution: parseInt(document.getElementById('dm-char-con').value),
      intelligence: parseInt(document.getElementById('dm-char-int').value),
      wisdom: parseInt(document.getElementById('dm-char-wis').value),
      charisma: parseInt(document.getElementById('dm-char-cha').value),
      armor_class: parseInt(document.getElementById('dm-char-ac').value),
      hit_points: parseInt(document.getElementById('dm-char-hp').value),
      max_hit_points: parseInt(document.getElementById('dm-char-maxhp').value),
      speed: parseInt(document.getElementById('dm-char-speed').value),
    };
    const r = await fetch('/api/dm-admin/characters/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const status = document.getElementById('dm-chars-status');
    if (r.ok) { showStatus(status, 'Character saved.', 'success'); closeCharEdit(); _charsCache = []; loadCharacters(); }
    else { const err = await r.json(); showStatus(status, 'Error: ' + (err.error || 'Unknown'), 'error'); }
  }

  async function ddbSync(charId) {
    const status = document.getElementById('dm-chars-status');
    showStatus(status, 'Syncing from D&D Beyond...', 'info');
    const r = await fetch('/api/dm-admin/characters/' + charId + '/sync', { method: 'POST' });
    const data = await r.json();
    if (r.ok) { showStatus(status, 'Synced: ' + (data.message || 'OK'), 'success'); _charsCache = []; loadCharacters(); }
    else { showStatus(status, 'Sync failed: ' + (data.error || 'Unknown'), 'error'); }
  }

  async function ddbSyncAll() {
    const status = document.getElementById('dm-chars-status');
    showStatus(status, 'Syncing all characters...', 'info');
    const r = await fetch('/api/dm-admin/characters/sync-all', { method: 'POST' });
    const data = await r.json();
    if (r.ok) { showStatus(status, data.message || 'Sync complete', 'success'); _charsCache = []; loadCharacters(); }
    else { showStatus(status, 'Sync failed: ' + (data.error || 'Unknown'), 'error'); }
  }

  // ═══ NPCs ═══
  async function loadNpcs() {
    const r = await fetch('/api/dm-admin/npcs');
    const data = await r.json();
    const tbody = document.getElementById('dm-npcs-body');
    if (!data.npcs || data.npcs.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="dm-loading">No NPCs.</td></tr>'; return; }
    tbody.innerHTML = data.npcs.map(n => '<tr>' +
      '<td>' + n.id + '</td><td style="color:#e8b923;">' + esc(n.name) + '</td>' +
      '<td>' + esc(n.race || '') + '</td><td>' + esc(n.npc_class || '') + '</td>' +
      '<td>' + esc(n.location || '') + '</td><td>' + esc(n.status || '') + '</td>' +
      '<td>' + esc(n.alignment_tag || '') + '</td>' +
      '<td>' + (n.is_hidden ? '&#128065;' : '') + '</td></tr>').join('');
  }

  // ═══ SESSIONS ═══
  async function loadSessions() {
    const r = await fetch('/api/dm-admin/sessions');
    const data = await r.json();
    const tbody = document.getElementById('dm-sessions-body');
    if (!data.sessions || data.sessions.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="dm-loading">No sessions.</td></tr>'; return; }
    tbody.innerHTML = data.sessions.map(s => '<tr>' +
      '<td>' + s.session_number + '</td><td style="color:#e8b923;">' + esc(s.title) + '</td>' +
      '<td>' + esc(s.game_date || '') + '</td><td>' + esc(s.play_date || '') + '</td>' +
      '<td style="font-size:0.75rem;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc((s.summary || '').substring(0, 120)) + '</td></tr>').join('');
  }

  // ═══ AI CONFIG ═══
  async function loadAiConfig() {
    const r = await fetch('/api/dm-admin/config');
    const data = await r.json();
    if (data.ai_model) document.getElementById('dm-ai-model').value = data.ai_model;
    if (data.ai_temperature) document.getElementById('dm-ai-temp').value = data.ai_temperature;
    if (data.ai_max_tokens) document.getElementById('dm-ai-maxtokens').value = data.ai_max_tokens;
    if (data.ai_system_prompt) document.getElementById('dm-ai-prompt').value = data.ai_system_prompt;
    if (data.ai_image_size) document.getElementById('dm-ai-imgsize').value = data.ai_image_size;
    if (data.ai_image_style) document.getElementById('dm-ai-imgstyle').value = data.ai_image_style;
    // Load tools
    if (data.ai_tools) {
      const tools = JSON.parse(data.ai_tools || '[]');
      const grid = document.getElementById('dm-ai-tools');
      grid.innerHTML = tools.map(t => '<div class="dm-tool-item"><label><input type="checkbox" name="tool" value="' + esc(t.name) + '" ' + (t.enabled !== false ? 'checked' : '') + ' /> ' + esc(t.name) + '</label></div>').join('');
    }
  }

  async function saveAiConfig(e) {
    e.preventDefault();
    const tools = [...document.querySelectorAll('#dm-ai-tools input[name=tool]')].map(i => ({ name: i.value, enabled: i.checked }));
    const body = {
      ai_model: document.getElementById('dm-ai-model').value,
      ai_temperature: document.getElementById('dm-ai-temp').value,
      ai_max_tokens: document.getElementById('dm-ai-maxtokens').value,
      ai_system_prompt: document.getElementById('dm-ai-prompt').value,
      ai_image_size: document.getElementById('dm-ai-imgsize').value,
      ai_image_style: document.getElementById('dm-ai-imgstyle').value,
      ai_tools: JSON.stringify(tools),
    };
    const r = await fetch('/api/dm-admin/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    alert(r.ok ? 'AI config saved.' : 'Error saving config.');
  }

  // ═══ SEARCH CONFIG ═══
  async function loadSearchConfig() {
    const r = await fetch('/api/dm-admin/config');
    const data = await r.json();
    if (data.search_mode) document.getElementById('dm-search-mode').value = data.search_mode;
    if (data.search_threshold) document.getElementById('dm-search-threshold').value = data.search_threshold;
    if (data.search_limit) document.getElementById('dm-search-limit').value = data.search_limit;
    if (data.rag_service_url) document.getElementById('dm-search-ragurl').value = data.rag_service_url;
    // Check RAG status
    try {
      const rs = await fetch('/api/dm-admin/rag-status');
      const rsd = await rs.json();
      const badge = document.getElementById('dm-rag-status');
      badge.textContent = rsd.status === 'ok' ? 'Connected' : 'Offline';
      badge.className = 'dm-badge ' + (rsd.status === 'ok' ? 'dm-badge-ok' : 'dm-badge-err');
    } catch (_) {
      document.getElementById('dm-rag-status').textContent = 'Error';
      document.getElementById('dm-rag-status').className = 'dm-badge dm-badge-err';
    }
  }

  async function testSearch() {
    const q = document.getElementById('dm-search-test-q').value;
    if (!q) return;
    const pre = document.getElementById('dm-search-result');
    pre.style.display = 'block';
    pre.textContent = 'Searching...';
    const r = await fetch('/api/search?q=' + encodeURIComponent(q));
    const data = await r.json();
    pre.textContent = JSON.stringify(data, null, 2);
  }

  async function saveSearchConfig(e) {
    e.preventDefault();
    const body = {
      search_mode: document.getElementById('dm-search-mode').value,
      search_threshold: document.getElementById('dm-search-threshold').value,
      search_limit: document.getElementById('dm-search-limit').value,
      rag_service_url: document.getElementById('dm-search-ragurl').value,
    };
    const r = await fetch('/api/dm-admin/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    alert(r.ok ? 'Search config saved.' : 'Error saving config.');
  }

  // ═══ CAMPAIGN CONFIG ═══
  async function loadCampaignConfig() {
    const r = await fetch('/api/dm-admin/config');
    const data = await r.json();
    if (data.next_game_date) document.getElementById('dm-camp-nextgame').value = data.next_game_date;
    if (data.party_location) document.getElementById('dm-camp-location').value = data.party_location;
    if (data.current_day) document.getElementById('dm-camp-day').value = data.current_day;
    if (data.current_month) document.getElementById('dm-camp-month').value = data.current_month;
    if (data.current_year) document.getElementById('dm-camp-year').value = data.current_year;
  }

  async function saveCampaignConfig(e) {
    e.preventDefault();
    const body = {
      next_game_date: document.getElementById('dm-camp-nextgame').value,
      party_location: document.getElementById('dm-camp-location').value,
      current_day: document.getElementById('dm-camp-day').value,
      current_month: document.getElementById('dm-camp-month').value,
      current_year: document.getElementById('dm-camp-year').value,
    };
    const r = await fetch('/api/dm-admin/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    alert(r.ok ? 'Campaign settings saved.' : 'Error saving settings.');
  }

  // ═══ USERS ═══
  async function loadUsers() {
    const r = await fetch('/api/dm-admin/users');
    const data = await r.json();
    const tbody = document.getElementById('dm-users-body');
    if (!data.users || data.users.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="dm-loading">No users.</td></tr>'; return; }
    tbody.innerHTML = data.users.map(u => '<tr>' +
      '<td>' + u.id + '</td><td style="color:#e8b923;">' + esc(u.username) + '</td>' +
      '<td>' + esc((u.first_name || '') + ' ' + (u.last_name || '')) + '</td>' +
      '<td>' + esc(u.email || '') + '</td>' +
      '<td>' + esc(u.role) + '</td>' +
      '<td>' + (u.is_approved ? '&#9989;' : '&#10060;') + '</td>' +
      '<td>' +
        (!u.is_approved ? '<button class="dm-btn dm-btn-sm" onclick="userAction(' + u.id + ',\\'approve\\')">Approve</button> ' : '') +
        (u.role !== 'admin' ? '<button class="dm-btn dm-btn-sm" onclick="userAction(' + u.id + ',\\'promote\\')">Promote</button> ' : '<button class="dm-btn dm-btn-sm" onclick="userAction(' + u.id + ',\\'demote\\')">Demote</button> ') +
        '<button class="dm-btn dm-btn-sm dm-btn-danger" onclick="userAction(' + u.id + ',\\'delete\\')">Delete</button>' +
      '</td></tr>').join('');
  }

  async function userAction(userId, action) {
    if (action === 'delete' && !confirm('Delete this user?')) return;
    const r = await fetch('/api/dm-admin/users/' + userId + '/' + action, { method: 'POST' });
    if (r.ok) loadUsers();
    else alert('Error: ' + (await r.json()).error);
  }

  // ═══ IMAGE STUDIO ═══
  let _imgCurrentFolder = null;
  let _imgCurrentId = null;
  let _imgPreviewId = null;

  async function loadImageStudio() {
    await loadFolders();
    await loadGallery();
  }

  async function loadFolders() {
    try {
      const r = await fetch('/api/dm-admin/images/folders');
      const data = await r.json();
      const bar = document.getElementById('img-folder-bar');
      const dl = document.getElementById('img-folder-list');
      bar.innerHTML = '<button class="dm-btn dm-btn-sm img-folder-btn' + (!_imgCurrentFolder ? ' active' : '') + '" onclick="filterFolder(null, this)">All</button>';
      dl.innerHTML = '';
      (data.folders || []).forEach(f => {
        bar.innerHTML += '<button class="dm-btn dm-btn-sm img-folder-btn' + (_imgCurrentFolder === f ? ' active' : '') + '" onclick="filterFolder(\\''+esc(f)+'\\', this)">' + esc(f) + '</button>';
        dl.innerHTML += '<option value="' + esc(f) + '">';
      });
    } catch (_) {}
  }

  function filterFolder(folder, btn) {
    _imgCurrentFolder = folder;
    document.querySelectorAll('.img-folder-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadGallery();
  }

  async function loadGallery() {
    const gallery = document.getElementById('img-gallery');
    gallery.innerHTML = '<p class="dm-loading">Loading...</p>';
    let url = '/api/dm-admin/images';
    if (_imgCurrentFolder) url += '?folder=' + encodeURIComponent(_imgCurrentFolder);
    const r = await fetch(url);
    const data = await r.json();
    if (!data.images || data.images.length === 0) {
      gallery.innerHTML = '<p class="dm-loading" style="grid-column:1/-1;">No images yet. Generate your first one above!</p>';
      return;
    }
    gallery.innerHTML = data.images.map(img =>
      '<div class="img-card" onclick="openImgModal(' + img.id + ')" data-id="' + img.id + '">' +
        (img.is_published ? '<span class="img-published">Published</span>' : '') +
        '<img src="' + esc(img.image_url) + '" alt="' + esc(img.prompt) + '" loading="lazy" />' +
        '<div class="img-card-info"><p>' + esc(img.prompt) + '</p>' +
        '<small>' + (img.folder ? esc(img.folder) + ' &middot; ' : '') + img.size + ' &middot; ' + new Date(img.created_at).toLocaleDateString() + '</small></div></div>'
    ).join('');
    window._imgGalleryData = data.images;
  }

  async function generateImage() {
    const prompt = document.getElementById('img-prompt').value.trim();
    if (!prompt) { alert('Enter a prompt'); return; }
    const btn = document.getElementById('img-gen-btn');
    const status = document.getElementById('img-gen-status');
    btn.disabled = true;
    status.textContent = 'Generating with DALL-E 3... (this may take 15-30s)';
    try {
      const body = {
        prompt,
        size: document.getElementById('img-size').value,
        style: document.getElementById('img-style').value,
        quality: document.getElementById('img-quality').value,
        folder: document.getElementById('img-folder').value || null,
        tags: document.getElementById('img-tags').value.split(',').map(t => t.trim()).filter(Boolean),
      };
      const r = await fetch('/api/dm-admin/images/generate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Generation failed');
      // Show preview
      _imgPreviewId = data.image.id;
      document.getElementById('img-preview-src').src = data.image.image_url;
      document.getElementById('img-preview-prompt').textContent = data.image.prompt;
      document.getElementById('img-preview-revised').textContent = data.image.revised_prompt ? 'DALL-E revised: ' + data.image.revised_prompt : '';
      document.getElementById('img-preview').style.display = 'flex';
      status.textContent = 'Generated successfully!';
      setTimeout(() => { status.textContent = ''; }, 4000);
      // Refresh gallery + folders
      await loadFolders();
      await loadGallery();
    } catch (err) {
      status.textContent = 'Error: ' + err.message;
    } finally {
      btn.disabled = false;
    }
  }

  function openImgModal(imgId) {
    const data = (window._imgGalleryData || []).find(i => i.id === imgId);
    if (!data) return;
    _imgCurrentId = imgId;
    document.getElementById('img-modal-src').src = data.image_url;
    document.getElementById('img-modal-prompt').textContent = data.prompt;
    document.getElementById('img-modal-revised').textContent = data.revised_prompt ? 'DALL-E revised: ' + data.revised_prompt : '';
    document.getElementById('img-modal-size').textContent = data.size;
    document.getElementById('img-modal-style').textContent = data.style;
    document.getElementById('img-modal-quality').textContent = data.quality;
    document.getElementById('img-modal-folder').textContent = data.folder || 'Unfiled';
    document.getElementById('img-modal-date').textContent = new Date(data.created_at).toLocaleString();
    document.getElementById('img-modal-edit-folder').value = data.folder || '';
    const tags = data.tags ? (typeof data.tags === 'string' ? JSON.parse(data.tags) : data.tags) : [];
    document.getElementById('img-modal-edit-tags').value = tags.join(', ');
    document.getElementById('img-modal').style.display = 'flex';
  }

  function closeImgModal() { document.getElementById('img-modal').style.display = 'none'; _imgCurrentId = null; }

  async function updateImageMeta() {
    if (!_imgCurrentId) return;
    const folder = document.getElementById('img-modal-edit-folder').value || null;
    const tags = document.getElementById('img-modal-edit-tags').value.split(',').map(t => t.trim()).filter(Boolean);
    const r = await fetch('/api/dm-admin/images/' + _imgCurrentId, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ folder, tags }) });
    if (r.ok) { closeImgModal(); await loadFolders(); await loadGallery(); }
    else alert('Error updating image');
  }

  async function deleteModalImage() {
    if (!_imgCurrentId || !confirm('Delete this image permanently?')) return;
    const r = await fetch('/api/dm-admin/images/' + _imgCurrentId, { method: 'DELETE' });
    if (r.ok) { closeImgModal(); await loadFolders(); await loadGallery(); }
    else alert('Error deleting image');
  }

  async function publishModal() {
    if (!_imgCurrentId) return;
    const data = (window._imgGalleryData || []).find(i => i.id === _imgCurrentId);
    const title = prompt('Title for Art Gallery:', data ? data.prompt : '');
    if (!title) return;
    const category = prompt('Category:', data && data.folder ? data.folder : 'Generated');
    const r = await fetch('/api/dm-admin/images/' + _imgCurrentId + '/publish', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ title, category }) });
    if (r.ok) { alert('Published to Art Gallery!'); closeImgModal(); await loadGallery(); }
    else { const d = await r.json(); alert('Error: ' + (d.error || 'Unknown')); }
  }

  async function publishPreview() {
    if (!_imgPreviewId) return;
    const pr = document.getElementById('img-preview-prompt').textContent;
    const title = prompt('Title for Art Gallery:', pr);
    if (!title) return;
    const category = prompt('Category:', document.getElementById('img-folder').value || 'Generated');
    const r = await fetch('/api/dm-admin/images/' + _imgPreviewId + '/publish', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ title, category }) });
    if (r.ok) { alert('Published to Art Gallery!'); await loadGallery(); }
    else { const d = await r.json(); alert('Error: ' + (d.error || 'Unknown')); }
  }

  // ═══ UTILITY ═══
  function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // ═══ INIT ═══
  window._loaded_characters = true;
  loadCharacters();
  </script>`;

  return pageShell("DM Management — Halls of the Damned", "/dm-admin", body, session);
}

module.exports = { renderDmAdminPage };
