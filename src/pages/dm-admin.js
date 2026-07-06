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
    <!-- ═══ MAIN CONTENT (full canvas; navigation lives in the site top-menu "DM Command Center" dropdown, admin-only) ═══ -->
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

      <!-- ╔══ IMAGE STUDIO ══╗ -->
      <section class="dmc-panel" id="dmc-images" style="display:none;">
        <div class="dmc-panel-bar"><h2>Image Studio</h2></div>
        <div class="dmc-form-row">
          <label style="flex:3">Prompt<textarea id="img-prompt" rows="2" class="dmc-textarea" placeholder="Describe what to generate..."></textarea></label>
        </div>
        <div class="dmc-form-row">
          <label>Size<select id="img-size">
            <option value="1024x1024">1024x1024</option>
            <option value="1536x1024">1536x1024</option>
            <option value="1024x1536">1024x1536</option>
            <option value="auto">Auto</option>
          </select></label>
          <label>Quality<select id="img-quality">
            <option value="medium">Medium</option><option value="low">Low</option><option value="high">High</option><option value="auto">Auto</option>
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
              <div style="display:flex;gap:4px;">
                <button class="dmc-btn dmc-btn-sm dmc-btn-primary" onclick="nbAiOpen()" title="Generate a page with AI (RAG-grounded)">&#10024; AI</button>
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
                <div>&#9998; <strong>Rich editing</strong> &mdash; headings, bold, italic, lists, tables, code</div>
                <div>&#128247; <strong>Paste images</strong> directly into the editor (Ctrl+V)</div>
                <div>&#128190; <strong>Auto-save</strong> after 5 seconds of inactivity</div>
                <div>&#128269; <strong>Search</strong> notes by name in the sidebar</div>
              </div>
            </div>
            <div id="nb-editor-wrap" style="display:none;">
              <div class="nb-editor-bar">
                <div class="nb-tb-left">
                  <input type="text" id="nb-note-title" class="nb-tb-name" placeholder="Page name..." title="Page name (used as the file name)" />
                  <label class="nb-tb-fld">in <select id="nb-ai-folder" class="nb-tb-folder"></select></label>
                </div>
                <div class="nb-tb-right">
                  <span id="nb-save-status" style="color:#555;font-size:0.72rem;"></span>
                  <span id="nb-status-badge" style="display:none;font-size:0.62rem;font-weight:700;padding:2px 7px;border-radius:10px;letter-spacing:0.03em;"></span>
                  <button id="nb-publish-btn" class="dmc-btn dmc-btn-sm" style="display:none;" onclick="nbTogglePublish()"></button>
                  <button class="dmc-btn dmc-btn-primary dmc-btn-sm" onclick="nbSave()" title="Save this page (moves it if you changed the name or folder)">&#128190; Save Page</button>
                  <button class="dmc-btn dmc-btn-sm" id="nb-ai-regen" onclick="nbAiGenerate()" title="Re-run the AI prompt and replace the draft">&#8635; Regenerate</button>
                  <button class="dmc-btn dmc-btn-sm" id="nb-session-summary" style="display:none;" onclick="nbSessionGenSummary()" title="Draft the Session Summary from the Session Notes (AI)">&#129302; Generate Summary</button>
                  <button class="dmc-btn dmc-btn-sm" id="nb-session-pdf" style="display:none;" onclick="nbSessionPdf()" title="Render this session to a GM Guide PDF">&#128196; Create PDF</button>
                  <button class="dmc-btn dmc-btn-sm" onclick="nbToggleInfo()" title="Note Info &amp; Backlinks">&#9432;</button>
                  <button class="dmc-btn dmc-btn-sm" onclick="nbShowLinkMap()" title="Link Map">&#128279;</button>
                  <button class="dmc-btn dmc-btn-sm dmc-btn-danger" onclick="nbDeleteCurrent()" title="Delete this page">&#128465;</button>
                  <button class="dmc-btn dmc-btn-sm" onclick="nbCloseEditor()" title="Close">&#10005;</button>
                </div>
              </div>
              <div class="nb-ai-sec">
                <div class="nb-ai-sec-hdr"><span>&#10024; AI Assist</span><span id="nb-ai-status" class="dmc-status-text"></span></div>
                <textarea id="nb-ai-prompt" rows="2" class="nb-ai-prompt-in" placeholder="Describe the document to generate. Grounded in your campaign RAG (NPCs, lore, sessions). e.g. 'Write a writeup of the Wachter family politics in Vallaki.'"></textarea>
                <div class="nb-ai-sec-row">
                  <input id="nb-ai-ents" class="nb-ai-ents-in" placeholder="Related entities (optional): Fiona Wachter, Vallaki, Baron Vallakovich" />
                  <button class="dmc-btn dmc-btn-primary dmc-btn-sm" id="nb-ai-gen" onclick="nbAiGenerate()">Generate</button>
                </div>
                <div class="nb-ai-sec-row">
                  <input id="nb-ai-followup" class="nb-ai-followup-in" placeholder="Follow-up for the AI (e.g. 'make it darker', 'add a section on their rituals')" onkeydown="if(event.key==='Enter'){event.preventDefault();nbAiRefine();}" />
                  <button class="dmc-btn dmc-btn-sm" id="nb-ai-refine" onclick="nbAiRefine()">&#129302; Refine</button>
                </div>
              </div>
              <div class="nb-tabs">
                <button class="nb-tab nb-tab-active" id="nb-tab-edit" onclick="nbShowTab('edit')">Edit</button>
                <button class="nb-tab" id="nb-tab-preview" onclick="nbShowTab('preview')">Preview</button>
              </div>
              <div class="nb-editor-body">
                <div class="nb-editor-area" id="nb-edit-view">
                  <textarea id="nb-editor" class="nb-editor-ta" spellcheck="false" placeholder="Write Markdown here, or use AI Assist above to generate a draft..." oninput="nbEditorChanged()"></textarea>
                  <div id="nb-monaco" class="nb-monaco" style="display:none;"></div>
                </div>
                <div class="nb-preview-view" id="nb-preview-view" style="display:none;"></div>
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
      <!-- Player Characters now live in the GM Player Workspace at /characters/admin.
           The sidebar Characters link navigates directly there; this panel is
           intentionally empty so an old bookmarked dmc('characters') call from
           an active tab still resolves to a defined section. -->
      <section class="dmc-panel" id="dmc-characters" style="display:none;">
        <div class="dmc-panel-bar"><h2>Player Characters</h2></div>
        <div class="dmc-empty" style="padding:24px;text-align:center;">
          The Player Characters workspace has moved.
          <div style="margin-top:12px;"><a class="dmc-btn dmc-btn-primary" href="/characters/admin">Open GM Player Workspace &rarr;</a></div>
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
              <label>Class / Role<input id="npc-class" /></label>
            </div>
            <div class="dmc-form-row">
              <label>Location<input id="npc-location" /></label>
              <label>Status<select id="npc-status"><option value="Alive">Alive</option><option value="Dead">Dead</option><option value="Unknown">Unknown</option><option value="Missing">Missing</option><option value="Undead">Undead</option><option value="Imprisoned">Imprisoned</option><option value="Active">Active</option><option value="Corrupted">Corrupted</option></select></label>
              <label>Alignment<select id="npc-align"><option value="neutral">Neutral</option><option value="ally">Ally</option><option value="enemy">Enemy</option></select></label>
            </div>
            <div class="dmc-form-row">
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
            <div style="margin-top:8px;">
              <label style="margin-bottom:4px;">Associations <span style="color:#555;font-size:0.7rem;">(linked NPCs and relationships)</span></label>
              <div id="npc-assoc-list" style="margin-bottom:8px;"></div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <input id="npc-assoc-name" placeholder="NPC Name" style="flex:1;min-width:120px;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:4px;padding:5px 8px;color:#ccc;font-size:0.78rem;" />
                <input id="npc-assoc-id" placeholder="NPC ID" type="number" style="width:70px;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:4px;padding:5px 8px;color:#ccc;font-size:0.78rem;" />
                <input id="npc-assoc-rel" placeholder="Relationship" style="flex:2;min-width:200px;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:4px;padding:5px 8px;color:#ccc;font-size:0.78rem;" />
                <button type="button" class="dmc-btn dmc-btn-sm dmc-btn-primary" onclick="addAssociation()">+ Add</button>
              </div>
            </div>
            <div class="dmc-form-actions">
              <button type="submit" class="dmc-btn dmc-btn-primary">Save</button>
              <button type="button" class="dmc-btn dmc-btn-danger" id="npc-del-btn" onclick="deleteNpc()" style="display:none;">Delete</button>
              <button type="button" class="dmc-btn" onclick="el('npc-edit').style.display='none'">Cancel</button>
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
            <label>Model<select id="ai-model"><option value="gpt-5.4-mini" selected>gpt-5.4-mini</option><option value="gpt-5.4">gpt-5.4</option><option value="gpt-5.4-nano">gpt-5.4-nano</option></select></label>
            <label>Temperature<input type="number" id="ai-temp" min="0" max="2" step="0.1" value="0.7" /></label>
            <label>Max Tokens<input type="number" id="ai-maxtokens" min="100" max="4096" value="1024" /></label>
          </div>
          <label>System Prompt<textarea id="ai-prompt" rows="8" class="dmc-textarea"></textarea></label>
          <div id="ai-tools" class="dmc-tools-grid"></div>
          <div class="dmc-form-row" style="margin-top:16px;">
            <label>Image Size<select id="ai-imgsize"><option value="1024x1024">1024x1024</option><option value="1792x1024">1792x1024</option><option value="1024x1792">1024x1792</option></select></label>
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
          <a href="/calendar/admin" class="dmc-card"><span>&#128197;</span>Calendar<small>Next game, Harptos events</small></a>
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
    html:has(.dmc) { overflow:hidden; }
    .dmc { display:flex; height:calc(100vh - 60px); background:#111; overflow:hidden; }

    /* ── Main ── */
    .dmc-main { flex:1; overflow-y:auto; padding:0; min-width:0; }
    .dmc-panel { padding:20px 24px; }
    /* Pin the panel action bar to the top of the scrolling canvas so its
       buttons (+ Add NPC, + New Chat, filters, etc.) stay reachable no matter
       how far the panel content is scrolled. Negative margins pull it over the
       panel padding so it spans the full canvas width. Panels that opt out of
       padding (#dmc-notes) have no .dmc-panel-bar, so they are
       unaffected. */
    .dmc-panel-bar { position:sticky; top:0; z-index:5; display:flex; align-items:center; justify-content:space-between; margin:-20px -24px 16px; padding:14px 24px; background:#111; border-bottom:1px solid #222; flex-wrap:wrap; gap:8px; }
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
    #dmc-notes { padding:0 !important; height:100%; overflow:hidden; }
    .notebook-layout { display:flex; height:100%; border:1px solid #222; border-radius:8px; overflow:hidden; background:#0d0d0d; }
    .nb-sidebar { width:260px; min-width:200px; max-width:360px; border-right:1px solid #222; display:flex; flex-direction:column; background:#0a0a0a; resize:horizontal; overflow:hidden; }
    .nb-sidebar-hdr { display:flex; justify-content:space-between; align-items:center; padding:8px 10px; border-bottom:1px solid #222; }
    /* ── Unified editor: toolbar ── */
    .nb-tb-left { display:flex; align-items:center; gap:8px; min-width:0; flex:1; }
    .nb-tb-name { background:#0d0d0d; border:1px solid #333; border-radius:4px; color:#e8b923; padding:5px 8px; font-size:0.85rem; font-weight:600; min-width:150px; max-width:340px; }
    .nb-tb-name:focus { border-color:#c83232; outline:none; }
    .nb-tb-fld { display:flex; align-items:center; gap:5px; font-size:0.7rem; color:#666; }
    .nb-tb-folder { background:#0d0d0d; border:1px solid #333; border-radius:4px; color:#ccc; padding:4px 6px; font-size:0.75rem; max-width:220px; }
    .nb-tb-right { display:flex; gap:6px; align-items:center; flex-shrink:0; }
    /* ── Unified editor: AI Assist section (fixed size, stays put) ── */
    .nb-ai-sec { border-bottom:1px solid #222; background:#0a0a0a; padding:8px 12px; display:flex; flex-direction:column; gap:6px; flex-shrink:0; }
    .nb-ai-sec-hdr { display:flex; justify-content:space-between; align-items:center; color:#e8b923; font-size:0.8rem; font-weight:600; }
    .nb-ai-sec-hdr .dmc-status-text { color:#666; font-size:0.68rem; font-weight:400; }
    .nb-ai-prompt-in { width:100%; box-sizing:border-box; background:#0d0d0d; border:1px solid #333; border-radius:4px; color:#ddd; padding:6px 8px; font-size:0.8rem; resize:vertical; font-family:inherit; }
    .nb-ai-prompt-in:focus { border-color:#c83232; outline:none; }
    .nb-ai-sec-row { display:flex; gap:6px; align-items:center; }
    .nb-ai-ents-in { flex:1; min-width:0; background:#0d0d0d; border:1px solid #333; border-radius:4px; color:#ddd; padding:6px 8px; font-size:0.78rem; }
    .nb-ai-ents-in:focus { border-color:#c83232; outline:none; }
    /* ── Unified editor: Edit/Preview tabs ── */
    .nb-tabs { display:flex; gap:2px; padding:0 12px; border-bottom:1px solid #222; background:#0a0a0a; flex-shrink:0; }
    .nb-tab { background:none; border:none; border-bottom:2px solid transparent; color:#777; font-size:0.75rem; font-weight:600; padding:8px 14px; cursor:pointer; }
    .nb-tab:hover { color:#ccc; }
    .nb-tab-active { color:#e8b923; border-bottom-color:#c83232; }
    /* ── Unified editor: textarea + preview (fills remaining space) ── */
    .nb-editor-ta { flex:1; min-height:0; width:100%; box-sizing:border-box; background:#111; color:#ccc; border:none; outline:none; resize:none; padding:14px 16px; font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace; font-size:0.85rem; line-height:1.6; }
    .nb-monaco { flex:1; min-height:0; overflow:hidden; }
    .nb-preview-view { flex:1; min-width:0; min-height:0; overflow-y:auto; background:#111; color:#ccc; padding:16px 24px; font-size:0.9rem; line-height:1.7; }
    .nb-preview-view > *:first-child { margin-top:0; }
    .nb-preview-view h1, .nb-preview-view h2, .nb-preview-view h3, .nb-preview-view h4, .nb-preview-view h5, .nb-preview-view h6 { color:#e8b923; line-height:1.3; margin:1.2em 0 0.5em; font-weight:700; }
    .nb-preview-view h1 { font-size:1.7rem; border-bottom:1px solid #2a2a2a; padding-bottom:0.3em; }
    .nb-preview-view h2 { font-size:1.4rem; border-bottom:1px solid #222; padding-bottom:0.25em; }
    .nb-preview-view h3 { font-size:1.2rem; }
    .nb-preview-view h4 { font-size:1.05rem; color:#c83232; }
    .nb-preview-view h5, .nb-preview-view h6 { font-size:0.95rem; color:#c83232; }
    .nb-preview-view p { margin:0 0 0.9em; }
    .nb-preview-view ul, .nb-preview-view ol { margin:0 0 0.9em; padding-left:1.6em; }
    .nb-preview-view li { margin:0.2em 0; }
    .nb-preview-view li > ul, .nb-preview-view li > ol { margin:0.2em 0; }
    .nb-preview-view blockquote { border-left:3px solid #c83232; margin:0 0 0.9em; padding:0.2em 1em; color:#999; background:#161616; }
    .nb-preview-view a { color:#6fb3ff; text-decoration:none; }
    .nb-preview-view a:hover { text-decoration:underline; }
    .nb-preview-view strong { color:#eee; }
    .nb-preview-view hr { border:none; border-top:1px solid #2a2a2a; margin:1.4em 0; }
    .nb-preview-view code { background:#1a1a1a; padding:2px 5px; border-radius:3px; font-size:0.85em; color:#e0b0b0; }
    .nb-preview-view pre { background:#0d0d0d; border:1px solid #222; padding:12px 14px; border-radius:6px; overflow-x:auto; margin:0 0 0.9em; }
    .nb-preview-view pre code { background:none; padding:0; color:#ccc; font-size:0.82rem; }
    .nb-preview-view img { max-width:100%; border-radius:6px; }
    .nb-preview-view table { border-collapse:collapse; margin:0 0 0.9em; }
    .nb-preview-view th, .nb-preview-view td { border:1px solid #333; padding:6px 10px; text-align:left; }
    .nb-preview-view th { background:#1a1a1a; color:#e8b923; }
    .nb-preview-view tr:nth-child(even) td { background:#151515; }
    .nb-preview-view input[type=checkbox] { margin-right:6px; }
    .nb-preview-view .wiki-link { color:#e8b923; cursor:pointer; text-decoration:underline dotted; }
    .nb-preview-view .wiki-link:hover { color:#fff; text-decoration:underline; }
    .nb-ai-followup { display:flex; gap:6px; margin:6px 0 10px; }
    .nb-ai-followup-in { flex:1; background:#0d0d0d; border:1px solid #333; border-radius:4px; color:#ddd; padding:6px 8px; font-size:0.8rem; }
    .nb-ai-prev-details { margin:0 0 10px; }
    .nb-ai-prev-details summary { cursor:pointer; color:#888; font-size:0.74rem; padding:2px 0; }
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
    .nb-main { flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden; }
    .nb-welcome { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#666; text-align:center; padding:32px; }
    .nb-welcome h3 { margin:0 0 8px; font-size:1.1rem; }
    .nb-welcome code { background:#1a1a1a; padding:2px 6px; border-radius:4px; font-size:0.72rem; color:#aaa; }
    .nb-editor-bar { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:6px 12px; border-bottom:1px solid #222; min-height:36px; background:#0a0a0a; }
    #nb-editor-wrap { flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden; }
    /* ── Context menu ── */
    .nb-ctx-menu { position:fixed; z-index:9999; background:#1a1a1a; border:1px solid #333; border-radius:6px; padding:4px 0; min-width:180px; box-shadow:0 4px 16px rgba(0,0,0,0.5); }
    .nb-ctx-item { padding:6px 14px; font-size:0.78rem; color:#ccc; cursor:pointer; }
    .nb-ctx-item:hover { background:#222; color:#e8b923; }
    .nb-ctx-danger { color:#f44; }
    .nb-ctx-danger:hover { background:#2a1515; color:#f66; }
    .nb-ctx-sep { border-top:1px solid #2a2a2a; margin:3px 0; }
    /* ── Editor body (editor + right panel) ── */
    .nb-editor-body { flex:1; min-height:0; display:flex; overflow:hidden; }
    .nb-editor-area { flex:1; min-width:0; min-height:0; display:flex; flex-direction:column; overflow:hidden; }
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
    /* ── Link Map overlay ── */
    .nb-linkmap-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.85); z-index:9999; display:flex; align-items:center; justify-content:center; }
    .nb-linkmap-inner { background:#111; border:1px solid #333; border-radius:10px; width:92vw; max-width:1100px; height:75vh; display:flex; flex-direction:column; overflow:hidden; }
    .nb-linkmap-hdr { display:flex; justify-content:space-between; align-items:center; padding:10px 16px; border-bottom:1px solid #222; }
    #nb-linkmap-canvas { flex:1; width:100%; cursor:grab; }

    /* ── Responsive ── */
    @media (max-width:768px) {
      .dmc { flex-direction:column; }
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

  <script src="https://cdn.jsdelivr.net/npm/marked@15.0.4/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/loader.min.js"></script>
  <script>
  const el = id => document.getElementById(id);
  const esc = s => { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
  function renderMd(text) {
    if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
      try { return DOMPurify.sanitize(marked.parse(text || '', { gfm: true, breaks: true })); } catch(_) {}
    }
    return esc(text);
  }

  // ═══ NAVIGATION ═══
  // The DM Command Center menu now lives in the site top-nav dropdown. Panels
  // are selected via the URL hash (e.g. /dm-admin#sessions) so the dropdown
  // works from any page and switches panels in-place when already here.
  let _currentPanel = null;
  let _loaded = {};
  const PANELS = ['chat','images','notes','characters','npcs','ai','search','campaign','users'];
  function showPanel(panel) {
    if (!panel || PANELS.indexOf(panel) === -1 || !el('dmc-' + panel)) panel = 'chat';
    document.querySelectorAll('.dmc-panel').forEach(p => p.style.display = 'none');
    el('dmc-' + panel).style.display = 'block';
    _currentPanel = panel;
    if (!_loaded[panel]) { _loaded[panel] = true; loadPanel(panel); }
  }
  // Back-compat shim for any legacy dmc('panel') call: drive selection via hash.
  function dmc(panel) {
    if (location.hash === '#' + panel) showPanel(panel);
    else location.hash = panel;
  }
  function loadPanel(p) {
    const loaders = { chat:loadChat, images:loadImages, notes:loadNotes,
      characters:loadChars, npcs:loadNpcs, ai:loadAiCfg,
      search:loadSearchCfg, campaign:loadCampCfg, users:loadUsers };
    if (loaders[p]) loaders[p]();
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
      const r = await fetch('/api/dm-admin/images/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,size:el('img-size').value,quality:el('img-quality').value,folder:el('img-folder').value||null,tags})});
      const d = await r.json();
      if(!r.ok) throw new Error(d.error);
      _imgPreviewId = d.image.id;
      el('img-preview-src').src = d.image.image_url;
      el('img-preview-prompt').textContent = d.image.prompt;
      el('img-preview-revised').textContent = d.image.revised_prompt ? 'Revised: ' + d.image.revised_prompt : '';
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
    el('img-modal-revised').textContent = img.revised_prompt ? 'Revised: ' + img.revised_prompt : '';
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
  let _nbStatus = null;
  let _nbEditorWired = false;
  let _monaco = null;
  let _monacoLoading = null;
  let _nbSyncing = false;
  let _nbLintTimer = null;
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
  // Sync the toolbar identity (page name + folder) from a path.
  function renderBreadcrumb(path) {
    if (!path) return;
    nbPopulateFolders();
    var fileName = path.split('/').pop();
    if (el('nb-note-title')) el('nb-note-title').value = fileName.replace(/\\.md$/i, '').replace(/[-_]/g, ' ');
    if (el('nb-ai-folder')) el('nb-ai-folder').value = path.indexOf('/') >= 0 ? path.substring(0, path.lastIndexOf('/')) : '';
  }

  // ── Open a page into the unified editor ──
  async function nbOpenFile(path) {
    if (_nbDirty && _nbCurrentPath) { await nbAutoSave(); }
    _nbCurrentPath = path;
    if (path !== _nbAiTempPath) _nbAiTempPath = null;
    el('nb-welcome').style.display = 'none';
    el('nb-editor-wrap').style.display = 'flex';
    el('nb-save-status').textContent = 'Loading...';
    el('nb-ai-status').textContent = '';
    el('nb-ai-followup').value = '';

    var r = await fetch('/api/dm-admin/notebook/read?path=' + encodeURIComponent(path));
    var d = await r.json();
    if (!r.ok) { el('nb-save-status').textContent = 'Error: ' + (d.error||''); return; }

    nbPopulateFolders();
    var fileName = path.split('/').pop();
    el('nb-note-title').value = fileName.replace(/\\.md$/i, '').replace(/[-_]/g, ' ');
    el('nb-ai-folder').value = path.indexOf('/') >= 0 ? path.substring(0, path.lastIndexOf('/')) : '';

    nbWireEditor();
    el('nb-editor').value = d.content || '';
    await nbEnsureMonaco();
    if (_monaco) { _nbSyncing = true; _monaco.setValue(d.content || ''); _nbSyncing = false; }
    _nbDirty = false;
    el('nb-save-status').textContent = 'Saved';
    el('nb-save-status').style.color = '#555';
    _nbStatus = d.status || 'draft';
    nbRenderStatus();
    var _isSess = path.indexOf('Sessions/') === 0;
    el('nb-session-summary').style.display = _isSess ? 'inline-block' : 'none';
    el('nb-session-pdf').style.display = _isSess ? 'inline-block' : 'none';
    nbShowTab('edit');
    renderNbTree();
    nbLoadBacklinks(path);
    nbLoadNoteInfo(d.content || '');
    nbRunLint();
  }

  // Populate the toolbar folder <select> from the current tree.
  function nbPopulateFolders() {
    var sel = el('nb-ai-folder');
    if (!sel) return;
    var current = sel.value;
    var folders = [''];
    (function walk(nodes) { (nodes || []).forEach(function(n) { if (n.type === 'folder') { folders.push(n.path); walk(n.children); } }); })(_nbTree);
    sel.innerHTML = folders.map(function(f) { return '<option value="' + esc(f) + '">' + (f ? esc(f) : '(root)') + '</option>'; }).join('');
    sel.value = current;
  }

  // Wire paste/drop image upload + preview wiki-link clicks (once).
  function nbWireEditor() {
    if (_nbEditorWired) return;
    _nbEditorWired = true;
    var ta = el('nb-editor');
    ta.addEventListener('paste', function(e) {
      var items = (e.clipboardData || {}).items || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          nbUploadImage(items[i].getAsFile(), ta);
          return;
        }
      }
    });
    ta.addEventListener('drop', function(e) {
      var files = (e.dataTransfer || {}).files || [];
      for (var i = 0; i < files.length; i++) {
        if (files[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          nbUploadImage(files[i], ta);
          return;
        }
      }
    });
    el('nb-preview-view').addEventListener('click', function(e) {
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

  // Set editor content in both the textarea (fallback + source of truth) and Monaco.
  function nbSetContent(v) {
    v = v || '';
    el('nb-editor').value = v;
    if (_monaco) { _nbSyncing = true; _monaco.setValue(v); _nbSyncing = false; }
    nbScheduleLint();
  }

  // Lazily load Monaco (the VS Code editor) and mount it over the textarea.
  function nbEnsureMonaco() {
    if (_monaco) return Promise.resolve(_monaco);
    if (_monacoLoading) return _monacoLoading;
    if (typeof require === 'undefined' || !require.config) return Promise.resolve(null);
    var VS = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min';
    _monacoLoading = new Promise(function(resolve) {
      try {
        window.MonacoEnvironment = {
          getWorkerUrl: function() {
            return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(
              "self.MonacoEnvironment={baseUrl:'" + VS + "/'};" +
              "importScripts('" + VS + "/vs/base/worker/workerMain.js');"
            );
          }
        };
        require.config({ paths: { vs: VS + '/vs' } });
        require(['vs/editor/editor.main'], function() {
          try {
            _monaco = monaco.editor.create(el('nb-monaco'), {
              value: el('nb-editor').value || '',
              language: 'markdown',
              theme: 'vs-dark',
              automaticLayout: true,
              wordWrap: 'on',
              minimap: { enabled: false },
              lineNumbers: 'on',
              fontSize: 13,
              scrollBeyondLastLine: false,
              renderWhitespace: 'boundary',
              fixedOverflowWidgets: true,
              padding: { top: 10 }
            });
            el('nb-editor').style.display = 'none';
            el('nb-monaco').style.display = 'block';
            _monaco.onDidChangeModelContent(function() {
              el('nb-editor').value = _monaco.getValue();
              nbScheduleLint();
              if (_nbSyncing) return;
              nbEditorChanged();
            });
            nbWireMonacoImages();
            nbRunLint();
            resolve(_monaco);
          } catch (e) { console.error('Monaco init failed', e); resolve(null); }
        });
      } catch (e) { console.error('Monaco load failed', e); resolve(null); }
    });
    return _monacoLoading;
  }

  // Paste / drop image upload inside Monaco.
  function nbWireMonacoImages() {
    var host = el('nb-monaco');
    host.addEventListener('paste', function(e) {
      var items = (e.clipboardData || {}).items || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) { e.preventDefault(); e.stopPropagation(); nbUploadImage(items[i].getAsFile(), null); return; }
      }
    }, true);
    host.addEventListener('drop', function(e) {
      var files = (e.dataTransfer || {}).files || [];
      for (var i = 0; i < files.length; i++) {
        if (files[i].type.indexOf('image') !== -1) { e.preventDefault(); e.stopPropagation(); nbUploadImage(files[i], null); return; }
      }
    }, true);
  }

  // markdownlint-compatible linting -> inline Monaco squiggles (advisory only, VS Code rule IDs).
  function nbScheduleLint() { clearTimeout(_nbLintTimer); _nbLintTimer = setTimeout(nbRunLint, 500); }

  // A focused subset of markdownlint's default rules, self-contained (no external deps).
  function nbLintMarkdown(text) {
    var lines = String(text == null ? '' : text).split('\\n');
    var out = [];
    function add(line, id, name, desc, detail, range) {
      out.push({ lineNumber: line, ruleNames: [id, name], ruleDescription: desc, errorDetail: detail || null, errorRange: range || null });
    }
    var inFence = false, fenceChar = '', blankRun = 0, h1Count = 0;
    for (var i = 0; i < lines.length; i++) {
      var ln = i + 1, line = lines[i];
      var fenceM = line.match(/^(\\s*)(\\x60{3,}|~{3,})(.*)$/);
      if (fenceM && (!inFence || fenceM[2].charAt(0) === fenceChar)) {
        if (!inFence) {
          inFence = true; fenceChar = fenceM[2].charAt(0);
          if (!fenceM[3].trim()) add(ln, 'MD040', 'fenced-code-language', 'Fenced code blocks should have a language specified', null, null);
          if (i > 0 && lines[i-1].trim() !== '') add(ln, 'MD031', 'blanks-around-fences', 'Fenced code blocks should be surrounded by blank lines', null, null);
        } else {
          inFence = false;
          if (i < lines.length - 1 && lines[i+1].trim() !== '') add(ln, 'MD031', 'blanks-around-fences', 'Fenced code blocks should be surrounded by blank lines', null, null);
        }
        blankRun = 0; continue;
      }
      if (inFence) { blankRun = 0; continue; }

      if (line.trim() === '') {
        blankRun++;
        if (blankRun >= 2) add(ln, 'MD012', 'no-multiple-blanks', 'Multiple consecutive blank lines', 'Expected: 1; Actual: ' + blankRun, null);
        continue;
      }
      blankRun = 0;

      var tabIdx = line.indexOf('\\t');
      if (tabIdx !== -1) add(ln, 'MD010', 'no-hard-tabs', 'Hard tabs', 'Column: ' + (tabIdx + 1), [tabIdx + 1, 1]);

      var trail = line.match(/(\\s+)$/);
      if (trail && trail[1].length !== 2) {
        var rightLen = line.length - trail[1].length;
        add(ln, 'MD009', 'no-trailing-spaces', 'Trailing spaces', 'Expected: 0 or 2; Actual: ' + trail[1].length, [rightLen + 1, trail[1].length]);
      }

      var hm = line.match(/^(\\s*)(#{1,6})(\\s*)(.*?)\\s*$/);
      if (hm) {
        var indent = hm[1], hashes = hm[2], sp = hm[3], htext = hm[4];
        if (indent.length > 0) add(ln, 'MD023', 'heading-start-left', 'Headings must start at the beginning of the line', null, [1, indent.length]);
        if (sp.length === 0 && htext.length > 0) add(ln, 'MD018', 'no-missing-space-atx', 'No space after hash on atx style heading', null, [indent.length + 1, hashes.length]);
        else if (sp.length > 1) add(ln, 'MD019', 'no-multiple-space-atx', 'Multiple spaces after hash on atx style heading', null, [indent.length + 1, hashes.length + sp.length]);
        if (htext && /[.,;:!]$/.test(htext)) add(ln, 'MD026', 'no-trailing-punctuation', 'Trailing punctuation in heading', "Punctuation: '" + htext.charAt(htext.length - 1) + "'", null);
        if (hashes.length === 1) { h1Count++; if (h1Count > 1) add(ln, 'MD025', 'single-title/single-h1', 'Multiple top-level headings in the same document', null, null); }
        if (i > 0 && lines[i-1].trim() !== '') add(ln, 'MD022', 'blanks-around-headings', 'Headings should be surrounded by blank lines', 'Expected blank line above', null);
        if (i < lines.length - 1 && lines[i+1].trim() !== '') add(ln, 'MD022', 'blanks-around-headings', 'Headings should be surrounded by blank lines', 'Expected blank line below', null);
      } else {
        var listRe = /^(\\s*)([-*+]|\\d+\\.)\\s+/;
        if (listRe.test(line)) {
          var prevL = i > 0 ? lines[i-1] : '';
          if (i > 0 && prevL.trim() !== '' && !listRe.test(prevL) && !/^\\s/.test(prevL)) add(ln, 'MD032', 'blanks-around-lists', 'Lists should be surrounded by blank lines', 'Expected blank line above', null);
        }
      }
    }
    if (text && text.charAt(text.length - 1) !== '\\n' && lines[lines.length - 1].trim() !== '') {
      add(lines.length, 'MD047', 'single-trailing-newline', 'Files should end with a single newline character', null, null);
    }
    return out;
  }

  function nbRunLint() {
    if (!_monaco || typeof monaco === 'undefined') return;
    var model = _monaco.getModel(); if (!model) return;
    var markers = [];
    try {
      nbLintMarkdown(_monaco.getValue()).forEach(function(v) {
        var line = v.lineNumber || 1;
        var col = 1, len = 1;
        if (v.errorRange && v.errorRange.length === 2) { col = v.errorRange[0]; len = v.errorRange[1]; }
        else { var lc = line <= model.getLineCount() ? model.getLineContent(line) : ''; len = Math.max(1, lc.length); }
        markers.push({
          startLineNumber: line, startColumn: col,
          endLineNumber: line, endColumn: col + len,
          message: v.ruleNames.slice(0, 2).join('/') + ': ' + v.ruleDescription + (v.errorDetail ? ' [' + v.errorDetail + ']' : ''),
          severity: monaco.MarkerSeverity.Warning,
          source: 'markdownlint'
        });
      });
    } catch (e) { /* advisory only */ }
    monaco.editor.setModelMarkers(model, 'markdownlint', markers);
  }

  // Typing in the editor -> mark dirty + schedule auto-save (content only).
  function nbEditorChanged() {
    _nbDirty = true;
    el('nb-save-status').textContent = 'Unsaved changes';
    el('nb-save-status').style.color = '#e8b923';
    clearTimeout(_nbSaveTimer);
    _nbSaveTimer = setTimeout(nbAutoSave, 5000);
  }

  // Auto-save: persist content to the current path (no rename/move).
  async function nbAutoSave() {
    if (!_nbCurrentPath || !_nbDirty) return;
    var r = await fetch('/api/dm-admin/notebook/write', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ path:_nbCurrentPath, content:el('nb-editor').value }) });
    if (r.ok) {
      _nbDirty = false;
      el('nb-save-status').textContent = 'Saved';
      el('nb-save-status').style.color = '#555';
    }
  }

  // Switch between the Edit and Preview tabs.
  function nbShowTab(tab) {
    var edit = tab !== 'preview';
    el('nb-edit-view').style.display = edit ? 'flex' : 'none';
    el('nb-preview-view').style.display = edit ? 'none' : 'block';
    el('nb-tab-edit').classList.toggle('nb-tab-active', edit);
    el('nb-tab-preview').classList.toggle('nb-tab-active', !edit);
    if (!edit) {
      var processed = (el('nb-editor').value || '').replace(/\\[\\[([^\\]]+)\\]\\]/g, function(m, name) {
        return '<span class="wiki-link" data-note="' + esc(name) + '">' + esc(name) + '</span>';
      });
      el('nb-preview-view').innerHTML = renderMd(processed);
    } else if (_monaco) {
      setTimeout(function() { _monaco.layout(); _monaco.focus(); }, 0);
    }
  }

  // Close the editor; clean up an untouched temp AI draft.
  async function nbCloseEditor() {
    if (_nbDirty && _nbCurrentPath) { await nbAutoSave(); }
    if (_nbAiTempPath && _nbCurrentPath === _nbAiTempPath && !_nbAiGenerated) {
      var bodyText = (el('nb-editor').value || '').trim();
      if (bodyText === '' || bodyText === '# Untitled AI Draft') {
        await fetch('/api/dm-admin/notebook/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ path:_nbAiTempPath }) }).catch(function() {});
        _nbCurrentPath = null;
        await loadNotes();
      }
    }
    _nbAiTempPath = null;
    showNbWelcome();
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

  async function nbUploadImage(file, ta) {
    el('nb-save-status').textContent = 'Uploading image...';
    var fd = new FormData();
    fd.append('image', file, file.name);
    var uploadUrl = '/api/dm-admin/notebook/upload-image';
    if (_nbCurrentPath) uploadUrl += '?notePath=' + encodeURIComponent(_nbCurrentPath);
    var r = await fetch(uploadUrl, { method:'POST', body:fd });
    var d = await r.json();
    if (r.ok && d.url) {
      var snippet = '![image](' + d.url + ')\\n';
      if (_monaco) {
        var sel = _monaco.getSelection();
        _monaco.executeEdits('img', [{ range: sel, text: snippet, forceMoveMarkers: true }]);
        _monaco.focus();
      } else if (ta) {
        var s = ta.selectionStart || 0, e = ta.selectionEnd || 0;
        ta.value = ta.value.slice(0, s) + snippet + ta.value.slice(e);
        ta.selectionStart = ta.selectionEnd = s + snippet.length;
        ta.focus();
      }
      nbEditorChanged();
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

  // ── Publish / Unpublish (RAG membership) ──
  function nbRenderStatus() {
    var badge = el('nb-status-badge'); var btn = el('nb-publish-btn');
    if (!badge || !btn) return;
    if (!_nbCurrentPath || !_nbStatus) { badge.style.display = 'none'; btn.style.display = 'none'; return; }
    badge.style.display = 'inline-block'; btn.style.display = 'inline-block';
    btn.disabled = false;
    if (_nbStatus === 'published') {
      badge.textContent = 'PUBLISHED'; badge.style.background = 'rgba(74,222,128,0.15)'; badge.style.color = '#4ade80';
      btn.textContent = 'Unpublish'; btn.title = 'Remove this page from campaign RAG (revert to draft)';
    } else {
      badge.textContent = 'DRAFT'; badge.style.background = 'rgba(232,185,35,0.15)'; badge.style.color = '#e8b923';
      btn.textContent = '\u2191 Publish'; btn.title = 'Publish this page into campaign RAG';
    }
  }

  function nbTogglePublish() {
    if (!_nbCurrentPath) return;
    return _nbStatus === 'published' ? nbUnpublish() : nbPublish();
  }

  async function nbPublish() {
    if (!_nbCurrentPath) return;
    if (_nbDirty) { await nbAutoSave(); }
    var btn = el('nb-publish-btn'); btn.disabled = true; btn.textContent = 'Publishing...';
    try {
      var r = await fetch('/api/dm-admin/notebook/publish', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:_nbCurrentPath}) });
      var d = await r.json();
      if (r.ok) { _nbStatus = 'published'; el('nb-save-status').textContent = 'Published (' + (d.chunks||0) + ' chunk' + ((d.chunks===1)?'':'s') + ' in RAG)'; el('nb-save-status').style.color = '#4ade80'; await loadNotes(); }
      else { el('nb-save-status').textContent = 'Publish failed: ' + (d.error||''); el('nb-save-status').style.color = '#f44'; }
    } catch (e) { el('nb-save-status').textContent = 'Publish failed'; el('nb-save-status').style.color = '#f44'; }
    nbRenderStatus();
  }

  async function nbUnpublish() {
    if (!_nbCurrentPath) return;
    var btn = el('nb-publish-btn'); btn.disabled = true; btn.textContent = 'Unpublishing...';
    try {
      var r = await fetch('/api/dm-admin/notebook/unpublish', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:_nbCurrentPath}) });
      var d = await r.json();
      if (r.ok) { _nbStatus = 'draft'; el('nb-save-status').textContent = 'Unpublished (removed from RAG)'; el('nb-save-status').style.color = '#e8b923'; await loadNotes(); }
      else { el('nb-save-status').textContent = 'Unpublish failed: ' + (d.error||''); el('nb-save-status').style.color = '#f44'; }
    } catch (e) { el('nb-save-status').textContent = 'Unpublish failed'; el('nb-save-status').style.color = '#f44'; }
    nbRenderStatus();
  }

  async function nbSave(silent) {
    if (!_nbCurrentPath) return;
    var content = el('nb-editor').value;
    // Move/rename if the page name or folder changed.
    var name = el('nb-note-title').value.trim();
    var folder = el('nb-ai-folder').value;
    if (name) {
      var fileName = name.replace(/\\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!fileName) fileName = 'untitled';
      var newPath = (folder ? folder + '/' : '') + fileName + '.md';
      if (newPath !== _nbCurrentPath) {
        var rr = await fetch('/api/dm-admin/notebook/rename', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({oldPath:_nbCurrentPath, newPath:newPath}) });
        if (rr.ok) {
          if (_nbAiTempPath === _nbCurrentPath) _nbAiTempPath = newPath;
          _nbCurrentPath = newPath;
        } else {
          var er = await rr.json();
          el('nb-save-status').textContent = 'Move failed: ' + (er.error||'');
          el('nb-save-status').style.color = '#f44';
          return;
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
      await loadNotes();
      renderBreadcrumb(_nbCurrentPath);
      nbLoadNoteInfo(content);
      setTimeout(function() { el('nb-save-status').style.color = '#555'; el('nb-save-status').textContent = 'Saved'; }, 2000);
    } else {
      var d = await r.json();
      el('nb-save-status').textContent = 'Save failed: ' + (d.error||'');
      el('nb-save-status').style.color = '#f44';
    }
  }

  // ── AI Assist: RAG-grounded generation + iterative refine (in the unified editor) ──
  var _nbAiTempPath = null;   // set while a fresh AI draft (unsaved temp) is the current page
  var _nbAiGenerated = false; // whether the AI produced content this session

  // Create a fresh temp draft at the notebook root and open it in the editor.
  async function nbStartTempDraft() {
    _nbAiGenerated = false;
    var tempName = 'ai-draft-' + Date.now() + '.md';
    var r = await fetch('/api/dm-admin/notebook/create', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ path:tempName, type:'file', content:'# Untitled AI Draft\\n\\n' }) });
    if (!r.ok) { var d = await r.json(); alert('Could not start AI draft: ' + (d.error || '')); throw new Error('temp draft failed'); }
    _nbAiTempPath = tempName;
    await loadNotes();
    await nbOpenFile(tempName);
  }

  // ✨ AI button: start a new AI draft page and focus the prompt.
  async function nbAiOpen() {
    try { await nbStartTempDraft(); } catch (e) { return; }
    el('nb-ai-prompt').value = '';
    el('nb-ai-ents').value = '';
    el('nb-ai-status').textContent = '';
    el('nb-ai-prompt').focus();
  }

  // Shared call: promptText is the instruction; baseContent (if set) makes it a revision.
  async function nbAiRun(promptText, baseContent, statusMsg) {
    var ents = el('nb-ai-ents').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    el('nb-ai-status').textContent = statusMsg;
    var r = await fetch('/api/dm-admin/notebook/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ prompt:promptText, entities:ents, baseContent:baseContent || '' }) });
    var d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Generation failed');
    nbSetContent(d.content || '');
    _nbAiGenerated = true;
    _nbDirty = true;
    nbShowTab('edit');
    el('nb-ai-status').textContent = (d.ragChunks || 0) + ' RAG chunks \u00b7 ' + (d.entityLookups || 0) + ' NPC lookups' + (d.usage ? ' \u00b7 ' + d.usage.total_tokens + ' tokens' : '');
    await nbAutoSave();
    nbLoadNoteInfo(el('nb-editor').value);
    return d;
  }

  // Generate / Regenerate: run the prompt and replace the draft.
  async function nbAiGenerate() {
    var p = el('nb-ai-prompt').value.trim();
    if (!p) return alert('Enter a prompt');
    if (!_nbCurrentPath) { try { await nbStartTempDraft(); } catch (e) { return; } }
    var btn = el('nb-ai-gen'); btn.disabled = true;
    var rbtn = el('nb-ai-regen'); if (rbtn) rbtn.disabled = true;
    try {
      var d = await nbAiRun(p, '', 'Generating with campaign RAG...');
      // For a fresh temp draft, auto-name from the first heading.
      if (_nbAiTempPath && _nbCurrentPath === _nbAiTempPath) {
        var m = (d.content || '').match(/^#\\s+(.+)$/m);
        if (m) el('nb-note-title').value = m[1].trim();
      }
    } catch (e) { el('nb-ai-status').textContent = 'Error: ' + e.message; }
    finally { btn.disabled = false; if (rbtn) rbtn.disabled = false; }
  }

  // Refine: revise the current draft with a follow-up instruction.
  async function nbAiRefine() {
    var instr = el('nb-ai-followup').value.trim();
    if (!instr) return alert('Enter a follow-up instruction');
    var base = el('nb-editor').value;
    if (!base.trim()) return alert('Generate or write a draft first');
    var btn = el('nb-ai-refine'); btn.disabled = true;
    try {
      await nbAiRun(instr, base, 'Refining with AI...');
      el('nb-ai-followup').value = '';
    } catch (e) { el('nb-ai-status').textContent = 'Error: ' + e.message; }
    finally { btn.disabled = false; }
  }

  async function nbNewFile() { nbNewFileIn(''); }
  async function nbNewFileIn(folder) {
    var name = prompt('New note name (e.g. session-12):');
    if (!name) return;
    if (!name.endsWith('.md')) name += '.md';
    var fullPath = folder ? folder + '/' + name : name;
    var title = name.replace(/\\.md$/i, '').replace(/[-_]/g, ' ');
    var content = (folder === 'Sessions' || (folder && folder.indexOf('Sessions/') === 0)) ? nbSessionTemplate() : ('# ' + title + '\\n\\n');
    var r = await fetch('/api/dm-admin/notebook/create', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:fullPath, type:'file', content:content}) });
    if (r.ok) { await loadNotes(); nbOpenFile(fullPath); }
    else { var d = await r.json(); alert('Error: '+(d.error||'')); }
  }

  // Default template for a new Session page (Adventure Notes/Sessions/).
  function nbSessionTemplate() {
    return 'Session #: \\nTitle: \\nIn-Game Date: \\nPlay Date: \\n\\n# Session Notes\\n\\n\\n# Session Summary\\n\\n_This is what players will see when you Publish. Write it by hand or use Generate Summary to draft it from the notes above._\\n';
  }

  // Session pages: AI-draft the Session Summary from the Session Notes.
  async function nbSessionGenSummary() {
    if (!_nbCurrentPath) return;
    if (_nbDirty) await nbAutoSave();
    var btn = el('nb-session-summary'); btn.disabled = true;
    el('nb-save-status').textContent = 'Generating summary...'; el('nb-save-status').style.color = '#888';
    try {
      var r = await fetch('/api/dm-admin/notebook/session-summary', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ path:_nbCurrentPath }) });
      var d = await r.json();
      if (!r.ok) { el('nb-save-status').textContent = 'Summary failed: ' + (d.error||''); el('nb-save-status').style.color = '#f44'; return; }
      nbSetContent(d.content || '');
      _nbDirty = false;
      el('nb-save-status').textContent = 'Summary generated'; el('nb-save-status').style.color = '#4ade80';
    } catch (e) { el('nb-save-status').textContent = 'Summary error: ' + e.message; el('nb-save-status').style.color = '#f44'; }
    finally { btn.disabled = false; }
  }

  // Session pages: render a GM Guide PDF (Session Notes, minus the summary).
  async function nbSessionPdf() {
    if (!_nbCurrentPath) return;
    if (_nbDirty) await nbAutoSave();
    var btn = el('nb-session-pdf'); btn.disabled = true;
    el('nb-save-status').textContent = 'Building PDF...'; el('nb-save-status').style.color = '#888';
    try {
      var r = await fetch('/api/dm-admin/notebook/session-pdf', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ path:_nbCurrentPath }) });
      var d = await r.json();
      if (!r.ok) { el('nb-save-status').textContent = 'PDF failed: ' + (d.error||''); el('nb-save-status').style.color = '#f44'; return; }
      el('nb-save-status').textContent = 'PDF ready'; el('nb-save-status').style.color = '#4ade80';
      if (d.download_url) window.open(d.download_url, '_blank');
    } catch (e) { el('nb-save-status').textContent = 'PDF error: ' + e.message; el('nb-save-status').style.color = '#f44'; }
    finally { btn.disabled = false; }
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
  // The full Player Characters workspace lives at /characters/admin.
  // The sidebar link navigates straight there; this loader is a no-op kept
  // so the dmc() panel router still has a registered handler for the
  // 'characters' key (the Characters <section> renders a permanent CTA).
  function loadChars() {}

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
  let _npcAssociations = [];
  function renderAssociations() {
    const box = el('npc-assoc-list');
    if (!_npcAssociations.length) { box.innerHTML = '<p style="color:#555;font-size:0.78rem;margin:4px 0;">No associations.</p>'; return; }
    box.innerHTML = _npcAssociations.map(function(a, i) {
      return '<div style="display:flex;gap:8px;align-items:center;padding:4px 8px;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:4px;margin-bottom:4px;">'+
        '<span style="color:#e8b923;font-weight:600;min-width:100px;">'+esc(a.name)+'</span>'+
        '<span style="color:#888;font-size:0.78rem;flex:1;">'+esc(a.relationship||'')+'</span>'+
        '<button type="button" class="dmc-btn dmc-btn-sm dmc-btn-danger" onclick="removeAssociation('+i+')" style="padding:2px 6px;">✕</button></div>';
    }).join('');
  }
  function addAssociation() {
    var name = el('npc-assoc-name').value.trim();
    var npcId = el('npc-assoc-id').value.trim();
    var rel = el('npc-assoc-rel').value.trim();
    if (!name) return;
    _npcAssociations.push({name:name, id:npcId?parseInt(npcId):null, relationship:rel, type:'npc'});
    el('npc-assoc-name').value = ''; el('npc-assoc-id').value = ''; el('npc-assoc-rel').value = '';
    renderAssociations();
  }
  function removeAssociation(i) {
    _npcAssociations.splice(i, 1);
    renderAssociations();
  }
  function newNpc() {
    el('npc-id').value = ''; el('npc-name').value = ''; el('npc-race').value = ''; el('npc-class').value = '';
    el('npc-location').value = ''; el('npc-status').value = 'Alive'; el('npc-align').value = 'neutral';
    el('npc-sort').value = '0'; el('npc-hidden').value = 'false'; el('npc-portrait').value = ''; el('npc-desc').value = ''; el('npc-dm-notes').value = '';
    _npcAssociations = [];
    renderAssociations();
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
    el('npc-id').value = n.id; el('npc-name').value = n.name||''; el('npc-race').value = n.race||''; el('npc-class').value = n.npc_class||'';
    el('npc-location').value = n.location||'';
    el('npc-status').value = n.status||'Unknown'; el('npc-align').value = n.alignment_tag||'neutral';
    el('npc-sort').value = n.sort_order||0; el('npc-hidden').value = n.is_hidden?'true':'false';
    el('npc-portrait').value = n.portrait_url||''; el('npc-desc').value = n.description||''; el('npc-dm-notes').value = n.dm_notes||'';
    _npcAssociations = Array.isArray(n.associations) ? n.associations.slice() : [];
    renderAssociations();
    npcPreviewPortrait();
    el('npc-edit-title').textContent = 'Edit: ' + n.name; el('npc-del-btn').style.display = 'inline-block';
    el('npc-edit').style.display = 'block';
    el('npc-edit').scrollIntoView({behavior:'smooth'});
  }
  async function saveNpc(e) {
    e.preventDefault();
    const id = el('npc-id').value;
    const body = { name:el('npc-name').value, race:el('npc-race').value, npc_class:el('npc-class').value,
      location:el('npc-location').value, status:el('npc-status').value, alignment_tag:el('npc-align').value,
      portrait_url:el('npc-portrait').value, description:el('npc-desc').value, dm_notes:el('npc-dm-notes').value,
      associations:_npcAssociations, sort_order:+el('npc-sort').value, is_hidden:el('npc-hidden').value==='true' };
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
  // Size the DMC canvas to the REAL space under the site header. The header
  // contains the logo banner, which uses width:100% and therefore grows taller
  // on wider viewports; the static .dmc height of calc(100vh - 60px) assumed a
  // 60px header, so on wide screens .dmc (and the Sessions iframe inside it)
  // overflowed below the viewport and overflow:hidden clipped the editor's
  // bottom button bar. Measuring the header height fixes it at any size.
  function sizeDmc() {
    var d = document.querySelector('.dmc');
    if (!d) return;
    d.style.height = Math.max(320, window.innerHeight - d.getBoundingClientRect().top) + 'px';
  }
  sizeDmc();
  window.addEventListener('resize', sizeDmc);
  window.addEventListener('load', sizeDmc);
  var _brandImg = document.querySelector('.site-brand img');
  if (_brandImg && !_brandImg.complete) _brandImg.addEventListener('load', sizeDmc);

  // Panel selection is hash-driven so the top-menu dropdown can deep-link into
  // any tool (/dm-admin#sessions) and switch panels without a reload.
  window.addEventListener('hashchange', function() {
    showPanel((location.hash || '').replace('#', ''));
  });
  showPanel((location.hash || '').replace('#', '') || 'chat');
  </script>`;

  return pageShell("DM Command Center — Halls of the Damned", "/dm-admin", body, session);
}

module.exports = { renderDmAdminPage };
