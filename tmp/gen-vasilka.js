const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const stylePrefix = 'Dark fantasy character portrait, digital painting style, head and shoulders framing, dramatic directional lighting, rich painterly brushwork, moody atmosphere, medieval fantasy setting, cinematic contrast, muted dark background, semi-realistic, D&D fantasy art.';

const prompt = `${stylePrefix} Vasilka, a flesh golem bride created by a fallen angel. She was built from the body of a young woman named Ilya Krezkov, so she has the face of a beautiful young woman in her early twenties with pale Slavic features, but something is clearly wrong. Her skin is porcelain-white with an unnatural waxy quality. Faint surgical stitch lines trace along her jawline and neck where flesh was assembled. Her eyes are ice blue, wide and unblinking, with an eerie doll-like quality that shifts between innocent and menacing. Dark hair falls around her shoulders, well-kept but lifeless. She wears a simple white gown, like a bridal dress, now stained and weathered. Faint arcane energy crackles around her fingertips, hinting at her sorcerous power. Her expression is cold and watchful, a created being who has learned to feel rage. Behind her, the faint outline of stone abbey walls in shadow.`;

async function generate() {
  console.log('Generating Vasilka...');
  const response = await client.images.generate({
    model: 'gpt-image-1',
    prompt: prompt,
    n: 1,
    size: '1024x1024',
    quality: 'high',
  });

  const b64 = response.data[0].b64_json;
  const outPath = path.join(__dirname, '..', 'src', 'hotd-campaign', 'images', 'vasilka.png');
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  console.log('Saved:', outPath, '(' + fs.statSync(outPath).size + ' bytes)');
}

generate().catch(err => { console.error('Error:', err.message); process.exit(1); });
