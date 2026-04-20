const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const client = new OpenAI();

const OUT_DIR = path.join(__dirname, '..', 'src', 'hotd-campaign', 'images');
const STYLE = 'Dark fantasy character portrait, digital painting style, head and shoulders framing, dramatic directional lighting, rich painterly brushwork, moody atmosphere, medieval fantasy setting, cinematic contrast, muted dark background, semi-realistic, D&D fantasy art.';

const npcs = [
  {
    file: 'strahd-von-zarovich.png',
    prompt: `${STYLE} A vampire lord sitting in a dark gothic throne room. He appears young and powerful, still handsome with sharp aristocratic angular features. His skin is pale but otherwise he looks human. He has slicked-back dark hair with a pronounced widow peak and piercing predatory crimson eyes. He wears elegant noble finery with a high-collared black and crimson cloak. One pale hand rests on the arm of an ornate stone throne. His expression is cold, calculating amusement with a hint of madness. The throne room behind him is dark and grand with tall gothic windows and candlelight.`
  },
  {
    file: 'bella-wormwiggle.png',
    prompt: `${STYLE} A young attractive woman in her late 20s with a warm inviting smile, dark hair tucked under a headscarf. She wears a simple shawl over a country dress. She stands beside a cart of freshly baked goods with pies steaming in the cool air. She is pretty and disarming, the kind of face you would trust without question. But her eyes watch with subtle predatory intensity beneath the charming facade. Behind her, a windmill on a hillside.`
  }
];

(async () => {
  for (const npc of npcs) {
    const outPath = path.join(OUT_DIR, npc.file);
    console.log(`[START] ${npc.file}`);
    try {
      const result = await client.images.generate({
        model: 'gpt-image-1',
        prompt: npc.prompt,
        size: '1024x1024',
        quality: 'high',
        n: 1
      });
      const buffer = Buffer.from(result.data[0].b64_json, 'base64');
      fs.writeFileSync(outPath, buffer);
      console.log(`[DONE] ${npc.file} (${buffer.length} bytes)`);
    } catch (err) {
      console.error(`[FAIL] ${npc.file}: ${err.message}`);
    }
  }
  console.log('=== Complete ===');
})();
