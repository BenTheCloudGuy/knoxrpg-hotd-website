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

// ── Enum maps (DDB select option ids, from live recon) ────────
const RARITY = { common: 1, uncommon: 2, rare: 3, "very rare": 4, legendary: 5, artifact: 7, varies: 9, unknown: 10 };
const MITYPE = { potion: 3, ring: 4, rod: 5, staff: 7, scroll: 6, wand: 8, "wondrous item": 10, armor: 1, weapon: 9 };
const SCHOOL = { abjuration: 3, conjuration: 4, divination: 5, enchantment: 6, evocation: 7, illusion: 8, necromancy: 9, transmutation: 10 };
const MSIZE = { tiny: 2, small: 3, medium: 4, large: 5, huge: 6, gargantuan: 7, "medium or small": 10 };
const MTYPE = { aberration: 1, beast: 2, celestial: 3, construct: 4, dragon: 6, elemental: 7, fey: 8, fiend: 9, giant: 10, humanoid: 11, monstrosity: 13, ooze: 14, plant: 15, undead: 16 };
const CLASSTYPE = { barbarian: 2190875, bard: 2190876, cleric: 2190877, druid: 2190878, fighter: 2190879, monk: 2190880, paladin: 2190881, ranger: 2190882, rogue: 2190883, sorcerer: 2190884, warlock: 2190885, wizard: 2190886, artificer: 2656866 };

function mapId(map, v, fallback) {
  if (v == null || v === "") return fallback;
  if (/^\d+$/.test(String(v))) return String(v);
  const m = map[String(v).toLowerCase().trim()];
  return m != null ? String(m) : fallback;
}
// CR string ("1/4", "5") → challenge-rating select id (0→1, 1/8→2, 1/4→3, 1/2→4, n≥1 → n+4).
function mapCR(v, fallback) {
  const s = String(v == null ? "" : v).trim();
  const frac = { "0": "1", "1/8": "2", "0.125": "2", "1/4": "3", "0.25": "3", "1/2": "4", "0.5": "4" };
  if (frac[s] != null) return frac[s];
  const n = parseInt(s, 10);
  if (!isNaN(n) && n >= 1 && n <= 30) return String(n + 4);
  return fallback;
}

