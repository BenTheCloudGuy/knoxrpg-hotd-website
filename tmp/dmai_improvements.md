# DM AI Improvement Recommendations

Full review of the DM AI system (`src/lib/ai-tools.js`, `src/routes/api.js`, `src/lib/rag.js`, `src/lib/auth.js`, `src/db/schema.js`) with detailed recommendations for improving response quality, formatting, and role-based access control.

---

## 1. Role-Based Access Control (DM vs Player) — HIGH PRIORITY

### Problem

The DM AI currently treats every user identically. There is no distinction between the DM (admin) and players. This means:

- Players can ask "tell me about [hidden NPC]" and get the full profile, including NPCs marked `is_hidden = TRUE`.
- Players can ask about monsters and get the full stat block (AC, HP, abilities, legendary actions), which is meta-gaming information they should not have.
- DM notes (`dm_notes` column on `hotd_npcs`) are never returned at all, even to the DM, because the `lookup_npc` query doesn't SELECT them.
- The RAG system (`searchEmbeddings`) has an `includeDmOnly` parameter that defaults to `false` and is never set to `true`, even when the DM is asking. This means content flagged `is_dm_only = TRUE` in `hotd_embeddings` is invisible to everyone, including the DM.

### What Already Exists

The infrastructure for role-based access is already built; it just isn't wired together:

| Component | Location | What It Has |
|:----------|:---------|:------------|
| Session auth | `src/lib/auth.js` | `getSession(req)` returns `{ role, username, firstName, lastName, userId }`. `role` is `"admin"` for DM. |
| API route | `src/routes/api.js`, line 15 | `handleApiRoutes(decoded, req, res, session, url)` receives `session` but never passes it to `chatWithTools()`. |
| NPC table | `src/db/schema.js` | `hotd_npcs` has `is_hidden BOOLEAN DEFAULT TRUE` and `dm_notes TEXT DEFAULT ''`. |
| Embeddings table | `src/db/schema.js` | `hotd_embeddings` has `is_dm_only BOOLEAN DEFAULT FALSE` with a dedicated index. |
| RAG search | `src/lib/rag.js` | `searchEmbeddings()` accepts `{ includeDmOnly }` but the callers in `ai-tools.js` never pass it. |
| AI tools | `src/lib/ai-tools.js` | `chatWithTools()` signature is `(openaiClient, model, userMessages, opts)` with no session/role param. |

### Recommended Changes

#### A. Pass session into `chatWithTools()`

In `src/routes/api.js`, the `/api/chat` handler (line 18) currently calls:

```js
const { reply } = await chatWithTools(azure.openaiClient, azure.aiModel, userMessages);
```

Change to:

```js
const isDM = session && session.role === 'admin';
const { reply } = await chatWithTools(azure.openaiClient, azure.aiModel, userMessages, {
  isDM,
  username: session ? session.firstName || session.username : 'Adventurer',
});
```

#### B. Update `chatWithTools()` to accept and use role

In `src/lib/ai-tools.js`, update `chatWithTools` to read `opts.isDM` and `opts.username`, then:

1. Select the appropriate system prompt (DM vs Player variant).
2. Pass `isDM` down to `executeTool()` so queries can filter accordingly.

#### C. Filter NPC queries by role

**`lookup_npc`**: Currently queries all NPCs regardless of `is_hidden`. For player mode:
- Add `AND is_hidden = FALSE` to the WHERE clause.
- Do NOT include `dm_notes` in the SELECT.

For DM mode:
- Include all NPCs.
- Add `dm_notes` to the SELECT and include it in the returned JSON.

**`search_npcs`**: Same filtering. Add `AND is_hidden = FALSE` for players.

#### D. Filter monster lookups by role

**`lookup_monster`**: For player mode, return only flavor information:
- Return: `name`, `size`, `type`, `alignment`, `description_text`, `environments`, `avatar_url`, `source`.
- Omit: `armor_class`, `hit_points`, `hit_dice`, `ability_scores`, `saving_throws`, `skills`, `damage_resistances`, `damage_immunities`, `damage_vulnerabilities`, `condition_immunities`, `challenge_rating`, `xp`, `proficiency_bonus`.
- The system prompt for players should instruct: "When a player asks about a monster, describe what their character would know from in-world experience or Arcana/Nature/History checks. Do not reveal AC, HP, exact ability scores, or stat block details."

