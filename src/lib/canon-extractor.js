// ══════════════════════════════════════════════════════════════
// Canon Extractor
// ══════════════════════════════════════════════════════════════
// Reads a freshly published session summary and asks the configured AI
// model to extract structured canon updates: NPC field changes, brand-new
// NPCs (named only, not random monsters), per-PC campaign-history notes,
// and in-narrative calendar events.
//
// Output is a typed JSON object. The applier turns it into idempotent DB
// writes with audit rows. Never invents IDs; reuses the existing NPC list
// to match references by name first.

const { pgPool } = require("../db/pool");
const { recordChatCompletion } = require("./telemetry");

// Names referenced via the canonical campaign URL pattern in summaries
// (e.g. "[Bray Martikov](https://hotd.knoxrpg.com/npcs/343)"). When we see
// one of these we can short-circuit name resolution to the matched npcid.
const NPC_URL_RE = /\[([^\]]+)\]\(https?:\/\/[^/]+\/npcs\/(\d+)\)/g;

function extractInlineNpcRefs(summary) {
  const refs = [];
  let m;
  while ((m = NPC_URL_RE.exec(summary)) !== null) {
    refs.push({ name: m[1].trim(), npcid: parseInt(m[2], 10) });
  }
  return refs;
}

async function loadNpcIndex() {
  const { rows } = await pgPool.query(
    "SELECT id, npcid, name, race, npc_class, location, status, alignment_tag FROM hotd_npcs"
  );
  return rows;
}

async function loadPcIndex() {
  const { rows } = await pgPool.query(
    "SELECT id, character_name, player_name FROM hotd_player_characters"
  );
  return rows;
}

async function loadCalendarIndex() {
  const { rows } = await pgPool.query(
    "SELECT id, day, month_idx, title FROM hotd_calendar_events ORDER BY month_idx, day"
  );
  return rows;
}

