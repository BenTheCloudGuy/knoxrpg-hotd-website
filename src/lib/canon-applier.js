// ══════════════════════════════════════════════════════════════
// Canon Applier
// ══════════════════════════════════════════════════════════════
// Takes structured proposals from canon-extractor and applies them to the
// campaign tables (hotd_npcs, hotd_player_characters.notes,
// hotd_calendar_events). Every successful write also produces a row in
// hotd_canon_audit so we have full provenance and an idempotency guard.
//
// Per-change error isolation: each proposal is applied in its own try/catch,
// so one bad row does not abort the rest of the publish. Failed proposals
// are returned in the result so the UI can surface them.
//
// After all writes commit, this kicks off `embed-pipeline.js --source X` for
// each touched source type (in parallel), mirroring src/mcp/reindex.mjs.

const path = require("node:path");
const { spawn } = require("node:child_process");
const { pgPool } = require("../db/pool");

const REINDEX_TIMEOUT_MS = 5 * 60 * 1000;

// Resolve REPO_ROOT the same way dm-admin-api.js does, so this works inside
// the container (where /app is the root) and in dev.
function repoRoot() {
  if (process.env.HOTD_REPO_ROOT) return process.env.HOTD_REPO_ROOT;
  // src/lib/canon-applier.js -> src/lib -> src -> repo
  return path.resolve(__dirname, "..", "..");
}

function pipelinePath() {
  if (process.env.HOTD_EMBED_PIPELINE) return process.env.HOTD_EMBED_PIPELINE;
  return path.join(repoRoot(), "scripts", "embed-pipeline.js");
}

/**
 * Apply a set of extracted proposals to canon.
 *
 * @param {object} args
 * @param {object} args.session   Session row { id, session_number, title, game_date, summary }
 * @param {object} args.proposals { npc_updates, npc_creates, pc_note_appends, calendar_events }
 * @param {object|null} args.headline  Auto-generated session headline event (Policy C)
 * @param {number|null} args.userId    account_info.id of the publisher (for audit)
 * @returns {Promise<object>}     { applied, skipped, errors, touched_sources, summary }
 */
async function applyCanonUpdates({ session, proposals, headline, userId }) {
  const result = {
    applied: 0,
    skipped: 0,
    errors: [],
    touched_sources: new Set(),
    summary: {
      npcs_created: [],
      npcs_updated: [],
      pc_notes_appended: [],
      calendar_events_created: [],
    },
  };

  // 1) NPC creates first so subsequent updates can target newly created rows.
  for (const create of proposals.npc_creates || []) {
    try {
      const r = await applyNpcCreate(session, create, userId);
      result.applied += r.applied;
      result.skipped += r.skipped;
      if (r.summary) result.summary.npcs_created.push(r.summary);
      result.touched_sources.add("npc");
    } catch (e) {
      result.errors.push({ kind: "npc_create", name: create?.name, error: e.message });
    }
  }

  // 2) NPC updates.
  for (const update of proposals.npc_updates || []) {
    try {
      const r = await applyNpcUpdate(session, update, userId);
      result.applied += r.applied;
      result.skipped += r.skipped;
      if (r.summary) result.summary.npcs_updated.push(r.summary);
      if (r.applied > 0) result.touched_sources.add("npc");
    } catch (e) {
      result.errors.push({ kind: "npc_update", match: update?.match, field: update?.field, error: e.message });
    }
  }

  // 3) PC note appends.
  for (const append of proposals.pc_note_appends || []) {
    try {
      const r = await applyPcNoteAppend(session, append, userId);
      result.applied += r.applied;
      result.skipped += r.skipped;
      if (r.summary) result.summary.pc_notes_appended.push(r.summary);
      if (r.applied > 0) result.touched_sources.add("character");
    } catch (e) {
      result.errors.push({ kind: "pc_note_append", match: append?.match, error: e.message });
    }
  }

  // 4) Calendar events. Headline (Policy C) first so it owns its date slot.
  if (headline) {
    try {
      const r = await applyCalendarEvent(session, headline, userId, "headline");
      result.applied += r.applied;
      result.skipped += r.skipped;
      if (r.summary) result.summary.calendar_events_created.push(r.summary);
      if (r.applied > 0) result.touched_sources.add("calendar");
    } catch (e) {
      result.errors.push({ kind: "calendar_headline", error: e.message });
    }
  }
  for (const ev of proposals.calendar_events || []) {
    try {
      const r = await applyCalendarEvent(session, ev, userId, "extracted");
      result.applied += r.applied;
      result.skipped += r.skipped;
      if (r.summary) result.summary.calendar_events_created.push(r.summary);
      if (r.applied > 0) result.touched_sources.add("calendar");
    } catch (e) {
      result.errors.push({ kind: "calendar_event", title: ev?.title, error: e.message });
    }
  }

  // The session itself was just edited and republished; always reindex it.
  result.touched_sources.add("session");

  return {
    ...result,
    touched_sources: [...result.touched_sources],
  };
}