// ── Small helpers ─────────────────────────────────────────────
function escapeHtml(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function stripHtml(s) { return String(s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim(); }
function slugify(name) { return String(name || "item").toLowerCase().replace(/[\u2018\u2019']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function decodeEntities(s) {
  return String(s || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&#x2F;/g, "/").replace(/&nbsp;/g, " ");
}
// Plain text → { wysiwyg (HTML paragraphs), plain }. Accepts pre-formed HTML.
function htmlPair(text) {
  const t = String(text || "").trim();
  if (!t) return { wysiwyg: "", plain: "" };
  if (t.startsWith("<")) return { wysiwyg: t, plain: stripHtml(t) };
  const wysiwyg = t.split(/\n\n+/).map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");
  return { wysiwyg, plain: t };
}
// Set a DDB description trio (base, base-wysiwyg, base-type) on a body object.
function setDesc(o, base, text) { const p = htmlPair(text); o[`${base}-type`] = "1"; o[`${base}-wysiwyg`] = p.wysiwyg; o[base] = p.plain; }

// Parse the editor <form> matching actionRe into { body, action }. Captures
// every named input/select/textarea's current value so structural fields
// (ability scores, AC, hidden ids) are preserved on re-submit.
function parseForm(html, actionRe) {
  const forms = [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)];
  for (const f of forms) {
    const a = (f[1].match(/action="([^"]+)"/) || [])[1];
    if (!a || !actionRe.test(a)) continue;
    const form = f[2]; const body = {};
    for (const m of form.matchAll(/<input\b([^>]*?)\/?>/gi)) {
      const at = m[1]; const name = (at.match(/name="([^"]+)"/) || [])[1]; if (!name) continue;
      const type = (at.match(/type="([^"]+)"/) || [])[1] || "text"; if (type === "file") continue;
      if (type === "checkbox" || type === "radio") { if (/\bchecked/.test(at)) body[name] = (at.match(/value="([^"]*)"/) || [])[1] || "y"; continue; }
      body[name] = decodeEntities((at.match(/value="([^"]*)"/) || [])[1] || "");
    }
    for (const m of form.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi)) { const name = (m[1].match(/name="([^"]+)"/) || [])[1]; if (name) body[name] = decodeEntities(m[2]); }
    for (const m of form.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) { const name = (m[1].match(/name="([^"]+)"/) || [])[1]; if (!name) continue; const s = m[2].match(/<option[^>]*value="([^"]*)"[^>]*selected/i); body[name] = s ? s[1] : ""; }
    return { body, action: a };
  }
  return null;
}

// ── Category registry (all 7 categories, from live recon) ─────
// Each def: entityTypeId, createPath + createBody (copy a base entity),
// defaultBase (base id to copy), editActionRe (find the editor form),
// overrides(fields) (fields we own, merged over the copied form), urlPath
// (public URL slug base), deletable (homebrew /delete works), subclass
// (uses the class-builder create flow instead of copy-base).
const CATEGORIES = {
  "magic-item": {
    category: "magic-item", entityTypeId: "112130694", deletable: true, urlPath: "magic-items",
    createPath: "/homebrew/creations/create-magic-item", defaultBase: "4607",
    editActionRe: /\/homebrew\/creations\/magic-items\/\d+-.*\/edit$/,
    createBody: (f, b) => ({ "magic-item-type": mapId(MITYPE, f.type, "10"), "magic-item": String(b) }),
    overrides(f) {
      const o = { name: f.name, rarity: mapId(RARITY, f.rarity, undefined), type: mapId(MITYPE, f.type, undefined), "attunement-description": f.attunement_description || "" };
      setDesc(o, "item-description", f.description || "");
      o["requires-attunement"] = f.requires_attunement ? "on" : undefined;
      return o;
    },
  },
  feat: {
    category: "feat", entityTypeId: "1088085227", deletable: true, urlPath: "feats",
    createPath: "/homebrew/creations/create-feat", defaultBase: "1789101",
    editActionRe: /\/homebrew\/creations\/create-feat\/\d+-.*\/edit$/,
    createBody: (f, b) => ({ Feat: String(b) }),
    overrides(f) {
      const o = { name: f.name, snippet: f.prerequisite ? `Prerequisite: ${f.prerequisite}` : undefined };
      setDesc(o, "item-description", f.description || "");
      return o;
    },
  },
  spell: {
    category: "spell", entityTypeId: "1118725998", deletable: true, urlPath: "spells",
    createPath: "/homebrew/creations/create-spell", defaultBase: "2618933",
    editActionRe: /\/homebrew\/creations\/spells\/\d+-.*\/edit$/,
    createBody: (f, b) => ({ spell: String(b) }),
    overrides(f) {
      const o = {
        Name: f.name,
        "spell-level": (f.level != null && f.level !== "") ? String(parseInt(f.level, 10) || 0) : undefined,
        "spell-school": mapId(SCHOOL, f.school, undefined),
        "spell-components": f.components || undefined,
      };
      setDesc(o, "spell-description", f.description || "");
      if (f.requires_concentration) o["spell-duration"] = "2";
      return o;
    },
  },
  monster: {
    category: "monster", entityTypeId: "779871897", deletable: true, urlPath: "monsters",
    createPath: "/homebrew/creations/create-monster", defaultBase: "5194893",
    editActionRe: /\/homebrew\/creations\/monsters\/\d+-.*\/edit$/,
    createBody: (f, b) => ({ monster: String(b) }),
    overrides(f) {
      const o = {
        Name: f.name,
        "monster-type": mapId(MTYPE, f.type, undefined),
        size: mapId(MSIZE, f.size, undefined),
        "challenge-rating": (f.challenge_rating != null && f.challenge_rating !== "") ? mapCR(f.challenge_rating, undefined) : undefined,
      };
      setDesc(o, "special-traits-description", f.description || "");
      return o;
    },
  },
  species: {
    category: "species", entityTypeId: "1743923279", deletable: true, urlPath: "species",
    createPath: "/homebrew/creations/create-species", defaultBase: "1751441",
    editActionRe: /\/homebrew\/creations\/species\/\d+-.*\/edit$/,
    createBody: (f, b) => ({ species: String(b) }),
    overrides(f) {
      const o = { name: f.name, size: mapId(MSIZE, f.size, undefined) };
      if (f.speed) o["speed-walking"] = String(f.speed).replace(/[^0-9]/g, "") || undefined;
      setDesc(o, "description", f.description || "");
      setDesc(o, "short-description", (f.description || "").split(/\n\n/)[0] || f.name || "");
      return o;
    },
  },
  background: {
    category: "background", entityTypeId: "1669830167", deletable: true, urlPath: "backgrounds",
    createPath: "/homebrew/creations/create-background", defaultBase: "406475",
    editActionRe: /\/homebrew\/creations\/create-background\/\d+-.*\/edit$/,
    createBody: (f, b) => ({ Background: String(b) }),
    overrides(f) {
      const o = { name: f.name };
      setDesc(o, "short-description", f.description || "");
      return o;
    },
  },
  subclass: {
    // DDB subclass is a class-builder flow: create persists on POST (200,
    // id read from the returned editor's action) and edits via the same
    // route. It has NO reversible HTTP delete (JS-app only), so `deletable`
    // is false — removal is manual on DDB. Features-by-level aren't
    // populated; the full text lives in subclass-description.
    category: "subclass", entityTypeId: null, deletable: false, urlPath: "subclasses", subclass: true,
    editActionRe: /\/classes\/[^"]*\/subclass\/\d+\/edit$/,
    overrides(f) {
      const o = { name: f.name };
      setDesc(o, "subclass-description", f.description || "");
      setDesc(o, "subclass-short-description", (f.description || "").split(/\n\n/)[0] || f.name || "");
      return o;
    },
  },
};

function categoryDef(category) {
  const def = CATEGORIES[category];
  if (!def) { const e = new Error(`Category not yet supported for DDB push: ${category}`); e.reason = "category-unmapped"; throw e; }
  return def;
}
function subclassClassPath(fields) {
  const classId = String(CLASSTYPE[String(fields.parent_class || "").toLowerCase().trim()] || CLASSTYPE.fighter);
  return `${classId}-${slugify(fields.parent_class || "fighter")}`;
}

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
// Load an editor page (following redirects), apply our field overrides on
// top of the copied form, and POST. Preserves all structural fields.
async function submitEditor(s, def, openUrl, fields) {
  let r = await s.get(openUrl);
  let guard = 0;
  while (r.status >= 300 && r.status < 400 && guard++ < 5) r = await s.get(new URL(r.headers.get("location"), BASE).href);
  const html = await r.text();
  const parsed = parseForm(html, def.editActionRe);
  const tokens = s.formTokens(html);
  if (!parsed || !tokens["security-token"]) { const e = new Error("Could not open DDB editor (token expired?)"); e.reason = "ddb-token-expired"; throw e; }
  const body = { ...parsed.body, ...tokens };
  const ov = def.overrides(fields);
  for (const [k, v] of Object.entries(ov)) { if (v === undefined) delete body[k]; else body[k] = v; }
  const p = await s.postForm(parsed.action, body, BASE + parsed.action);
  const ok = p.status === 200 || (p.status >= 300 && p.status < 400); // 303 (generic) or 200 (subclass)
  const slug = (parsed.action.match(/\/(\d+)-([a-z0-9-]+)\//) || [])[2] || slugify(fields.name);
  return { ok, action: parsed.action, slug };
}

// Create a private homebrew draft by copying a base entity (generic flow).
async function createDraft(category, baseId, fields = {}) {
  assertPushEnabled();
  const def = categoryDef(category);
  const s = await session();
  return def.subclass ? createSubclass(s, def, fields) : createGeneric(s, def, fields, baseId);
}
async function createGeneric(s, def, fields, baseId) {
  const g = await s.get(def.createPath);
  const html = await g.text();
  const tokens = s.formTokens(html);
  if (!tokens["security-token"]) { const e = new Error("Could not read DDB form tokens (token expired?)"); e.reason = "ddb-token-expired"; throw e; }
  const body = { ...tokens, ...def.createBody(fields, baseId || def.defaultBase) };
  const p = await s.postForm(def.createPath, body, BASE + def.createPath);
  const loc = p.headers.get("location") || "";
  const id = (loc.match(/[?&]id=(\d+)/) || [])[1];
  if (!id) { const e = new Error(`DDB create ${def.category} rejected (${p.status})`); e.reason = "ddb-create-failed"; throw e; }
  return { id, entityTypeId: (loc.match(/entityTypeId=(\d+)/i) || [])[1] || def.entityTypeId, editUrl: loc };
}
// Subclass uses the class-builder: the create POST persists and returns the
// editor inline (200); the new id is read from the editor form action.
async function createSubclass(s, def, fields) {
  const path = `/classes/${subclassClassPath(fields)}/subclass/create`;
  const g = await s.get(path);
  const html = await g.text();
  const parsed = parseForm(html, /\/subclass\/create$/);
  const tokens = s.formTokens(html);
  if (!parsed || !tokens["security-token"]) { const e = new Error("Could not open DDB subclass builder (token expired?)"); e.reason = "ddb-token-expired"; throw e; }
  const body = { ...parsed.body, ...tokens, name: fields.name || "Homebrew Subclass" };
  setDesc(body, "subclass-short-description", (fields.description || "").split(/\n\n/)[0] || fields.name || "Subclass");
  setDesc(body, "subclass-description", fields.description || fields.name || "Subclass");
  const p = await s.postForm(parsed.action, body, BASE + path);
  const rt = await p.text().catch(() => "");
  const em = rt.match(/action="(\/classes\/[^"]*\/subclass\/(\d+)\/edit)"/);
  if (!em) { const e = new Error(`DDB subclass create rejected (${p.status})`); e.reason = "ddb-create-failed"; throw e; }
  return { id: em[2], entityTypeId: null, editUrl: em[1] };
}

// Apply our field values to an existing draft via the full editor POST.
async function editDraft(category, id, fields = {}) {
  assertPushEnabled();
  const def = categoryDef(category);
  const s = await session();
  const openUrl = def.subclass
    ? `/classes/${subclassClassPath(fields)}/subclass/${id}/edit`
    : `/homebrew/creations/edit?entityTypeId=${def.entityTypeId}&id=${id}`;
  const r = await submitEditor(s, def, openUrl, fields);
  const ddbUrl = def.urlPath ? `${BASE}/${def.urlPath}/${id}-${r.slug}` : `${BASE}${openUrl}`;
  return { ok: r.ok, id, slug: r.slug, ddbUrl };
}

// Delete a homebrew draft (ajax-post). Not supported for subclasses (the
// DDB class-builder has no reversible HTTP delete — remove manually).
async function deleteDraft(category, id) {
  assertPushEnabled();
  const def = categoryDef(category);
  if (!def.deletable) { const e = new Error(`DDB ${category} cannot be deleted programmatically (remove it manually in D&D Beyond).`); e.reason = "delete-unsupported"; throw e; }
  const s = await session();
  const p = await s.ajaxPost(`/homebrew/creations/delete?entityTypeId=${def.entityTypeId}&id=${id}`);
  const body = await p.text().catch(() => "");
  const ok = p.status === 200 && /RedirectUrl/.test(body);
  return { ok, id };
}

// One-shot: create the draft (copy base / build subclass), apply fields.
async function pushDraft(category, { baseId, fields, ddbId } = {}) {
  assertPushEnabled();
  const def = categoryDef(category);
  const s = await session();
  // Update in place when we already have a DDB id (avoids duplicates).
  if (ddbId) {
    const openUrl = def.subclass
      ? `/classes/${subclassClassPath(fields)}/subclass/${ddbId}/edit`
      : `/homebrew/creations/edit?entityTypeId=${def.entityTypeId}&id=${ddbId}`;
    const e = await submitEditor(s, def, openUrl, fields);
    const ddbUrl = def.urlPath ? `${BASE}/${def.urlPath}/${ddbId}-${e.slug}` : `${BASE}${openUrl}`;
    return { id: ddbId, entityTypeId: def.entityTypeId, slug: e.slug, ddbUrl, edited: e.ok, deletable: !!def.deletable, updated: true };
  }
  const created = def.subclass ? await createSubclass(s, def, fields) : await createGeneric(s, def, fields, baseId);
  const e = await submitEditor(s, def, created.editUrl, fields);
  const ddbUrl = def.urlPath ? `${BASE}/${def.urlPath}/${created.id}-${e.slug}` : `${BASE}${created.editUrl}`;
  return { id: created.id, entityTypeId: created.entityTypeId || def.entityTypeId, slug: e.slug, ddbUrl, edited: e.ok, deletable: !!def.deletable };
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
  pushEnabled, assertPushEnabled, session,
  createDraft, editDraft, deleteDraft, pushDraft,
  publishDraft, uploadImage,
  categoryDef, CATEGORIES,
};
