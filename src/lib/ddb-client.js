// ══════════════════════════════════════════════════════════════
// ── D&D BEYOND CLIENT (shared auth/token) ─────────────────────
// Single source of truth for the DDB cobalt session token and the
// cobalt→bearer exchange. Every DDB consumer (audit, munch, homebrew
// push, character sync) should source the token through here so there
// is one KV-backed token and one auth path.
//
// Token resolution order:
//   1. Azure Key Vault secret `ddb-cobalt-session-token` (prod), via
//      src/lib/keyvault.js — see v3.30.0.
//   2. env DDB_COBALT_TOKEN / DDB_COBALT_SESSION_TOKEN (dev / host).
//
// The cobalt token is an opaque, encrypted JWE (5 segments) — its
// expiry is NOT readable client-side. Validity is therefore checked by
// a live cobalt→bearer exchange; the UI shows valid/expired + when the
// KV secret was last updated (no fake countdown).
// ══════════════════════════════════════════════════════════════

let keyvault;
try { keyvault = require("./keyvault"); } catch (_) { /* KV optional */ }

const KV_SECRET_NAME = "ddb-cobalt-session-token";
const COBALT_URL = "https://auth-service.dndbeyond.com/v1/cobalt-token";
const TOKEN_CACHE_MS = 60_000;
const BEARER_CACHE_MS = 240_000; // bearer ttl is ~300s; refresh a bit early

let _tokenCache = { value: null, at: 0, source: "none" };
let _bearerCache = { token: null, at: 0, ttl: null };

function kvReady() { return !!(keyvault && keyvault.isConfigured && keyvault.isConfigured()); }

// ── Token sourcing ────────────────────────────────────────────
async function getCobaltToken({ force = false } = {}) {
  if (!force && _tokenCache.value && Date.now() - _tokenCache.at < TOKEN_CACHE_MS) return _tokenCache.value;
  if (kvReady()) {
    try {
      const s = await keyvault.getSecret(KV_SECRET_NAME);
      if (s && s.value) { _tokenCache = { value: s.value, at: Date.now(), source: "keyvault" }; return s.value; }
    } catch (_) { /* fall through to env */ }
  }
  const env = process.env.DDB_COBALT_TOKEN || process.env.DDB_COBALT_SESSION_TOKEN || "";
  _tokenCache = { value: env || null, at: Date.now(), source: env ? "env" : "none" };
  return env || null;
}

async function getTokenSource() { await getCobaltToken(); return _tokenCache.source; }

// Save a new cobalt token to Key Vault (admin action). Busts caches.
async function setCobaltToken(value) {
  if (!value || typeof value !== "string" || value.length < 20) throw new Error("Invalid cobalt token");
  if (!kvReady()) throw new Error("Key Vault not configured; cannot save cobalt token");
  const r = await keyvault.setSecret(KV_SECRET_NAME, value.trim());
  _tokenCache = { value: null, at: 0, source: "none" };
  _bearerCache = { token: null, at: 0, ttl: null };
  return r;
}

// ── Bearer exchange ───────────────────────────────────────────
async function exchange(cobalt) {
  const r = await fetch(COBALT_URL, { method: "POST", headers: { Cookie: `CobaltSession=${cobalt}` } });
  if (!r.ok) { const err = new Error(`cobalt exchange failed (${r.status})`); err.status = r.status; throw err; }
  const b = await r.json();
  if (!b.token) throw new Error("no bearer token returned");
  return b;
}

async function bearer({ force = false } = {}) {
  if (!force && _bearerCache.token && Date.now() - _bearerCache.at < BEARER_CACHE_MS) return _bearerCache.token;
  const cobalt = await getCobaltToken();
  if (!cobalt) throw new Error("No cobalt token configured (Key Vault or env)");
  const b = await exchange(cobalt);
  _bearerCache = { token: b.token, at: Date.now(), ttl: b.ttl };
  return b.token;
}

async function bearerHeaders() {
  const t = await bearer();
  return { Authorization: `Bearer ${t}`, Accept: "application/json", "User-Agent": "Mozilla/5.0" };
}

// Validate an arbitrary token value (used before saving a pasted token).
async function validateToken(value) {
  try {
    const b = await exchange(String(value || "").trim());
    return { ok: !!b.token, ttl: b.ttl };
  } catch (e) {
    return { ok: false, status: e.status || null, error: e.message };
  }
}

// ── Health/status (for the DDB Content page) ──────────────────
async function status() {
  const out = { configured: false, source: "none", valid: false, updatedOn: null, checkedAt: new Date().toISOString(), reason: null };
  const cobalt = await getCobaltToken({ force: true });
  out.source = _tokenCache.source;
  out.configured = !!cobalt;
  if (kvReady()) {
    try { const s = await keyvault.getSecret(KV_SECRET_NAME); out.updatedOn = s.updatedOn || s.createdOn || null; } catch (_) { /* metadata optional */ }
  }
  if (!cobalt) { out.reason = `No cobalt token configured (Key Vault secret ${KV_SECRET_NAME} or env DDB_COBALT_TOKEN)`; return out; }
  const v = await validateToken(cobalt);
  out.valid = v.ok;
  if (!v.ok) out.reason = v.error || `exchange failed (${v.status || "?"})`;
  return out;
}

module.exports = {
  KV_SECRET_NAME,
  getCobaltToken, getTokenSource, setCobaltToken,
  bearer, bearerHeaders, validateToken, status,
};
