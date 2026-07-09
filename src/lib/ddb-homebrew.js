// ══════════════════════════════════════════════════════════════
// ── D&D BEYOND HOMEBREW PUSH ──────────────────────────────────
// Creates/edits/deletes homebrew content on D&D Beyond via the
// verified, CSRF-protected form flow (see repo memory
// `ddb-homebrew-push.md`). Auth is sourced through `ddb-client`
// (Key Vault-backed cobalt token).
//
// FRAGILE + against DDB automation ToS (accepted by the DM). Every
// DDB write is gated behind `pushEnabled()` so the rest of the app
// (Save + Embed) works even when pushing is turned off.
//
// Status: `magic-item` category is fully mapped + verified. The other
// six categories (feat/spell/monster/species/subclass/background)
// need the §1.2 recon before their adapters are added. `publishDraft`
// (public/campaign visibility) and `uploadImage` are intentionally
// stubbed pending the §1.3/§1.4 decisions.
// ══════════════════════════════════════════════════════════════

const ddbClient = require("./ddb-client");

const BASE = "https://www.dndbeyond.com";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Global push kill-switch. Off by default; enable via env for now.
function pushEnabled() {
  return process.env.DDB_ENABLE_PUSH === "1" || process.env.DDB_ENABLE_PUSH === "true";
}
function assertPushEnabled() {
  if (!pushEnabled()) {
    const e = new Error("DDB push is disabled (set DDB_ENABLE_PUSH=1 to enable)");
    e.reason = "push-disabled";
    throw e;
  }
}

// ── Category registry (magic-item mapped; others pending recon) ─
const RARITY = { common: 1, uncommon: 2, rare: 3, "very rare": 4, legendary: 5, artifact: 7, varies: 9, unknown: 10 };
const MITYPE = { potion: 3, ring: 4, rod: 5, staff: 7, scroll: 6, wand: 8, "wondrous item": 10 };
function mapId(map, v, fallback) {
  if (v == null || v === "") return fallback;
  if (/^\d+$/.test(String(v))) return String(v);
  return String(map[String(v).toLowerCase()] || fallback);
}

const CATEGORIES = {
  "magic-item": {
    entityTypeId: "112130694",
    createPath: "/homebrew/creations/create-magic-item",
    editPath: (id, slug) => `/homebrew/creations/magic-items/${id}-${slug}/edit`,
    // Step-1 create body: pick a type + a base item to copy.
    createBody(baseId, fields) {
      return {
        "magic-item-type": mapId(MITYPE, fields.type, "10"),
        "magic-item": String(baseId),
      };
    },
    // Step-2 full edit body from our fields, merged over the editor's
    // current values (so unset fields keep their copied defaults).
    editBody(fields, cur) {
      const desc = fields.description || fields.item_description || "";
      const b = {
        name: fields.name || cur.name || "Homebrew Item",
        version: cur.version || "",
        rarity: mapId(RARITY, fields.rarity, cur.rarity || "2"),
        "item-base-type": cur.itemBaseType || "",
        type: mapId(MITYPE, fields.type, cur.type || "10"),
        "strength-requirement": cur.strengthRequirement || "",
        "attunement-description": fields.attunement_description || cur.attunementDescription || "",
        "item-description-type": cur.itemDescriptionType || "",
        "item-description-wysiwyg": desc.trimStart().startsWith("<") ? desc : `<p>${escapeHtml(desc)}</p>`,
        "item-description": stripHtml(desc),
        "number-of-charges": fields.number_of_charges || cur.numberOfCharges || "",
        "charge-reset-condition": cur.chargeResetCondition || "",
        "charge-reset-description": fields.charge_reset_description || cur.chargeResetDescription || "",
        notes: fields.notes || cur.notes || "",
        weight: fields.weight != null ? String(fields.weight) : (cur.weight || ""),
      };
      if (fields.requires_attunement || cur.requiresAttunement) b["requires-attunement"] = "on";
      return b;
    },
  },
};

function categoryDef(category) {
  const def = CATEGORIES[category];
  if (!def) { const e = new Error(`Category not yet supported for DDB push: ${category}`); e.reason = "category-unmapped"; throw e; }
  return def;
}