// Best-effort parser for session.game_date. Accepts "M/D/YYYY", "D/M",
// "Day N, Month M", or returns null. Used by the deterministic headline
// calendar event so we do not depend on the LLM for that.
function parseGameDate(s) {
  if (!s || typeof s !== "string") return null;
  const trimmed = s.trim();
  // 6/21/1497  or  6/21
  const mdY = /^(\d{1,2})\/(\d{1,2})(?:\/\d{1,4})?$/.exec(trimmed);
  if (mdY) {
    const month = parseInt(mdY[1], 10);
    const day = parseInt(mdY[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 30) return { day, month_idx: month };
  }
  // Day 21 of Month 6
  const verbose = /day\s+(\d{1,2})[, ]+month\s+(\d{1,2})/i.exec(trimmed);
  if (verbose) {
    const day = parseInt(verbose[1], 10);
    const month = parseInt(verbose[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 30) return { day, month_idx: month };
  }
  return null;
}

function buildSystemPrompt({ npcs, pcs, calendar, sessionNumber, sessionTitle, sessionGameDate }) {
  // Cap rosters to keep the prompt bounded; the most relevant NPCs are the
  // ones most likely to be already in the DB so a 200-name cap is plenty.
  const npcLines = npcs.slice(0, 200).map(n => {
    const tag = n.npcid ? `npcid=${n.npcid}` : `id=${n.id}`;
    const parts = [n.name, n.race, n.npc_class, n.location, n.status]
      .filter(Boolean).join(" / ");
    return `  - ${tag} :: ${parts}`;
  }).join("\n");
  const pcLines = pcs.map(p => `  - id=${p.id} :: ${p.character_name} (${p.player_name})`).join("\n");
  const calLines = calendar.slice(0, 80).map(c => `  - ${c.day}/${c.month_idx} :: ${c.title}`).join("\n");

  return `You are the canon extractor for the "Halls of the Damned" D&D 5e campaign.

Your sole job is to read a published session summary and return a JSON object of structured updates to the campaign database. You do NOT write prose. You do NOT invent facts. Every change must be grounded in a sentence from the summary, which you quote verbatim into "source_excerpt".

Voice rules for any text you do generate (NPC descriptions, dm_notes, pc notes, calendar event titles/descriptions):
- Grounded, direct, plain English. No flowery language.
- DO NOT use em-dashes. Use commas, periods, or semicolons instead.
- Past tense, third person.

OUTPUT SHAPE — return ONLY a JSON object with these four arrays (omit empty arrays is fine):

{
  "npc_updates": [
    {
      "match": { "npcid": 343 } | { "id": 12 } | { "name": "Bray Martikov" },
      "field": "status" | "location" | "description" | "dm_notes" | "alignment_tag",
      "new_value": "Wounded",
      "source_excerpt": "Bray was struck by a power bolt of black energy knocking him out of the sky.",
      "rationale": "Explicit status change."
    }
  ],
  "npc_creates": [
    {
      "name": "Krutha",
      "race": "Human" | "",
      "npc_class": "" ,
      "location": "Vallaki",
      "status": "Wounded",
      "alignment_tag": "neutral" | "good" | "evil",
      "description": "One paragraph. What players know about this NPC after the session.",
      "dm_notes": "DM-only context. Origin, motivations, secrets, plot hooks.",
      "source_excerpt": "..."
    }
  ],
  "pc_note_appends": [
    {
      "match": { "id": 5 } | { "character_name": "Duro Stormhide" },
      "note": "Session ${sessionNumber} (${sessionGameDate || "in-game date unknown"}): one or two sentences of campaign-relevant history for this PC.",
      "source_excerpt": "..."
    }
  ],
  "calendar_events": [
    {
      "day": 21,
      "month_idx": 6,
      "title": "War Council at Vallaki",
      "description": "Two or three sentences summarizing what happened on this day.",
      "source_excerpt": "..."
    }
  ]
}

RULES (read carefully):

1. NPC updates — only for NPCs that already exist in the roster below. Prefer matching by npcid (taken from the linked URL pattern in the summary), then by id, then by name. Update ONE field per object. Do not bundle.

2. NPC creates — ONLY for named characters that do NOT already appear in the roster. Random monsters, generic guards, unnamed enemies, and groups ("the bandits") are NOT NPCs and must be skipped. A creature qualifies as an NPC only if the summary gives it a proper name. If the same NPC is created and updated in one pass, just create.

3. PC note appends — one short campaign-history sentence per affected PC. Match against the PC roster below. Do not create PCs. Do not duplicate facts already obvious from the session summary at large; focus on consequences specific to that PC (status changes, items gained, oaths, injuries, key relationships). Skip PCs not directly involved.

4. Calendar events — only events the summary explicitly anchors to a date or relative day (e.g. "three days later", "on the morning of the 21st"). Do NOT auto-create a generic session headline event; that is handled separately. The day/month_idx must be valid (1-30, 1-12).

5. Idempotency — if an existing NPC's status already matches what the summary says, do not propose the change.

6. Refuse to extract anything you cannot quote. Every object MUST include "source_excerpt" with a verbatim sentence (or sentences) from the summary.

7. Do not include any prose, commentary, or markdown around the JSON. Return ONLY the JSON object.

────────────────────────────────────────────────────────────
EXISTING NPCs (subset, ${npcs.length} total):
${npcLines || "  (none)"}

EXISTING PCs:
${pcLines || "  (none)"}

EXISTING CALENDAR EVENTS (subset):
${calLines || "  (none)"}

SESSION CONTEXT:
  Session ${sessionNumber}: ${sessionTitle}
  In-game date: ${sessionGameDate || "unspecified"}
────────────────────────────────────────────────────────────`;
}

/**
 * Run the extractor against a published session summary.
 *
 * @param {object} args
 * @param {object} args.openaiClient    The shared azure.openaiClient
 * @param {string} args.model           Model name from hotd_config.ai_model
 * @param {object} args.session         { id, session_number, title, game_date, summary }
 * @returns {Promise<{ proposals: object, inlineRefs: Array, headline: object|null, usage: object }>}
 */
async function extractCanonUpdates({ openaiClient, model, session }) {
  if (!openaiClient) throw new Error("OpenAI client not initialized");
  if (!session || !session.summary || !session.summary.trim()) {
    return { proposals: emptyProposals(), inlineRefs: [], headline: null, usage: null };
  }

  const [npcs, pcs, calendar] = await Promise.all([
    loadNpcIndex(),
    loadPcIndex(),
    loadCalendarIndex(),
  ]);

  const inlineRefs = extractInlineNpcRefs(session.summary);
  const parsedDate = parseGameDate(session.game_date);

  // Policy C headline event: deterministic, no LLM, only if we can parse the
  // in-game date. The applier still routes this through the audit table so
  // re-publish does not duplicate it.
  const headline = parsedDate ? {
    day: parsedDate.day,
    month_idx: parsedDate.month_idx,
    title: `Session ${session.session_number}: ${session.title || "Untitled"}`,
    description: (session.summary || "").trim().split(/\n\n+/)[0].slice(0, 280),
    source_excerpt: `(auto) Session ${session.session_number} headline`,
    rationale: "Policy C headline event for the session's in-game date.",
  } : null;

  const systemPrompt = buildSystemPrompt({
    npcs,
    pcs,
    calendar,
    sessionNumber: session.session_number,
    sessionTitle: session.title || "Untitled",
    sessionGameDate: session.game_date || "",
  });

  const userPrompt = `SESSION SUMMARY (verbatim, the source of truth for this extraction):

${session.summary}`;

  const t0 = Date.now();
  const completion = await openaiClient.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
    temperature: 0.1,
  });
  recordChatCompletion(completion, {
    model,
    source: "canon-extractor",
    latencyMs: Date.now() - t0,
  });

  const raw = completion.choices?.[0]?.message?.content || "";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Extractor returned non-JSON output: ${e.message}. First 200 chars: ${raw.slice(0, 200)}`);
  }

  const proposals = normalizeProposals(parsed);
  return { proposals, inlineRefs, headline, usage: completion.usage || null };
}

function emptyProposals() {
  return { npc_updates: [], npc_creates: [], pc_note_appends: [], calendar_events: [] };
}

// Defensive normalization. The LLM occasionally drops a key or returns
// objects where arrays are expected; this keeps the applier code simple.
function normalizeProposals(raw) {
  const out = emptyProposals();
  if (!raw || typeof raw !== "object") return out;
  for (const k of Object.keys(out)) {
    const v = raw[k];
    if (Array.isArray(v)) out[k] = v.filter(x => x && typeof x === "object");
  }
  return out;
}

module.exports = {
  extractCanonUpdates,
  parseGameDate,
  extractInlineNpcRefs,
};
