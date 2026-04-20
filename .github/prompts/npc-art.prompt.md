---
description: "Generate a portrait for an NPC using GPT Image API"
agent: "agent"
---

# NPC Portrait Generator

Generate a dark fantasy character portrait for the specified NPC.

## Steps

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

4. Generate the image by creating and running a Node.js script in `tmp/` that:
   - Uses the `openai` SDK (require from `NODE_PATH=../scripts/node_modules`)
   - Calls `client.images.generate()` with `model: 'gpt-image-1'`, `size: '1024x1024'`, `quality: 'high'`
   - Saves the output as a `.png` to `src/hotd-campaign/images/` using lowercase-hyphenated naming (e.g., `madam-eva.png`)

5. Show the generated image to the user for approval.

6. Do NOT update `npcs.json` or any other files unless the user asks.

## Important Rules

- Do NOT guess physical appearance. If the NPC data lacks specific details (hair color, build, age, etc.) and the user hasn't specified them, ask before generating.
- Always incorporate any creative direction the user gives (e.g., "include a raven in the background", "make them bald with a big gut").
- If an image already exists at the target path, it will be overwritten. This is expected when replacing book art.
- If the user doesn't like the result, regenerate with adjusted prompt based on their feedback.
- Keep the style consistent across all NPC portraits by always using the style prefix above.
