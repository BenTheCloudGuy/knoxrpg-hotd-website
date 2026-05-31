// ══════════════════════════════════════════════════════════════
// ── Loki shipper ──────────────────────────────────────────────
// Optional in-process push to Grafana Loki. Enabled when
// LOKI_PUSH_URL is set (e.g. http://192.168.10.20:3100/loki/api/v1/push).
// Until a cluster-wide log collector (Grafana Alloy / Promtail
// DaemonSet) lands in the MicroK8s cluster, this keeps the
// dashboard's Logs panel populated. Fails open: any push error
// is mirrored to stderr and dropped, never blocking a request.
// ══════════════════════════════════════════════════════════════

const PUSH_URL = process.env.LOKI_PUSH_URL || "";
const ENABLED = !!PUSH_URL;
const FLUSH_INTERVAL_MS = parseInt(process.env.LOKI_FLUSH_MS || "2000", 10);
const FLUSH_BATCH_SIZE = parseInt(process.env.LOKI_BATCH_SIZE || "100", 10);
const MAX_QUEUE = parseInt(process.env.LOKI_MAX_QUEUE || "5000", 10);

function parseLabels() {
  // Allow override via LOKI_LABELS_JSON. Defaults are filled from env / downward API.
  let labels = {
    app: "hotd-website",
    env: process.env.NODE_ENV || "production",
  };
  if (process.env.LOKI_LABELS_JSON) {
    try {
      const parsed = JSON.parse(process.env.LOKI_LABELS_JSON);
      if (parsed && typeof parsed === "object") labels = { ...labels, ...parsed };
    } catch (_) { /* ignore malformed override */ }
  }
  if (process.env.POD_NAMESPACE) labels.namespace = process.env.POD_NAMESPACE;
  if (process.env.POD_NAME) labels.pod = process.env.POD_NAME;
  if (process.env.HOSTNAME && !labels.host) labels.host = process.env.HOSTNAME;
  // Strip empties — Loki rejects empty label values.
  for (const k of Object.keys(labels)) {
    if (labels[k] === "" || labels[k] == null) delete labels[k];
  }
  return labels;
}

const LABELS = parseLabels();
const queue = []; // [[nanoTs, line, level], ...]
let flushTimer = null;
let inFlight = false;
let droppedSinceLastFlush = 0;

function nowNanoStr() {
  // Loki wants nanoseconds-since-epoch as a string.
  const ms = Date.now();
  return `${ms}000000`;
}

function enqueue(level, line) {
  if (!ENABLED) return;
  if (queue.length >= MAX_QUEUE) {
    droppedSinceLastFlush++;
    return;
  }
  queue.push([nowNanoStr(), line, level || "info"]);
  if (queue.length >= FLUSH_BATCH_SIZE) {
    flush().catch(() => {});
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush().catch(() => {});
    }, FLUSH_INTERVAL_MS);
    if (typeof flushTimer.unref === "function") flushTimer.unref();
  }
}

async function flush() {
  if (!ENABLED || inFlight || queue.length === 0) return;
  inFlight = true;
  const batch = queue.splice(0, queue.length);
  const dropped = droppedSinceLastFlush;
  droppedSinceLastFlush = 0;

  // Group by level so we get separate streams (label = level) which makes
  // Loki/Grafana filtering cheaper without exploding cardinality.
  const byLevel = new Map();
  for (const [ts, line, level] of batch) {
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level).push([ts, line]);
  }

  const streams = [];
  for (const [level, values] of byLevel.entries()) {
    streams.push({
      stream: { ...LABELS, level },
      values,
    });
  }
  if (dropped > 0) {
    streams.push({
      stream: { ...LABELS, level: "warn" },
      values: [[nowNanoStr(), `[loki-shipper] dropped ${dropped} log lines (queue full)`]],
    });
  }

  const body = JSON.stringify({ streams });

  try {
    const res = await fetch(PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      // Drain body to free the socket, then log once to stderr.
      const text = await res.text().catch(() => "");
      process.stderr.write(`[loki-shipper] push failed: HTTP ${res.status} ${text.slice(0, 200)}\n`);
    }
  } catch (err) {
    process.stderr.write(`[loki-shipper] push error: ${err && err.message ? err.message : err}\n`);
  } finally {
    inFlight = false;
    // If items were enqueued during the push, schedule another flush.
    if (queue.length >= FLUSH_BATCH_SIZE) {
      flush().catch(() => {});
    } else if (queue.length > 0 && !flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flush().catch(() => {});
      }, FLUSH_INTERVAL_MS);
      if (typeof flushTimer.unref === "function") flushTimer.unref();
    }
  }
}

function shutdown() {
  if (!ENABLED) return Promise.resolve();
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  return flush();
}

if (ENABLED) {
  // Best-effort flush on shutdown so the last few lines are not lost.
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => { shutdown().finally(() => process.exit(0)); });
  }
  process.on("beforeExit", () => { shutdown(); });
  console.log(`  Loki: shipping to ${PUSH_URL} (labels=${JSON.stringify(LABELS)})`);
}

module.exports = {
  ENABLED,
  enqueue,
  flush,
  shutdown,
  _labels: LABELS,
};