For DM mode, return everything as-is (full stat block).

#### E. Pass `includeDmOnly` to RAG searches

In `executeTool`, the `search_dnd_reference` and `search_campaign_lore` cases currently call `searchEmbeddings()` without `includeDmOnly`. When the user is the DM:

```js
const results = await searchEmbeddings(openaiClient, args.query, {
  limit: 6,
  minScore: 0.3,
  includeDmOnly: isDM,  // <-- add this
});
```

This ensures DM-only embedded content (hidden plot points, secret lore, encounter prep notes) is only surfaced to the DM.

#### F. Create separate system prompts

Create two system prompt variants:

**DM System Prompt** additions:
```
You are speaking to the Dungeon Master (admin). You have full access to all campaign data,
including hidden NPCs, DM notes, secret plot elements, and full monster stat blocks.
Present DM notes in a clearly labeled section so they stand out.
When showing monster stat blocks, include the full stat block with all details.
```

**Player System Prompt** additions:
```
You are speaking to a player. Do not reveal:
- Hidden NPCs or NPCs the party has not encountered.
- DM notes or behind-the-screen information.
- Full monster stat blocks (AC, HP, exact ability scores, legendary actions).
- Secret plot points or upcoming story elements.

When asked about a monster, describe what the character might know based on common
knowledge or relevant skill checks (Arcana, Nature, History, Religion). Frame it as
in-world knowledge, not game mechanics.
```

---

## 2. Chat Endpoint Auth Gate — HIGH PRIORITY

### Problem

The `/api/chat` endpoint at `src/routes/api.js` line 18 has no authentication check. The `session` variable is available but never inspected. Any unauthenticated visitor can use the AI, consuming OpenAI API credits.

### Current Code

```js
if (decoded === "/api/chat" && req.method === "POST") {
    if (!azure.openaiClient) return sendJSON(res, { error: "Chat is not configured." }, 503), true;
    try {
      const body = await readBody(req);
      // ... no session check at all
```

### Recommended Options

**Option A: Require login for all chat access.**
```js
if (!session) return sendJSON(res, { error: "Please log in to use the DM AI." }, 401), true;
```

**Option B: Allow anonymous but restrict to player-mode with rate limiting.**
- Treat `!session` as player role (no DM features).
- Add a rate limit (e.g., 10 requests per hour per IP for anonymous, 100 for logged-in users).

**Option C: Allow anonymous, no rate limiting, player mode.**
- Simplest. Just treat anonymous as `isDM = false`.

**Question for you:** Which option do you prefer? Option A (login required), B (anonymous with rate limits), or C (anonymous unrestricted, player mode only)?

---

## 3. Context-Aware Response Formatting — MEDIUM PRIORITY

### Problem

The system prompt gives one set of formatting instructions for all query types. The model has to figure out how to present spell data vs. NPC profiles vs. session logs, and it often gets it wrong or inconsistent.

### Recommended Additions to System Prompt

Add a **"Formatting by Content Type"** section to the system prompt:

```
## Formatting by Content Type

### Spells
Format as a spell card:
- **Name** as header
- Level, School on one line (e.g., "3rd-level Evocation")
- **Casting Time / Range / Components / Duration** each on their own line, bolded label
- Area of effect if applicable
- Save type if applicable
- Description text
- "At Higher Levels" section if `can_cast_at_higher_level` is true
- Source citation at bottom (e.g., "Source: Player's Handbook, p. 241")

### Monsters (DM only)
Format as a standard 5e stat block:
- **Name** as header
- *Size Type, Alignment* in italics
- **Armor Class** (with type), **Hit Points** (with hit dice), **Speed**
- Ability scores in a 6-column table: STR | DEX | CON | INT | WIS | CHA
- Saving throws, skills, senses, languages, CR each on their own line
- Damage resistances/immunities/vulnerabilities and condition immunities
- Traits, Actions, Legendary Actions as bold-headed sections

### NPCs
- Portrait image at top (if portrait_url exists)
- **Name** as header
- Race, Class, Alignment on one line
- **Location** and **Status** on their own lines
- Description paragraph
- DM Notes in a clearly labeled section (DM only)
- Link to NPC profile page

### Session Logs
- **Session N: Title** as header
- Game date and play date
- Summary as bullet points for key events, not a wall of text

### Magic Items
- **Name** as header
- Type, Rarity, Attunement requirement
- Description
- Charges/reset if applicable
- Source citation

### Player Characters
- Avatar at top (if avatar_url exists)
- **Name** (played by Player Name) as header
- Level, Race, Class/Subclass
- Ability scores in a 6-column table
- AC, HP, Speed
- Key features and notable equipment
- Background summary
```

