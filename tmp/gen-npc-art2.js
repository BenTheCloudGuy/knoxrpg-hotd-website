const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const client = new OpenAI();
const stylePrefix = 'Dark fantasy character portrait, digital painting style, head and shoulders framing, dramatic directional lighting, rich painterly brushwork, moody atmosphere, medieval fantasy setting, cinematic contrast, muted dark background, semi-realistic, D&D fantasy art.';
const prompt = stylePrefix + ' A strong, thin, attractive human woman in her 30s with sharp lupine features and fierce amber-gold eyes. She has wild dark hair with bone beads and feathers woven through it. She wears a tight hide-leather crop top and a short tight hide-leather skirt, both decorated with bone charms and small feathers marking her as both warrior and shaman. Her skin is tanned and smooth, her build lean and athletic. Her expression is weary but resolute, a den leader carrying the weight of her pack on her shoulders. Behind her, the entrance to a cave den with wolf pelts on the walls and warm firelight flickering from deeper within.';
async function main() {
  console.log('Generating Emil Toranescu...');
  const result = await client.images.generate({ model: 'gpt-image-1', prompt, size: '1024x1024', quality: 'high', n: 1 });
  const buffer = Buffer.from(result.data[0].b64_json, 'base64');
  const outPath = path.join(__dirname, '..', 'src', 'hotd-campaign', 'images', 'emil-toranescu.png');
  fs.writeFileSync(outPath, buffer);
  console.log('Saved: ' + outPath + ' (' + buffer.length + ' bytes)');
}
main().catch(console.error);
