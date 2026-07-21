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
// Status: all seven categories have push adapters with defensive
// key-mapping against live form fields. `magic-item` remains the most
// heavily verified path; other categories are best-effort and should be
// rechecked when DDB editor field names/options change. `uploadImage`
// posts art to a draft via the editor's multipart form (verified on
// magic-item). `publishDraft` (public/campaign visibility) is still
// stubbed pending the §1.3 decision.
// ══════════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");
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
const BASE_ITEM_TYPE = { item: "", armor: "701257905", weapon: "1782728300" };
const ARMOR_DEX = { full: "1", "max 2": "2", none: "3" };
const STEALTH_CHECK = { none: "1", disadvantage: "2" };
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
function firstKey(obj, keys) {
  for (const k of keys || []) if (Object.prototype.hasOwnProperty.call(obj || {}, k)) return k;
  return null;
}
function setMapped(out, existing, keys, value) {
  if (value === undefined) return;
  const k = firstKey(existing, keys) || (Array.isArray(keys) && keys.length ? keys[0] : null);
  if (k) out[k] = value;
}
function clearKeys(out, keys) {
  for (const k of keys || []) out[k] = "";
}
function toTrimmedOrUndef(v) {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}
function normalizeMagicItemFields(fields = {}) {
  const f = fields || {};
  const legacyType = String(f.type || "").toLowerCase().trim();
  const baseRaw = f.base_item_type || f.item_base_type || ((legacyType === "armor" || legacyType === "weapon") ? legacyType : "item");
  const baseMapped = mapId(BASE_ITEM_TYPE, baseRaw, "");
  const baseLabel = baseMapped === BASE_ITEM_TYPE.armor ? "armor" : (baseMapped === BASE_ITEM_TYPE.weapon ? "weapon" : "item");
  const magicRaw = f.magic_item_type || f.type || "Wondrous Item";

  return {
    name: f.name,
    version: toTrimmedOrUndef(f.version),
    rarity: f.rarity,
    baseLabel,
    baseItemType: baseMapped,
    magicItemType: mapId(MITYPE, magicRaw, "10"),
    baseArmor: toTrimmedOrUndef(f.base_armor),
    dexterityModifier: mapId(ARMOR_DEX, f.dexterity_modifier, toTrimmedOrUndef(f.dexterity_modifier)),
    strengthRequirement: toTrimmedOrUndef(f.strength_requirement),
    stealthCheck: mapId(STEALTH_CHECK, f.stealth_check, toTrimmedOrUndef(f.stealth_check)),
    baseWeapon: toTrimmedOrUndef(f.base_weapon),
    requiresAttunement: !!f.requires_attunement,
    attunementDescription: f.attunement_description || "",
    weight: toTrimmedOrUndef(f.weight),
    description: f.description || "",
  };
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

// ── Image upload helpers ──────────────────────────────────────
// DDB file inputs use dynamically hashed names that change every page load,
// so we anchor on the stable id (field-avatar / field-large-avatar) and
// re-read the name each time. Returns { <id>: name, _order: [names...] }.
function parseFileInputs(html) {
  const out = { _order: [] };
  for (const m of String(html).matchAll(/<input\b[^>]*type="file"[^>]*>/gi)) {
    const tag = m[0];
    const name = (tag.match(/name="([^"]+)"/) || [])[1];
    if (!name) continue;
    const id = (tag.match(/id="([^"]+)"/) || [])[1] || "";
    out._order.push(name);
    if (id) out[id] = name;
  }
  return out;
}

const IMG_MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml" };
function mimeForExt(nameOrUrl) {
  const ext = (String(nameOrUrl).split("?")[0].split(".").pop() || "").toLowerCase();
  return IMG_MIME[ext] || "";
}
// Resolve /hotd-content/{rel} to a local file (uploads PVC first, then NAS),
// mirroring image-index.js. Reads env at call time (dirs may be unset in dev).
function resolveContentPath(url) {
  const rel = String(url).replace(/^\/hotd-content\//, "");
  for (const root of [process.env.HOTD_UPLOADS_DIR, process.env.HOTD_CONTENT_DIR]) {
    if (!root) continue;
    const p = path.join(root, rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
// imageSource → { data: Buffer, contentType, filename }. Accepts an http(s)
// URL, a /hotd-content path, or a filesystem path (absolute or cwd-relative).
async function resolveImageBytes(imageSource) {
  const src = String(imageSource || "").trim();
  if (!src) { const e = new Error("No image source provided"); e.reason = "image-missing"; throw e; }
  if (/^https?:\/\//i.test(src)) {
    const r = await fetch(src, { headers: { "User-Agent": UA } });
    if (!r.ok) { const e = new Error(`Failed to fetch image (${r.status})`); e.reason = "image-fetch-failed"; throw e; }
    const data = Buffer.from(await r.arrayBuffer());
    const ct = (r.headers.get("content-type") || "").split(";")[0].trim();
    const contentType = (/^image\//.test(ct) ? ct : "") || mimeForExt(src) || "image/png";
    const filename = ((src.split("?")[0].split("/").pop()) || "image") || "image";
    return { data, contentType, filename };
  }
  const local = src.startsWith("/hotd-content/") ? resolveContentPath(src) : (path.isAbsolute(src) ? src : path.resolve(src));
  if (!local || !fs.existsSync(local)) { const e = new Error(`Image not found: ${src}`); e.reason = "image-missing"; throw e; }
  return { data: fs.readFileSync(local), contentType: mimeForExt(local) || "image/png", filename: path.basename(local) };
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
    createBody: (f, b) => {
      const n = normalizeMagicItemFields(f || {});
      const createType = n.baseLabel === "armor"
        ? "1"
        : (n.baseLabel === "weapon" ? "9" : n.magicItemType);
      return { "magic-item-type": createType, "magic-item": String(b) };
    },
    overrides(f, existing = {}) {
      const n = normalizeMagicItemFields(f || {});
      const editorType = (n.baseLabel === "armor" || n.baseLabel === "weapon") ? "10" : n.magicItemType;
      const o = {
        name: n.name,
        version: n.version,
        rarity: mapId(RARITY, n.rarity, undefined),
        type: editorType,
        "item-base-type": n.baseItemType,
        "attunement-description": n.attunementDescription,
        weight: n.weight,
      };
      setDesc(o, "item-description", n.description);
      o["requires-attunement"] = n.requiresAttunement ? "on" : undefined;

      if (n.baseLabel === "armor") {
        o["base-armor"] = n.baseArmor || undefined;
        o["dexterity-modifier"] = n.dexterityModifier || undefined;
        o["strength-requirement"] = n.strengthRequirement || undefined;
        o["stealth-check"] = n.stealthCheck || undefined;
        clearKeys(o, ["base-weapon"]);
      } else if (n.baseLabel === "weapon") {
        o["base-weapon"] = n.baseWeapon || undefined;
        clearKeys(o, ["base-armor", "dexterity-modifier", "strength-requirement", "stealth-check"]);
      } else {
        clearKeys(o, ["base-armor", "dexterity-modifier", "strength-requirement", "stealth-check", "base-weapon"]);
      }
      return o;
    },
  },
  feat: {
    category: "feat", entityTypeId: "1088085227", deletable: true, urlPath: "feats",
    createPath: "/homebrew/creations/create-feat", defaultBase: "1789101",
    editActionRe: /\/homebrew\/creations\/create-feat\/\d+-.*\/edit$/,
    createBody: (f, b) => ({ Feat: String(b) }),
    overrides(f, existing = {}) {
      const o = { name: f.name };
      const snippet = f.prerequisite ? `Prerequisite: ${f.prerequisite}` : undefined;
      setMapped(o, existing, ["snippet", "short-description", "shortDescription"], snippet);
      setDesc(o, "item-description", f.description || "");
      return o;
    },
  },
  spell: {
    category: "spell", entityTypeId: "1118725998", deletable: true, urlPath: "spells",
    createPath: "/homebrew/creations/create-spell", defaultBase: "2618933",
    editActionRe: /\/homebrew\/creations\/spells\/\d+-.*\/edit$/,
    createBody: (f, b) => ({ spell: String(b) }),
    overrides(f, existing = {}) {
      const o = {
        Name: f.name,
      };
      setMapped(o, existing, ["spell-level", "level", "spellLevel"], (f.level != null && f.level !== "") ? String(parseInt(f.level, 10) || 0) : undefined);
      setMapped(o, existing, ["spell-school", "school", "spellSchool"], mapId(SCHOOL, f.school, undefined));
      setMapped(o, existing, ["spell-components", "components", "spellComponents"], f.components || undefined);
      setMapped(o, existing, ["spell-casting-time", "casting-time", "casting_time", "spellCastingTime"], f.casting_time || undefined);
      setMapped(o, existing, ["spell-range", "range", "spellRange"], f.range || undefined);
      if (f.duration) setMapped(o, existing, ["spell-duration-description", "duration", "spellDurationDescription"], f.duration);
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
    overrides(f, existing = {}) {
      const o = {
        Name: f.name,
        "monster-type": mapId(MTYPE, f.type, undefined),
        size: mapId(MSIZE, f.size, undefined),
        "challenge-rating": (f.challenge_rating != null && f.challenge_rating !== "") ? mapCR(f.challenge_rating, undefined) : undefined,
      };
      setMapped(o, existing, ["alignment", "monster-alignment", "monsterAlignment"], f.alignment || undefined);
      setDesc(o, "special-traits-description", f.description || "");
      return o;
    },
  },
  species: {
    category: "species", entityTypeId: "1743923279", deletable: true, urlPath: "species",
    createPath: "/homebrew/creations/create-species", defaultBase: "1751441",
    editActionRe: /\/homebrew\/creations\/species\/\d+-.*\/edit$/,
    createBody: (f, b) => ({ species: String(b) }),
    overrides(f, existing = {}) {
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
    overrides(f, existing = {}) {
      const o = { name: f.name };
      setMapped(o, existing, ["feature-name", "feature_name", "feature", "background-feature-name"], f.feature_name || undefined);
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
    overrides(f, existing = {}) {
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
  // multipart/form-data POST (for file uploads). Do NOT set Content-Type —
  // fetch derives the multipart boundary from the FormData body. `files` is
  // [{ name, data(Buffer), contentType, filename }].
  async function postMultipart(path, fields, files, referer) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields || {})) { if (v === undefined || v === null) continue; fd.append(k, String(v)); }
    for (const f of files || []) { fd.append(f.name, new Blob([f.data], { type: f.contentType || "application/octet-stream" }), f.filename || "upload"); }
    const r = await fetch(path.startsWith("http") ? path : BASE + path, {
      method: "POST", redirect: "manual",
      headers: H({ Origin: BASE, Referer: referer || BASE, Accept: "text/html" }),
      body: fd,
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
  return { get, getFollow, postForm, postMultipart, ajaxPost, formTokens };
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
  const ov = def.overrides(fields, parsed.body || {});
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

// Upload art to an existing DDB draft. The editor form is multipart/form-data
// with two file inputs (icon + detail image) whose names are hashed per page
// load, so we re-parse them each call (anchored on their stable ids) and post
// the FULL form (all saved fields + tokens) so nothing gets wiped. The same
// image is sent to both art fields. `imageSource` may be an http(s) URL, a
// /hotd-content path, or a filesystem path. Item must already exist on DDB.
async function uploadImage(category, id, imageSource, fields = null) {
  assertPushEnabled();
  const def = categoryDef(category);
  if (def.subclass || !def.entityTypeId) { const e = new Error(`Image upload not supported for ${category}`); e.reason = "image-unsupported"; throw e; }
  if (!id) { const e = new Error("uploadImage requires a DDB id"); e.reason = "image-no-id"; throw e; }
  const img = await resolveImageBytes(imageSource);
  const s = await session();
  // Load the editor (follow redirects to the slug URL).
  const openUrl = `/homebrew/creations/edit?entityTypeId=${def.entityTypeId}&id=${id}`;
  let r = await s.get(openUrl);
  let guard = 0;
  while (r.status >= 300 && r.status < 400 && guard++ < 6) r = await s.get(new URL(r.headers.get("location"), BASE).href);
  const html = await r.text();
  const parsed = parseForm(html, def.editActionRe);
  const tokens = s.formTokens(html);
  const fileInputs = parseFileInputs(html);
  if (!parsed || !tokens["security-token"]) { const e = new Error("Could not open DDB editor for image upload (token expired?)"); e.reason = "ddb-token-expired"; throw e; }
  const avatarField = fileInputs["field-avatar"] || fileInputs._order[0];
  const largeField = fileInputs["field-large-avatar"] || fileInputs._order[1];
  if (!avatarField && !largeField) { const e = new Error("No file inputs found in DDB editor"); e.reason = "image-field-missing"; throw e; }
  // Preserve every saved field; overlay tokens (and optional field overrides).
  const body = { ...parsed.body, ...tokens };
  if (fields) { const ov = def.overrides(fields, parsed.body || {}); for (const [k, v] of Object.entries(ov)) { if (v === undefined) delete body[k]; else body[k] = v; } }
  // Same bytes to both art fields (icon + detail image); dedupe if only one.
  const files = []; const seen = new Set();
  for (const fld of [avatarField, largeField]) { if (fld && !seen.has(fld)) { seen.add(fld); files.push({ name: fld, data: img.data, contentType: img.contentType, filename: img.filename }); } }
  const p = await s.postMultipart(parsed.action, body, files, BASE + parsed.action);
  const ok = p.status === 200 || (p.status >= 300 && p.status < 400);
  if (!ok) { const e = new Error(`DDB image upload rejected (${p.status})`); e.reason = "image-upload-failed"; throw e; }
  const slug = (parsed.action.match(/\/\d+-([a-z0-9_-]+)\//i) || [])[1] || "";
  const ddbUrl = def.urlPath ? `${BASE}/${def.urlPath}/${id}-${slug}` : `${BASE}${openUrl}`;
  return { ok: true, ddbUrl, bytes: img.data.length, contentType: img.contentType, fields: { avatar: avatarField, largeAvatar: largeField } };
}

// ── Deferred (pending §1.3 decision) ──────────────────────────
async function publishDraft() {
  const e = new Error("DDB publish (public/campaign visibility) not yet enabled — pending §1.3 recon + confirmation");
  e.reason = "publish-not-implemented";
  throw e;
}

module.exports = {
  pushEnabled, assertPushEnabled, session,
  createDraft, editDraft, deleteDraft, pushDraft,
  publishDraft, uploadImage,
  categoryDef, CATEGORIES,
};
