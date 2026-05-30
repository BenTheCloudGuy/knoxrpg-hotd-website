# Narrative Prose (Rooms, Traps, Monsters, Treasure, Scenes, Attacks)

**Owner:** Mercer
**Confidence:** high

## When to use

Use this skill whenever the user asks for in-world prose for the table: a room description, a trap, a monster reveal, a treasure pull, a scene transition, or a combat attack narration. Also use it when expanding or fixing an existing description.

## The voice (non-negotiable)

The voice is set by `tmp/halls-of-the-damned/01-dm-guide/writing-style-and-ai-config.md` and the user's `writing-style.md` memory note. Apply both together.

**The test:** Would a real person actually say this out loud at the table? If not, rewrite it.

Avoid:
- em-dashes
- ornamental phrasing and AI-fantasy prose
- sentence fragments used only for drama
- "not X, but Y" constructions unless a person would really say it that way
- poetic abstractions and trailer-voice
- vague mood language used instead of concrete information

Do:
- direct wording, functional sentences
- concrete nouns and concrete verbs
- speech-like rhythm, plainspoken fantasy tone
- blunt clarity, real human emphasis

Voice anchors (from the campaign master doc):
- Bad: *"Wachterhaus offers something different—an ancestral home steeped in resentment, decay, and ambition."*
- Good: *"Wachterhaus feels older than the rest of Vallaki. Richer too. Not cleaner. Just older."*

## Reference order (read before writing)

1. `src/hotd-campaign/data/npcs.json` — for any named NPC mentioned
2. `src/hotd-campaign/data/realms/*.md` — for region tone and geography
3. `src/hotd-campaign/data/Krezk.md` (and other notebook entries) — for location format precedent
4. `src/hotd-campaign/sessions/sessionNN.md` — for current state (wounded, dead, where last seen)
5. `tmp/halls-of-the-damned/04-locations/location-descriptions.md` — location format precedent
6. `tmp/halls-of-the-damned/07-handouts/read-aloud-text.md` — read-aloud format precedent
7. `tmp/halls-of-the-damned/05-items-and-artifacts/magic-items.md` — treasure format
8. `tmp/halls-of-the-damned/06-encounters/` — combat and skill challenge format
9. `tmp/frhof-raw/` — Forgotten Realms reference (atlas, gods, factions, magic)

When running inside the website, also use `searchEmbeddings()` from `src/lib/rag.js` for semantic lookup, and the function tools in `src/lib/ai-tools.js` (`lookup_npc`, `search_npcs`, `get_session_log`, `lookup_spell`, `lookup_monster`).

## Step-by-step

1. Identify every named entity in the request (NPC, location, item, monster). Look each one up in canon before writing.
2. Check the most recent session logs for current state. Do not describe a character as healthy if they were last seen bleeding out.
3. Pick the matching format below.
4. Draft. Read it back. Apply the "real person at the table" test. Rewrite anything that fails.
5. If canon is missing or contradictory, stop and ask the user. Do not invent.

## Formats

### Room / location

```markdown
## [Area Code]. [Location Name]

> **Read-Aloud**
> [One short paragraph the DM can read verbatim. Concrete sensory details: what they see, hear, smell first. No mood adjectives without an object. No em-dashes.]

**Features**
- [What is actually in the room: furniture, exits, light sources, smells, sounds]
- [Anything interactive: doors, levers, containers, bodies]
- [Anything obviously dangerous or out of place]

**Creatures** (if any)
- [Name (npcid X) — current state, position, what they're doing]

**Treasure** (if any)
- [Item — location in the room]

**DM Notes**
- [Secrets, hidden passages, perception/investigation DCs]
- [Story hooks tied to current arc]
- [What changes if the party returns later]
```

### Trap

```markdown
## [Trap Name]

> **Read-Aloud (on trigger)**
> [One or two sentences describing what the party experiences when the trap fires. Present tense.]

**Trigger:** [Pressure plate / tripwire / proximity / magical / touched object]
**Effect:** [Damage type, dice, save type and DC, secondary effects]
**Detect:** Passive Perception or Investigation DC X. Clue: [what tipped them off]
**Disable:** [Tool, spell, skill check, DC]
**Countermeasures:** [How a clever party can bypass without the check]
**Reset:** [Yes/no, how long]

**DM Notes**
- [Why this trap exists, who set it, what it guards]
```

### Monster / creature reveal

```markdown
## [Creature Name]

> **Read-Aloud (on first sighting)**
> [What the party perceives first. Sound before sight, sight before identification. One short paragraph.]

**Stat block:** `src/hotd-campaign/data/statBlocks/[file].md` (delegate to Ranger if missing)

**Behavior**
- [How it opens combat]
- [What it does when bloodied]
- [What it does on the brink of death]

**DM Notes**
- [Origin and lore]
- [Connections to current arc]
- [Loot it carries, if any]
```

### Treasure

```markdown
## [Item Name]

> **Read-Aloud (on discovery)**
> [Sensory: what it looks, feels, smells, sounds like. Concrete.]

**Mechanical Effect:** [Rules text in plain language. Charges, attunement, save DCs.]

**Lore Hook:** [One sentence tying it to a faction, NPC, or arc.]

**DM Notes**
- [Where it came from, who wants it back]
- [Hidden properties revealed by Identify or specific triggers]
```

### Scene framing / transition

Use prose paragraphs, no template. One to three short paragraphs:

- Where they are now and what just changed.
- What the party perceives (one concrete sensory hook).
- What the party can do next (implicit or explicit prompt).

Keep it shorter than the players expect. Long scene transitions kill table momentum.

### Attack / combat narration

One or two sentences. Present tense. Concrete verb. Name the body part or the surface.

- Good: *"Vasilka's hand closes on Korith's wrist. The bones grind. He drops the sword."*
- Bad: *"Vasilka's grip becomes an inescapable vise — a brutal testament to her unnatural strength, a moment frozen in horror as the paladin's blade tumbles toward the cold earth."*

If the attack misses, narrate the miss with the same economy. Do not pad.

## Rules

- Never invent canon. If a fact is missing, ask the user or check RAG.
- Never modify `npcs.json` from this skill. That is a separate, explicit task.
- Never describe a published-canon location in a way that contradicts the realm file in `src/hotd-campaign/data/realms/`.
- When using a named NPC, cite the `npcid` from `npcs.json` in DM notes (e.g. `Baron Krezkov (npcid 24)`).
- Match existing file precedents in `src/hotd-campaign/data/` before inventing new layouts.
- Read-aloud blocks must pass the "say it out loud" test. If it feels like reading a book aloud, rewrite it.

## Learned from

- User's writing-style memory note
- `tmp/halls-of-the-damned/01-dm-guide/writing-style-and-ai-config.md` (the campaign style guide with worked examples)
- `tmp/halls-of-the-damned/07-handouts/read-aloud-text.md` (existing read-aloud precedent)
- `src/hotd-campaign/data/Krezk.md` (existing notebook format)