// ──────────────────────────────────────────────────────────────
// Individual apply handlers
// ──────────────────────────────────────────────────────────────

const NPC_ALLOWED_FIELDS = new Set([
  "status", "location", "description", "dm_notes", "alignment_tag",
]);

async function applyNpcUpdate(session, update, userId) {
  const field = update?.field;
  if (!field || !NPC_ALLOWED_FIELDS.has(field)) {
    return { applied: 0, skipped: 1 };
  }
  const newValue = (update.new_value ?? "").toString();
  const matched = await resolveNpc(update.match);
  if (!matched) return { applied: 0, skipped: 1 };

  const beforeValue = (matched[field] ?? "").toString();
  if (beforeValue.trim() === newValue.trim()) return { applied: 0, skipped: 1 };

  // dm_notes is append-only history; everything else is a replace.
  let afterValue;
  if (field === "dm_notes") {
    const prefix = `\n\nSession ${session.session_number}${session.game_date ? ` (${session.game_date})` : ""}: `;
    afterValue = beforeValue.trim()
      ? `${beforeValue.trimEnd()}${prefix}${newValue}`
      : `Session ${session.session_number}${session.game_date ? ` (${session.game_date})` : ""}: ${newValue}`;
  } else {
    afterValue = newValue;
  }

  await pgPool.query("BEGIN");
  try {
    await pgPool.query(
      `UPDATE hotd_npcs SET ${field} = $1 WHERE id = $2`,
      [afterValue, matched.id]
    );
    await writeAudit({
      session_id: session.id,
      target_kind: "npc",
      target_id: matched.id,
      operation: "update",
      field,
      before_value: beforeValue,
      after_value: afterValue,
      source_excerpt: update.source_excerpt || "",
      rationale: update.rationale || "",
      applied_by: userId,
    });
    await pgPool.query("COMMIT");
  } catch (e) {
    await pgPool.query("ROLLBACK").catch(() => {});
    throw e;
  }
  return {
    applied: 1,
    skipped: 0,
    summary: { id: matched.id, name: matched.name, field, value: afterValue.slice(0, 120) },
  };
}

async function applyNpcCreate(session, create, userId) {
  const name = (create?.name || "").trim();
  if (!name) return { applied: 0, skipped: 1 };

  // Name dedupe (case-insensitive). If exists, fold dm_notes into the existing
  // NPC instead of creating a duplicate.
  const { rows: existing } = await pgPool.query(
    "SELECT id, name, dm_notes FROM hotd_npcs WHERE LOWER(name) = LOWER($1) LIMIT 1",
    [name]
  );
  if (existing.length) {
    const target = existing[0];
    const note = `Session ${session.session_number}${session.game_date ? ` (${session.game_date})` : ""}: first appearance in canon extraction. ${create.dm_notes || ""}`.trim();
    if (target.dm_notes && target.dm_notes.includes(note.slice(0, 60))) {
      return { applied: 0, skipped: 1 };
    }
    const merged = target.dm_notes
      ? `${target.dm_notes.trimEnd()}\n\n${note}`
      : note;
    await pgPool.query("BEGIN");
    try {
      await pgPool.query("UPDATE hotd_npcs SET dm_notes = $1 WHERE id = $2", [merged, target.id]);
      await writeAudit({
        session_id: session.id,
        target_kind: "npc",
        target_id: target.id,
        operation: "update",
        field: "dm_notes",
        before_value: target.dm_notes || "",
        after_value: merged,
        source_excerpt: create.source_excerpt || "",
        rationale: "Canon-create folded into existing NPC by name match.",
        applied_by: userId,
      });
      await pgPool.query("COMMIT");
    } catch (e) {
      await pgPool.query("ROLLBACK").catch(() => {});
      throw e;
    }
    return { applied: 1, skipped: 0, summary: { id: target.id, name: target.name, status: "folded" } };
  }

  // New NPC. Stays is_hidden=TRUE so the DM can review before exposing.
  await pgPool.query("BEGIN");
  let newId;
  try {
    const { rows } = await pgPool.query(
      `INSERT INTO hotd_npcs (name, race, npc_class, location, status, alignment_tag, description, dm_notes, is_hidden)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
       RETURNING id`,
      [
        name,
        (create.race || "").toString(),
        (create.npc_class || "").toString(),
        (create.location || "").toString(),
        (create.status || "Unknown").toString(),
        normalizeAlignmentTag(create.alignment_tag),
        (create.description || "").toString(),
        buildCreateDmNotes(session, create),
      ]
    );
    newId = rows[0].id;
    await writeAudit({
      session_id: session.id,
      target_kind: "npc",
      target_id: newId,
      operation: "create",
      field: "name",
      before_value: "",
      after_value: name,
      source_excerpt: create.source_excerpt || "",
      rationale: create.rationale || "Named NPC introduced in session.",
      applied_by: userId,
    });
    await pgPool.query("COMMIT");
  } catch (e) {
    await pgPool.query("ROLLBACK").catch(() => {});
    throw e;
  }
  return { applied: 1, skipped: 0, summary: { id: newId, name, status: "created", hidden: true } };
}

