# Session Summary & Chronicling

**Owner:** Bard
**Confidence:** high

## When to use

Use this skill when the user asks to:

- Create or update a session prep file (`src/hotd-campaign/sessions/sessionNN.md`)
- Write or revise a post-session summary (the `hotd_sessions.summary` column)
- Generate a player-safe recap to share with the table
- Backfill an older session that's missing a summary
- Re-index sessions so RAG search reflects the change

## Reference order (read before writing)

1. **The previous session file** — `src/hotd-campaign/sessions/session{N-1}.md`. Continuity starts here.
2. **The current session file (if exists)** — `src/hotd-campaign/sessions/sessionNN.md` for DM prep already captured.
3. **`hotd_sessions` table** — confirm `session_number`, current `title`, current `summary`, `game_date`, `play_date`.
4. **`src/hotd-campaign/data/npcs.json`** — confirm every NPC mentioned by name. `npcid` is the canon identifier used in DM notes and cross-references; the **website URL uses `hotd_npcs.id`** (DB primary key), which is different. See the linking rule below.
5. **`src/hotd-campaign/data/campaign_notes.md`** — chapter/arc context.
6. **`tmp/halls-of-the-damned/01-dm-guide/writing-style-and-ai-config.md`** — voice rules.
7. **`tmp/halls-of-the-damned/01-dm-guide/narration-notes.md`** — PC background hooks (worth pulling into recaps when a character moment fires).

## Voice (non-negotiable)

Same rules as the rest of the campaign:

- **The test:** Would a real person actually say this out loud at the table? If not, rewrite.
- No em-dashes. Use commas, periods, or semicolons.
- No flowery, "AI fantasy prose." Direct, grounded, plainspoken.
- No "not X, but Y" constructions, no poetic abstractions, no trailer-voice.
- Concrete nouns and concrete verbs. Real human emphasis.
- Past tense for recaps. Present or future tense for prep notes.

## File format: `src/hotd-campaign/sessions/sessionNN.md`

Use the existing files (`session27.md`, `session28.md`) as the template. Standard layout:

```markdown
# Session N - Title #

## To-Do
[DM prep checklist: maps, tokens, music, props]

### Notes
[Free-form DM prep, mechanics to test, pacing notes]

## NPCS
- [NPC Name](https://hotd.knoxrpg.com/npcs/{id})
- [NPC Name](https://hotd.knoxrpg.com/npcs/{id})

### [PHASE NAME]
[Encounter prep, beats to hit, read-aloud cues]

### [PHASE NAME]
[Next beat]

## WRAP UP
[Post-session hooks, what carries into next session, message-from-NPC setups]
```

Rules:

- File name: `sessionNN.md` matching the existing numeric convention. Check the directory before naming.
- Title format: `# Session N - Title #` (trailing hash matches existing files).
- NPC links use the public website pattern `https://hotd.knoxrpg.com/npcs/{id}` where `{id}` is the **`hotd_npcs.id` column** (DB primary key), **not** the `npcid` field in `npcs.json`. The two differ: e.g. Mordenkainen is `npcid=93` but `id=669`. The website route resolves `/npcs/:id` against `hotd_npcs.id` only.
  - **Lookup query** (preferred): `SELECT id, name FROM hotd_npcs WHERE name ILIKE ANY(ARRAY['%Name1%','%Name2%']);` (PG env: `PGHOST=localhost PGPORT=30432 PGUSER=cortana PGDATABASE=dnd_website`, password in `/memories/repo/cortana-db.md`).
  - **Via MCP:** `search_campaign_lore` with `source_type="npc"` returns `source_id` which equals `hotd_npcs.id`.
  - In DM-internal notes (e.g. `(npcid 24)` citations), continue to use `npcid` — that is the canon identifier. URLs are the only place that needs the DB `id`.
- Phase labels in `### [BRACKETS]` keep prep blocks scannable at the table.

## DB summary format: `hotd_sessions.summary`

This is what shows on the public website and what gets embedded for RAG. Treat it as the player-facing recap.

- **Length:** 4 to 5 dense paragraphs, roughly 300 to 550 words.
- **Audience:** the players at the table. No DM secrets. No spoilers for upcoming plot.
- **Content:** what the party did, who they met, what changed in the world, where they ended.
- **Voice:** 3rd person, past tense, reporter-style. Who did what to whom.
- **Banned:** internal DM mechanics, hidden NPC motivations, future plot beats, anything tagged `dm_notes` in `npcs.json`.

### Locked voice rules (sessions 25 to 28 set the bar; do not violate)

