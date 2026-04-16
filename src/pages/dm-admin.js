// ══════════════════════════════════════════════════════════════
// ── DM COMMAND CENTER ─────────────────────────────────────────
// Full-width sidebar dashboard for managing the campaign.
// ══════════════════════════════════════════════════════════════

const { pgPool } = require("../db/pool");
const { esc } = require("../lib/utils");
const { pageShell } = require("../components/shell");

async function renderDmAdminPage(session) {
  if (!session || session.role !== "admin") return null;

  const body = `
  <div class="dmc">
    <!-- ═══ SIDEBAR ═══ -->
    <aside class="dmc-side" id="dmc-side">
      <div class="dmc-side-head">
        <span class="dmc-logo">DM Command Center</span>
        <button class="dmc-collapse-btn" onclick="toggleSidebar()" title="Collapse">&#9776;</button>
      </div>
      <nav class="dmc-nav">
        <div class="dmc-nav-section">
          <div class="dmc-nav-label">AI Tools</div>
          <button class="dmc-nav-btn active" onclick="dmc('chat')">DM Chat</button>
          <button class="dmc-nav-btn" onclick="dmc('forge')">Story Forge</button>
          <button class="dmc-nav-btn" onclick="dmc('images')">Image Studio</button>
        </div>
        <div class="dmc-nav-section">
          <div class="dmc-nav-label">Campaign</div>
          <button class="dmc-nav-btn" onclick="dmc('notes')">Notebook</button>
          <button class="dmc-nav-btn" onclick="dmc('characters')">Characters</button>
          <button class="dmc-nav-btn" onclick="dmc('npcs')">NPCs</button>
          <button class="dmc-nav-btn" onclick="dmc('sessions')">Sessions</button>
        </div>
        <div class="dmc-nav-section">
          <div class="dmc-nav-label">Config</div>
          <button class="dmc-nav-btn" onclick="dmc('ai')">AI Config</button>
          <button class="dmc-nav-btn" onclick="dmc('search')">Search</button>
          <button class="dmc-nav-btn" onclick="dmc('campaign')">Campaign Data</button>
          <button class="dmc-nav-btn" onclick="dmc('users')">Users</button>
        </div>
      </nav>
    </aside>

    <!-- ═══ MAIN CONTENT ═══ -->
    <main class="dmc-main" id="dmc-main">

      <!-- ╔══ DM CHAT ══╗ -->
      <section class="dmc-panel" id="dmc-chat">
        <div class="dmc-panel-bar"><h2>DM Chat</h2>
          <div class="dmc-bar-actions">
            <button class="dmc-btn dmc-btn-sm" onclick="newConversation()">+ New Chat</button>
            <button class="dmc-btn dmc-btn-sm" onclick="toggleConvList()">Conversations</button>
          </div>
        </div>
        <div class="chat-layout">
          <div class="chat-convlist" id="chat-convlist" style="display:none;">
            <div id="chat-conv-items"></div>
          </div>
          <div class="chat-area">
            <div class="chat-messages" id="chat-messages">
              <div class="chat-welcome">
                <h3>Welcome, Dungeon Master</h3>
                <p>Ask me anything about your campaign. I have access to all your embedded lore, NPCs, sessions, and story elements.</p>
                <div class="chat-suggestions">
                  <button onclick="chatSend('Summarize the last 3 sessions')">Summarize last 3 sessions</button>
                  <button onclick="chatSend('Who are the key NPCs in Vallaki?')">NPCs in Vallaki</button>
                  <button onclick="chatSend('Help me plan the next session')">Plan next session</button>
                </div>
              </div>
            </div>
            <div class="chat-input-bar">
              <textarea id="chat-input" rows="2" placeholder="Ask the DM AI..." onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();chatSendInput()}"></textarea>
              <button class="dmc-btn dmc-btn-primary" id="chat-send-btn" onclick="chatSendInput()">Send</button>
            </div>
          </div>
        </div>
      </section>

      <!-- ╔══ STORY FORGE ══╗ -->
      <section class="dmc-panel" id="dmc-forge" style="display:none;">
        <div class="dmc-panel-bar"><h2>Story Forge</h2>
          <div class="dmc-bar-actions">
            <button class="dmc-btn dmc-btn-sm" onclick="showForge('gen')">Generate</button>
            <button class="dmc-btn dmc-btn-sm" onclick="showForge('lib')">Library</button>
            <button class="dmc-btn dmc-btn-sm" onclick="showForge('rag')">RAG Search</button>
          </div>
        </div>
        <!-- Generate -->
        <div id="forge-gen" class="forge-sec">
          <div class="dmc-form-row">
            <label>Template<select id="forge-tpl" onchange="updateForgeHint()">
              <option value="npc_backstory">NPC Backstory</option>
              <option value="magic_item">Magic Item</option>
              <option value="spell">Custom Spell</option>
              <option value="session_summary">Session Summary</option>
              <option value="session_planning">Session Planning</option>
              <option value="scene_description">Scene Description</option>
              <option value="quest_hook">Quest Hook</option>
              <option value="faction_lore">Faction Lore</option>
              <option value="freeform">Freeform</option>
            </select></label>
            <label>Related Entities<input id="forge-ents" placeholder="Ireena, Vallaki, Van Richten" /></label>
          </div>
          <p id="forge-hint" class="dmc-hint"></p>
          <textarea id="forge-prompt" rows="4" class="dmc-textarea" placeholder="Describe what to generate..."></textarea>
          <div class="dmc-form-actions">
            <button class="dmc-btn dmc-btn-primary" id="forge-go" onclick="forgeGen()">Generate</button>
            <span id="forge-status" class="dmc-status-text"></span>
          </div>
          <div id="forge-result" class="forge-result" style="display:none;">
            <div class="forge-result-hdr">
              <span id="forge-result-meta"></span>
              <div>
                <button class="dmc-btn dmc-btn-primary dmc-btn-sm" onclick="forgeCommit()">Commit</button>
                <button class="dmc-btn dmc-btn-sm" onclick="forgeCopy()">Copy</button>
                <button class="dmc-btn dmc-btn-sm" onclick="forgeGen()">Redo</button>
              </div>
            </div>
            <div id="forge-result-body" class="forge-result-body"></div>
          </div>
        </div>
        <!-- Library -->
        <div id="forge-lib" class="forge-sec" style="display:none;">
          <div class="dmc-form-row">
            <label>Type<select id="forge-lib-type" onchange="loadForgeLib()">
              <option value="">All</option>
              <option value="npc_backstory">NPC Backstory</option><option value="magic_item">Magic Item</option>
              <option value="spell">Spell</option><option value="session_summary">Session Summary</option>
              <option value="session_planning">Session Planning</option><option value="scene_description">Scene</option>
              <option value="quest_hook">Quest Hook</option><option value="faction_lore">Faction Lore</option>
              <option value="freeform">Freeform</option>
            </select></label>
            <label>Status<select id="forge-lib-st" onchange="loadForgeLib()">
              <option value="">All</option><option value="draft">Draft</option>
              <option value="committed">Committed</option><option value="archived">Archived</option>
            </select></label>
          </div>
          <div id="forge-lib-list"></div>
          <div id="forge-detail" class="forge-detail" style="display:none;">
            <div class="forge-result-hdr"><h4 id="forge-det-title"></h4>
              <div>
                <button class="dmc-btn dmc-btn-sm dmc-btn-primary" onclick="forgeApply()">Apply to NPCs</button>
                <button class="dmc-btn dmc-btn-sm" onclick="forgeEdit()">Edit</button>
                <button class="dmc-btn dmc-btn-sm dmc-btn-danger" onclick="forgeDel()">Delete</button>
                <button class="dmc-btn dmc-btn-sm" onclick="el('forge-detail').style.display='none'">Close</button>
              </div>
            </div>
            <div id="forge-det-meta" class="forge-result-meta"></div>
            <div id="forge-det-body" class="forge-result-body"></div>
            <div id="forge-det-edit" style="display:none;margin-top:8px;">
              <textarea id="forge-det-edit-ta" rows="8" class="dmc-textarea"></textarea>
              <div class="dmc-form-actions"><button class="dmc-btn dmc-btn-primary dmc-btn-sm" onclick="forgeSaveEdit()">Save</button>
                <button class="dmc-btn dmc-btn-sm" onclick="el('forge-det-edit').style.display='none'">Cancel</button></div>
            </div>
          </div>
        </div>
        <!-- RAG -->
        <div id="forge-rag" class="forge-sec" style="display:none;">
          <p class="dmc-hint">Search your campaign's embedded knowledge base. Includes DM-only content.</p>
          <div class="dmc-form-row">
            <label style="flex:3">Query<input id="rag-q" placeholder="What happened to Ireena at Castle Ravenloft?" onkeydown="if(event.key==='Enter')ragSearch()" /></label>
            <label>Source<select id="rag-type"><option value="">All</option>
              <option value="npc">NPC</option><option value="session">Session</option>
              <option value="lore">Lore</option><option value="lore_json">Lore JSON</option>
              <option value="calendar">Calendar</option><option value="handout">Handout</option>
              <option value="artifact">Artifact</option><option value="character">Character</option>
              <option value="journal">Journal</option></select></label>
            <label>Min<input type="number" id="rag-min" value="0.2" min="0" max="1" step="0.05" style="width:80px" /></label>
          </div>
          <div class="dmc-form-actions"><button class="dmc-btn dmc-btn-primary" onclick="ragSearch()">Search</button></div>
          <div id="rag-results"></div>
        </div>
      </section>

      <!-- ╔══ IMAGE STUDIO ══╗ -->
      <section class="dmc-panel" id="dmc-images" style="display:none;">
        <div class="dmc-panel-bar"><h2>Image Studio</h2></div>
        <div class="dmc-form-row">
          <label style="flex:3">Prompt<textarea id="img-prompt" rows="2" class="dmc-textarea" placeholder="Describe what to generate..."></textarea></label>
        </div>
        <div class="dmc-form-row">
          <label>Size<select id="img-size">
            <option value="1024x1024">1024x1024</option>
            <option value="1792x1024">1792x1024</option>
            <option value="1024x1792">1024x1792</option>
          </select></label>
          <label>Style<select id="img-style">
            <option value="vivid">Vivid</option><option value="natural">Natural</option>
          </select></label>
          <label>Quality<select id="img-quality">
            <option value="standard">Standard</option><option value="hd">HD</option>
          </select></label>
          <label>Folder<input id="img-folder" placeholder="NPCs, Scenes..." list="img-folders-dl" /><datalist id="img-folders-dl"></datalist></label>
        </div>
        <div class="dmc-form-actions">
          <button class="dmc-btn dmc-btn-primary" id="img-gen-btn" onclick="imgGenerate()">Generate</button>
          <span id="img-status" class="dmc-status-text"></span>
        </div>
        <div id="img-preview" class="img-preview" style="display:none;">
          <img id="img-preview-src" /><div class="img-preview-info">
            <p id="img-preview-prompt" class="img-p-title"></p>
            <p id="img-preview-revised" class="dmc-hint"></p>
            <div class="dmc-form-actions"><button class="dmc-btn dmc-btn-primary dmc-btn-sm" onclick="imgPublishPreview()">Publish to Art Gallery</button>
              <button class="dmc-btn dmc-btn-sm" onclick="el('img-preview').style.display='none'">Dismiss</button></div>
          </div>
        </div>
        <div class="img-folder-bar" id="img-folder-bar"><button class="dmc-btn dmc-btn-sm active" onclick="imgFilter(null,this)">All</button></div>
        <div class="img-gallery" id="img-gallery"><p class="dmc-empty">Loading...</p></div>
        <div class="img-modal" id="img-modal" style="display:none;" onclick="if(event.target===this)closeImgModal()">
          <div class="img-modal-inner">
            <img id="img-modal-src" /><div class="img-modal-info">
              <p id="img-modal-prompt" class="img-p-title"></p>
              <p id="img-modal-revised" class="dmc-hint"></p>
              <div id="img-modal-meta" class="dmc-meta"></div>
              <div class="dmc-form-row" style="margin-top:8px;">
                <label>Folder<input id="img-modal-folder" list="img-folders-dl" /></label>
                <label>Tags<input id="img-modal-tags" /></label>
              </div>
              <div class="dmc-form-actions">
                <button class="dmc-btn dmc-btn-sm" onclick="imgUpdateMeta()">Update</button>
                <button class="dmc-btn dmc-btn-sm dmc-btn-primary" onclick="imgPublishModal()">Publish</button>
                <button class="dmc-btn dmc-btn-sm dmc-btn-danger" onclick="imgDeleteModal()">Delete</button>
                <button class="dmc-btn dmc-btn-sm" onclick="closeImgModal()">Close</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ╔══ CAMPAIGN NOTEBOOK ══╗ -->
      <section class="dmc-panel" id="dmc-notes" style="display:none;">
        <div class="notebook-layout">
          <div class="nb-sidebar" id="nb-sidebar">
            <div class="nb-sidebar-hdr">
              <span style="font-weight:700;color:#c83232;font-size:0.82rem;">Campaign Notes</span>
              <div style="display:flex;gap:4px;">
                <button class="dmc-btn dmc-btn-sm" onclick="nbNewFile()" title="New File">&#128196; +</button>
                <button class="dmc-btn dmc-btn-sm" onclick="nbNewFolder()" title="New Folder">&#128193; +</button>
                <button class="dmc-btn dmc-btn-sm" onclick="nbExpandAll()" title="Expand All" style="font-size:0.65rem;">&#9662;&#9662;</button>
                <button class="dmc-btn dmc-btn-sm" onclick="nbCollapseAll()" title="Collapse All" style="font-size:0.65rem;">&#9656;&#9656;</button>
              </div>
            </div>
            <div class="nb-search-wrap">
              <input type="text" id="nb-search" class="nb-search" placeholder="Search notes..." oninput="nbFilterTree(this.value)" />
            </div>
            <div class="nb-tree" id="nb-tree"><div class="dmc-empty" style="padding:12px;">Loading...</div></div>
          </div>
          <div class="nb-main" id="nb-main">
            <div id="nb-welcome" class="nb-welcome">
              <h3 style="color:#e8b923;">&#128214; Campaign Notebook</h3>
              <p style="color:#888;margin:8px 0;">A Trilium-inspired knowledge base for your campaign.<br/>Select a note from the tree or create a new one.</p>
              <div style="color:#555;font-size:0.75rem;max-width:360px;text-align:left;line-height:1.7;">
                <div>&#128196; <strong>Markdown files</strong> stored in <code>src/hotd-campaign/notebook/</code></div>
                <div>&#9998; <strong>Rich editing</strong> &mdash; headings, bold, italic, lists, tables, code</div>
                <div>&#128247; <strong>Paste images</strong> directly into the editor (Ctrl+V)</div>
                <div>&#128190; <strong>Auto-save</strong> after 5 seconds of inactivity</div>
                <div>&#128269; <strong>Search</strong> notes by name in the sidebar</div>
              </div>
            </div>
            <div id="nb-editor-wrap" style="display:none;">
              <div class="nb-editor-bar">
                <div class="nb-breadcrumb" id="nb-breadcrumb"></div>
                <div style="display:flex;gap:6px;align-items:center;">
                  <span id="nb-save-status" style="color:#555;font-size:0.72rem;"></span>
                  <button class="dmc-btn dmc-btn-sm" onclick="nbToggleInfo()" title="Note Info &amp; Backlinks">&#9432;</button>
                  <button class="dmc-btn dmc-btn-sm" onclick="nbShowLinkMap()" title="Link Map">&#128279;</button>
                  <button class="dmc-btn dmc-btn-primary dmc-btn-sm" onclick="nbSave()">&#128190; Save</button>
                  <button class="dmc-btn dmc-btn-sm dmc-btn-danger" onclick="nbDeleteCurrent()" title="Delete this file">&#128465;</button>
                </div>
              </div>
              <div class="nb-title-wrap">
                <input type="text" id="nb-note-title" class="nb-note-title" placeholder="Note title..." />
              </div>
              <div class="nb-editor-body">
                <div class="nb-editor-area">
                  <textarea id="nb-editor"></textarea>
                </div>
                <div class="nb-right-panel" id="nb-right-panel" style="display:none;">
                  <div class="nb-rp-section">
                    <div class="nb-rp-hdr">&#128279; Backlinks</div>
                    <div id="nb-backlinks" class="nb-rp-body"><span class="nb-rp-empty">No backlinks</span></div>
                  </div>
                  <div class="nb-rp-section">
                    <div class="nb-rp-hdr">&#128196; Note Info</div>
                    <div id="nb-note-info" class="nb-rp-body"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- Right-click context menu -->
        <div id="nb-ctx-menu" class="nb-ctx-menu" style="display:none;">
          <div class="nb-ctx-item" data-action="open">&#128196; Open</div>
          <div class="nb-ctx-item" data-action="new-child">&#128196; New Note Here</div>
          <div class="nb-ctx-item" data-action="new-folder-child">&#128193; New Folder Here</div>
          <div class="nb-ctx-sep"></div>
          <div class="nb-ctx-item" data-action="rename">&#9998; Rename</div>
          <div class="nb-ctx-item nb-ctx-danger" data-action="delete">&#128465; Delete</div>
        </div>
        <!-- Link Map overlay -->
        <div id="nb-linkmap-overlay" class="nb-linkmap-overlay" style="display:none;">
          <div class="nb-linkmap-inner">
            <div class="nb-linkmap-hdr">
              <span style="color:#e8b923;font-weight:700;">&#128279; Note Link Map</span>
              <button class="dmc-btn dmc-btn-sm" onclick="nbCloseLinkMap()">Close</button>
            </div>
            <canvas id="nb-linkmap-canvas" width="900" height="600"></canvas>
          </div>
        </div>
      </section>

      <!-- ╔══ CHARACTERS ══╗ -->
      <section class="dmc-panel" id="dmc-characters" style="display:none;">
        <div class="dmc-panel-bar"><h2>Player Characters</h2>
          <div class="dmc-bar-actions"><button class="dmc-btn dmc-btn-primary dmc-btn-sm" onclick="ddbSyncAll()">Sync All from D&amp;D Beyond</button></div>
        </div>
        <div id="chars-status" class="dmc-alert" style="display:none;"></div>
        <table class="dmc-table"><thead><tr><th>ID</th><th>Character</th><th>Player</th><th>Lv</th><th>Race</th><th>Class</th><th>STR</th><th>DEX</th><th>CON</th><th>INT</th><th>WIS</th><th>CHA</th><th>AC</th><th>HP</th><th>Actions</th></tr></thead>
        <tbody id="chars-body"><tr><td colspan="15" class="dmc-empty">Loading...</td></tr></tbody></table>
        <div id="char-edit" class="dmc-edit" style="display:none;">
          <h4 id="char-edit-title">Edit Character</h4>
          <form onsubmit="saveChar(event)">
            <input type="hidden" id="char-id" />
            <div class="dmc-form-row">
              <label>Name<input id="char-name" /></label><label>Player<input id="char-player" /></label>
              <label>Level<input type="number" id="char-level" min="1" max="20" /></label><label>Race<input id="char-race" /></label>
              <label>Class<input id="char-class" /></label><label>Background<input id="char-bg" /></label>
              <label>Alignment<input id="char-align" /></label><label>DDB ID<input id="char-ddb" /></label>
            </div>
            <div class="dmc-form-row">
              <label>STR<input type="number" id="char-str" /></label><label>DEX<input type="number" id="char-dex" /></label>
              <label>CON<input type="number" id="char-con" /></label><label>INT<input type="number" id="char-int" /></label>
              <label>WIS<input type="number" id="char-wis" /></label><label>CHA<input type="number" id="char-cha" /></label>
            </div>
            <div class="dmc-form-row">
              <label>AC<input type="number" id="char-ac" /></label><label>HP<input type="number" id="char-hp" /></label>
              <label>Max HP<input type="number" id="char-maxhp" /></label><label>Speed<input type="number" id="char-speed" /></label>
            </div>
            <div class="dmc-form-actions">
              <button type="submit" class="dmc-btn dmc-btn-primary">Save</button>
              <button type="button" class="dmc-btn" onclick="el('char-edit').style.display='none'">Cancel</button>
            </div>
          </form>
        </div>
      </section>

      <!-- ╔══ NPCs ══╗ -->
      <section class="dmc-panel" id="dmc-npcs" style="display:none;">
        <div class="dmc-panel-bar"><h2>NPCs</h2>
          <div class="dmc-bar-actions">
            <input id="npc-search" placeholder="Filter NPCs..." oninput="filterNpcs()" style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:4px;padding:5px 8px;color:#ccc;font-size:0.78rem;width:180px;" />
            <button class="dmc-btn dmc-btn-primary dmc-btn-sm" onclick="newNpc()">+ Add NPC</button>
          </div>
        </div>
        <div id="npcs-status" class="dmc-alert" style="display:none;"></div>
        <table class="dmc-table"><thead><tr><th style="width:50px;"></th><th>Name</th><th>Race</th><th>Location</th><th>Status</th><th>Alignment</th><th>Hidden</th><th>Actions</th></tr></thead>
        <tbody id="npcs-body"><tr><td colspan="8" class="dmc-empty">Loading...</td></tr></tbody></table>
        <div id="npc-edit" class="dmc-edit" style="display:none;">
          <h4 id="npc-edit-title">Add NPC</h4>
          <form onsubmit="saveNpc(event)">
            <input type="hidden" id="npc-id" />
            <div class="dmc-form-row">
              <label>Name<input id="npc-name" required /></label>
              <label>Race<input id="npc-race" /></label>
              <label>Location<input id="npc-location" /></label>
            </div>
            <div class="dmc-form-row">
              <label>Status<select id="npc-status"><option value="Alive">Alive</option><option value="Dead">Dead</option><option value="Unknown">Unknown</option><option value="Missing">Missing</option></select></label>
              <label>Alignment<select id="npc-align"><option value="neutral">Neutral</option><option value="lawful good">Lawful Good</option><option value="neutral good">Neutral Good</option><option value="chaotic good">Chaotic Good</option><option value="lawful neutral">Lawful Neutral</option><option value="chaotic neutral">Chaotic Neutral</option><option value="lawful evil">Lawful Evil</option><option value="neutral evil">Neutral Evil</option><option value="chaotic evil">Chaotic Evil</option></select></label>
              <label>Sort Order<input type="number" id="npc-sort" value="0" /></label>
              <label>Hidden<select id="npc-hidden"><option value="false">Visible</option><option value="true">Hidden from Players</option></select></label>
            </div>
            <div style="display:flex;gap:12px;align-items:flex-start;">
              <div style="flex:1;"><label>Portrait URL<input id="npc-portrait" oninput="npcPreviewPortrait()" /></label></div>
              <div id="npc-portrait-preview" style="flex-shrink:0;width:80px;height:80px;border-radius:6px;border:1px solid #2a2a2a;overflow:hidden;background:#0d0d0d;display:flex;align-items:center;justify-content:center;">
                <span style="color:#555;font-size:0.7rem;">No image</span>
              </div>
            </div>
            <label>Player Description <span style="color:#555;font-size:0.7rem;">(visible to players)</span><textarea id="npc-desc" rows="4" class="dmc-textarea"></textarea></label>
            <label>DM Notes <span style="color:#c83232;font-size:0.7rem;">(DM only — motives, alliances, secrets)</span><textarea id="npc-dm-notes" rows="4" class="dmc-textarea" style="border-color:#c8323244;"></textarea></label>
            <div class="dmc-form-actions">
              <button type="submit" class="dmc-btn dmc-btn-primary">Save</button>
              <button type="button" class="dmc-btn dmc-btn-danger" id="npc-del-btn" onclick="deleteNpc()" style="display:none;">Delete</button>
              <button type="button" class="dmc-btn" onclick="el('npc-edit').style.display='none'">Cancel</button>
            </div>
          </form>
        </div>
      </section>

      <!-- ╔══ SESSIONS ══╗ -->
      <section class="dmc-panel" id="dmc-sessions" style="display:none;">
        <div class="dmc-panel-bar"><h2>Session Logs</h2>
          <div class="dmc-bar-actions"><button class="dmc-btn dmc-btn-primary dmc-btn-sm" onclick="newSession()">+ Add Session</button></div>
        </div>
        <div id="sess-status" class="dmc-alert" style="display:none;"></div>
        <table class="dmc-table"><thead><tr><th>#</th><th>Title</th><th>Game Date</th><th>Play Date</th><th>Summary</th><th>Actions</th></tr></thead>
        <tbody id="sess-body"><tr><td colspan="6" class="dmc-empty">Loading...</td></tr></tbody></table>
        <div id="sess-edit" class="dmc-edit" style="display:none;">
          <h4 id="sess-edit-title">Add Session</h4>
          <form onsubmit="saveSess(event)">
            <input type="hidden" id="sess-id" />
            <div class="dmc-form-row">
              <label>Session #<input type="number" id="sess-num" required min="1" /></label>
              <label>Title<input id="sess-title" required /></label>
              <label>Game Date<input id="sess-gamedate" placeholder="e.g. 15 Marpenoth" /></label>
              <label>Play Date<input type="date" id="sess-playdate" /></label>
            </div>
            <label>Summary<textarea id="sess-summary" rows="8" class="dmc-textarea"></textarea></label>
            <div class="dmc-form-actions">
              <button type="submit" class="dmc-btn dmc-btn-primary">Save</button>
              <button type="button" class="dmc-btn dmc-btn-danger" id="sess-del-btn" onclick="deleteSess()" style="display:none;">Delete</button>
              <button type="button" class="dmc-btn" onclick="el('sess-edit').style.display='none'">Cancel</button>
            </div>
          </form>
        </div>
      </section>

      <!-- ╔══ AI CONFIG ══╗ -->
      <section class="dmc-panel" id="dmc-ai" style="display:none;">
        <div class="dmc-panel-bar"><h2>AI Configuration</h2>
          <div class="dmc-bar-actions"><button class="dmc-btn dmc-btn-sm" onclick="window.open('/api-test/admin','_blank')">AI Test Console &#8599;</button></div>
        </div>
        <form onsubmit="saveAiCfg(event)">
          <div class="dmc-form-row">
            <label>Model<select id="ai-model"><option value="gpt-4o-mini">gpt-4o-mini</option><option value="gpt-4o">gpt-4o</option><option value="gpt-4-turbo">gpt-4-turbo</option></select></label>
            <label>Temperature<input type="number" id="ai-temp" min="0" max="2" step="0.1" value="0.7" /></label>
            <label>Max Tokens<input type="number" id="ai-maxtokens" min="100" max="4096" value="1024" /></label>
          </div>
          <label>System Prompt<textarea id="ai-prompt" rows="8" class="dmc-textarea"></textarea></label>
          <div id="ai-tools" class="dmc-tools-grid"></div>
          <div class="dmc-form-row" style="margin-top:16px;">
            <label>DALL-E Size<select id="ai-imgsize"><option value="1024x1024">1024x1024</option><option value="1792x1024">1792x1024</option><option value="1024x1792">1024x1792</option></select></label>
            <label>DALL-E Style<select id="ai-imgstyle"><option value="vivid">Vivid</option><option value="natural">Natural</option></select></label>
          </div>
          <div class="dmc-form-actions"><button type="submit" class="dmc-btn dmc-btn-primary">Save AI Config</button></div>
        </form>
      </section>

      <!-- ╔══ SEARCH CONFIG ══╗ -->
      <section class="dmc-panel" id="dmc-search" style="display:none;">
        <div class="dmc-panel-bar"><h2>Search Configuration</h2></div>
        <form onsubmit="saveSearchCfg(event)">
          <div class="dmc-form-row">
            <label>Mode<select id="srch-mode"><option value="database">Database Full-Text</option><option value="rag">RAG Semantic</option><option value="hybrid">Hybrid</option></select></label>
            <label>Min Score<input type="number" id="srch-threshold" min="0" max="100" value="50" /></label>
            <label>Max Results<input type="number" id="srch-limit" min="5" max="100" value="20" /></label>
          </div>
          <div class="dmc-form-row">
            <label>RAG Service URL<input id="srch-ragurl" placeholder="http://dnd-rag..." /></label>
            <label>RAG Status<span id="srch-rag-badge" class="dmc-badge">...</span></label>
          </div>
          <div class="dmc-form-row"><label>Test Query<input id="srch-test-q" placeholder="e.g. Vistani" /></label></div>
          <button type="button" class="dmc-btn dmc-btn-sm" onclick="testSearch()">Test</button>
          <pre id="srch-test-result" class="dmc-pre" style="display:none;"></pre>
          <div class="dmc-form-actions" style="margin-top:12px;"><button type="submit" class="dmc-btn dmc-btn-primary">Save Search Config</button></div>
        </form>
      </section>

      <!-- ╔══ CAMPAIGN DATA ══╗ -->
      <section class="dmc-panel" id="dmc-campaign" style="display:none;">
        <div class="dmc-panel-bar"><h2>Campaign Data</h2></div>
        <div class="dmc-card-grid">
          <a href="/home/admin" class="dmc-card"><span>&#127968;</span>Home<small>Next game, location</small></a>
          <a href="/calendar/admin" class="dmc-card"><span>&#128197;</span>Calendar<small>Harptos events</small></a>
          <a href="/maps/admin" class="dmc-card"><span>&#128506;</span>Maps<small>Upload/manage</small></a>
          <a href="/map/admin" class="dmc-card"><span>&#128205;</span>Markers<small>Interactive placement</small></a>
          <a href="/artifacts/admin" class="dmc-card"><span>&#128142;</span>Artifacts<small>Magic items</small></a>
          <a href="/handouts/admin" class="dmc-card"><span>&#128220;</span>Handouts<small>Documents</small></a>
          <a href="/art/admin" class="dmc-card"><span>&#127912;</span>Art<small>Gallery</small></a>
          <a href="/bulk-upload/admin" class="dmc-card"><span>&#128228;</span>Bulk Upload<small>JSON import</small></a>
        </div>
        <form onsubmit="saveCampCfg(event)" style="margin-top:20px;">
          <h4 class="dmc-section-title">Campaign Settings</h4>
          <div class="dmc-form-row">
            <label>Next Game Date<input type="datetime-local" id="camp-nextgame" /></label>
            <label>Party Location<input id="camp-location" /></label>
          </div>
          <div class="dmc-form-row">
            <label>Day<input type="number" id="camp-day" min="1" max="30" /></label>
            <label>Month<select id="camp-month"><option value="1">Hammer</option><option value="2">Alturiak</option><option value="3">Ches</option><option value="4">Tarsakh</option><option value="5">Mirtul</option><option value="6">Kythorn</option><option value="7">Flamerule</option><option value="8">Eleasis</option><option value="9">Eleint</option><option value="10">Marpenoth</option><option value="11">Uktar</option><option value="12">Nightal</option></select></label>
            <label>Year<input type="number" id="camp-year" /></label>
          </div>
          <div class="dmc-form-actions"><button type="submit" class="dmc-btn dmc-btn-primary">Save</button></div>
        </form>
      </section>

      <!-- ╔══ USERS ══╗ -->
      <section class="dmc-panel" id="dmc-users" style="display:none;">
        <div class="dmc-panel-bar"><h2>User Management</h2></div>
        <table class="dmc-table"><thead><tr><th>ID</th><th>Username</th><th>Name</th><th>Email</th><th>Role</th><th>Approved</th><th>Actions</th></tr></thead>
        <tbody id="users-body"><tr><td colspan="7" class="dmc-empty">Loading...</td></tr></tbody></table>
      </section>

    </main>
  </div>

  <style>
    /* ═══ DM COMMAND CENTER LAYOUT ═══ */
    .dmc { display:flex; min-height:calc(100vh - 60px); background:#111; }

    /* ── Sidebar ── */
    .dmc-side { width:220px; min-width:220px; background:#0d0d0d; border-right:1px solid #222; display:flex; flex-direction:column; transition:width 0.2s,min-width 0.2s; overflow:hidden; }
    .dmc-side.collapsed { width:0; min-width:0; border-right:none; }
    .dmc-side-head { display:flex; align-items:center; justify-content:space-between; padding:14px 12px; border-bottom:1px solid #222; }
    .dmc-logo { color:#c83232; font-weight:700; font-size:0.85rem; letter-spacing:0.5px; white-space:nowrap; }
    .dmc-collapse-btn { background:none; border:none; color:#666; cursor:pointer; font-size:1.1rem; padding:4px; }
    .dmc-nav { flex:1; overflow-y:auto; padding:8px 0; }
    .dmc-nav-section { margin-bottom:8px; }
    .dmc-nav-label { color:#555; font-size:0.65rem; text-transform:uppercase; letter-spacing:1px; padding:8px 16px 4px; }
    .dmc-nav-btn { display:block; width:100%; text-align:left; background:none; border:none; color:#888; padding:7px 16px; font-size:0.8rem; cursor:pointer; transition:all 0.15s; border-left:2px solid transparent; }
    .dmc-nav-btn:hover { color:#ccc; background:#1a1a1a; }
    .dmc-nav-btn.active { color:#c83232; border-left-color:#c83232; background:#1a1111; }

    /* ── Main ── */
    .dmc-main { flex:1; overflow-y:auto; padding:0; min-width:0; }
    .dmc-panel { padding:20px 24px; }
    .dmc-panel-bar { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; flex-wrap:wrap; gap:8px; }
    .dmc-panel-bar h2 { color:#c83232; margin:0; font-size:1.15rem; }
    .dmc-bar-actions { display:flex; gap:6px; }

    /* ── Buttons ── */
    .dmc-btn { background:#1e1e1e; color:#aaa; border:1px solid #333; border-radius:6px; padding:6px 14px; font-size:0.78rem; cursor:pointer; transition:all 0.15s; }
    .dmc-btn:hover { color:#fff; border-color:#666; }
    .dmc-btn-primary { background:#c83232; color:#fff; border-color:#c83232; }
    .dmc-btn-primary:hover { background:#a82828; }
    .dmc-btn-sm { padding:4px 10px; font-size:0.72rem; }
    .dmc-btn-danger { color:#f44; border-color:#f44; }
    .dmc-btn-danger:hover { background:#f44; color:#fff; }

    /* ── Forms ── */
    .dmc-form-row { display:flex; gap:12px; margin-bottom:12px; flex-wrap:wrap; }
    .dmc-form-row label { display:flex; flex-direction:column; gap:4px; color:#777; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.5px; flex:1; min-width:120px; }
    .dmc-form-row input, .dmc-form-row select { background:#0d0d0d; border:1px solid #2a2a2a; border-radius:4px; padding:7px 8px; color:#ccc; font-size:0.82rem; }
    .dmc-form-row input:focus, .dmc-form-row select:focus, .dmc-textarea:focus { border-color:#c83232; outline:none; }
    .dmc-textarea { width:100%; background:#0d0d0d; border:1px solid #2a2a2a; border-radius:4px; padding:8px; color:#ccc; font-size:0.82rem; resize:vertical; box-sizing:border-box; }
    .dmc-form-actions { display:flex; gap:8px; margin-top:8px; align-items:center; }
    .dmc-status-text { color:#888; font-size:0.78rem; }
    .dmc-hint { color:#666; font-size:0.78rem; font-style:italic; margin:0 0 8px; }
    .dmc-section-title { color:#e8b923; font-size:0.85rem; margin:0 0 10px; text-transform:uppercase; letter-spacing:0.5px; }

    /* ── Tables ── */
    .dmc-table-wrap { overflow-x:auto; }
    .dmc-table { width:100%; border-collapse:collapse; font-size:0.78rem; }
    .dmc-table th { color:#666; font-size:0.68rem; text-transform:uppercase; letter-spacing:0.5px; text-align:left; padding:8px 6px; border-bottom:2px solid #c83232; background:#111; }
    .dmc-table td { padding:6px; color:#bbb; border-bottom:1px solid #1e1e1e; }
    .dmc-table tr:hover td { background:#1a1a1a; }
    .npc-thumb { width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #2a2a2a; }
    .npc-thumb-empty { width:40px;height:40px;border-radius:50%;background:#1a1a1a;border:2px solid #2a2a2a;display:flex;align-items:center;justify-content:center;color:#555;font-size:0.7rem; }
    .dmc-empty { text-align:center; color:#555; padding:24px; font-style:italic; }

    /* ── Alerts & badges ── */
    .dmc-alert { padding:8px 12px; border-radius:6px; font-size:0.78rem; margin-bottom:12px; }
    .dmc-alert.ok { background:#16a34a22; color:#4ade80; border:1px solid #16a34a44; }
    .dmc-alert.err { background:#dc262622; color:#f87171; border:1px solid #dc262644; }
    .dmc-alert.info { background:#2563eb22; color:#60a5fa; border:1px solid #2563eb44; }
    .dmc-badge { padding:2px 8px; border-radius:10px; font-size:0.68rem; font-weight:600; background:#333; color:#888; }
    .dmc-meta { display:flex; gap:6px; flex-wrap:wrap; margin:8px 0; }
    .dmc-meta span { background:#1e1e1e; padding:2px 8px; border-radius:10px; font-size:0.7rem; color:#888; }

    /* ── Edit panels ── */
    .dmc-edit { background:#0d0d0d; border:1px solid #c83232; border-radius:8px; padding:16px; margin-top:12px; }
    .dmc-edit h4 { color:#c83232; margin:0 0 12px; }
    .dmc-pre { background:#0d0d0d; border:1px solid #222; border-radius:4px; padding:10px; font-size:0.75rem; color:#888; max-height:300px; overflow:auto; white-space:pre-wrap; margin-top:8px; }
    .dmc-card-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px; }
    .dmc-card { display:flex; flex-direction:column; background:#0d0d0d; border:1px solid #222; border-radius:6px; padding:14px; text-decoration:none; color:#bbb; transition:border-color 0.15s; }
    .dmc-card:hover { border-color:#e8b923; }
    .dmc-card span { font-size:1.3rem; margin-bottom:6px; }
    .dmc-card small { color:#555; font-size:0.7rem; }
    .dmc-tools-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:6px; margin-top:12px; }
    .dmc-tools-grid label { color:#bbb; font-size:0.78rem; display:flex; align-items:center; gap:6px; padding:6px; background:#0d0d0d; border:1px solid #222; border-radius:4px; cursor:pointer; }

    /* ═══ DM CHAT ═══ */
    .chat-layout { display:flex; height:calc(100vh - 160px); gap:0; }
    .chat-convlist { width:240px; min-width:240px; background:#0d0d0d; border-right:1px solid #222; overflow-y:auto; padding:8px; }
    .chat-conv-item { padding:8px 10px; border-radius:6px; cursor:pointer; margin-bottom:4px; font-size:0.78rem; color:#888; transition:background 0.15s; }
    .chat-conv-item:hover { background:#1a1a1a; color:#ccc; }
    .chat-conv-item.active { background:#1a1111; color:#c83232; border-left:2px solid #c83232; }
    .chat-conv-item small { display:block; color:#444; font-size:0.68rem; margin-top:2px; }
    .chat-area { flex:1; display:flex; flex-direction:column; min-width:0; }
    .chat-messages { flex:1; overflow-y:auto; padding:16px; }
    .chat-welcome { text-align:center; padding:40px 20px; }
    .chat-welcome h3 { color:#c83232; margin-bottom:8px; }
    .chat-welcome p { color:#666; font-size:0.85rem; }
    .chat-suggestions { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:16px; }
    .chat-suggestions button { background:#1e1e1e; border:1px solid #333; border-radius:16px; padding:6px 14px; color:#aaa; font-size:0.75rem; cursor:pointer; }
    .chat-suggestions button:hover { border-color:#c83232; color:#c83232; }
    .chat-msg { margin-bottom:12px; max-width:85%; }
    .chat-msg.user { margin-left:auto; }
    .chat-msg-bubble { padding:10px 14px; border-radius:12px; font-size:0.82rem; line-height:1.6; }
    .chat-msg.user .chat-msg-bubble { background:#c83232; color:#fff; border-bottom-right-radius:4px; white-space:pre-wrap; }
    .chat-msg.ai .chat-msg-bubble { background:#1e1e1e; color:#ccc; border-bottom-left-radius:4px; }
    .chat-msg.ai .chat-msg-bubble h1,.chat-msg.ai .chat-msg-bubble h2,.chat-msg.ai .chat-msg-bubble h3,.chat-msg.ai .chat-msg-bubble h4 { color:#e8b923; margin:12px 0 6px; font-size:0.95rem; }
    .chat-msg.ai .chat-msg-bubble h3 { font-size:0.88rem; } .chat-msg.ai .chat-msg-bubble h4 { font-size:0.84rem; }
    .chat-msg.ai .chat-msg-bubble p { margin:0 0 8px; }
    .chat-msg.ai .chat-msg-bubble ul,.chat-msg.ai .chat-msg-bubble ol { margin:0 0 8px; padding-left:20px; }
    .chat-msg.ai .chat-msg-bubble li { margin-bottom:3px; }
    .chat-msg.ai .chat-msg-bubble code { background:#111; padding:1px 5px; border-radius:3px; font-size:0.78rem; color:#e8b923; }
    .chat-msg.ai .chat-msg-bubble pre { background:#0a0a0a; border:1px solid #333; border-radius:6px; padding:10px; overflow-x:auto; margin:8px 0; }
    .chat-msg.ai .chat-msg-bubble pre code { background:none; padding:0; color:#bbb; }
    .chat-msg.ai .chat-msg-bubble table { border-collapse:collapse; width:100%; margin:8px 0; font-size:0.78rem; }
    .chat-msg.ai .chat-msg-bubble th { background:#1a1a1a; color:#e8b923; padding:6px 8px; text-align:left; border:1px solid #333; }
    .chat-msg.ai .chat-msg-bubble td { padding:5px 8px; border:1px solid #2a2a2a; }
    .chat-msg.ai .chat-msg-bubble blockquote { border-left:3px solid #c83232; margin:8px 0; padding:4px 12px; color:#999; }
    .chat-msg.ai .chat-msg-bubble strong { color:#fff; }
    .chat-msg.ai .chat-msg-bubble hr { border:none; border-top:1px solid #333; margin:12px 0; }
    .chat-msg.ai .chat-msg-bubble a { color:#60a5fa; }
    .chat-msg-time { font-size:0.65rem; color:#444; margin-top:2px; padding:0 4px; }
    .chat-input-bar { display:flex; gap:8px; padding:12px 16px; border-top:1px solid #222; background:#0d0d0d; }
    .chat-input-bar textarea { flex:1; background:#111; border:1px solid #2a2a2a; border-radius:8px; padding:8px 12px; color:#ccc; font-size:0.82rem; resize:none; }
    .chat-input-bar textarea:focus { border-color:#c83232; outline:none; }

    /* ═══ STORY FORGE ═══ */
    .forge-sec { }
    .forge-result { background:#0d0d0d; border:1px solid #c83232; border-radius:8px; padding:14px; margin-top:12px; }
    .forge-result-hdr { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
    .forge-result-hdr h4 { color:#c83232; margin:0; font-size:0.9rem; }
    .forge-result-meta { display:flex; gap:6px; flex-wrap:wrap; }
    .forge-result-meta span { background:#1e1e1e; padding:2px 8px; border-radius:10px; font-size:0.7rem; color:#888; }
    .forge-result-body { background:#111; border:1px solid #222; border-radius:4px; padding:14px; color:#bbb; font-size:0.82rem; line-height:1.7; }
    .forge-result-body h1,.forge-result-body h2,.forge-result-body h3,.forge-result-body h4 { color:#e8b923; margin:12px 0 6px; }
    .forge-result-body p { margin:0 0 8px; } .forge-result-body ul,.forge-result-body ol { margin:0 0 8px; padding-left:20px; }
    .forge-result-body code { background:#0a0a0a; padding:1px 5px; border-radius:3px; font-size:0.78rem; color:#e8b923; }
    .forge-result-body pre { background:#0a0a0a; border:1px solid #333; border-radius:6px; padding:10px; overflow-x:auto; margin:8px 0; }
    .forge-result-body pre code { background:none; padding:0; color:#bbb; }
    .forge-result-body table { border-collapse:collapse; width:100%; margin:8px 0; font-size:0.78rem; }
    .forge-result-body th { background:#1a1a1a; color:#e8b923; padding:6px 8px; text-align:left; border:1px solid #333; }
    .forge-result-body td { padding:5px 8px; border:1px solid #2a2a2a; }
    .forge-result-body blockquote { border-left:3px solid #c83232; margin:8px 0; padding:4px 12px; color:#999; }
    .forge-result-body strong { color:#fff; } .forge-result-body a { color:#60a5fa; }
    .forge-detail { background:#0d0d0d; border:1px solid #c83232; border-radius:8px; padding:14px; margin-top:12px; }
    .forge-lib-item { display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:#0d0d0d; border:1px solid #222; border-radius:6px; cursor:pointer; margin-bottom:6px; transition:border-color 0.15s; }
    .forge-lib-item:hover { border-color:#e8b923; }
    .forge-lib-item h5 { margin:0; color:#e8b923; font-size:0.82rem; }
    .forge-lib-item small { color:#555; font-size:0.7rem; }
    .forge-badge-draft { background:#e8b92333; color:#e8b923; padding:2px 8px; border-radius:10px; font-size:0.68rem; }
    .forge-badge-committed { background:#16a34a33; color:#4ade80; padding:2px 8px; border-radius:10px; font-size:0.68rem; }
    .forge-badge-archived { background:#33333366; color:#666; padding:2px 8px; border-radius:10px; font-size:0.68rem; }
    .forge-rag-item { background:#0d0d0d; border:1px solid #222; border-radius:4px; padding:10px; margin-bottom:6px; }
    .forge-rag-hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
    .forge-rag-hdr strong { color:#e8b923; font-size:0.78rem; }
    .forge-score { background:#c83232; color:#fff; padding:1px 6px; border-radius:8px; font-size:0.65rem; }
    .forge-rag-item p { color:#888; font-size:0.78rem; line-height:1.5; margin:0; white-space:pre-wrap; }

    /* ═══ IMAGE STUDIO ═══ */
    .img-preview { display:flex; gap:16px; background:#0d0d0d; border:1px solid #c83232; border-radius:8px; padding:12px; margin:12px 0; }
    .img-preview img { width:250px; border-radius:6px; }
    .img-preview-info { flex:1; }
    .img-p-title { color:#e8b923; font-weight:600; margin:0 0 4px; font-size:0.85rem; }
    .img-folder-bar { display:flex; gap:4px; flex-wrap:wrap; margin:12px 0; }
    .img-folder-bar .active { background:#c83232; color:#fff; border-color:#c83232; }
    .img-gallery { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:10px; }
    .img-card { background:#0d0d0d; border:1px solid #222; border-radius:6px; overflow:hidden; cursor:pointer; transition:border-color 0.15s; position:relative; }
    .img-card:hover { border-color:#e8b923; }
    .img-card img { width:100%; aspect-ratio:1; object-fit:cover; display:block; }
    .img-card-info { padding:6px 8px; }
    .img-card-info p { margin:0; font-size:0.75rem; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .img-card-info small { color:#555; font-size:0.68rem; }
    .img-card .img-pub-badge { position:absolute; top:4px; right:4px; background:#16a34a; color:#fff; font-size:0.6rem; padding:1px 5px; border-radius:8px; }
    .img-modal { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.85); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px; }
    .img-modal-inner { display:flex; gap:16px; max-width:1000px; width:100%; max-height:90vh; background:#1a1a1a; border:1px solid #333; border-radius:8px; padding:16px; overflow-y:auto; }
    .img-modal-inner img { max-width:450px; max-height:70vh; border-radius:6px; object-fit:contain; }
    .img-modal-info { flex:1; }

    /* ═══ CAMPAIGN NOTEBOOK ═══ */
    #dmc-notes { padding:0 !important; overflow:hidden; }
    .notebook-layout { display:flex; height:calc(100vh - 60px); border:1px solid #222; border-radius:8px; overflow:hidden; background:#0d0d0d; }
    .nb-sidebar { width:260px; min-width:200px; max-width:360px; border-right:1px solid #222; display:flex; flex-direction:column; background:#0a0a0a; resize:horizontal; overflow:hidden; }
    .nb-sidebar-hdr { display:flex; justify-content:space-between; align-items:center; padding:8px 10px; border-bottom:1px solid #222; }
    .nb-search-wrap { padding:6px 10px; border-bottom:1px solid #1a1a1a; }
    .nb-search { width:100%; background:#111; border:1px solid #2a2a2a; border-radius:4px; padding:5px 8px; color:#ccc; font-size:0.75rem; outline:none; }
    .nb-search:focus { border-color:#c83232; }
    .nb-tree { flex:1; overflow-y:auto; padding:4px 0; font-size:0.78rem; }
    .nb-tree-item { display:flex; align-items:center; padding:4px 8px 4px calc(8px + var(--depth,0) * 18px); cursor:pointer; color:#aaa; transition:background 0.1s; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; border-left:2px solid transparent; }
    .nb-tree-item:hover { background:#151515; color:#ccc; }
    .nb-tree-item.active { background:#1a1512; color:#e8b923; border-left-color:#c83232; }
    .nb-tree-item.nb-drag-over { background:#1a1a0a; border-left-color:#e8b923; }
    .nb-tree-item.nb-dragging { opacity:0.4; }
    .nb-drop-bar { height:2px; background:#e8b923; margin:0 8px; border-radius:2px; pointer-events:none; }
    .nb-tree-item .nb-icon { margin-right:6px; font-size:0.72rem; flex-shrink:0; }
    .nb-folder-toggle { cursor:pointer; user-select:none; margin-right:2px; font-size:0.58rem; flex-shrink:0; width:10px; text-align:center; }
    .nb-tree-actions { margin-left:auto; display:none; gap:3px; flex-shrink:0; padding-left:6px; }
    .nb-tree-item:hover .nb-tree-actions { display:flex; }
    .nb-tree-actions button { background:none; border:none; color:#555; cursor:pointer; font-size:0.65rem; padding:1px 3px; border-radius:3px; }
    .nb-tree-actions button:hover { color:#e8b923; background:#222; }
    .nb-folder-children { }
    .nb-tree-item.nb-hidden { display:none; }
    .nb-folder-children.nb-hidden { display:none; }
    .nb-main { flex:1; display:flex; flex-direction:column; overflow:hidden; }
    .nb-welcome { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#666; text-align:center; padding:32px; }
    .nb-welcome h3 { margin:0 0 8px; font-size:1.1rem; }
    .nb-welcome code { background:#1a1a1a; padding:2px 6px; border-radius:4px; font-size:0.72rem; color:#aaa; }
    .nb-editor-bar { display:flex; justify-content:space-between; align-items:center; padding:6px 12px; border-bottom:1px solid #222; min-height:36px; background:#0a0a0a; }
    .nb-breadcrumb { display:flex; align-items:center; gap:4px; font-size:0.72rem; color:#666; overflow:hidden; }
    .nb-breadcrumb span { cursor:pointer; color:#888; }
    .nb-breadcrumb span:hover { color:#e8b923; text-decoration:underline; }
    .nb-breadcrumb .nb-bc-sep { color:#333; cursor:default; }
    .nb-breadcrumb .nb-bc-sep:hover { color:#333; text-decoration:none; }
    .nb-breadcrumb .nb-bc-current { color:#e8b923; cursor:default; }
    .nb-breadcrumb .nb-bc-current:hover { text-decoration:none; }
    .nb-title-wrap { padding:8px 14px 4px; border-bottom:1px solid #1a1a1a; }
    .nb-note-title { width:100%; background:transparent; border:none; color:#e8b923; font-size:1.2rem; font-weight:700; outline:none; padding:0; font-family:inherit; }
    .nb-note-title::placeholder { color:#333; }
    #nb-editor-wrap { flex:1; display:flex; flex-direction:column; overflow:hidden; }
    #nb-editor-wrap .EasyMDEContainer { flex:1; display:flex; flex-direction:column; }
    #nb-editor-wrap .EasyMDEContainer .CodeMirror { flex:1; background:#111; color:#ccc; border:none; font-size:0.85rem; }
    #nb-editor-wrap .editor-toolbar { background:#0d0d0d; border-bottom:1px solid #222; }
    #nb-editor-wrap .editor-toolbar button { color:#999 !important; }
    #nb-editor-wrap .editor-toolbar button:hover { background:#1a1a1a !important; }
    #nb-editor-wrap .editor-toolbar button.active { background:#222 !important; color:#e8b923 !important; }
    #nb-editor-wrap .editor-preview { background:#111; color:#ccc; padding:16px; }
    #nb-editor-wrap .editor-preview h1,
    #nb-editor-wrap .editor-preview h2,
    #nb-editor-wrap .editor-preview h3 { color:#e8b923; }
    #nb-editor-wrap .editor-preview code { background:#1a1a1a; padding:2px 5px; border-radius:3px; }
    #nb-editor-wrap .editor-preview pre { background:#0d0d0d; border:1px solid #222; padding:12px; border-radius:6px; overflow-x:auto; }
    #nb-editor-wrap .editor-preview table { border-collapse:collapse; width:100%; margin:8px 0; }
    #nb-editor-wrap .editor-preview th,
    #nb-editor-wrap .editor-preview td { border:1px solid #333; padding:6px 10px; text-align:left; }
    #nb-editor-wrap .editor-preview th { background:#1a1a1a; color:#e8b923; }
    #nb-editor-wrap .editor-preview blockquote { border-left:3px solid #c83232; margin:8px 0; padding:4px 12px; color:#888; }
    #nb-editor-wrap .editor-preview img { max-width:100%; border-radius:6px; }
    #nb-editor-wrap .editor-statusbar { background:#0a0a0a; border-top:1px solid #222; color:#555; }
    /* ── Context menu ── */
    .nb-ctx-menu { position:fixed; z-index:9999; background:#1a1a1a; border:1px solid #333; border-radius:6px; padding:4px 0; min-width:180px; box-shadow:0 4px 16px rgba(0,0,0,0.5); }
    .nb-ctx-item { padding:6px 14px; font-size:0.78rem; color:#ccc; cursor:pointer; }
    .nb-ctx-item:hover { background:#222; color:#e8b923; }
    .nb-ctx-danger { color:#f44; }
    .nb-ctx-danger:hover { background:#2a1515; color:#f66; }
    .nb-ctx-sep { border-top:1px solid #2a2a2a; margin:3px 0; }
    /* ── Editor body (editor + right panel) ── */
    .nb-editor-body { flex:1; display:flex; overflow:hidden; }
    .nb-editor-area { flex:1; display:flex; flex-direction:column; overflow:hidden; }
    .nb-editor-area .EasyMDEContainer { flex:1; display:flex; flex-direction:column; }
    .nb-editor-area .EasyMDEContainer .CodeMirror { flex:1; }
    /* ── Right info panel ── */
    .nb-right-panel { width:240px; min-width:180px; border-left:1px solid #222; background:#0a0a0a; overflow-y:auto; font-size:0.75rem; }
    .nb-rp-section { border-bottom:1px solid #1a1a1a; }
    .nb-rp-hdr { padding:8px 10px; color:#c83232; font-size:0.7rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; }
    .nb-rp-body { padding:4px 10px 10px; color:#888; }
    .nb-rp-empty { color:#444; font-style:italic; }
    .nb-backlink-item { padding:4px 0; cursor:pointer; color:#888; border-bottom:1px solid #111; }
    .nb-backlink-item:hover { color:#e8b923; }
    .nb-backlink-item .nb-bl-name { color:#ccc; font-weight:600; }
    .nb-backlink-item .nb-bl-ctx { color:#555; font-size:0.68rem; display:block; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .nb-info-row { display:flex; justify-content:space-between; padding:3px 0; color:#666; }
    .nb-info-row span:last-child { color:#aaa; }
    /* ── Wiki link in preview ── */
    #nb-editor-wrap .editor-preview .wiki-link { color:#e8b923; cursor:pointer; text-decoration:underline dotted; border-bottom:none; }
    #nb-editor-wrap .editor-preview .wiki-link:hover { color:#fff; text-decoration:underline; }
    /* ── Link Map overlay ── */
    .nb-linkmap-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.85); z-index:9999; display:flex; align-items:center; justify-content:center; }
    .nb-linkmap-inner { background:#111; border:1px solid #333; border-radius:10px; width:92vw; max-width:1100px; height:75vh; display:flex; flex-direction:column; overflow:hidden; }
    .nb-linkmap-hdr { display:flex; justify-content:space-between; align-items:center; padding:10px 16px; border-bottom:1px solid #222; }
    #nb-linkmap-canvas { flex:1; width:100%; cursor:grab; }

    /* ── Responsive ── */
    @media (max-width:768px) {
      .dmc { flex-direction:column; }
      .dmc-side { width:100%; min-width:100%; border-right:none; border-bottom:1px solid #222; }
      .dmc-side.collapsed { height:0; min-height:0; }
      .dmc-nav { display:flex; flex-wrap:wrap; padding:4px 8px; }
      .dmc-nav-section { display:contents; }
      .dmc-nav-label { display:none; }
      .dmc-nav-btn { width:auto; padding:6px 10px; font-size:0.72rem; border-left:none; border-bottom:2px solid transparent; }
      .dmc-nav-btn.active { border-bottom-color:#c83232; border-left:none; }
      .chat-layout { height:calc(100vh - 200px); }
      .chat-convlist { width:100%; min-width:100%; max-height:200px; border-right:none; border-bottom:1px solid #222; }
      .chat-layout { flex-direction:column; }
      .notebook-layout { flex-direction:column; height:auto; min-height:70vh; }
      .nb-sidebar { width:100% !important; max-width:100%; min-width:100%; max-height:200px; border-right:none; border-bottom:1px solid #222; resize:none; }
      .img-preview { flex-direction:column; }
      .img-preview img { width:100%; }
      .img-modal-inner { flex-direction:column; }
      .img-modal-inner img { max-width:100%; }
    }
  </style>

  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/easymde@2.18.0/dist/easymde.min.css" />
  <script src="https://cdn.jsdelivr.net/npm/easymde@2.18.0/dist/easymde.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked@15.0.4/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.min.js"></script>
  <script>
  const el = id => document.getElementById(id);
  const esc = s => { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
  function renderMd(text) {
    if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
      try { return DOMPurify.sanitize(marked.parse(text || '')); } catch(_) {}
    }
    return esc(text);
  }

  // ═══ NAVIGATION ═══
  let _currentPanel = 'chat';
  let _loaded = {};
  function dmc(panel) {
    document.querySelectorAll('.dmc-panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.dmc-nav-btn').forEach(b => b.classList.remove('active'));
    el('dmc-' + panel).style.display = 'block';
    event.target.classList.add('active');
    _currentPanel = panel;
    if (!_loaded[panel]) { _loaded[panel] = true; loadPanel(panel); }
  }
  function loadPanel(p) {
    const loaders = { chat:loadChat, forge:loadForge, images:loadImages, notes:loadNotes,
      characters:loadChars, npcs:loadNpcs, sessions:loadSessions, ai:loadAiCfg,
      search:loadSearchCfg, campaign:loadCampCfg, users:loadUsers };
    if (loaders[p]) loaders[p]();
  }
  function toggleSidebar() {
    el('dmc-side').classList.toggle('collapsed');
  }

  // ═══ DM CHAT ═══
  let _chatConvId = null;
  let _chatMessages = [];

  async function loadChat() {
    await loadConversations();
  }

  async function loadConversations() {
    const r = await fetch('/api/dm-admin/conversations');
    const data = await r.json();
    const items = el('chat-conv-items');
    if (!data.conversations?.length) { items.innerHTML = '<p style="color:#555;font-size:0.75rem;padding:8px;">No conversations yet.</p>'; return; }
    items.innerHTML = data.conversations.map(c =>
      '<div class="chat-conv-item' + (c.id === _chatConvId ? ' active' : '') + '" onclick="openConversation(' + c.id + ')">' +
        esc(c.title) + '<small>' + c.message_count + ' msgs &middot; ' + new Date(c.updated_at).toLocaleDateString() + '</small></div>'
    ).join('');
  }

  function toggleConvList() {
    const cl = el('chat-convlist');
    cl.style.display = cl.style.display === 'none' ? 'block' : 'none';
    if (cl.style.display === 'block') loadConversations();
  }

  async function newConversation() {
    _chatConvId = null;
    _chatMessages = [];
    el('chat-messages').innerHTML = '<div class="chat-welcome"><h3>New Conversation</h3><p>Start a new chat with the DM AI.</p></div>';
  }

  async function openConversation(id) {
    _chatConvId = id;
    const r = await fetch('/api/dm-admin/conversations/' + id);
    const data = await r.json();
    if (!r.ok) return;
    _chatMessages = data.conversation.messages || [];
    renderChatMessages();
    loadConversations();
  }

  function renderChatMessages() {
    const container = el('chat-messages');
    if (!_chatMessages.length) {
      container.innerHTML = '<div class="chat-welcome"><h3>Empty conversation</h3></div>';
      return;
    }
    container.innerHTML = _chatMessages.map(m =>
      '<div class="chat-msg ' + (m.role === 'user' ? 'user' : 'ai') + '">' +
        '<div class="chat-msg-bubble">' + (m.role === 'user' ? esc(m.content) : renderMd(m.content)) + '</div>' +
        '<div class="chat-msg-time">' + (m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '') + '</div></div>'
    ).join('');
    container.scrollTop = container.scrollHeight;
  }

  function chatSend(text) {
    el('chat-input').value = text;
    chatSendInput();
  }

  async function chatSendInput() {
    const input = el('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    // Add user message
    _chatMessages.push({ role: 'user', content: text, timestamp: new Date().toISOString() });
    renderChatMessages();

    // Show typing indicator
    const msgs = el('chat-messages');
    const typing = document.createElement('div');
    typing.className = 'chat-msg ai';
    typing.innerHTML = '<div class="chat-msg-bubble" style="color:#666;">Thinking...</div>';
    msgs.appendChild(typing);
    msgs.scrollTop = msgs.scrollHeight;

    el('chat-send-btn').disabled = true;
    try {
      // Create conversation if needed
      if (!_chatConvId) {
        const title = text.substring(0, 60) + (text.length > 60 ? '...' : '');
        const cr = await fetch('/api/dm-admin/conversations', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ title, conversation_type: 'dm_chat' })
        });
        const cd = await cr.json();
        _chatConvId = cd.id;
      }

      // Send message
      const r = await fetch('/api/dm-admin/conversations/' + _chatConvId + '/message', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ message: text })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');

      _chatMessages.push({ role: 'assistant', content: data.reply, timestamp: new Date().toISOString() });
    } catch (err) {
      _chatMessages.push({ role: 'assistant', content: 'Error: ' + err.message, timestamp: new Date().toISOString() });
    }
    typing.remove();
    renderChatMessages();
    el('chat-send-btn').disabled = false;
    loadConversations();
  }

  // ═══ STORY FORGE ═══
  let _forgeContent = '', _forgeTpl = '', _forgeElId = null;
  const FORGE_HINTS = {
    npc_backstory:'Describe the NPC and what to develop. Mention related NPCs/locations.',
    magic_item:'Describe the item concept, rarity, and campaign ties.',
    spell:'Describe the spell concept, school, level, and use.',
    session_summary:'Provide session number and key events.',
    session_planning:'Describe next session goals. Mention NPCs and locations.',
    scene_description:'Describe location, time, mood, and what the party notices.',
    quest_hook:'Describe the quest concept and who gives it.',
    faction_lore:'Name the faction and what to develop.',
    freeform:'Write anything — AI uses RAG for grounding.',
  };
  function updateForgeHint() { el('forge-hint').textContent = FORGE_HINTS[el('forge-tpl').value] || ''; }
  function showForge(s) { document.querySelectorAll('.forge-sec').forEach(x => x.style.display = 'none'); el('forge-' + s).style.display = 'block'; if (s === 'lib') loadForgeLib(); }
  function loadForge() { updateForgeHint(); }

  async function forgeGen() {
    const prompt = el('forge-prompt').value.trim();
    if (!prompt) return alert('Enter a prompt');
    const tpl = el('forge-tpl').value;
    const ents = el('forge-ents').value.split(',').map(s=>s.trim()).filter(Boolean);
    el('forge-go').disabled = true;
    el('forge-status').textContent = 'Generating with RAG context...';
    try {
      const r = await fetch('/api/dm-admin/story-forge/generate', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ template:tpl, prompt, entities:ents })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      _forgeContent = d.content; _forgeTpl = tpl;
      el('forge-result-body').innerHTML = renderMd(d.content);
      el('forge-result-meta').innerHTML = esc(tpl.replace(/_/g,' ')) + ' &middot; ' + d.ragChunks + ' RAG chunks &middot; ' + d.entityLookups + ' lookups' + (d.usage ? ' &middot; ' + d.usage.total_tokens + ' tokens' : '');
      el('forge-result').style.display = 'block';
      el('forge-status').textContent = 'Done!';
      setTimeout(() => el('forge-status').textContent = '', 3000);
    } catch(e) { el('forge-status').textContent = 'Error: ' + e.message; }
    finally { el('forge-go').disabled = false; }
  }

  function forgeCopy() { navigator.clipboard.writeText(_forgeContent).then(() => alert('Copied!')); }

  async function forgeCommit() {
    const title = prompt('Title:','');
    if (!title) return;
    const ents = el('forge-ents').value.split(',').map(s=>s.trim()).filter(Boolean);
    const r = await fetch('/api/dm-admin/story-elements', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ element_type:_forgeTpl||'freeform', title, content:_forgeContent, related_entities:ents, status:'draft' })
    });
    const d = await r.json();
    alert(r.ok ? 'Saved (ID: ' + d.id + ')' : 'Error: ' + (d.error||''));
  }

  async function loadForgeLib() {
    const type = el('forge-lib-type').value;
    const st = el('forge-lib-st').value;
    let url = '/api/dm-admin/story-elements?';
    if(type) url += 'type=' + type + '&';
    if(st) url += 'status=' + st;
    const r = await fetch(url);
    const d = await r.json();
    const list = el('forge-lib-list');
    if (!d.elements?.length) { list.innerHTML = '<p class="dmc-empty">No elements yet.</p>'; return; }
    list.innerHTML = d.elements.map(e => {
      const bc = e.status==='committed'?'forge-badge-committed':e.status==='archived'?'forge-badge-archived':'forge-badge-draft';
      const rel = (typeof e.related_entities==='string'?JSON.parse(e.related_entities):e.related_entities)||[];
      return '<div class="forge-lib-item" onclick="openForgeEl('+e.id+')"><div><h5>'+esc(e.title)+'</h5><small>'+e.element_type.replace(/_/g,' ')+' &middot; '+new Date(e.updated_at).toLocaleDateString()+(rel.length?' &middot; '+rel.join(', '):'')+
        '</small></div><span class="'+bc+'">'+e.status+'</span></div>';
    }).join('');
  }

  async function openForgeEl(id) {
    _forgeElId = id;
    const r = await fetch('/api/dm-admin/story-elements/' + id);
    const d = await r.json();
    if (!r.ok) return;
    const e = d.element;
    el('forge-det-title').textContent = e.title;
    el('forge-det-body').innerHTML = renderMd(e.content);
    el('forge-det-body').dataset.raw = e.content;
    const bc = e.status==='committed'?'forge-badge-committed':e.status==='archived'?'forge-badge-archived':'forge-badge-draft';
    const rel = (typeof e.related_entities==='string'?JSON.parse(e.related_entities):e.related_entities)||[];
    el('forge-det-meta').innerHTML = '<span>'+e.element_type.replace(/_/g,' ')+'</span><span class="'+bc+'">'+e.status+'</span><span>'+new Date(e.created_at).toLocaleString()+'</span>'+(rel.length?'<span>'+rel.join(', ')+'</span>':'');
    el('forge-det-edit').style.display = 'none';
    el('forge-detail').style.display = 'block';
  }

  function forgeEdit() { el('forge-det-edit-ta').value = el('forge-det-body').dataset.raw || el('forge-det-body').textContent; el('forge-det-edit').style.display = 'block'; }
  async function forgeSaveEdit() {
    if(!_forgeElId) return;
    const r = await fetch('/api/dm-admin/story-elements/'+_forgeElId, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({content:el('forge-det-edit-ta').value})});
    if(r.ok) { const v=el('forge-det-edit-ta').value; el('forge-det-body').innerHTML=renderMd(v); el('forge-det-body').dataset.raw=v; el('forge-det-edit').style.display='none'; loadForgeLib(); }
  }
  async function forgeDel() {
    if(!_forgeElId||!confirm('Delete?')) return;
    await fetch('/api/dm-admin/story-elements/'+_forgeElId,{method:'DELETE'});
    el('forge-detail').style.display='none'; loadForgeLib();
  }
  async function forgeApply() {
    if(!_forgeElId) return;
    const ids = prompt('NPC IDs (comma separated):');
    if(!ids) return;
    const r = await fetch('/api/dm-admin/story-elements/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({element_id:_forgeElId,npc_ids:ids.split(',').map(s=>s.trim())})});
    const d = await r.json();
    alert(r.ok ? 'Applied to '+d.updated+' NPC(s)' : 'Error: '+(d.error||''));
    if(r.ok) openForgeEl(_forgeElId);
  }

  async function ragSearch() {
    const q = el('rag-q').value.trim();
    if(!q) return;
    el('rag-results').innerHTML = '<p class="dmc-empty">Searching...</p>';
    const r = await fetch('/api/dm-admin/story-forge/rag-search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q,sourceType:el('rag-type').value||undefined,minScore:parseFloat(el('rag-min').value)||0.2,limit:10})});
    const d = await r.json();
    if(!d.results?.length) { el('rag-results').innerHTML = '<p class="dmc-empty">No results.</p>'; return; }
    el('rag-results').innerHTML = d.results.map(r =>
      '<div class="forge-rag-item"><div class="forge-rag-hdr"><strong>'+esc(r.title)+'</strong><span><span class="forge-score">'+r.score+'</span> '+r.source_type+'</span></div><p>'+esc(r.chunk_text.substring(0,500))+(r.chunk_text.length>500?'...':'')+'</p></div>'
    ).join('');
  }

  // ═══ IMAGE STUDIO ═══
  let _imgFolder = null, _imgId = null, _imgPreviewId = null;
  async function loadImages() { await loadImgFolders(); await loadImgGallery(); }

  async function loadImgFolders() {
    try {
      const r = await fetch('/api/dm-admin/images/folders');
      const d = await r.json();
      const bar = el('img-folder-bar');
      const dl = el('img-folders-dl');
      bar.innerHTML = '<button class="dmc-btn dmc-btn-sm'+(!_imgFolder?' active':'')+'" onclick="imgFilter(null,this)">All</button>';
      dl.innerHTML = '';
      (d.folders||[]).forEach(f => {
        bar.innerHTML += '<button class="dmc-btn dmc-btn-sm'+(_imgFolder===f?' active':'')+'" onclick="imgFilter(\\''+esc(f)+'\\',this)">'+esc(f)+'</button>';
        dl.innerHTML += '<option value="'+esc(f)+'">';
      });
    } catch(_) {}
  }

  function imgFilter(f, btn) { _imgFolder = f; el('img-folder-bar').querySelectorAll('button').forEach(b=>b.classList.remove('active')); if(btn)btn.classList.add('active'); loadImgGallery(); }

  async function loadImgGallery() {
    const g = el('img-gallery');
    g.innerHTML = '<p class="dmc-empty">Loading...</p>';
    let url = '/api/dm-admin/images';
    if(_imgFolder) url += '?folder=' + encodeURIComponent(_imgFolder);
    const r = await fetch(url);
    const d = await r.json();
    if(!d.images?.length) { g.innerHTML = '<p class="dmc-empty">No images yet.</p>'; return; }
    g.innerHTML = d.images.map(i =>
      '<div class="img-card" onclick="openImgModal('+i.id+')" data-id="'+i.id+'">'+(i.is_published?'<span class="img-pub-badge">Published</span>':'')+
      '<img src="'+esc(i.image_url)+'" loading="lazy" /><div class="img-card-info"><p>'+esc(i.prompt)+'</p><small>'+(i.folder?esc(i.folder)+' &middot; ':'')+i.size+' &middot; '+new Date(i.created_at).toLocaleDateString()+'</small></div></div>'
    ).join('');
    window._imgData = d.images;
  }

  async function imgGenerate() {
    const prompt = el('img-prompt').value.trim();
    if(!prompt) return alert('Enter a prompt');
    el('img-gen-btn').disabled = true;
    el('img-status').textContent = 'Generating... (15-30s)';
    try {
      const tags = [];
      const r = await fetch('/api/dm-admin/images/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,size:el('img-size').value,style:el('img-style').value,quality:el('img-quality').value,folder:el('img-folder').value||null,tags})});
      const d = await r.json();
      if(!r.ok) throw new Error(d.error);
      _imgPreviewId = d.image.id;
      el('img-preview-src').src = d.image.image_url;
      el('img-preview-prompt').textContent = d.image.prompt;
      el('img-preview-revised').textContent = d.image.revised_prompt ? 'DALL-E revised: ' + d.image.revised_prompt : '';
      el('img-preview').style.display = 'flex';
      el('img-status').textContent = 'Done!';
      setTimeout(()=>el('img-status').textContent='',3000);
      await loadImgFolders(); await loadImgGallery();
    } catch(e) { el('img-status').textContent = 'Error: ' + e.message; }
    finally { el('img-gen-btn').disabled = false; }
  }

  function openImgModal(id) {
    const img = (window._imgData||[]).find(i=>i.id===id);
    if(!img) return;
    _imgId = id;
    el('img-modal-src').src = img.image_url;
    el('img-modal-prompt').textContent = img.prompt;
    el('img-modal-revised').textContent = img.revised_prompt ? 'DALL-E revised: ' + img.revised_prompt : '';
    el('img-modal-meta').innerHTML = '<span>'+img.size+'</span><span>'+img.style+'</span><span>'+img.quality+'</span><span>'+(img.folder||'Unfiled')+'</span><span>'+new Date(img.created_at).toLocaleString()+'</span>';
    el('img-modal-folder').value = img.folder||'';
    const tags = img.tags?(typeof img.tags==='string'?JSON.parse(img.tags):img.tags):[];
    el('img-modal-tags').value = tags.join(', ');
    el('img-modal').style.display = 'flex';
  }
  function closeImgModal() { el('img-modal').style.display='none'; _imgId=null; }

  async function imgUpdateMeta() {
    if(!_imgId) return;
    const r = await fetch('/api/dm-admin/images/'+_imgId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({folder:el('img-modal-folder').value||null,tags:el('img-modal-tags').value.split(',').map(s=>s.trim()).filter(Boolean)})});
    if(r.ok) { closeImgModal(); await loadImgFolders(); await loadImgGallery(); }
  }
  async function imgDeleteModal() {
    if(!_imgId||!confirm('Delete permanently?')) return;
    await fetch('/api/dm-admin/images/'+_imgId,{method:'DELETE'});
    closeImgModal(); await loadImgFolders(); await loadImgGallery();
  }
  async function imgPublishModal() {
    if(!_imgId) return;
    const img = (window._imgData||[]).find(i=>i.id===_imgId);
    const title = prompt('Title:',img?img.prompt:'');
    if(!title) return;
    const cat = prompt('Category:',img&&img.folder?img.folder:'Generated');
    const r = await fetch('/api/dm-admin/images/'+_imgId+'/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,category:cat})});
    if(r.ok) { alert('Published!'); closeImgModal(); await loadImgGallery(); }
  }
  async function imgPublishPreview() {
    if(!_imgPreviewId) return;
    const title = prompt('Title:',el('img-preview-prompt').textContent);
    if(!title) return;
    const cat = prompt('Category:','Generated');
    const r = await fetch('/api/dm-admin/images/'+_imgPreviewId+'/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,category:cat})});
    if(r.ok) { alert('Published!'); await loadImgGallery(); }
  }

  // ═══ CAMPAIGN NOTEBOOK ═══
  let _nbTree = [];
  let _nbCurrentPath = null;
  let _nbEditor = null;
  let _nbDirty = false;
  let _nbSaveTimer = null;
  let _nbInfoOpen = false;
  let _nbCtxPath = null;
  let _nbCtxType = null;
  let _nbAllFiles = []; // flat list for wiki-link autocomplete

  async function loadNotes() {
    var r = await fetch('/api/dm-admin/notebook/tree');
    var d = await r.json();
    _nbTree = d.tree || [];
    _nbAllFiles = [];
    flattenTree(_nbTree, _nbAllFiles);
    renderNbTree();
    if (_nbCurrentPath) {
      var exists = findNode(_nbTree, _nbCurrentPath);
      if (!exists) { _nbCurrentPath = null; showNbWelcome(); }
    }
  }

  function flattenTree(nodes, out) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].type === 'file') out.push(nodes[i]);
      if (nodes[i].children) flattenTree(nodes[i].children, out);
    }
  }

  function findNode(nodes, path) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].path === path) return nodes[i];
      if (nodes[i].children) { var f = findNode(nodes[i].children, path); if (f) return f; }
    }
    return null;
  }

  // ── Tree rendering with event delegation ──
  function renderNbTree() {
    var container = el('nb-tree');
    container.innerHTML = renderTreeLevel(_nbTree, 0);
    container.onclick = function(e) {
      var btn = e.target.closest('[data-action]');
      if (btn) {
        e.stopPropagation();
        var item = btn.closest('.nb-tree-item');
        var p = item ? item.dataset.path : '';
        if (btn.dataset.action === 'rename') nbRenameItem(p);
        else if (btn.dataset.action === 'delete') nbDeleteItem(p);
        else if (btn.dataset.action === 'new-child') nbNewFileIn(p);
        return;
      }
      var row = e.target.closest('.nb-tree-item');
      if (!row) return;
      if (row.dataset.type === 'folder') nbToggleFolder(row.dataset.path);
      else nbOpenFile(row.dataset.path);
    };
    // Right-click context menu
    container.oncontextmenu = function(e) {
      var row = e.target.closest('.nb-tree-item');
      if (!row) return;
      e.preventDefault();
      _nbCtxPath = row.dataset.path;
      _nbCtxType = row.dataset.type;
      var menu = el('nb-ctx-menu');
      menu.style.display = 'block';
      menu.style.left = e.clientX + 'px';
      menu.style.top = e.clientY + 'px';
    };

    // ── Drag-and-drop reordering ──
    var _dragPath = null;
    container.addEventListener('dragstart', function(e) {
      var row = e.target.closest('.nb-tree-item');
      if (!row) return;
      _dragPath = row.dataset.path;
      row.classList.add('nb-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.path);
    });
    container.addEventListener('dragend', function(e) {
      _dragPath = null;
      container.querySelectorAll('.nb-dragging').forEach(function(el) { el.classList.remove('nb-dragging'); });
      container.querySelectorAll('.nb-drag-over').forEach(function(el) { el.classList.remove('nb-drag-over'); });
    });
    container.addEventListener('dragover', function(e) {
      if (!_dragPath) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      container.querySelectorAll('.nb-drag-over').forEach(function(el) { el.classList.remove('nb-drag-over'); });
      var row = e.target.closest('.nb-tree-item');
      if (row && row.dataset.path !== _dragPath) row.classList.add('nb-drag-over');
    });
    container.addEventListener('dragleave', function(e) {
      var row = e.target.closest('.nb-tree-item');
      if (row) row.classList.remove('nb-drag-over');
    });
    container.addEventListener('drop', function(e) {
      e.preventDefault();
      container.querySelectorAll('.nb-drag-over').forEach(function(el) { el.classList.remove('nb-drag-over'); });
      if (!_dragPath) return;
      var row = e.target.closest('.nb-tree-item');
      if (!row || row.dataset.path === _dragPath) return;
      var targetPath = row.dataset.path;
      var targetType = row.dataset.type;
      nbMoveItem(_dragPath, targetPath, targetType);
      _dragPath = null;
    });
  }

  // Context menu handler
  document.addEventListener('click', function() { el('nb-ctx-menu').style.display = 'none'; });
  el('nb-ctx-menu').onclick = function(e) {
    var item = e.target.closest('.nb-ctx-item');
    if (!item || !_nbCtxPath) return;
    var action = item.dataset.action;
    if (action === 'open' && _nbCtxType === 'file') nbOpenFile(_nbCtxPath);
    else if (action === 'new-child') nbNewFileIn(_nbCtxType === 'folder' ? _nbCtxPath : '');
    else if (action === 'new-folder-child') nbNewFolderIn(_nbCtxType === 'folder' ? _nbCtxPath : '');
    else if (action === 'rename') nbRenameItem(_nbCtxPath);
    else if (action === 'delete') nbDeleteItem(_nbCtxPath);
    el('nb-ctx-menu').style.display = 'none';
  };

  function renderTreeLevel(nodes, depth) {
    return nodes.map(function(n) {
      if (n.type === 'folder') {
        var isOpen = n._open !== false;
        var arrow = isOpen ? '&#9662;' : '&#9656;';
        return '<div class="nb-tree-item" draggable="true" style="--depth:'+depth+'" data-path="'+esc(n.path)+'" data-type="folder">' +
          '<span class="nb-folder-toggle">'+arrow+'</span>' +
          '<span class="nb-icon">&#128193;</span>' +
          '<span>'+esc(n.name)+'</span>' +
          '<span class="nb-tree-actions">' +
            '<button data-action="new-child" title="New note in folder">+</button>' +
            '<button data-action="rename" title="Rename">&#9998;</button>' +
            '<button data-action="delete" title="Delete">&#128465;</button>' +
          '</span>' +
        '</div>' +
        (isOpen ? '<div class="nb-folder-children" data-folder="'+esc(n.path)+'">'+renderTreeLevel(n.children||[], depth+1)+'</div>' : '');
      } else {
        var active = n.path === _nbCurrentPath ? ' active' : '';
        var name = n.name.replace(/\\.md$/i, '');
        return '<div class="nb-tree-item'+active+'" draggable="true" style="--depth:'+depth+'" data-path="'+esc(n.path)+'" data-type="file">' +
          '<span class="nb-icon">&#128196;</span>' +
          '<span>'+esc(name)+'</span>' +
          '<span class="nb-tree-actions">' +
            '<button data-action="rename" title="Rename">&#9998;</button>' +
            '<button data-action="delete" title="Delete">&#128465;</button>' +
          '</span>' +
        '</div>';
      }
    }).join('');
  }

  function nbToggleFolder(path) {
    var node = findNode(_nbTree, path);
    if (node) { node._open = node._open === false ? true : false; renderNbTree(); }
  }

  function nbExpandAll() { setAllOpen(_nbTree, true); renderNbTree(); }
  function nbCollapseAll() { setAllOpen(_nbTree, false); renderNbTree(); }
  function setAllOpen(nodes, open) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].type === 'folder') { nodes[i]._open = open; if (nodes[i].children) setAllOpen(nodes[i].children, open); }
    }
  }

  // ── Search / filter tree ──
  function nbFilterTree(query) {
    var q = query.toLowerCase().trim();
    var items = el('nb-tree').querySelectorAll('.nb-tree-item');
    var folders = el('nb-tree').querySelectorAll('.nb-folder-children');
    if (!q) {
      items.forEach(function(el) { el.classList.remove('nb-hidden'); });
      folders.forEach(function(el) { el.classList.remove('nb-hidden'); });
      return;
    }
    // Show files matching, hide others; always show folders that contain matches
    items.forEach(function(el) {
      if (el.dataset.type === 'file') {
        var name = (el.dataset.path || '').toLowerCase();
        el.classList.toggle('nb-hidden', name.indexOf(q) === -1);
      }
    });
    // Show parent folders of visible files
    folders.forEach(function(el) {
      var hasVisible = el.querySelector('.nb-tree-item:not(.nb-hidden)[data-type="file"]');
      el.classList.toggle('nb-hidden', !hasVisible);
    });
    items.forEach(function(el) {
      if (el.dataset.type === 'folder') {
        var next = el.nextElementSibling;
        el.classList.toggle('nb-hidden', next && next.classList.contains('nb-hidden'));
      }
    });
  }

  // ── Breadcrumb ──
  function renderBreadcrumb(path) {
    var parts = path.split('/');
    var bc = el('nb-breadcrumb');
    var html = '<span class="nb-bc-sep">&#128214;</span>';
    var cumulative = '';
    for (var i = 0; i < parts.length; i++) {
      if (i > 0) cumulative += '/';
      cumulative += parts[i];
      var label = parts[i].replace(/\\.md$/i, '');
      if (i < parts.length - 1) {
        html += ' <span class="nb-bc-sep">/</span> <span data-path="'+esc(cumulative)+'">'+esc(label)+'</span>';
      } else {
        html += ' <span class="nb-bc-sep">/</span> <span class="nb-bc-current">'+esc(label)+'</span>';
      }
    }
    bc.innerHTML = html;
    bc.onclick = function(e) {
      var sp = e.target.closest('[data-path]');
      if (sp) {
        var node = findNode(_nbTree, sp.dataset.path);
        if (node && node.type === 'file') nbOpenFile(sp.dataset.path);
      }
    };
  }

  // ── Open file (with title, breadcrumb, backlinks) ──
  async function nbOpenFile(path) {
    if (_nbDirty && _nbCurrentPath) {
      await nbSave(true);
    }
    _nbCurrentPath = path;
    el('nb-welcome').style.display = 'none';
    el('nb-editor-wrap').style.display = 'flex';
    el('nb-save-status').textContent = 'Loading...';
    renderBreadcrumb(path);

    // Set title from filename
    var titleName = path.split('/').pop().replace(/\\.md$/i, '').replace(/[-_]/g, ' ');
    el('nb-note-title').value = titleName;

    var r = await fetch('/api/dm-admin/notebook/read?path=' + encodeURIComponent(path));
    var d = await r.json();
    if (!r.ok) { el('nb-save-status').textContent = 'Error: ' + (d.error||''); return; }

    if (!_nbEditor) {
      _nbEditor = new EasyMDE({
        element: document.getElementById('nb-editor'),
        spellChecker: false,
        autofocus: true,
        status: ['lines', 'words', 'cursor'],
        toolbar: ['bold','italic','heading','|','quote','unordered-list','ordered-list','|','link','image','table','horizontal-rule','|','preview','side-by-side','fullscreen','|','guide'],
        previewRender: function(text) {
          // Render [[wiki links]] as clickable spans
          var processed = text.replace(/\\[\\[([^\\]]+)\\]\\]/g, function(m, name) {
            return '<span class="wiki-link" data-note="'+name+'">'+name+'</span>';
          });
          return DOMPurify.sanitize(marked.parse(processed));
        },
        sideBySideFullscreen: false,
        minHeight: '200px',
      });
      _nbEditor.codemirror.on('change', function() {
        _nbDirty = true;
        el('nb-save-status').textContent = 'Unsaved changes';
        el('nb-save-status').style.color = '#e8b923';
        clearTimeout(_nbSaveTimer);
        _nbSaveTimer = setTimeout(function() { nbSave(true); }, 5000);
      });
      // Image paste handler
      _nbEditor.codemirror.on('paste', function(cm, e) {
        var items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (var i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            e.preventDefault();
            var file = items[i].getAsFile();
            nbUploadImage(file, cm);
            return;
          }
        }
      });
      // Image drop handler
      _nbEditor.codemirror.on('drop', function(cm, e) {
        var files = e.dataTransfer.files;
        for (var i = 0; i < files.length; i++) {
          if (files[i].type.indexOf('image') !== -1) {
            e.preventDefault();
            nbUploadImage(files[i], cm);
            return;
          }
        }
      });
      // Wiki-link click in preview
      document.querySelector('.editor-preview')?.addEventListener('click', function(e) {
        var wl = e.target.closest('.wiki-link');
        if (!wl) return;
        var noteName = wl.dataset.note;
        var target = _nbAllFiles.find(function(f) {
          return f.name.replace(/\\.md$/i, '').toLowerCase() === noteName.toLowerCase();
        });
        if (target) nbOpenFile(target.path);
        else alert('Note not found: ' + noteName);
      });
    }

    _nbEditor.value(d.content || '');
    _nbDirty = false;
    el('nb-save-status').textContent = 'Saved';
    el('nb-save-status').style.color = '#555';
    renderNbTree();

    // Load backlinks and note info
    nbLoadBacklinks(path);
    nbLoadNoteInfo(d.content || '');
  }

  // ── Backlinks ──
  async function nbLoadBacklinks(path) {
    var bl = el('nb-backlinks');
    bl.innerHTML = '<span class="nb-rp-empty">Loading...</span>';
    try {
      var r = await fetch('/api/dm-admin/notebook/backlinks?path=' + encodeURIComponent(path));
      var d = await r.json();
      if (!d.backlinks || !d.backlinks.length) {
        bl.innerHTML = '<span class="nb-rp-empty">No other notes link here</span>';
        return;
      }
      bl.innerHTML = d.backlinks.map(function(b) {
        return '<div class="nb-backlink-item" data-path="'+esc(b.path)+'">' +
          '<span class="nb-bl-name">'+esc(b.name)+'</span>' +
          '<span class="nb-bl-ctx">'+esc(b.context)+'</span>' +
        '</div>';
      }).join('');
      bl.onclick = function(e) {
        var item = e.target.closest('.nb-backlink-item');
        if (item) nbOpenFile(item.dataset.path);
      };
    } catch (_) {
      bl.innerHTML = '<span class="nb-rp-empty">Error loading backlinks</span>';
    }
  }

  // ── Note info ──
  function nbLoadNoteInfo(content) {
    var words = content.trim() ? content.trim().split(/\\s+/).length : 0;
    var lines = content.split('\\n').length;
    var links = (content.match(/\\[\\[([^\\]]+)\\]\\]/g) || []).length;
    var images = (content.match(/!\\[/g) || []).length;
    el('nb-note-info').innerHTML =
      '<div class="nb-info-row"><span>Words</span><span>'+words+'</span></div>' +
      '<div class="nb-info-row"><span>Lines</span><span>'+lines+'</span></div>' +
      '<div class="nb-info-row"><span>Wiki Links</span><span>'+links+'</span></div>' +
      '<div class="nb-info-row"><span>Images</span><span>'+images+'</span></div>' +
      '<div class="nb-info-row"><span>Path</span><span style="font-size:0.65rem;">'+esc(_nbCurrentPath)+'</span></div>';
  }

  function nbToggleInfo() {
    _nbInfoOpen = !_nbInfoOpen;
    el('nb-right-panel').style.display = _nbInfoOpen ? 'block' : 'none';
  }

  // ── Link Map (force-directed graph) ──
  var _nbLinkMapData = null;
  async function nbShowLinkMap() {
    el('nb-linkmap-overlay').style.display = 'flex';
    try {
      var r = await fetch('/api/dm-admin/notebook/link-map');
      _nbLinkMapData = await r.json();
      nbDrawLinkMap();
    } catch (_) {}
  }
  function nbCloseLinkMap() {
    el('nb-linkmap-overlay').style.display = 'none';
  }
  function nbDrawLinkMap() {
    var data = _nbLinkMapData;
    if (!data) return;
    var canvas = el('nb-linkmap-canvas');
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height - 50;
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var nodes = data.nodes.map(function(n, i) {
      return { id: n.id, label: n.label, x: W/2 + (Math.random()-0.5)*W*0.6, y: H/2 + (Math.random()-0.5)*H*0.6, vx: 0, vy: 0, active: n.id === _nbCurrentPath };
    });
    var nodeMap = {};
    nodes.forEach(function(n) { nodeMap[n.id] = n; });
    var edges = data.edges.filter(function(e) { return nodeMap[e.source] && nodeMap[e.target]; });

    // Simple force simulation (60 iterations)
    for (var iter = 0; iter < 80; iter++) {
      // Repulsion between all nodes
      for (var i = 0; i < nodes.length; i++) {
        for (var j = i+1; j < nodes.length; j++) {
          var dx = nodes[j].x - nodes[i].x;
          var dy = nodes[j].y - nodes[i].y;
          var dist = Math.sqrt(dx*dx + dy*dy) || 1;
          var force = 5000 / (dist * dist);
          nodes[i].vx -= dx/dist * force;
          nodes[i].vy -= dy/dist * force;
          nodes[j].vx += dx/dist * force;
          nodes[j].vy += dy/dist * force;
        }
      }
      // Attraction along edges
      for (var e = 0; e < edges.length; e++) {
        var s = nodeMap[edges[e].source], t = nodeMap[edges[e].target];
        if (!s || !t) continue;
        var dx = t.x - s.x, dy = t.y - s.y;
        var dist = Math.sqrt(dx*dx + dy*dy) || 1;
        var force = (dist - 120) * 0.02;
        s.vx += dx/dist * force;
        s.vy += dy/dist * force;
        t.vx -= dx/dist * force;
        t.vy -= dy/dist * force;
      }
      // Center gravity
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].vx += (W/2 - nodes[i].x) * 0.005;
        nodes[i].vy += (H/2 - nodes[i].y) * 0.005;
        nodes[i].vx *= 0.85;
        nodes[i].vy *= 0.85;
        nodes[i].x += nodes[i].vx;
        nodes[i].y += nodes[i].vy;
        nodes[i].x = Math.max(40, Math.min(W-40, nodes[i].x));
        nodes[i].y = Math.max(30, Math.min(H-30, nodes[i].y));
      }
    }

    // Draw
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);
    // Edges
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (var e = 0; e < edges.length; e++) {
      var s = nodeMap[edges[e].source], t = nodeMap[edges[e].target];
      if (!s || !t) continue;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
      // Arrow
      var angle = Math.atan2(t.y - s.y, t.x - s.x);
      var ax = t.x - Math.cos(angle)*14, ay = t.y - Math.sin(angle)*14;
      ctx.fillStyle = '#555';
      ctx.beginPath();
      ctx.moveTo(ax + Math.cos(angle)*8, ay + Math.sin(angle)*8);
      ctx.lineTo(ax + Math.cos(angle+2.5)*6, ay + Math.sin(angle+2.5)*6);
      ctx.lineTo(ax + Math.cos(angle-2.5)*6, ay + Math.sin(angle-2.5)*6);
      ctx.fill();
    }
    // Nodes
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      ctx.fillStyle = n.active ? '#c83232' : '#1a1a1a';
      ctx.strokeStyle = n.active ? '#e8b923' : '#444';
      ctx.lineWidth = n.active ? 2 : 1;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 10, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = n.active ? '#e8b923' : '#aaa';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(n.label, n.x, n.y + 22);
    }
    // Click to navigate
    canvas.onclick = function(e) {
      var cr = canvas.getBoundingClientRect();
      var mx = e.clientX - cr.left, my = e.clientY - cr.top;
      for (var i = 0; i < nodes.length; i++) {
        var dx = mx - nodes[i].x, dy = my - nodes[i].y;
        if (dx*dx + dy*dy < 200) {
          nbCloseLinkMap();
          nbOpenFile(nodes[i].id);
          return;
        }
      }
    };
  }

  async function nbUploadImage(file, cm) {
    el('nb-save-status').textContent = 'Uploading image...';
    var fd = new FormData();
    fd.append('image', file, file.name);
    var uploadUrl = '/api/dm-admin/notebook/upload-image';
    if (_nbCurrentPath) uploadUrl += '?notePath=' + encodeURIComponent(_nbCurrentPath);
    var r = await fetch(uploadUrl, { method:'POST', body:fd });
    var d = await r.json();
    if (r.ok && d.url) {
      var cursor = cm.getCursor();
      cm.replaceRange('![image](' + d.url + ')\\n', cursor);
      el('nb-save-status').textContent = 'Image inserted';
    } else {
      el('nb-save-status').textContent = 'Upload failed';
    }
  }

  function showNbWelcome() {
    el('nb-welcome').style.display = 'flex';
    el('nb-editor-wrap').style.display = 'none';
  }

  function nbDeleteCurrent() {
    if (_nbCurrentPath) nbDeleteItem(_nbCurrentPath);
  }

  async function nbSave(silent) {
    if (!_nbCurrentPath || !_nbEditor) return;
    var content = _nbEditor.value();
    // Check if title changed (rename the file)
    var currentName = _nbCurrentPath.split('/').pop().replace(/\\.md$/i, '').replace(/[-_]/g, ' ');
    var newTitle = el('nb-note-title').value.trim();
    if (newTitle && newTitle !== currentName) {
      var dir = _nbCurrentPath.substring(0, _nbCurrentPath.lastIndexOf('/'));
      var newFileName = newTitle.replace(/\\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') + '.md';
      var newPath = dir ? dir + '/' + newFileName : newFileName;
      if (newPath !== _nbCurrentPath) {
        var rr = await fetch('/api/dm-admin/notebook/rename', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({oldPath:_nbCurrentPath, newPath:newPath}) });
        if (rr.ok) {
          _nbCurrentPath = newPath;
          renderBreadcrumb(newPath);
          await loadNotes();
        }
      }
    }
    el('nb-save-status').textContent = 'Saving...';
    el('nb-save-status').style.color = '#888';
    var r = await fetch('/api/dm-admin/notebook/write', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:_nbCurrentPath, content:content}) });
    if (r.ok) {
      _nbDirty = false;
      el('nb-save-status').textContent = 'Saved';
      el('nb-save-status').style.color = '#4ade80';
      setTimeout(function() { el('nb-save-status').style.color = '#555'; el('nb-save-status').textContent = 'Saved'; }, 2000);
    } else {
      var d = await r.json();
      el('nb-save-status').textContent = 'Save failed: ' + (d.error||'');
      el('nb-save-status').style.color = '#f44';
    }
  }

  async function nbNewFile() { nbNewFileIn(''); }
  async function nbNewFileIn(folder) {
    var name = prompt('New note name (e.g. session-12):');
    if (!name) return;
    if (!name.endsWith('.md')) name += '.md';
    var fullPath = folder ? folder + '/' + name : name;
    var title = name.replace(/\\.md$/i, '').replace(/[-_]/g, ' ');
    var r = await fetch('/api/dm-admin/notebook/create', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:fullPath, type:'file', content:'# ' + title + '\\n\\n'}) });
    if (r.ok) { await loadNotes(); nbOpenFile(fullPath); }
    else { var d = await r.json(); alert('Error: '+(d.error||'')); }
  }

  async function nbNewFolder() { nbNewFolderIn(''); }
  async function nbNewFolderIn(parentFolder) {
    var name = prompt('Folder name:');
    if (!name) return;
    var fullPath = parentFolder ? parentFolder + '/' + name : name;
    var r = await fetch('/api/dm-admin/notebook/create', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:fullPath, type:'folder'}) });
    if (r.ok) { await loadNotes(); }
    else { var d = await r.json(); alert('Error: '+(d.error||'')); }
  }

  async function nbDeleteItem(path) {
    if (!confirm('Delete ' + path + '?')) return;
    var r = await fetch('/api/dm-admin/notebook/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:path}) });
    if (r.ok) {
      if (_nbCurrentPath === path) { _nbCurrentPath = null; _nbDirty = false; showNbWelcome(); }
      await loadNotes();
    } else { var d = await r.json(); alert('Error: '+(d.error||'')); }
  }

  async function nbRenameItem(path) {
    var newName = prompt('New name:', path);
    if (!newName || newName === path) return;
    var r = await fetch('/api/dm-admin/notebook/rename', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({oldPath:path, newPath:newName}) });
    if (r.ok) {
      if (_nbCurrentPath === path) { _nbCurrentPath = newName; renderBreadcrumb(newName); }
      await loadNotes();
    } else { var d = await r.json(); alert('Error: '+(d.error||'')); }
  }

  async function nbMoveItem(srcPath, targetPath, targetType) {
    // Determine destination: if target is a folder, move into it; if file, move to same folder
    var fileName = srcPath.split('/').pop();
    var destFolder = targetType === 'folder' ? targetPath : targetPath.substring(0, targetPath.lastIndexOf('/'));
    var newPath = destFolder ? destFolder + '/' + fileName : fileName;
    if (newPath === srcPath) return;
    // Prevent moving a folder into itself
    if (newPath.startsWith(srcPath + '/')) return;
    var r = await fetch('/api/dm-admin/notebook/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: srcPath, newPath: newPath })
    });
    if (r.ok) {
      if (_nbCurrentPath === srcPath) { _nbCurrentPath = newPath; renderBreadcrumb(newPath); }
      await loadNotes();
    } else { var d = await r.json(); alert('Move failed: ' + (d.error || '')); }
  }

  // ═══ CHARACTERS ═══
  let _charsCache = [];
  async function loadChars() {
    const r = await fetch('/api/dm-admin/characters');
    const d = await r.json();
    _charsCache = d.characters || [];
    const tb = el('chars-body');
    if(!_charsCache.length) { tb.innerHTML='<tr><td colspan="15" class="dmc-empty">No characters.</td></tr>'; return; }
    tb.innerHTML = _charsCache.map(c => '<tr><td>'+c.id+'</td><td style="color:#e8b923;font-weight:600;">'+esc(c.character_name)+'</td>'+
      '<td>'+esc(c.player_name)+'</td><td>'+c.level+'</td><td>'+esc(c.race)+'</td><td style="font-size:0.72rem;">'+esc(c.class_summary)+'</td>'+
      '<td>'+c.strength+'</td><td>'+c.dexterity+'</td><td>'+c.constitution+'</td><td>'+c.intelligence+'</td><td>'+c.wisdom+'</td><td>'+c.charisma+'</td>'+
      '<td>'+c.armor_class+'</td><td>'+c.hit_points+'/'+c.max_hit_points+'</td>'+
      '<td><button class="dmc-btn dmc-btn-sm" onclick="editChar('+c.id+')">Edit</button> '+(c.ddb_character_id?'<button class="dmc-btn dmc-btn-sm" onclick="ddbSync('+c.id+')">Sync</button>':'')+
      '</td></tr>').join('');
  }

  function editChar(id) {
    const c = _charsCache.find(x=>x.id===id);
    if(!c) return;
    el('char-edit').style.display = 'block';
    el('char-edit-title').textContent = 'Edit: ' + c.character_name;
    el('char-id').value = c.id;
    el('char-name').value=c.character_name||''; el('char-player').value=c.player_name||''; el('char-level').value=c.level||1;
    el('char-race').value=c.race||''; el('char-class').value=c.class_summary||''; el('char-bg').value=c.background||'';
    el('char-align').value=c.alignment||''; el('char-ddb').value=c.ddb_character_id||'';
    el('char-str').value=c.strength; el('char-dex').value=c.dexterity; el('char-con').value=c.constitution;
    el('char-int').value=c.intelligence; el('char-wis').value=c.wisdom; el('char-cha').value=c.charisma;
    el('char-ac').value=c.armor_class; el('char-hp').value=c.hit_points; el('char-maxhp').value=c.max_hit_points; el('char-speed').value=c.speed;
  }

  async function saveChar(e) {
    e.preventDefault();
    const id = el('char-id').value;
    const body = {
      character_name:el('char-name').value, player_name:el('char-player').value, level:+el('char-level').value,
      race:el('char-race').value, class_summary:el('char-class').value, background:el('char-bg').value,
      alignment:el('char-align').value, ddb_character_id:el('char-ddb').value||null,
      strength:+el('char-str').value, dexterity:+el('char-dex').value, constitution:+el('char-con').value,
      intelligence:+el('char-int').value, wisdom:+el('char-wis').value, charisma:+el('char-cha').value,
      armor_class:+el('char-ac').value, hit_points:+el('char-hp').value, max_hit_points:+el('char-maxhp').value, speed:+el('char-speed').value,
    };
    const r = await fetch('/api/dm-admin/characters/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const st = el('chars-status');
    if(r.ok) { showAlert(st,'Saved.','ok'); el('char-edit').style.display='none'; loadChars(); }
    else { const d=await r.json(); showAlert(st,'Error: '+(d.error||''),'err'); }
  }

  async function ddbSync(id) {
    const st = el('chars-status');
    showAlert(st,'Syncing...','info');
    const r = await fetch('/api/dm-admin/characters/'+id+'/sync',{method:'POST'});
    const d = await r.json();
    if(r.ok) { showAlert(st,d.message||'Synced','ok'); loadChars(); }
    else showAlert(st,'Failed: '+(d.error||''),'err');
  }
  async function ddbSyncAll() {
    const st = el('chars-status');
    showAlert(st,'Syncing all...','info');
    const r = await fetch('/api/dm-admin/characters/sync-all',{method:'POST'});
    const d = await r.json();
    if(r.ok) { showAlert(st,d.message||'Done','ok'); loadChars(); }
    else showAlert(st,'Failed: '+(d.error||''),'err');
  }

  function showAlert(el,msg,type) { el.style.display='block'; el.className='dmc-alert '+type; el.textContent=msg; if(type==='ok')setTimeout(()=>el.style.display='none',4000); }

  // ═══ NPCs ═══
  let _npcsCache = [];
  async function loadNpcs() {
    const r = await fetch('/api/dm-admin/npcs');
    const d = await r.json();
    _npcsCache = d.npcs || [];
    renderNpcs(_npcsCache);
  }
  function renderNpcs(list) {
    el('npcs-body').innerHTML = list.map(n =>
      '<tr><td style="width:50px;padding:4px;">'+( n.portrait_url ? '<img src="'+esc(n.portrait_url)+'" class="npc-thumb" />' : '<div class="npc-thumb-empty">?</div>')+'</td>'+
      '<td><a href="/npcs/'+n.id+'" target="_blank" style="color:#e8b923;font-weight:600;text-decoration:none;">'+esc(n.name)+'</a></td><td>'+esc(n.race||'')+'</td>'+
      '<td>'+esc(n.location||'')+'</td><td>'+esc(n.status||'')+'</td><td>'+esc(n.alignment_tag||'')+'</td><td>'+(n.is_hidden?'&#128065;':'')+
      '</td><td><button class="dmc-btn dmc-btn-sm" onclick="editNpc('+n.id+')">Edit</button> <button class="dmc-btn dmc-btn-sm dmc-btn-danger" onclick="deleteNpcDirect('+n.id+')">Del</button></td></tr>'
    ).join('') || '<tr><td colspan="8" class="dmc-empty">No NPCs.</td></tr>';
    document.querySelectorAll('.npc-thumb').forEach(function(img) { img.onerror = function() { this.style.display = 'none'; }; });
  }
  function filterNpcs() {
    const q = el('npc-search').value.toLowerCase();
    if (!q) return renderNpcs(_npcsCache);
    renderNpcs(_npcsCache.filter(n => (n.name+' '+n.race+' '+n.location+' '+n.npc_class).toLowerCase().includes(q)));
  }
  function newNpc() {
    el('npc-id').value = ''; el('npc-name').value = ''; el('npc-race').value = '';
    el('npc-location').value = ''; el('npc-status').value = 'Alive'; el('npc-align').value = 'neutral';
    el('npc-sort').value = '0'; el('npc-hidden').value = 'false'; el('npc-portrait').value = ''; el('npc-desc').value = ''; el('npc-dm-notes').value = '';
    npcPreviewPortrait();
    el('npc-edit-title').textContent = 'Add NPC'; el('npc-del-btn').style.display = 'none';
    el('npc-edit').style.display = 'block';
    el('npc-edit').scrollIntoView({behavior:'smooth'});
  }
  function npcPreviewPortrait() {
    const url = el('npc-portrait').value.trim();
    const box = el('npc-portrait-preview');
    if (url) {
      box.innerHTML = '';
      var img = document.createElement('img');
      img.src = url;
      img.style.cssText = 'width:80px;height:80px;object-fit:cover;';
      img.onerror = function() { box.innerHTML = '<span style="color:#f55;font-size:0.7rem;">Invalid</span>'; };
      box.appendChild(img);
    } else {
      box.innerHTML = '<span style="color:#555;font-size:0.7rem;">No image</span>';
    }
  }
  function editNpc(id) {
    const n = _npcsCache.find(x=>x.id===id);
    if (!n) return;
    el('npc-id').value = n.id; el('npc-name').value = n.name||''; el('npc-race').value = n.race||'';
    el('npc-location').value = n.location||'';
    el('npc-status').value = n.status||'Unknown'; el('npc-align').value = n.alignment_tag||'neutral';
    el('npc-sort').value = n.sort_order||0; el('npc-hidden').value = n.is_hidden?'true':'false';
    el('npc-portrait').value = n.portrait_url||''; el('npc-desc').value = n.description||''; el('npc-dm-notes').value = n.dm_notes||'';
    npcPreviewPortrait();
    el('npc-edit-title').textContent = 'Edit: ' + n.name; el('npc-del-btn').style.display = 'inline-block';
    el('npc-edit').style.display = 'block';
    el('npc-edit').scrollIntoView({behavior:'smooth'});
  }
  async function saveNpc(e) {
    e.preventDefault();
    const id = el('npc-id').value;
    const body = { name:el('npc-name').value, race:el('npc-race').value, npc_class:'',
      location:el('npc-location').value, status:el('npc-status').value, alignment_tag:el('npc-align').value,
      portrait_url:el('npc-portrait').value, description:el('npc-desc').value, dm_notes:el('npc-dm-notes').value,
      sort_order:+el('npc-sort').value, is_hidden:el('npc-hidden').value==='true' };
    const url = id ? '/api/dm-admin/npcs/'+id : '/api/dm-admin/npcs';
    const method = id ? 'PUT' : 'POST';
    const r = await fetch(url, {method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
    if (r.ok) { showAlert(el('npcs-status'),id?'NPC updated.':'NPC created.','ok'); el('npc-edit').style.display='none'; loadNpcs(); }
    else { const d=await r.json(); showAlert(el('npcs-status'),'Error: '+(d.error||''),'err'); }
  }
  async function deleteNpc() {
    const id = el('npc-id').value;
    if (!id || !confirm('Delete this NPC?')) return;
    await fetch('/api/dm-admin/npcs/'+id,{method:'DELETE'});
    el('npc-edit').style.display='none'; loadNpcs();
  }
  async function deleteNpcDirect(id) {
    var npc = _npcsCache.find(function(x){return x.id===id;});
    var name = npc ? npc.name : 'this NPC';
    if (!confirm('Delete NPC: '+name+'?')) return;
    await fetch('/api/dm-admin/npcs/'+id,{method:'DELETE'});
    loadNpcs();
  }

  // ═══ SESSIONS ═══
  let _sessCache = [];
  async function loadSessions() {
    const r = await fetch('/api/dm-admin/sessions');
    const d = await r.json();
    _sessCache = d.sessions || [];
    el('sess-body').innerHTML = _sessCache.map(s =>
      '<tr><td>'+s.session_number+'</td><td style="color:#e8b923;font-weight:600;">'+esc(s.title)+'</td><td>'+esc(s.game_date||'')+'</td><td>'+esc(s.play_date||'')+'</td>'+
      '<td style="font-size:0.72rem;">'+esc((s.summary||'').substring(0,150))+(s.summary?.length>150?'...':'')+'</td>'+
      '<td><button class="dmc-btn dmc-btn-sm" onclick="editSess('+s.id+')">Edit</button> <button class="dmc-btn dmc-btn-sm dmc-btn-danger" onclick="deleteSessDirect('+s.id+')">Del</button></td></tr>'
    ).join('') || '<tr><td colspan="6" class="dmc-empty">No sessions.</td></tr>';
  }
  function newSession() {
    el('sess-id').value = ''; el('sess-num').value = ''; el('sess-title').value = '';
    el('sess-gamedate').value = ''; el('sess-playdate').value = ''; el('sess-summary').value = '';
    el('sess-edit-title').textContent = 'Add Session'; el('sess-del-btn').style.display = 'none';
    el('sess-edit').style.display = 'block';
    el('sess-edit').scrollIntoView({behavior:'smooth'});
  }
  function editSess(id) {
    const s = _sessCache.find(x=>x.id===id);
    if (!s) return;
    el('sess-id').value = s.id; el('sess-num').value = s.session_number;
    el('sess-title').value = s.title||''; el('sess-gamedate').value = s.game_date||'';
    el('sess-playdate').value = s.play_date||''; el('sess-summary').value = s.summary||'';
    el('sess-edit-title').textContent = 'Edit: Session '+s.session_number; el('sess-del-btn').style.display = 'inline-block';
    el('sess-edit').style.display = 'block';
    el('sess-edit').scrollIntoView({behavior:'smooth'});
  }
  async function saveSess(e) {
    e.preventDefault();
    const id = el('sess-id').value;
    const body = { session_number:+el('sess-num').value, title:el('sess-title').value,
      summary:el('sess-summary').value, game_date:el('sess-gamedate').value, play_date:el('sess-playdate').value||null };
    const url = id ? '/api/dm-admin/sessions/'+id : '/api/dm-admin/sessions';
    const method = id ? 'PUT' : 'POST';
    const r = await fetch(url, {method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
    if (r.ok) { showAlert(el('sess-status'),id?'Session updated.':'Session created.','ok'); el('sess-edit').style.display='none'; loadSessions(); }
    else { const d=await r.json(); showAlert(el('sess-status'),'Error: '+(d.error||''),'err'); }
  }
  async function deleteSess() {
    const id = el('sess-id').value;
    if (!id || !confirm('Delete this session?')) return;
    await fetch('/api/dm-admin/sessions/'+id,{method:'DELETE'});
    el('sess-edit').style.display='none'; loadSessions();
  }
  async function deleteSessDirect(id) {
    if (!confirm('Delete this session?')) return;
    await fetch('/api/dm-admin/sessions/'+id,{method:'DELETE'});
    loadSessions();
  }

  // ═══ AI CONFIG ═══
  async function loadAiCfg() {
    const r = await fetch('/api/dm-admin/config');
    const d = await r.json();
    if(d.ai_model) el('ai-model').value=d.ai_model;
    if(d.ai_temperature) el('ai-temp').value=d.ai_temperature;
    if(d.ai_max_tokens) el('ai-maxtokens').value=d.ai_max_tokens;
    if(d.ai_system_prompt) el('ai-prompt').value=d.ai_system_prompt;
    if(d.ai_image_size) el('ai-imgsize').value=d.ai_image_size;
    if(d.ai_image_style) el('ai-imgstyle').value=d.ai_image_style;
    if(d.ai_tools) {
      const tools = JSON.parse(d.ai_tools||'[]');
      el('ai-tools').innerHTML = tools.map(t => '<label><input type="checkbox" name="tool" value="'+esc(t.name)+'" '+(t.enabled!==false?'checked':'')+' /> '+esc(t.name)+'</label>').join('');
    }
  }

  async function saveAiCfg(e) {
    e.preventDefault();
    const tools = [...document.querySelectorAll('#ai-tools input[name=tool]')].map(i=>({name:i.value,enabled:i.checked}));
    const body = { ai_model:el('ai-model').value, ai_temperature:el('ai-temp').value, ai_max_tokens:el('ai-maxtokens').value,
      ai_system_prompt:el('ai-prompt').value, ai_image_size:el('ai-imgsize').value, ai_image_style:el('ai-imgstyle').value, ai_tools:JSON.stringify(tools) };
    const r = await fetch('/api/dm-admin/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    alert(r.ok?'Saved.':'Error.');
  }

  // ═══ SEARCH CONFIG ═══
  async function loadSearchCfg() {
    const r = await fetch('/api/dm-admin/config');
    const d = await r.json();
    if(d.search_mode) el('srch-mode').value=d.search_mode;
    if(d.search_threshold) el('srch-threshold').value=d.search_threshold;
    if(d.search_limit) el('srch-limit').value=d.search_limit;
    if(d.rag_service_url) el('srch-ragurl').value=d.rag_service_url;
    try {
      const rs = await fetch('/api/dm-admin/rag-status');
      const rsd = await rs.json();
      const badge = el('srch-rag-badge');
      badge.textContent = rsd.status==='ok'?'Connected':'Offline';
      badge.style.background = rsd.status==='ok'?'#16a34a33':'#dc262633';
      badge.style.color = rsd.status==='ok'?'#4ade80':'#f87171';
    } catch(_) {}
  }

  async function testSearch() {
    const q = el('srch-test-q').value;
    if(!q) return;
    const pre = el('srch-test-result');
    pre.style.display='block'; pre.textContent='Searching...';
    const r = await fetch('/api/search?q='+encodeURIComponent(q));
    pre.textContent = JSON.stringify(await r.json(),null,2);
  }

  async function saveSearchCfg(e) {
    e.preventDefault();
    const body = { search_mode:el('srch-mode').value, search_threshold:el('srch-threshold').value, search_limit:el('srch-limit').value, rag_service_url:el('srch-ragurl').value };
    const r = await fetch('/api/dm-admin/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    alert(r.ok?'Saved.':'Error.');
  }

  // ═══ CAMPAIGN CONFIG ═══
  async function loadCampCfg() {
    const r = await fetch('/api/dm-admin/config');
    const d = await r.json();
    if(d.next_game_date) el('camp-nextgame').value=d.next_game_date;
    if(d.party_location) el('camp-location').value=d.party_location;
    if(d.current_day) el('camp-day').value=d.current_day;
    if(d.current_month) el('camp-month').value=d.current_month;
    if(d.current_year) el('camp-year').value=d.current_year;
  }

  async function saveCampCfg(e) {
    e.preventDefault();
    const body = { next_game_date:el('camp-nextgame').value, party_location:el('camp-location').value,
      current_day:el('camp-day').value, current_month:el('camp-month').value, current_year:el('camp-year').value };
    const r = await fetch('/api/dm-admin/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    alert(r.ok?'Saved.':'Error.');
  }

  // ═══ USERS ═══
  async function loadUsers() {
    const r = await fetch('/api/dm-admin/users');
    const d = await r.json();
    el('users-body').innerHTML = (d.users||[]).map(u =>
      '<tr><td>'+u.id+'</td><td style="color:#e8b923;">'+esc(u.username)+'</td><td>'+esc((u.first_name||'')+' '+(u.last_name||''))+'</td>'+
      '<td>'+esc(u.email||'')+'</td><td>'+esc(u.role)+'</td><td>'+(u.is_approved?'&#9989;':'&#10060;')+'</td><td>'+
      (!u.is_approved?'<button class="dmc-btn dmc-btn-sm" onclick="userAct('+u.id+',\\'approve\\')">Approve</button> ':'')+
      (u.role!=='admin'?'<button class="dmc-btn dmc-btn-sm" onclick="userAct('+u.id+',\\'promote\\')">Promote</button> ':'<button class="dmc-btn dmc-btn-sm" onclick="userAct('+u.id+',\\'demote\\')">Demote</button> ')+
      '<button class="dmc-btn dmc-btn-sm dmc-btn-danger" onclick="userAct('+u.id+',\\'delete\\')">Delete</button></td></tr>'
    ).join('') || '<tr><td colspan="7" class="dmc-empty">No users.</td></tr>';
  }
  async function userAct(id,action) {
    if(action==='delete'&&!confirm('Delete?')) return;
    const r = await fetch('/api/dm-admin/users/'+id+'/'+action,{method:'POST'});
    if(r.ok) loadUsers(); else alert('Error');
  }

  // ═══ INIT ═══
  _loaded.chat = true;
  loadChat();
  </script>`;

  return pageShell("DM Command Center — Halls of the Damned", "/dm-admin", body, session);
}

module.exports = { renderDmAdminPage };
