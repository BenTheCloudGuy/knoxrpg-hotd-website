// expand-realms.js — Expand realm markdown files with additional FR lore via OpenAI
// Usage: node scripts/expand-realms.js [realm-name]
// If realm-name provided, only that realm is processed. Otherwise all are processed.

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const REALMS_DIR = path.join(__dirname, '..', 'src', 'hotd-campaign', 'data', 'realms');
const FRHOF_JSON = path.join(__dirname, '..', 'tmp', 'frhof-raw', 'realms-parsed.json');

// Map realm filenames to FRHoF JSON keys
const FRHOF_KEY_MAP = {
  'aglarond': 'Aglarond',
  'amn': 'Amn',
  'anauroch': 'Anauroch',
  'calimshan': 'Calimshan',
  'chessenta': 'Chessenta',
  'chondath': 'Chondath',
  'chult': 'Chult',
  'cormyr': 'Cormyr',
  'damara': 'Damara',
  'elturgard': 'Elturgard',
  'evermeet': 'Evermeet',
  'great-dale': 'GreatDale',
  'icewind-dale': 'IcewindDale',
  'impiltur': 'Impiltur',
  'independent-city-states': 'IndependentCityStates',
  'kingdom-of-many-arrows': 'KingdomofManyArrows',
  'lake-of-steam': 'LakeofSteam',
  'lantan': 'Lantan',
  'lords-alliance': 'TheNorthLordsAlliance',
  'luskan': 'Luskan',
  'mintarn': 'Mintarn',
  'mulhorand': 'Mulhorand',
  'najara': 'Najara',
  'narfell': 'Narfell',
  'northern-dwarfholds': 'NorthernDwarfholds',
  'rashemen': 'Rashemen',
  'savage-frontier': 'SavageFrontier',
  'sembia': 'Sembia',
  'sespech': 'Sespech',
  'shining-plains': 'ShiningPlains',
  'sossal': 'Sossal',
  'sword-coast': 'SwordCoastLordsAlliance',
  'tethyr': 'Tethyr',
  'thay': 'Thay',
  'the-dalelands': null,  // extracted from HTML directly, already in file
  'the-moonsea': null,
  'the-moonshae-isles': 'MoonshaeIsles',
  'the-shaar': 'TheShaar',
  'the-vast': 'TheVast',
  'thesk': 'Thesk',
  'turmish': 'Turmish',
  'unther': 'Unther',
  'vaasa': null,  // campaign-specific content, skip FRHoF
};

// Skip these - already expanded or campaign-specific
const SKIP_REALMS = ['barovia', 'menzoberranzan', 'vaasa'];

const SYSTEM_PROMPT = `You are expanding a Forgotten Realms encyclopedia entry for a D&D campaign website. You will receive:
1. The current markdown content of the realm page
2. The FRHoF (Forgotten Realms Heroes of Faerun) source text for this realm (if available)

Your job is to EXPAND the existing content with significantly more detail about the realm, drawing on established Forgotten Realms lore. Keep the FRHoF content as the foundation and add to it.

RULES:
- Keep ALL existing image references (![...](...)) exactly as they are, in the same positions
- Keep the existing # Title, map image, and > At a Glance blockquote EXACTLY as they are (do not modify these lines)
- If a ## DM Notes section exists in the current file, keep it EXACTLY as-is at the end. Do NOT add a ## DM Notes section if one does not exist
- Do NOT use em-dashes (—). Use commas, periods, or semicolons instead
- Do NOT write flowery or overly dramatic prose. Keep it direct and grounded
- Do NOT add any new image references
- Use ## for major sections and ### for subsections
- Target 60-90 lines total for the file
- The campaign is set in 1496 DR
- Only reference locations, organizations, and NPCs that are canonical to the Forgotten Realms. Do NOT invent tavern names, NPC names, or locations that don't appear in published FR sourcebooks. If you don't have enough canonical locations to fill 5+ entries, use fewer entries but make them more detailed. It is better to have 3 well-sourced locations than 8 made-up ones
- Use "Faerun" not "Faerûn"

STRUCTURE to follow:
1. Keep the existing header (title, map image, At a Glance blockquote) unchanged
2. Expand the intro paragraphs with more context about government, geography, culture, and history
3. If there's an art image after the intro, keep it in place
4. Add a ## Notable Locations section (if not present) with 5-10 ### entries, each 2-4 sentences
5. For locations already present, expand them if they're too brief
6. Add sections for key organizations, culture, or politics if relevant
7. If a ## DM Notes section exists, keep it unchanged at the end. Do NOT add one if it doesn't exist

For Notable Locations:
- Include major cities, landmarks, dungeons, and geographical features
- Each location should explain what it is, who controls it, and what makes it notable
- ONLY use canonical FR locations from published D&D sourcebooks (SCAG, FR Campaign Setting, published adventures)
- Focus on information useful to a DM running a campaign

For files that already have Notable Locations:
- Keep all existing locations but expand their descriptions if they are less than 2 sentences
- Add 2-4 more canonical locations that are missing
- Add more cultural, political, or historical context in the intro section

Do NOT include a trailing newline after the last line of content.
Output ONLY the complete markdown file content, nothing else.`;

