const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const client = new OpenAI();

const OUT = path.join(__dirname, '..', 'src', 'hotd-campaign', 'images', 'strahd-von-zarovich.png');
const STYLE = 'Dark fantasy character portrait, digital painting style, head and shoulders framing, dramatic directional lighting, rich painterly brushwork, moody atmosphere, medieval fantasy setting, cinematic contrast, muted dark background, semi-realistic, D&D fantasy art.';

const prompt = `${STYLE} A vampire lord sitting in a dark gothic throne room. He is human, not elven — he has normal rounded human ears. He appears young and powerful, still handsome with sharp aristocratic angular features. His skin is pale but otherwise he looks fully human. He has slicked-back dark hair with a pronounced widow peak and dark intense eyes with no red or glowing coloration. He wears elegant noble finery with a high-collared black and crimson cloak. One pale hand rests on the arm of an ornate stone throne. His expression is cold, calculating amusement with a hint of madness. The throne room behind him is dark and grand with tall gothic windows and candlelight.`;

(async () => {
  console.log('[START] strahd-von-zarovich.png');
  const result = await client.images.generate({
    model: 'gpt-image-1', prompt, size: '1024x1024', quality: 'high', n: 1
  });
  const buf = Buffer.from(result.data[0].b64_json, 'base64');
  fs.writeFileSync(OUT, buf);
  console.log(`[DONE] strahd-von-zarovich.png (${buf.length} bytes)`);
})();
