// ══════════════════════════════════════════════════════════════
// ── GeoIP enrichment ──────────────────────────────────────────
// Resolves visitor IPs to country / region / city / lat / lon
// using the geoip-lite MaxMind GeoLite2 City dataset bundled with
// the package. No external HTTP calls, no license key, no API
// rate limit. Data refresh happens whenever geoip-lite itself is
// bumped in src/package.json.
//
// Used by lib/telemetry.js trackRequest() to enrich the per-request
// log so Grafana's geomap panel + Loki visitor log can place hits
// on a world map and count them by country.
//
// In-memory LRU keeps repeated visitors from re-hitting the lookup
// table. Private RFC1918 / loopback / IPv6 link-local addresses are
// skipped (they have no meaningful geo).
//
// Disable entirely with GEOIP_ENABLED=false. Missing geoip-lite
// install (e.g. dev without `npm install`) silently degrades to
// null results; nothing in the request path throws.
// ══════════════════════════════════════════════════════════════

let geoip = null;
try { geoip = require("geoip-lite"); } catch (_e) { geoip = null; }

const ENABLED = !!geoip && process.env.GEOIP_ENABLED !== "false";

const CACHE_MAX = parseInt(process.env.GEOIP_CACHE_MAX || "5000", 10);
const cache = new Map();

function normalizeIp(ip) {
  if (!ip || typeof ip !== "string") return "";
  // Strip IPv6-mapped IPv4 prefix (::ffff:a.b.c.d → a.b.c.d).
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip.trim();
}

function isPrivate(ip) {
  if (!ip) return true;
  if (ip === "::1" || ip === "127.0.0.1" || ip === "localhost") return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;     // link-local
  if (/^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./.test(ip)) return true; // CGNAT
  if (/^fe80:/i.test(ip)) return true;          // IPv6 link-local
  if (/^fc00:/i.test(ip) || /^fd[0-9a-f]{2}:/i.test(ip)) return true; // IPv6 ULA
  return false;
}

function cacheGet(key) {
  if (!cache.has(key)) return undefined;
  // Touch — re-insert to mark as most recently used.
  const v = cache.get(key);
  cache.delete(key);
  cache.set(key, v);
  return v;
}

function cacheSet(key, value) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

// Returns one of:
//   • null                       — geoip disabled, IP missing/private, or no DB match
//   • { country, region, city,   — flat object so Loki's `| json` parser
//       lat, lon, timezone }       exposes geo_country / geo_lat / etc.
function lookup(ip) {
  if (!ENABLED) return null;
  const norm = normalizeIp(ip);
  if (!norm) return null;
  if (isPrivate(norm)) return null;

  const cached = cacheGet(norm);
  if (cached !== undefined) return cached;

  let result = null;
  try {
    const g = geoip.lookup(norm);
    if (g) {
      const ll = Array.isArray(g.ll) && g.ll.length === 2 ? g.ll : [null, null];
      result = {
        country: g.country || "",
        region: g.region || "",
        city: g.city || "",
        lat: typeof ll[0] === "number" ? ll[0] : null,
        lon: typeof ll[1] === "number" ? ll[1] : null,
        timezone: g.timezone || "",
      };
    }
  } catch (_) { result = null; }

  cacheSet(norm, result);
  return result;
}

module.exports = { lookup, ENABLED, _cache: cache };