async function expandRealm(client, realmName, currentContent, frhofText) {
  const userMessage = `## Current File: ${realmName}.md

${currentContent}

${frhofText ? `## FRHoF Source Text\n\n${frhofText}` : '(No FRHoF source available for this realm)'}`;

  console.log(`  Calling OpenAI for ${realmName}...`);
  const t0 = Date.now();

  const response = await client.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.4,
    max_tokens: 4000,
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const result = response.choices[0].message.content.trim();
  console.log(`  Done (${elapsed}s, ${result.split('\n').length} lines)`);
  return result;
}

async function main() {
  const targetRealm = process.argv[2] || null;

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const frhofData = JSON.parse(fs.readFileSync(FRHOF_JSON, 'utf8'));

  // Get list of realm files
  const files = fs.readdirSync(REALMS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace('.md', ''))
    .filter(f => !SKIP_REALMS.includes(f))
    .filter(f => !targetRealm || f === targetRealm)
    .sort();

  if (targetRealm && files.length === 0) {
    console.error(`Realm "${targetRealm}" not found or is in skip list`);
    process.exit(1);
  }

  console.log(`\nExpanding ${files.length} realm files...\n`);

  for (const realm of files) {
    const filePath = path.join(REALMS_DIR, `${realm}.md`);
    const currentContent = fs.readFileSync(filePath, 'utf8');
    const currentLines = currentContent.split('\n').length;

    // Get FRHoF source text
    const frhofKey = FRHOF_KEY_MAP[realm];
    let frhofText = '';
    if (frhofKey && frhofData[frhofKey]) {
      const entry = frhofData[frhofKey];
      frhofText = typeof entry === 'string' ? entry : (entry.text || '');
    }

    console.log(`[${realm}] ${currentLines} lines, FRHoF: ${frhofText.length} chars`);

    try {
      const expanded = await expandRealm(client, realm, currentContent, frhofText);
      const expandedLines = expanded.split('\n').length;

      // Validate: must still contain the title and map image
      const titleMatch = currentContent.match(/^# .+/m);
      if (titleMatch && !expanded.includes(titleMatch[0])) {
        console.error(`  ERROR: Expanded content missing title "${titleMatch[0]}", skipping`);
        continue;
      }

      // Validate: must contain all existing image references
      const imgRefs = [...currentContent.matchAll(/!\[.*?\]\(.*?\)/g)].map(m => m[0]);
      const missingImgs = imgRefs.filter(ref => !expanded.includes(ref));
      if (missingImgs.length > 0) {
        console.error(`  ERROR: Missing ${missingImgs.length} image refs, skipping:`);
        missingImgs.forEach(img => console.error(`    ${img}`));
        continue;
      }

      // Validate: if DM Notes existed, must still be present
      if (currentContent.includes('## DM Notes') && !expanded.includes('## DM Notes')) {
        console.error(`  ERROR: DM Notes section removed, skipping`);
        continue;
      }

      fs.writeFileSync(filePath, expanded + '\n');
      console.log(`  Written: ${currentLines} → ${expandedLines} lines\n`);
    } catch (err) {
      console.error(`  ERROR: ${err.message}\n`);
    }
  }

  console.log('Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