### Why This Matters

Without explicit formatting guidance per type, the model may:
- Dump raw JSON field names like `activation_type` or `range_field` instead of "Casting Time" and "Range".
- Present spell data as a paragraph instead of a structured card.
- Skip the stat block table layout for monsters.
- Present session summaries as long unbroken paragraphs.

---

## 4. Spell Lookup Output Quality — MEDIUM PRIORITY

### Problem

The `lookup_spell` tool returns raw database column names that don't match standard D&D terminology:

| DB Column | Should Display As |
|:----------|:-----------------|
| `activation_type` | Casting Time |
| `range_field` | Range |
| `duration_type` + `duration_field` | Duration |
| `aoe_type` + `aoe_size` | Area |
| `save_ability` | Saving Throw |
| `requires_concentration` | Concentration |
| `can_cast_as_ritual` | Ritual |
| `can_cast_at_higher_level` | At Higher Levels |
| `source` + `source_page` | Source |

### Recommended Fix

Transform the output in `executeTool` before returning to the model. Instead of returning raw rows, map them to human-readable keys:

```js
case "lookup_spell": {
  // ... existing query ...
  return JSON.stringify({
    found: true,
    spells: res.rows.map(s => ({
      name: s.name,
      level: s.level === 0 ? 'Cantrip' : `${s.level}${ordinal(s.level)}-level`,
      school: s.school,
      casting_time: s.activation_type,
      range: s.range_field,
      components: s.components,
      duration: s.requires_concentration
        ? `Concentration, ${s.duration_field}`
        : s.duration_field || s.duration_type,
      area: s.aoe_type ? `${s.aoe_size}-foot ${s.aoe_type}` : null,
      saving_throw: s.save_ability || null,
      ritual: s.can_cast_as_ritual || false,
      description: s.description_text,
      at_higher_levels: s.can_cast_at_higher_level || false,
      source: s.source_page
        ? `${s.source}, p. ${s.source_page}`
        : s.source,
    })),
  });
}
```

This gives the model clean, labeled data to format rather than expecting it to translate `activation_type` to "Casting Time".

---

## 5. User Identity in System Prompt — MEDIUM PRIORITY

### Problem

The system prompt doesn't tell the model who is asking. Every conversation is generic. The model can't personalize responses or adjust tone based on whether it's talking to the DM or a specific player.

### Recommended Addition

When building the system prompt, inject a user context block:

**For DM/Admin:**
```
## Current User
You are speaking with the Dungeon Master. Address them directly and provide full
behind-the-screen information when relevant.
```

**For logged-in player:**
```
## Current User
You are speaking with {firstName}, who plays {characterName} in the campaign.
You can reference their character when relevant. Answer from an in-world perspective
where appropriate.
```

To get the player's character name, you could do a quick lookup during chat init:
```js
const pcRes = await pgPool.query(
  `SELECT pc.character_name FROM hotd_player_characters pc
   JOIN hotd_character_access ca ON ca.character_id = pc.id
   WHERE ca.user_id = $1 LIMIT 1`, [session.userId]
);
```

**For anonymous:**
```
## Current User
You are speaking with an unidentified visitor. Treat them as a player with no
special access.
```

---

## 6. DM Notes Not Returned for DM — MEDIUM PRIORITY

### Problem

Even when the DM asks about an NPC, the `lookup_npc` query (line ~207 of ai-tools.js) does not SELECT the `dm_notes` column:

```sql
SELECT id, name, race, npc_class, location, status, alignment_tag, portrait_url, description
FROM hotd_npcs WHERE name ILIKE $1 ORDER BY sort_order, name LIMIT 5
```

The `dm_notes` column exists on the table and is synced by `scripts/sync-npcs.js`, but the AI never sees it.

### Recommended Fix

For DM mode, add `dm_notes` to the SELECT and include it in the response:

