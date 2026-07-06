# Stat Block Generation

**Confidence:** high

## Pattern

Create D&D 5e (2024) stat blocks for campaign NPCs, monsters, and allies as formatted markdown files with embedded NPC portraits.

### Step-by-step

1. Look up the NPC in `src/hotd-campaign/data/npcs.json` by name. Read their `name`, `race`, `npc_class`, `location`, `status`, `alignment_tag`, `description`, `dm_notes`, and `portrait_url` fields.

2. Determine the stat block type:
   - **Enemy/Monster:** No filename prefix. Include lair actions or legendary actions if appropriate.
   - **Ally/NPC:** Prefix filename with `ally-`. Include tactical notes for how the DM should run them.
   - **Custom Creature:** No prefix. Include custom mechanic explanations.

3. If the NPC has a `portrait_url`, add a portrait image at the top of the stat block:
   ```markdown
   ![NPC Name](/hotd-content/images/npc-name.png)
   ```
   The `portrait_url` field in npcs.json now stores an absolute served URL (e.g., `/hotd-content/images/vasilka.png`) — images live on the uploads PVC/NAS/blob, not the repo. Use the `portrait_url` value directly as the image source; do not build a relative `../images/` path.

4. Build the stat block using 2024 Monster Manual format:
   - Size, type, alignment line
   - AC, HP (with hit dice), Speed
   - Ability scores table with modifiers
   - Saving throws, skills, damage resistances/immunities, condition immunities, senses, languages, CR
   - Traits section
   - Spellcasting section (if applicable) with full inline summaries for every spell
   - Actions section
   - Bonus Actions (if any)
   - Reactions (if any)
   - Lair Actions (if applicable)
   - DM Notes section with campaign-specific context

5. For spellcasters, every spell MUST include an inline summary covering:
   - Range
   - Save type or attack roll
   - Damage dice and type
   - Duration
   - Concentration requirement
   - Key mechanical effect in plain language

   Example:
   ```
   - *Fireball* — 150 ft. range, 20 ft. radius. 8d6 fire damage. DEX save for half.
   - *Hold Person* — 60 ft. Target humanoid must make WIS save or be paralyzed. Repeat save at end of each turn. Concentration.
   ```

6. Save the file to `src/hotd-campaign/data/statBlocks/` using lowercase-hyphenated naming:
   - Allies: `ally-ismark-kolyanovich.md`
   - Enemies: `vasilka.md`
   - Creatures: `patchwork-goblin-swarm.md`

### Rules

- Always look up NPC data before creating stat blocks. Do NOT guess race, class, or lore.
- If stat details (level, CR, special abilities) aren't specified by the user, derive them from the NPC's class, description, and role in the campaign.
- Spell selections should match the NPC's class, personality, and tactical role.
- Include a DM Notes section with campaign context: when they appear, how to run them, story hooks.
- Portrait images must use relative paths from the statBlocks directory: `../images/filename.png`
- If no portrait exists for the NPC, note it in DM Notes and skip the image tag.
- Do NOT modify `npcs.json` unless explicitly asked.

### Stat Guidelines by Role

| Role | CR Range | HP Range | Key Feature |
|------|----------|----------|-------------|
| Commoner / Non-combatant | 0-1/4 | 4-22 | Minimal combat, morale/support abilities |
| Militia / Guard | 1/4-2 | 11-45 | Pack tactics, simple weapons |
| Skilled Fighter / Ranger | 3-5 | 45-85 | Multiattack, class features |
| Elite / Captain | 5-8 | 75-130 | Reactions, leadership abilities |
| Boss / Named Villain | 8-13 | 120-200+ | Lair actions, legendary actions, spell redirect |
| Swarm | 2-5 | 50-75 | Custom scaling rules, drag down, pile on |

### Learned Patterns

- Always include spell summaries inline. DMs should never need to look up a spell during the session.
- Custom swarm rules: per-goblin scaling (+2 attack, 1d6+1 damage, +2 DC per goblin in swarm).
- Flesh golem catapult: 3-turn reload cycle, separate stat block for weapon vs operator.
- Wereravens/werewolves need shapechanger trait with form-specific attack options.
- Non-combatant nobles still need a stat block for AC, HP, and morale abilities.

## Learned from

- Session 27 Battle of Tser Hill stat block creation (Vasilka, stitches, flesh golem, 15 allies)
- Custom patchwork goblin swarm mechanic design
