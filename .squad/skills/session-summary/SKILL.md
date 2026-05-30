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
4. **`src/hotd-campaign/data/npcs.json`** — confirm every NPC mentioned by name. Use `npcid` for cross-links.
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
- [NPC Name](https://hotd.knoxrpg.com/npcs/{npcid})
- [NPC Name](https://hotd.knoxrpg.com/npcs/{npcid})

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
- NPC links use the public website pattern `https://hotd.knoxrpg.com/npcs/{npcid}`. Look up `npcid` in `npcs.json` before linking.
- Phase labels in `### [BRACKETS]` keep prep blocks scannable at the table.

## DB summary format: `hotd_sessions.summary`

This is what shows on the public website and what gets embedded for RAG. Treat it as the player-facing recap.

- **Length:** 2 to 5 short paragraphs.
- **Audience:** the players at the table. No DM secrets. No spoilers for upcoming plot.
- **Content:** what the party did, who they met, what changed in the world, where they ended.
- **Voice:** past tense, reporter-like, concrete actions. Who did what to whom.
- **Banned:** internal DM mechanics, hidden NPC motivations, future plot beats, anything tagged `dm_notes` in `npcs.json`.

### Summary template (mental model, not literal)

1. **Opening paragraph** — where the session picked up. One concrete sensory anchor.
2. **The main beats** — one paragraph per major scene or encounter. Name NPCs. Name choices the party made.
3. **The turn** — the moment the situation changed (a reveal, a loss, a new arrival).
4. **Where they ended** — last location, last action, last decision. Sets up the next session.

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
- Always link NPCs by `npcid` in markdown files. Names alone break when NPCs are renamed.
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