// ── Small helpers ─────────────────────────────────────────────
function escapeHtml(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function stripHtml(s) { return String(s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim(); }
function slugify(name) { return String(name || "item").toLowerCase().replace(/[\u2018\u2019']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

// Parse a named control's current value out of editor HTML.
function fieldValue(html, name) {
  let m = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*value="([^"]*)"`, "i"));
  if (m) return m[1];
  m = html.match(new RegExp(`<textarea[^>]*name="${name}"[^>]*>([\\s\\S]*?)</textarea>`, "i"));
  if (m) return m[1].trim();
  m = html.match(new RegExp(`<select[^>]*name="${name}"[\\s\\S]*?</select>`, "i"));
  if (m) { const s = m[0].match(/<option[^>]*value="([^"]*)"[^>]*selected/i); if (s) return s[1]; }
  return "";
}
function isChecked(html, name) { const m = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`, "i")); return m ? /checked/i.test(m[0]) : false; }

// ── Authenticated session (cobalt cookie jar + CSRF) ──────────
async function session() {
  const cobalt = await ddbClient.getCobaltToken();
  if (!cobalt) { const e = new Error("No DDB cobalt token available"); e.reason = "ddb-token-missing"; throw e; }
  const jar = { CobaltSession: cobalt };
  const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
  const merge = (setc) => { for (const c of (setc || [])) { const [k, ...v] = c.split(";")[0].split("="); if (k) jar[k.trim()] = v.join("="); } };
  const H = (extra = {}) => ({ Cookie: cookie(), "User-Agent": UA, ...extra });

  async function get(path, accept = "text/html") {
    const r = await fetch(path.startsWith("http") ? path : BASE + path, { headers: H({ Accept: accept }), redirect: "manual" });
    merge(r.headers.getSetCookie ? r.headers.getSetCookie() : []);
    return r;
  }
  async function getFollow(path) {
    let r = await get(path);
    let guard = 0;
    while (r.status >= 300 && r.status < 400 && guard++ < 5) r = await get(new URL(r.headers.get("location"), BASE).href);
    return r;
  }
  async function postForm(path, body, referer) {
    const r = await fetch(path.startsWith("http") ? path : BASE + path, {
      method: "POST", redirect: "manual",
      headers: H({ "Content-Type": "application/x-www-form-urlencoded", Origin: BASE, Referer: referer || BASE, Accept: "text/html" }),
      body: new URLSearchParams(body).toString(),
    });
    merge(r.headers.getSetCookie ? r.headers.getSetCookie() : []);
    return r;
  }
  // ajax-post CSRF: fetch /refresh-request-verification-token → cookie value
  async function requestVerificationToken() {
    const r = await fetch(`${BASE}/refresh-request-verification-token`, { method: "POST", headers: H({ "X-Requested-With": "XMLHttpRequest", Accept: "application/json" }) });
    merge(r.headers.getSetCookie ? r.headers.getSetCookie() : []);
    return jar["RequestVerificationToken"] || "";
  }
  async function ajaxPost(path) {
    const token = await requestVerificationToken();
    const r = await fetch(path.startsWith("http") ? path : BASE + path, {
      method: "POST", redirect: "manual",
      headers: H({ "X-Requested-With": "XMLHttpRequest", Origin: BASE, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json, text/javascript, */*" }),
      body: new URLSearchParams({ "request-verification-token": decodeURIComponent(token) }).toString(),
    });
    return r;
  }
  function formTokens(html) {
    return {
      "security-token": (html.match(/name="security-token"[^>]*value="([^"]+)"/) || [])[1] || "",
      "authenticity-token": (html.match(/name="authenticity-token"[^>]*value="([^"]+)"/) || [])[1] || "",
    };
  }
  return { get, getFollow, postForm, ajaxPost, formTokens };
}

// ── Draft lifecycle ───────────────────────────────────────────
// Create a private homebrew draft by copying a base entity.
async function createDraft(category, baseId, fields = {}) {
  assertPushEnabled();
  const def = categoryDef(category);
  const s = await session();
  const g = await s.get(def.createPath);
  const html = await g.text();
  const tokens = s.formTokens(html);
  if (!tokens["security-token"]) { const e = new Error("Could not read DDB form tokens (token expired?)"); e.reason = "ddb-token-expired"; throw e; }
  const body = { ...tokens, ...def.createBody(baseId, fields) };
  const p = await s.postForm(def.createPath, body, BASE + def.createPath);
  if (p.status < 300 || p.status >= 400) { const e = new Error(`DDB create rejected (${p.status})`); e.reason = "ddb-create-failed"; throw e; }
  const loc = p.headers.get("location") || "";
  const id = (loc.match(/[?&]id=(\d+)/) || [])[1];
  if (!id) { const e = new Error("DDB create did not return a draft id"); e.reason = "ddb-create-failed"; throw e; }
  return { id, entityTypeId: def.entityTypeId, editRedirect: loc };
}

// Apply our field values to a draft via the full editor form POST.
async function editDraft(category, id, fields = {}) {
  assertPushEnabled();
  const def = categoryDef(category);
  const s = await session();
  // Load the editor (follow the ?id= redirect to the slug editor).
  const r = await s.getFollow(`/homebrew/creations/edit?entityTypeId=${def.entityTypeId}&id=${id}`);
  const html = await r.text();
  const action = (html.match(/action="(\/homebrew\/creations\/[^"]+\/edit)"/) || [])[1];
  const tokens = s.formTokens(html);
  if (!action || !tokens["security-token"]) { const e = new Error("Could not open DDB editor (token expired?)"); e.reason = "ddb-token-expired"; throw e; }
  const cur = {
    name: fieldValue(html, "name"), version: fieldValue(html, "version"), rarity: fieldValue(html, "rarity"),
    type: fieldValue(html, "type"), itemBaseType: fieldValue(html, "item-base-type"),
    strengthRequirement: fieldValue(html, "strength-requirement"), requiresAttunement: isChecked(html, "requires-attunement"),
    attunementDescription: fieldValue(html, "attunement-description"), itemDescriptionType: fieldValue(html, "item-description-type"),
    numberOfCharges: fieldValue(html, "number-of-charges"), chargeResetCondition: fieldValue(html, "charge-reset-condition"),
    chargeResetDescription: fieldValue(html, "charge-reset-description"), notes: fieldValue(html, "notes"), weight: fieldValue(html, "weight"),
  };
  const body = { ...tokens, ...def.editBody(fields, cur) };
  const p = await s.postForm(action, body, BASE + action);
  const loc = p.headers.get("location") || "";
  const slug = (loc.match(/magic-items\/\d+-([^/]+)\/edit/) || [])[1] || slugify(fields.name);
  const ok = p.status >= 300 && p.status < 400; // 303 on success
  return { ok, id, slug, ddbUrl: `${BASE}/magic-items/${id}-${slug}` };
}

// Delete a homebrew draft (ajax-post with request-verification-token).
async function deleteDraft(category, id) {
  assertPushEnabled();
  const def = categoryDef(category);
  const s = await session();
  const p = await s.ajaxPost(`/homebrew/creations/delete?entityTypeId=${def.entityTypeId}&id=${id}`);
  const body = await p.text().catch(() => "");
  const ok = p.status === 200 && /RedirectUrl/.test(body);
  return { ok, id };
}

// One-shot: create draft (copy base), apply fields. Returns ids + URL.
async function pushDraft(category, { baseId, fields }) {
  const created = await createDraft(category, baseId, fields);
  const edited = await editDraft(category, created.id, fields);
  return { id: created.id, entityTypeId: created.entityTypeId, slug: edited.slug, ddbUrl: edited.ddbUrl, edited: edited.ok };
}

// ── Deferred (pending §1.3 / §1.4 decisions) ──────────────────
async function publishDraft() {
  const e = new Error("DDB publish (public/campaign visibility) not yet enabled — pending §1.3 recon + confirmation");
  e.reason = "publish-not-implemented";
  throw e;
}
async function uploadImage() {
  const e = new Error("DDB image upload not yet enabled — pending §1.4 decision (HOTD-only for now)");
  e.reason = "image-not-implemented";
  throw e;
}

module.exports = {
  pushEnabled, session,
  createDraft, editDraft, deleteDraft, pushDraft,
  publishDraft, uploadImage,
  CATEGORIES,
};