```js
case "lookup_npc": {
  const pattern = `%${args.name}%`;
  const columns = isDM
    ? 'id, name, race, npc_class, location, status, alignment_tag, portrait_url, description, dm_notes'
    : 'id, name, race, npc_class, location, status, alignment_tag, portrait_url, description';
  const filter = isDM ? '' : ' AND is_hidden = FALSE';
  const res = await pgPool.query(
    `SELECT ${columns} FROM hotd_npcs WHERE name ILIKE $1${filter} ORDER BY sort_order, name LIMIT 5`, [pattern]
  );
  // ... map results, include dm_notes for DM ...
}
```

---

## 7. Max Token Limit — LOW PRIORITY

### Problem

`maxTokens` is hardcoded to 2048 in `chatWithTools()`. For responses that include full stat blocks (monster with legendary actions), long session summaries, or multi-NPC search results, this can cause truncation mid-response.

### Current Code

```js
const maxTokens = opts.maxTokens || 2048;
```

### Recommended Fix

Differentiate by role:

```js
const maxTokens = opts.maxTokens || (opts.isDM ? 4096 : 2048);
```

DM queries tend to request more detailed information (full stat blocks, DM notes, session planning), so a higher limit is warranted. Players get shorter, more focused responses. This also helps control API costs since player queries are more common.

---

## 8. Tool Selection Overhead — LOW PRIORITY

### Problem

All 12 tool definitions are sent with every API call regardless of what the user is asking. For a simple spell question, the model still evaluates `lookup_npc`, `search_npcs`, `get_session_log`, etc. before deciding on `lookup_spell`.

This isn't a correctness issue, but it:
- Adds input tokens to every call (the tool definitions are ~1500 tokens).
- Occasionally causes the model to make unnecessary parallel calls (e.g., calling `search_campaign_lore` alongside `lookup_spell` for a basic spell question).

### Possible Approaches

**Option A: Two-pass routing.** Use a lightweight first call (no tools, small model) to classify the query type, then only include relevant tools in the second call. Adds latency for the routing call but reduces tool confusion.

**Option B: Leave as-is.** The current approach works and OpenAI handles tool selection well. The overhead is minor. This is a "nice to have" optimization, not a problem.

**Recommendation:** Leave as-is unless you notice the model frequently making unnecessary tool calls.

---

## 9. Missing Error Context in RAG Fallback — LOW PRIORITY

### Problem

When `search_dnd_reference` or `search_campaign_lore` returns no results, the model gets:

```json
{ "found": false, "message": "No reference material found" }
```

The system prompt says "If a tool returns no results, say so honestly," but the model sometimes falls back to its general training data and answers anyway (e.g., giving the PHB Fireball description from memory rather than saying "I couldn't find that in my reference data").

### Recommended Fix

Add to the system prompt:

```
When a tool returns no results, clearly state that you could not find the information in
the campaign database or reference materials. You may supplement with general D&D knowledge
from official sources, but explicitly note that it comes from general knowledge and not from
the campaign's data. Never present general knowledge as if it came from a tool lookup.
```

---

## 10. Session Summary Truncation — LOW PRIORITY

### Problem

In the `get_session_log` tool, when searching by query, summaries are truncated to 500 characters:

```js
summary: (s.summary || "").slice(0, 500)
```

This is fine for search results, but when a user asks "what happened in session 15?", the specific session lookup returns the full summary. The inconsistency can cause confusion if the model searches first and gets truncated results.

### Recommended Fix

Increase the search result truncation to 1000 characters, or return full summaries and let the model summarize naturally.

---

## Implementation Priority Summary

| # | Recommendation | Priority | Effort | Impact |
|:-:|:---------------|:---------|:-------|:-------|
| 1 | Role-based access (DM vs Player) | HIGH | Medium | Prevents meta-gaming, protects DM secrets |
| 2 | Chat endpoint auth gate | HIGH | Low | Controls API costs, establishes role |
| 3 | Context-aware formatting | MEDIUM | Low | Cleaner spell cards, stat blocks, session logs |
| 4 | Spell lookup output cleanup | MEDIUM | Low | Fixes raw column names in spell responses |
| 5 | User identity in prompt | MEDIUM | Low | Personalized, contextual responses |
| 6 | DM notes in NPC queries | MEDIUM | Low | DM gets full NPC intel |
| 7 | Max token limit by role | LOW | Trivial | Prevents truncated DM responses |
| 8 | Tool selection optimization | LOW | High | Minor efficiency gain |
| 9 | RAG fallback messaging | LOW | Trivial | Clearer "not found" handling |
| 10 | Session summary truncation | LOW | Trivial | Better search result context |
