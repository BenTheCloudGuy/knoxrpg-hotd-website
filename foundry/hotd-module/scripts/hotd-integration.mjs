/**
 * Halls of the Damned — Website Integration Module
 * Main entry point for FoundryVTT v13
 */

const MODULE_ID = 'hotd-website-integration';

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | Initializing`);

  // ── Website sync settings ──────────────────────────────────
  game.settings.register(MODULE_ID, 'websiteUrl', {
    name: 'HotD Website URL',
    hint: 'Base URL of the Halls of the Damned campaign website (e.g. https://hotd.knoxrpg.com).',
    scope: 'world',
    config: true,
    type: String,
    default: 'https://hotd.knoxrpg.com',
  });

  game.settings.register(MODULE_ID, 'syncEnabled', {
    name: 'Enable Sync',
    hint: 'Automatically sync session data between FoundryVTT and the website',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });

  // ── DM AI (RAG) chat bridge settings ───────────────────────
  game.settings.register(MODULE_ID, 'dmaiToken', {
    name: 'DM AI Token',
    hint: 'Shared token that authenticates chat queries to the website DM AI (matches hotd_config.foundry_dmai_token). GM-only.',
    scope: 'world',
    config: true,
    type: String,
    default: '',
  });

  game.settings.register(MODULE_ID, 'dmaiTrigger', {
    name: 'DM AI Chat Trigger',
    hint: 'Type this word at the start of a chat message, followed by your question, to ask the DM AI.',
    scope: 'world',
    config: true,
    type: String,
    default: 'DMAI',
  });

  game.settings.register(MODULE_ID, 'dmaiWhisper', {
    name: 'Whisper DM AI Responses',
    hint: 'DM AI answers draw on DM-only campaign lore. Keep ON to whisper the exchange to the asker + GMs. Turn OFF to post publicly to the table.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, 'dmaiPlayersAllowed', {
    name: 'Allow Players to use DM AI',
    hint: 'When ON, players may also use the trigger (they receive player-safe answers, no DM-only lore). When OFF, only the GM can use it.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });
});

Hooks.once('ready', () => {
  console.log(`${MODULE_ID} | Ready`);
  if (!game.modules.get(MODULE_ID)?.active) return;

  const trigger = game.settings.get(MODULE_ID, 'dmaiTrigger') || 'DMAI';
  const hasToken = !!game.settings.get(MODULE_ID, 'dmaiToken');
  console.log(`${MODULE_ID} | DM AI trigger "${trigger}" ${hasToken ? 'ready' : '(token not set)'}`);
  if (game.user.isGM && !hasToken) {
    ui.notifications.info(`HotD DM AI: set the "DM AI Token" in module settings to enable "${trigger} <question>".`);
  }
});

// ── Intercept "DMAI <question>" chat commands ────────────────
Hooks.on('chatMessage', (chatLog, message, chatData) => {
  // GM-only import command: "HOTD IMPORT npcs" / "HOTD IMPORT pcs"
  const imp = message.match(/^HOTD\s*IMPORT\s+(npcs?|pcs?|players?)\b/i);
  if (imp) {
    if (!game.user.isGM) { ui.notifications.warn('HotD import is GM-only.'); return false; }
    importActors(/pc|player/i.test(imp[1]) ? 'pc' : 'npc').catch((e) => console.error(`${MODULE_ID} | import`, e));
    return false;
  }

  const trigger = (game.settings.get(MODULE_ID, 'dmaiTrigger') || 'DMAI').trim();
  if (!trigger) return true;
  const re = new RegExp('^' + escapeRegExp(trigger) + '\\b[:,]?\\s*([\\s\\S]*)$', 'i');
  const m = message.match(re);
  if (!m) return true; // not a DM AI command — let Foundry handle it normally

  const question = (m[1] || '').trim();
  const playersAllowed = game.settings.get(MODULE_ID, 'dmaiPlayersAllowed');
  if (!game.user.isGM && !playersAllowed) {
    ui.notifications.warn('The DM AI is restricted to the GM.');
    return false;
  }
  if (!question) {
    ui.notifications.warn(`Usage: ${trigger} <question>`);
    return false;
  }
  askDMAI(question).catch((err) => console.error(`${MODULE_ID} | DM AI error`, err));
  return false; // suppress the raw command from the chat log
});

async function askDMAI(question) {
  const base = (game.settings.get(MODULE_ID, 'websiteUrl') || '').replace(/\/+$/, '');
  const token = game.settings.get(MODULE_ID, 'dmaiToken');
  const whisper = game.settings.get(MODULE_ID, 'dmaiWhisper');

  if (!base || !token) {
    ui.notifications.error('DM AI is not configured (set the Website URL and DM AI Token in module settings).');
    return;
  }

  // GMs get full (DM-only) RAG; players get player-safe answers.
  const asDM = game.user.isGM;
  const gmIds = ChatMessage.getWhisperRecipients('GM').map((u) => u.id);
  const whisperTo = whisper ? Array.from(new Set([game.user.id, ...gmIds])) : [];
  const alias = 'DM AI';

  await ChatMessage.create({
    content: `<b>${escapeHtml(game.user.name)} asks the DM AI:</b> ${escapeHtml(question)}`,
    speaker: { alias },
    whisper: whisperTo,
  });
  const thinking = await ChatMessage.create({
    content: `<i>DM AI is consulting the archives&hellip;</i>`,
    speaker: { alias },
    whisper: [game.user.id],
  });

  try {
    const res = await fetch(`${base}/api/foundry/dmai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ question, dm: asDM }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    await thinking?.delete();
    await ChatMessage.create({
      content: `<div class="hotd-dmai"><b>DM AI:</b><br>${mdToHtml(data.reply || '(no answer)')}</div>`,
      speaker: { alias },
      whisper: whisperTo,
    });
  } catch (err) {
    await thinking?.delete();
    await ChatMessage.create({
      content: `<b>DM AI error:</b> ${escapeHtml(err.message || String(err))}`,
      speaker: { alias },
      whisper: Array.from(new Set([game.user.id, ...gmIds])),
    });
  }
}

