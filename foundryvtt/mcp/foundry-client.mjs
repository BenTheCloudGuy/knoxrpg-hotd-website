// Thin HTTP client for the FoundryVTT server API.
//
// Host is FIXED by FOUNDRY_URL (default the production HotD Foundry). Tools may
// only vary the path, never the host — this prevents SSRF via tool arguments.

const BASE = (process.env.FOUNDRY_URL || 'https://hotd-foundry.knoxrpg.com').replace(/\/+$/, '');
const API_TOKEN = process.env.FOUNDRY_API_TOKEN || '';

export function foundryBaseUrl() {
  return BASE;
}

function authHeaders() {
  const h = { Accept: 'application/json' };
  // Only sent if a REST-relay module token is configured.
  if (API_TOKEN) h.Authorization = `Bearer ${API_TOKEN}`;
  return h;
}

// GET an absolute path on the configured Foundry host. Returns a normalized
// envelope { url, status, ok, latencyMs, contentType, body }.
export async function foundryGet(path = '/api/status', { timeoutMs = 8000 } = {}) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('..') || /^[a-z]+:\/\//i.test(path)) {
    throw new Error(
      `Invalid path: ${JSON.stringify(path)}. Must be an absolute path on the Foundry host ` +
      `(start with "/", no scheme, no "..").`
    );
  }
  const url = BASE + path;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: authHeaders(), redirect: 'manual', signal: ctrl.signal });
    const latencyMs = Date.now() - started;
    const contentType = res.headers.get('content-type') || '';
    let body;
    if (contentType.includes('application/json')) {
      body = await res.json();
    } else {
      // Non-JSON (e.g. the /join or /setup HTML pages): return a short excerpt.
      body = (await res.text()).slice(0, 2000);
    }
    return { url, status: res.status, ok: res.ok, latencyMs, contentType, body };
  } finally {
    clearTimeout(timer);
  }
}