async function applyPcNoteAppend(session, append, userId) {
  const note = (append?.note || "").trim();
  if (!note) return { applied: 0, skipped: 1 };
  const target = await resolvePc(append.match);
  if (!target) return { applied: 0, skipped: 1 };

  // Writes target dm_notes (the GM-owned column). The DDB-sourced `notes`
  // column is left untouched so a future DDB sync does not clobber
  // canon-applied campaign history.
  const before = (target.dm_notes || "").toString();
  // Dedupe: if the same first 80 chars already exist, skip.
  if (before.includes(note.slice(0, 80))) return { applied: 0, skipped: 1 };

  const after = before.trim() ? `${before.trimEnd()}\n\n${note}` : note;

  await pgPool.query("BEGIN");
  try {
    await pgPool.query("UPDATE hotd_player_characters SET dm_notes = $1, updated_at = NOW() WHERE id = $2", [after, target.id]);
    await writeAudit({
      session_id: session.id,
      target_kind: "pc",
      target_id: target.id,
      operation: "append_note",
      field: "dm_notes",
      before_value: before,
      after_value: after,
      source_excerpt: append.source_excerpt || "",
      rationale: "Per-PC campaign history append.",
      applied_by: userId,
    });
    await pgPool.query("COMMIT");
  } catch (e) {
    await pgPool.query("ROLLBACK").catch(() => {});
    throw e;
  }
  return {
    applied: 1,
    skipped: 0,
    summary: { id: target.id, character_name: target.character_name, appended: note.slice(0, 120) },
  };
}