// ── Small helpers ────────────────────────────────────────────
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Minimal, safe Markdown -> HTML for chat (escape first, then a few inline forms).
function mdToHtml(md) {
  let html = escapeHtml(md);
  html = html.replace(/```([\s\S]*?)```/g, (_, c) => `<pre>${c}</pre>`);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  html = html.replace(/\n{2,}/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  return `<p>${html}</p>`;
}

// ══════════════════════════════════════════════════════════════
// Actor import (website -> dnd5e Actors). GM-only. Idempotent: matches on the
// module flags (sourceType + sourceId) so re-running updates instead of dupes.
// ══════════════════════════════════════════════════════════════

// Resolve relative /hotd-content image paths against the website base URL.
function resolveImgs(payload, base) {
  const fix = (u) => (typeof u === 'string' && u.startsWith('/')) ? base + u : u;
  if (payload.img) payload.img = fix(payload.img);
  if (payload.prototypeToken?.texture?.src) {
    payload.prototypeToken.texture.src = fix(payload.prototypeToken.texture.src);
  }
}

async function importActors(type) {
  const base = (game.settings.get(MODULE_ID, 'websiteUrl') || '').replace(/\/+$/, '');
  const token = game.settings.get(MODULE_ID, 'dmaiToken');
  if (!base || !token) {
    ui.notifications.error('Set the Website URL and DM AI Token in module settings first.');
    return;
  }

  ui.notifications.info(`Importing ${type.toUpperCase()} from the HotD website…`);
  let payloads;
  try {
    const res = await fetch(`${base}/api/foundry/actors?type=${encodeURIComponent(type)}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    payloads = data.actors || [];
  } catch (err) {
    ui.notifications.error(`Import failed: ${err.message}`);
    return;
  }

  let created = 0, updated = 0, failed = 0;
  for (const p of payloads) {
    try {
      resolveImgs(p, base);
      const src = p.flags?.[MODULE_ID] || {};
      const existing = game.actors.find((a) =>
        a.getFlag(MODULE_ID, 'sourceType') === src.sourceType &&
        a.getFlag(MODULE_ID, 'sourceId') === src.sourceId);
      if (existing) { await existing.update(p); updated++; }
      else { await Actor.create(p); created++; }
    } catch (err) {
      failed++;
      console.error(`${MODULE_ID} | failed to import "${p?.name}"`, err);
    }
  }

  const summary = `HotD import (${type}): ${created} created, ${updated} updated${failed ? `, ${failed} failed` : ''}.`;
  ui.notifications.info(summary);
  ChatMessage.create({
    content: `<b>${summary}</b>`,
    speaker: { alias: 'HotD Import' },
    whisper: ChatMessage.getWhisperRecipients('GM').map((u) => u.id),
  });
}

async function promptImport() {
  const DV2 = foundry?.applications?.api?.DialogV2;
  if (DV2) {
    const choice = await DV2.wait({
      window: { title: 'Import from HotD Website' },
      content: '<p>Create or update Actors from the campaign website.</p>',
      buttons: [
        { action: 'npc', label: 'Import NPCs' },
        { action: 'pc', label: 'Import PCs (core stats)' },
        { action: 'cancel', label: 'Cancel' },
      ],
      submit: (r) => r,
    }).catch(() => 'cancel');
    if (choice && choice !== 'cancel') importActors(choice);
    return;
  }
  // Legacy fallback.
  new Dialog({
    title: 'Import from HotD Website',
    content: '<p>Create or update Actors from the campaign website.</p>',
    buttons: {
      npc: { label: 'Import NPCs', callback: () => importActors('npc') },
      pc: { label: 'Import PCs (core stats)', callback: () => importActors('pc') },
      cancel: { label: 'Cancel' },
    },
    default: 'cancel',
  }).render(true);
}

// GM button in the Actors sidebar directory.
Hooks.on('renderActorDirectory', (app, html) => {
  try {
    if (!game.user?.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector('.hotd-import-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hotd-import-btn';
    btn.innerHTML = '&#128229; Import from HotD';
    btn.addEventListener('click', () => promptImport());
    const header = root.querySelector('.directory-header') || root.querySelector('.header-actions') || root.querySelector('header') || root;
    header.appendChild(btn);
  } catch (err) {
    console.error(`${MODULE_ID} | failed to add import button`, err);
  }
});
