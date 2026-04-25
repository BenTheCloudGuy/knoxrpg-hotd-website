# NPC Portrait Generation

**Confidence:** high

## Pattern

Generate dark fantasy character portraits for campaign NPCs using the GPT Image API.

### Step-by-step

1. Look up the NPC in `src/hotd-campaign/data/npcs.json` by name. Read their `name`, `race`, `npc_class`, `location`, `status`, `description`, and `dm_notes` fields.

2. If the user provides specific physical description details or creative direction, use those. Otherwise, craft a character-appropriate description from the NPC data.

3. Build the image prompt using this style prefix:

   > `Dark fantasy character portrait, digital painting style, head and shoulders framing, dramatic directional lighting, rich painterly brushwork, moody atmosphere, medieval fantasy setting, cinematic contrast, muted dark background, semi-realistic, D&D fantasy art.`

   Then append character-specific details covering:
   - Physical appearance (race, age, build, skin tone, facial features, hair)
   - Expression and mood (should reflect their personality and story)
   - Clothing and equipment (appropriate to class, status, and setting)
   - One distinctive detail (a scar, weapon, symbol, magical effect, etc.)
   - Background setting (location-appropriate, atmospheric, not distracting)

4. Generate the image using the reusable `scripts/gen-image.js` tool:

   ```bash
   NODE_PATH=scripts/node_modules node scripts/gen-image.js \
     --prompt "Character-specific description here" \
     --output "npc-name.png" \
     --size 1024x1024 \
     --quality high
   ```

   The tool automatically prepends the dark fantasy style prefix. Use `--scene` for wider scene art, `--no-style` for fully custom prompts, or `--dry-run` to preview without generating.

   Available sizes: `1024x1024` (portrait), `1536x1024` (landscape scene), `1024x1536` (tall portrait)

   Output is always saved to `src/hotd-campaign/images/`.

5. Show the generated image to the user for approval.

6. Do NOT update `npcs.json` or any other files unless the user asks.

### Rules

- Do NOT guess physical appearance. If the NPC data lacks specific details (hair color, build, age, etc.) and the user hasn't specified them, ask before generating.
- Always incorporate any creative direction the user gives.
- If an image already exists at the target path, it will be overwritten.
- If the user doesn't like the result, regenerate with adjusted prompt based on their feedback.
- Keep the style consistent across all NPC portraits by always using the style prefix above.

### Learned patterns

- Bash `!` characters cause `event not found` — use temp .js files instead of inline scripts
- Image generation takes 30-60+ seconds — use 180000ms timeout or async mode
- npcs.json editing with `multi_replace_string_in_file` FAILS with em-dash characters — always use Node.js scripts for npcs.json modifications
- "Normal rounded human ears" must be specified for human characters or the model defaults to pointed ears
- Portraits are 1.4-1.8MB PNGs at 1024x1024

## Learned from

- NPC portrait batch generation (69 portraits, session v2.1.0)
- Strahd portrait iterations (v1 too old, v2 pointy ears, v3 final)
- Bella Wormwiggle regeneration (young attractive, not hag-like)
