// ══════════════════════════════════════════════════════════════
// ── TINY IN-MEMORY JOB REGISTRY ───────────────────────────────
// Runs a long operation in the background so HTTP requests return
// immediately (avoids ingress/proxy timeouts on big DDB syncs). The
// client polls a status endpoint. In-memory only — jobs are short-lived
// and DM-triggered; a pod restart just drops history (re-run the audit).
// ══════════════════════════════════════════════════════════════

const jobs = new Map();
let seq = 0;
const MAX_JOBS = 30;
const MAX_PROGRESS = 300;

function start(label, runner) {
  const id = `${Date.now().toString(36)}-${++seq}`;
  const job = { id, label, status: "running", progress: [], result: null, error: null, reason: null, startedAt: Date.now(), finishedAt: null };
  jobs.set(id, job);
  while (jobs.size > MAX_JOBS) jobs.delete(jobs.keys().next().value);
  const log = (m) => { job.progress.push(String(m)); if (job.progress.length > MAX_PROGRESS) job.progress.shift(); };
  Promise.resolve()
    .then(() => runner(log))
    .then((res) => { job.result = res; job.status = "done"; job.finishedAt = Date.now(); })
    .catch((e) => { job.error = e.message; job.reason = e.reason || null; job.status = "error"; job.finishedAt = Date.now(); });
  return job;
}

function get(id) { return jobs.get(id) || null; }

// Public view for the status endpoint (trims progress to the tail).
function view(id, tail = 12) {
  const j = jobs.get(id);
  if (!j) return null;
  return {
    id: j.id, label: j.label, status: j.status,
    progress: j.progress.slice(-tail),
    result: j.result, error: j.error, reason: j.reason,
    startedAt: j.startedAt, finishedAt: j.finishedAt,
  };
}

module.exports = { start, get, view };