1. **3rd person, past tense.** Reporter-style. Never "you" or "the party will." Never present tense.
2. **4 to 5 dense paragraphs.** Roughly 300 to 550 words. Open mid-action, not with scene-setting.
3. **Open with a concrete beat.** A PC name and a specific action in the first sentence. No weather, no mood-setting preamble.
4. **One paragraph per major beat,** in chronological order.
5. **Name every PC and NPC by full canonical name.** Never "the rogue" or "the cleric." Pull names from `npcs.json` and the PC roster.
6. **DM shorthand stays out.** Replace nicknames like "Moddy" or "Ezzie" with full names ("Mordenkainen", "Ezmerelda"). Family/group labels like "the Skanders" are fine because they describe a group, not a single person.
7. **Preserve the DM's asides and humor verbatim.** ("Krutha still very much naked", "with a mischievous grin", a linebacker metaphor, "Krutha rolled a natural 1. Twice.") These are the table's voice and are non-negotiable. Do not sanitize them.
8. **Preserve thematic spell descriptions alongside mechanical names.** If the DM describes Vasilka's Flaming Sphere as "a whirlwind spun out of the burning hut below Thorian", keep both the spell name ("Flaming Sphere") and the thematic description. Don't pick one and drop the other.
9. **Mirror the DM's outcome words exactly.** "Damaged" means damaged, not destroyed. "Crippled" means crippled, not wrecked. "Nearly dropped" means he was still standing. Never escalate or de-escalate what the DM said happened.
10. **Quote NPC dialogue inline** with regular double quotes. No italics, no em-dashes inside quotes.
11. **No em-dashes anywhere** (`—`). Use commas, periods, semicolons, or colons. Hyphens in compound modifiers ("foul-mouthed") are fine.
12. **No flowery prose.** No "they steeled themselves," no "the air grew heavy," no trailer-voice, no "not X, but Y" constructions. If a real person would not say it out loud at the table, cut it.
13. **No "the players felt..." or "this should feel..."** That is DM prep language, not a recap. The recap reports actions and outcomes, not intended emotional impact.
14. **Closing paragraph ends with a snapshot of where everyone left off.** Use the pattern "That is where the session ended, with..." or "That's where we left off, with..." Setting up the next session is the closing move every time.

### Summary template (mental model, not literal)

1. **Opening paragraph.** PC name + concrete action in sentence one. Resolve one immediate beat.
2. **The main beats.** One paragraph per major scene or encounter. Name NPCs. Name the choices the party made.
3. **The turn.** The moment the situation changed (a reveal, a loss, a new arrival).
4. **Where they ended.** Last location, last action, last decision. Sets up the next session.

## Step-by-step workflow

### Pre-session prep file

1. Confirm next session number against the directory and the DB.
2. Copy the section structure from the most recent prep file.
3. Pull the active NPCs from `npcs.json` (look up by current location, status, or arc).
4. Block out phases the DM has called out (`[REINFORCEMENTS]`, `[END PHASE]`, etc.).
5. Add `## To-Do` items for any prep that needs to happen before the session (maps, tokens, art).
6. Hand back to the DM. Do NOT invent encounter beats the user didn't ask for.

### Post-session summary

1. Read the prep file for the session and any DM notes the user gives you.
2. Read the previous session's `summary` for continuity (where the party was, who was wounded, what was pending).
3. Look up every NPC name in `npcs.json`. Confirm IDs, status, location.
4. Draft a 2–5 paragraph player-safe recap using the format above.
5. Apply the voice test. Strip anything that sounds like trailer prose.
6. Show the draft to the user for approval before writing to the DB.
7. On approval, update `hotd_sessions` row: `summary`, and `play_date` if not already set.
8. Run the embed re-index for sessions:

   ```bash
   cd scripts && node embed-pipeline.js --source session
   ```

9. Verify in the website that the new summary appears and RAG search returns it for relevant queries.

### Backfilling an older session

Same as post-session summary, except step 6 also requires confirming the `game_date` and `title` match what was actually played. If `play_date` is unknown, leave it NULL.

## Rules

- Never invent events. If the user's notes don't cover a beat, ask.
- Never expose DM secrets in the public summary. If you're unsure whether something is a secret, ask.
- Never modify `npcs.json` from this skill.
- Never modify the title or session_number of an existing session row without explicit approval — both are referenced by other systems (PDFs, RAG, public pages).
- Always link NPCs by their `hotd_npcs.id` in markdown files (not `npcid`). Names alone break when NPCs are renamed; the wrong ID column produces 404s.
- After any DB summary write, re-index. RAG goes stale silently otherwise.

## Coordination with other agents

- **Mercer** owns in-world prose (room/trap/monster descriptions, scene framing). If a recap needs new in-world descriptive prose, ask Mercer.
- **Ranger** owns stat blocks. If a recap references a creature that needs a new stat block, ask Ranger.
- **Bard** (self) handles all art prompts for portraits or scenes referenced in the session.

## Learned from

- `src/hotd-campaign/sessions/session27.md` and `session28.md` (existing format)
- `src/db/schema.js` (the `hotd_sessions` schema)
- `scripts/embed-pipeline.js` (the `--source session` re-index path)
- `tmp/halls-of-the-damned/01-dm-guide/writing-style-and-ai-config.md` (voice)
