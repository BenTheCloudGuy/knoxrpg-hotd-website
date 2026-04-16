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
          <button class="dmc-nav-btn" onclick="dmc('notes')">Notes Board</button>
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

      <!-- ╔══ NOTES BOARD ══╗ -->
      <section class="dmc-panel" id="dmc-notes" style="display:none;">
        <div class="dmc-panel-bar"><h2>Notes Board</h2>
          <div class="dmc-bar-actions"><button class="dmc-btn dmc-btn-primary dmc-btn-sm" onclick="newNote()">+ New Note</button></div>
        </div>
        <div class="kanban" id="kanban">
          <div class="kanban-col" data-status="backlog"><div class="kanban-col-hdr">Backlog</div><div class="kanban-cards" id="kanban-backlog"></div></div>
          <div class="kanban-col" data-status="todo"><div class="kanban-col-hdr">To Do</div><div class="kanban-cards" id="kanban-todo"></div></div>
          <div class="kanban-col" data-status="in_progress"><div class="kanban-col-hdr">In Progress</div><div class="kanban-cards" id="kanban-in_progress"></div></div>
          <div class="kanban-col" data-status="done"><div class="kanban-col-hdr">Done</div><div class="kanban-cards" id="kanban-done"></div></div>
        </div>
        <div id="note-modal" class="note-modal" style="display:none;" onclick="if(event.target===this)closeNoteModal()">
          <div class="note-modal-inner">
            <h3 id="note-modal-title">New Note</h3>
            <form onsubmit="saveNote(event)">
              <input type="hidden" id="note-id" />
              <label>Title<input id="note-title" required /></label>
              <label>Content<textarea id="note-content" rows="6" class="dmc-textarea"></textarea></label>
              <div class="dmc-form-row">
                <label>Status<select id="note-status">
                  <option value="backlog">Backlog</option><option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option><option value="done">Done</option>
                </select></label>
                <label>Priority<select id="note-priority">
                  <option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option>
                </select></label>
                <label>Category<input id="note-category" value="General" /></label>
              </div>
              <label>Tags (comma separated)<input id="note-tags" /></label>
              <div class="dmc-form-actions">
                <button type="submit" class="dmc-btn dmc-btn-primary">Save</button>
                <button type="button" class="dmc-btn dmc-btn-danger" onclick="deleteNote()">Delete</button>
                <button type="button" class="dmc-btn" onclick="closeNoteModal()">Cancel</button>
              </div>
            </form>
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
            <button class="dmc-btn dmc-btn-sm" onclick="splitNpcDescriptions()" title="Use AI to split existing descriptions into Player/DM fields" style="background:#2a1a3a;color:#c084fc;border:1px solid #7c3aed44;">AI Split Descriptions</button>
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

    /* ═══ KANBAN (Notes Board) ═══ */
    .kanban { display:flex; gap:12px; overflow-x:auto; padding-bottom:8px; min-height:400px; }
    .kanban-col { flex:1; min-width:220px; background:#0d0d0d; border:1px solid #222; border-radius:8px; display:flex; flex-direction:column; }
    .kanban-col-hdr { color:#c83232; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; padding:10px 12px; border-bottom:1px solid #222; }
    .kanban-cards { flex:1; padding:8px; overflow-y:auto; min-height:100px; }
    .kanban-card { background:#111; border:1px solid #2a2a2a; border-radius:6px; padding:10px; margin-bottom:8px; cursor:pointer; transition:border-color 0.15s; }
    .kanban-card:hover { border-color:#e8b923; }
    .kanban-card h5 { color:#ccc; margin:0 0 4px; font-size:0.8rem; }
    .kanban-card small { color:#555; font-size:0.68rem; }
    .kanban-card .priority-high { color:#f44; }
    .kanban-card .priority-medium { color:#e8b923; }
    .kanban-card .priority-low { color:#4ade80; }

    /* ── Note modal ── */
    .note-modal { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.8); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px; }
    .note-modal-inner { background:#1a1a1a; border:1px solid #333; border-radius:8px; padding:20px; width:100%; max-width:500px; }
    .note-modal-inner h3 { color:#c83232; margin:0 0 12px; }
    .note-modal-inner label { display:flex; flex-direction:column; gap:4px; color:#777; font-size:0.72rem; text-transform:uppercase; margin-bottom:10px; }
    .note-modal-inner input, .note-modal-inner select { background:#0d0d0d; border:1px solid #2a2a2a; border-radius:4px; padding:7px 8px; color:#ccc; font-size:0.82rem; }
    .note-modal-inner input:focus, .note-modal-inner select:focus { border-color:#c83232; outline:none; }

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
      .kanban { flex-direction:column; }
      .img-preview { flex-direction:column; }
      .img-preview img { width:100%; }
      .img-modal-inner { flex-direction:column; }
      .img-modal-inner img { max-width:100%; }
    }
  </style>

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

  // ═══ NOTES (KANBAN) ═══
  let _notesData = [];

  async function loadNotes() {
    const r = await fetch('/api/dm-admin/notes');
    const d = await r.json();
    _notesData = d.notes || [];
    renderKanban();
  }

  function renderKanban() {
    ['backlog','todo','in_progress','done'].forEach(status => {
      const container = el('kanban-' + status);
      const cards = _notesData.filter(n => n.status === status);
      container.innerHTML = cards.map(n => {
        const pCls = n.priority === 'high' ? 'priority-high' : n.priority === 'medium' ? 'priority-medium' : 'priority-low';
        return '<div class="kanban-card" draggable="true" data-id="'+n.id+'" ondragstart="noteDragStart(event)" onclick="editNote('+n.id+')">' +
          '<h5>'+esc(n.title)+'</h5><small><span class="'+pCls+'">&#9679;</span> '+esc(n.category)+(n.tags?.length?' &middot; '+n.tags.join(', '):'')+
          '</small></div>';
      }).join('');
    });

    // Setup drop targets
    document.querySelectorAll('.kanban-cards').forEach(zone => {
      zone.ondragover = e => { e.preventDefault(); zone.style.background = '#1a1a1a'; };
      zone.ondragleave = () => { zone.style.background = ''; };
      zone.ondrop = async e => {
        e.preventDefault();
        zone.style.background = '';
        const id = e.dataTransfer.getData('text/plain');
        const newStatus = zone.id.replace('kanban-', '');
        await fetch('/api/dm-admin/notes/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status:newStatus})});
        loadNotes();
      };
    });
  }

  function noteDragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.dataset.id);
  }

  function newNote() {
    el('note-id').value = '';
    el('note-title').value = '';
    el('note-content').value = '';
    el('note-status').value = 'backlog';
    el('note-priority').value = 'medium';
    el('note-category').value = 'General';
    el('note-tags').value = '';
    el('note-modal-title').textContent = 'New Note';
    el('note-modal').style.display = 'flex';
  }

  function editNote(id) {
    const n = _notesData.find(x => x.id === id);
    if (!n) return;
    el('note-id').value = n.id;
    el('note-title').value = n.title;
    el('note-content').value = n.content || '';
    el('note-status').value = n.status;
    el('note-priority').value = n.priority;
    el('note-category').value = n.category || 'General';
    el('note-tags').value = (n.tags||[]).join(', ');
    el('note-modal-title').textContent = 'Edit: ' + n.title;
    el('note-modal').style.display = 'flex';
  }

  function closeNoteModal() { el('note-modal').style.display = 'none'; }

  async function saveNote(e) {
    e.preventDefault();
    const id = el('note-id').value;
    const body = {
      title: el('note-title').value,
      content: el('note-content').value,
      status: el('note-status').value,
      priority: el('note-priority').value,
      category: el('note-category').value,
      tags: el('note-tags').value.split(',').map(s=>s.trim()).filter(Boolean),
    };
    const url = id ? '/api/dm-admin/notes/' + id : '/api/dm-admin/notes';
    const method = id ? 'PUT' : 'POST';
    const r = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    if (r.ok) { closeNoteModal(); loadNotes(); }
    else { const d = await r.json(); alert('Error: ' + (d.error||'')); }
  }

  async function deleteNote() {
    const id = el('note-id').value;
    if (!id || !confirm('Delete this note?')) return;
    await fetch('/api/dm-admin/notes/' + id, { method:'DELETE' });
    closeNoteModal(); loadNotes();
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
      '<td style="color:#e8b923;font-weight:600;">'+esc(n.name)+'</td><td>'+esc(n.race||'')+'</td>'+
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
  async function splitNpcDescriptions() {
    if (!confirm('This will use AI to split all NPC descriptions (that don\\'t already have DM Notes) into Player-safe and DM-only fields. Continue?')) return;
    showAlert(el('npcs-status'), 'AI is processing NPC descriptions... this may take a minute.', 'ok');
    try {
      const r = await fetch('/api/dm-admin/npcs/split-descriptions', {method:'POST'});
      const d = await r.json();
      if (d.error) { showAlert(el('npcs-status'), 'Error: '+d.error, 'err'); return; }
      var ok = d.results ? d.results.filter(function(x){return x.status==='ok';}).length : 0;
      var fail = d.results ? d.results.filter(function(x){return x.status==='error';}).length : 0;
      showAlert(el('npcs-status'), 'Done! '+ok+' NPCs split successfully'+(fail?' ('+fail+' errors)':'')+'.', ok?'ok':'err');
      loadNpcs();
    } catch(e) { showAlert(el('npcs-status'), 'Error: '+e.message, 'err'); }
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
