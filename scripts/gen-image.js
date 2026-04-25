#!/usr/bin/env node
// gen-image.js — Reusable OpenAI image generation tool
// Usage: node scripts/gen-image.js --prompt "..." --output "filename.png" [options]
//
// Options:
//   --prompt, -p     Image prompt text (required)
//   --output, -o     Output filename, saved to src/hotd-campaign/images/ (required)
//   --size, -s       Image size: 1024x1024, 1536x1024, 1024x1536 (default: 1024x1024)
//   --quality, -q    Image quality: high, medium, low (default: high)
//   --style-prefix   Prepend the standard dark fantasy style prefix (default: true)
//   --no-style       Skip the style prefix (for fully custom prompts)
//   --dry-run        Print the final prompt without generating

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const STYLE_PREFIX_PORTRAIT = `Dark fantasy character portrait, digital painting style, head and shoulders framing, dramatic directional lighting, rich painterly brushwork, moody atmosphere, medieval fantasy setting, cinematic contrast, muted dark background, semi-realistic, D&D fantasy art.`;

const STYLE_PREFIX_SCENE = `Dark fantasy scene illustration, digital painting style, dramatic directional lighting, rich painterly brushwork, moody atmosphere, medieval fantasy setting, cinematic contrast, semi-realistic, D&D fantasy art.`;

const VALID_SIZES = ['1024x1024', '1536x1024', '1024x1536'];
const VALID_QUALITIES = ['high', 'medium', 'low'];

function parseArgs(argv) {
  const args = {
    prompt: null,
    output: null,
    size: '1024x1024',
    quality: 'high',
    stylePrefix: true,
    styleType: 'portrait',
    dryRun: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--prompt': case '-p':
        args.prompt = argv[++i];
        break;
      case '--output': case '-o':
        args.output = argv[++i];
        break;
      case '--size': case '-s':
        args.size = argv[++i];
        break;
      case '--quality': case '-q':
        args.quality = argv[++i];
        break;
      case '--scene':
        args.styleType = 'scene';
        break;
      case '--no-style':
        args.stylePrefix = false;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      default:
        if (!args.prompt) args.prompt = arg;
        else if (!args.output) args.output = arg;
    }
  }

  return args;
}

function validate(args) {
  if (!args.prompt) {
    console.error('Error: --prompt is required');
    console.error('Usage: node scripts/gen-image.js --prompt "..." --output "filename.png"');
    process.exit(1);
  }
  if (!args.output) {
    console.error('Error: --output is required');
    process.exit(1);
  }
  if (!VALID_SIZES.includes(args.size)) {
    console.error(`Error: --size must be one of: ${VALID_SIZES.join(', ')}`);
    process.exit(1);
  }
  if (!VALID_QUALITIES.includes(args.quality)) {
    console.error(`Error: --quality must be one of: ${VALID_QUALITIES.join(', ')}`);
    process.exit(1);
  }
  // Ensure .png extension
  if (!args.output.endsWith('.png')) {
    args.output += '.png';
  }
}

async function generateImage(args) {
  // Build final prompt
  let finalPrompt = args.prompt;
  if (args.stylePrefix) {
    const prefix = args.styleType === 'scene' ? STYLE_PREFIX_SCENE : STYLE_PREFIX_PORTRAIT;
    finalPrompt = `${prefix}\n\n${args.prompt}`;
  }

  const outputPath = path.join(__dirname, '..', 'src', 'hotd-campaign', 'images', args.output);

  if (args.dryRun) {
    console.log('=== DRY RUN ===');
    console.log(`Output: ${outputPath}`);
    console.log(`Size: ${args.size}`);
    console.log(`Quality: ${args.quality}`);
    console.log(`Style prefix: ${args.stylePrefix ? args.styleType : 'none'}`);
    console.log(`\nFinal prompt:\n${finalPrompt}`);
    return;
  }

  console.log(`Generating image... (this may take 30-60+ seconds)`);
  console.log(`  Output: ${args.output}`);
  console.log(`  Size: ${args.size} | Quality: ${args.quality}`);
  console.log(`  Style: ${args.stylePrefix ? args.styleType : 'custom'}`);

  const client = new OpenAI();
  const result = await client.images.generate({
    model: 'gpt-image-1.5',
    prompt: finalPrompt,
    size: args.size,
    quality: args.quality,
    n: 1,
  });

  const imageData = result.data[0].b64_json;
  const buffer = Buffer.from(imageData, 'base64');
  fs.writeFileSync(outputPath, buffer);

  const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
  console.log(`Image saved: ${outputPath} (${sizeMB} MB)`);
}

const args = parseArgs(process.argv);
validate(args);
generateImage(args).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