async function applyCalendarEvent(session, ev, userId, kind /* 'headline' | 'extracted' */) {
  const day = parseInt(ev?.day, 10);
  const month = parseInt(ev?.month_idx, 10);
  if (!Number.isFinite(day) || !Number.isFinite(month)) return { applied: 0, skipped: 1 };
  if (day < 1 || day > 30 || month < 1 || month > 12) return { applied: 0, skipped: 1 };
  const title = (ev.title || "").trim();
  if (!title) return { applied: 0, skipped: 1 };

  // Dedupe: same date + same title, regardless of session.
  const { rows: dup } = await pgPool.query(
    "SELECT id FROM hotd_calendar_events WHERE day = $1 AND month_idx = $2 AND LOWER(title) = LOWER($3) LIMIT 1",
    [day, month, title]
  );
  if (dup.length) {
    // Make sure the session ref is present.
    const sessionRef = String(session.session_number);
    await pgPool.query(
      `UPDATE hotd_calendar_events
          SET session_refs = CASE
            WHEN session_refs IS NULL OR session_refs = '' THEN $1
            WHEN session_refs LIKE '%' || $1 || '%' THEN session_refs
            ELSE session_refs || ',' || $1
          END
        WHERE id = $2`,
      [sessionRef, dup[0].id]
    );
    return { applied: 0, skipped: 1 };
  }

  await pgPool.query("BEGIN");
  let newId;
  try {
    const { rows } = await pgPool.query(
      `INSERT INTO hotd_calendar_events (day, month_idx, title, description, session_refs)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [day, month, title, (ev.description || "").toString(), String(session.session_number)]
    );
    newId = rows[0].id;
    await writeAudit({
      session_id: session.id,
      target_kind: "calendar",
      target_id: newId,
      operation: kind === "headline" ? "create_headline" : "create",
      field: "title",
      before_value: "",
      after_value: title,
      source_excerpt: ev.source_excerpt || "",
      rationale: ev.rationale || (kind === "headline" ? "Policy C session headline event." : "In-narrative dated event."),
      applied_by: userId,
    });
    await pgPool.query("COMMIT");
  } catch (e) {
    await pgPool.query("ROLLBACK").catch(() => {});
    throw e;
  }
  return { applied: 1, skipped: 0, summary: { id: newId, day, month_idx: month, title, kind } };
}

// ──────────────────────────────────────────────────────────────
// Helpers: lookups, audit, reindex
// ──────────────────────────────────────────────────────────────

async function resolveNpc(match) {
  if (!match || typeof match !== "object") return null;
  if (Number.isFinite(match.npcid)) {
    const { rows } = await pgPool.query("SELECT * FROM hotd_npcs WHERE npcid = $1 LIMIT 1", [match.npcid]);
    if (rows.length) return rows[0];
  }
  if (Number.isFinite(match.id)) {
    const { rows } = await pgPool.query("SELECT * FROM hotd_npcs WHERE id = $1 LIMIT 1", [match.id]);
    if (rows.length) return rows[0];
  }
  if (match.name) {
    const { rows } = await pgPool.query(
      "SELECT * FROM hotd_npcs WHERE LOWER(name) = LOWER($1) LIMIT 1",
      [match.name]
    );
    if (rows.length) return rows[0];
  }
  return null;
}

async function resolvePc(match) {
  if (!match || typeof match !== "object") return null;
  if (Number.isFinite(match.id)) {
    const { rows } = await pgPool.query("SELECT id, character_name, dm_notes FROM hotd_player_characters WHERE id = $1 LIMIT 1", [match.id]);
    if (rows.length) return rows[0];
  }
  if (match.character_name) {
    const { rows } = await pgPool.query(
      "SELECT id, character_name, dm_notes FROM hotd_player_characters WHERE LOWER(character_name) = LOWER($1) LIMIT 1",
      [match.character_name]
    );
    if (rows.length) return rows[0];
  }
  return null;
}

function normalizeAlignmentTag(v) {
  const s = String(v || "neutral").toLowerCase().trim();
  if (s === "good" || s === "evil" || s === "neutral") return s;
  if (s.includes("good")) return "good";
  if (s.includes("evil")) return "evil";
  return "neutral";
}

function buildCreateDmNotes(session, create) {
  const base = (create.dm_notes || "").trim();
  const stamp = `Created from Session ${session.session_number}${session.game_date ? ` (${session.game_date})` : ""}.`;
  return base ? `${stamp}\n\n${base}` : stamp;
}

async function writeAudit(row) {
  // ON CONFLICT DO NOTHING gives us the idempotency guarantee. If the same
  // (session, target_kind, target_id, field, operation) is replayed, the
  // audit insert silently no-ops; the calling code has already short-circuited
  // the DB write via its own dedupe checks, so this is just a safety net.
  await pgPool.query(
    `INSERT INTO hotd_canon_audit
      (session_id, target_kind, target_id, operation, field, before_value, after_value, source_excerpt, rationale, applied_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT ON CONSTRAINT hotd_canon_audit_idem DO NOTHING`,
    [
      row.session_id,
      row.target_kind,
      row.target_id ?? null,
      row.operation,
      row.field || null,
      row.before_value ?? null,
      row.after_value ?? null,
      row.source_excerpt || null,
      row.rationale || null,
      row.applied_by || null,
    ]
  ).catch((e) => {
    // Audit failure is logged but never blocks the canon write.
    console.warn("[canon-applier] audit write failed:", e.message);
  });
}

/**
 * Spawn embed-pipeline.js incremental runs for each touched source type in
 * parallel. Returns an array of per-source results.
 */
async function reindexSources(sources) {
  const list = Array.isArray(sources) ? [...new Set(sources)] : [];
  if (!list.length) return [];
  const cwd = repoRoot();
  const script = pipelinePath();
  const runs = list.map((source) => runOne(script, source, cwd));
  return Promise.all(runs);
}

function runOne(script, source, cwd) {
  return new Promise((resolve) => {
    const child = spawn("node", [script, "--source", source, "--mode", "incremental"], {
      cwd,
      env: process.env,
    });
    let stderr = "";
    child.stdout.on("data", () => {}); // drain
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ source, ok: false, exitCode: null, error: `timeout after ${REINDEX_TIMEOUT_MS / 1000}s` });
    }, REINDEX_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ source, ok: code === 0, exitCode: code, stderrTail: stderr.slice(-500) });
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      resolve({ source, ok: false, exitCode: null, error: err.message });
    });
  });
}

module.exports = {
  applyCanonUpdates,
  reindexSources,
};
