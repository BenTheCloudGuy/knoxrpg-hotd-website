#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
// ── STAT BLOCK SYNC ──────────────────────────────────────────
// Parses homebrew stat block markdown files from
//   src/hotd-campaign/data/statBlocks/*.md
// and upserts them into the monsters table alongside DDB monsters.
//
// Usage:
//   node scripts/sync-statblocks.js [--verbose] [--dry-run]
//
// Env: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
// ══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const VERBOSE = process.argv.includes('--verbose');
const DRY_RUN = process.argv.includes('--dry-run');
const SOURCE = 'hotd-homebrew';

const STATBLOCK_DIR = path.resolve(__dirname, '..', 'src', 'hotd-campaign', 'data', 'statBlocks');

const pgPool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: false,
  max: 3,
});

function log(msg) { console.log(`  ${msg}`); }

// ── Parse a single creature block (from ## header to next ## or EOF) ──
function parseCreatureBlock(block, fileName) {
  const creature = {
    name: '',
    size: '',
    type: '',
    alignment: '',
    armor_class: null,
    armor_class_type: '',
    hit_points: '',
    average_hit_points: null,
    hit_dice: '',
    speed: [],
    ability_scores: {},
    saving_throws: [],
    skills: [],
    damage_resistances: [],
    damage_immunities: [],
    damage_vulnerabilities: [],
    condition_immunities: [],
    senses: [],
    passive_perception: null,
    languages: [],
    challenge_rating: null,
    challenge_rating_display: '',
    xp: null,
    proficiency_bonus: null,
    description_text: block,
    is_legendary: false,
    has_lair: false,
    avatar_url: '',
    source_file: fileName,
  };

  // Name from ## or # header
  const nameMatch = block.match(/^#{1,2} (.+)/m);
  if (nameMatch) {
    // Clean subtitle after em-dash
    creature.name = nameMatch[1].split(/\s*[—–]\s*/)[0].trim();
  }

  // Image URL
  const imgMatch = block.match(/<img\s+src="([^"]+)"/);
  if (imgMatch) {
    let imgPath = imgMatch[1];
    // Convert relative path to web path
    if (imgPath.startsWith('../../images/')) {
      imgPath = '/images/' + imgPath.replace('../../images/', '');
    }
    creature.avatar_url = imgPath;
  }

  // Size/type/alignment from italic line: *Medium Humanoid (Human), Lawful Neutral*
  const typeMatch = block.match(/\*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(.+?)(?:,\s*(.+?))?\*/);
  if (typeMatch) {
    creature.size = typeMatch[1].split(' ')[0];
    creature.type = typeMatch[2].replace(/[()]/g, '').trim();
    creature.alignment = (typeMatch[3] || '').trim();
  }

  // AC
  const acMatch = block.match(/\*\*Armor Class\*\*\s+(\d+)\s*(?:\(([^)]+)\))?/);
  if (acMatch) {
    creature.armor_class = parseInt(acMatch[1]);
    creature.armor_class_type = acMatch[2] || '';
  }

  // HP
  const hpMatch = block.match(/\*\*Hit Points\*\*\s+(\d+)\s*(?:\(([^)]+)\))?/);
  if (hpMatch) {
    creature.average_hit_points = parseInt(hpMatch[1]);
    creature.hit_points = `${hpMatch[1]}${hpMatch[2] ? ' (' + hpMatch[2] + ')' : ''}`;
    creature.hit_dice = hpMatch[2] || '';
  }

  // Speed
  const speedMatch = block.match(/\*\*Speed\*\*\s+(.+)/);
  if (speedMatch) {
    const speedStr = speedMatch[1].trim();
    const speeds = [];
    const parts = speedStr.split(',').map(s => s.trim());
    for (const part of parts) {
      const m = part.match(/(?:(\w+)\s+)?(\d+)\s*ft/);
      if (m) {
        speeds.push({ type: m[1] || 'Walk', speed: parseInt(m[2]) });
      }
    }
    creature.speed = speeds;
  }

  // Ability scores from table row: | 10 (+0) | 14 (+2) | ...
  const scoreMatch = block.match(/\|\s*(\d+)\s*\([+-]\d+\)\s*\|\s*(\d+)\s*\([+-]\d+\)\s*\|\s*(\d+)\s*\([+-]\d+\)\s*\|\s*(\d+)\s*\([+-]\d+\)\s*\|\s*(\d+)\s*\([+-]\d+\)\s*\|\s*(\d+)\s*\([+-]\d+\)\s*\|/);
  if (scoreMatch) {
    creature.ability_scores = {
      STR: parseInt(scoreMatch[1]),
      DEX: parseInt(scoreMatch[2]),
      CON: parseInt(scoreMatch[3]),
      INT: parseInt(scoreMatch[4]),
      WIS: parseInt(scoreMatch[5]),
      CHA: parseInt(scoreMatch[6]),
    };
  }

  // Saving Throws
  const stMatch = block.match(/\*\*Saving Throws\*\*\s+(.+)/);
  if (stMatch) creature.saving_throws = stMatch[1].split(',').map(s => s.trim());

  // Skills
  const skillMatch = block.match(/\*\*Skills\*\*\s+(.+)/);
  if (skillMatch) {
    creature.skills = skillMatch[1].split(',').map(s => {
      const m = s.trim().match(/(\w[\w\s]*)\s+([+-]\d+)/);
      return m ? { name: m[1].trim(), bonus: parseInt(m[2]) } : null;
    }).filter(Boolean);
  }

  // Damage Resistances
  const drMatch = block.match(/\*\*Damage Resistances\*\*\s+(.+)/);
  if (drMatch) creature.damage_resistances = drMatch[1].split(',').map(s => s.trim());

  // Damage Immunities
  const diMatch = block.match(/\*\*Damage Immunities\*\*\s+(.+)/);
  if (diMatch) creature.damage_immunities = diMatch[1].split(/,|;/).map(s => s.trim());

  // Condition Immunities
  const ciMatch = block.match(/\*\*Condition Immunities\*\*\s+(.+)/);
  if (ciMatch) creature.condition_immunities = ciMatch[1].split(',').map(s => s.trim());

  // Senses + Passive Perception
  const senseMatch = block.match(/\*\*Senses\*\*\s+(.+)/);
  if (senseMatch) {
    const senseStr = senseMatch[1];
    const ppMatch = senseStr.match(/Passive Perception\s+(\d+)/);
    if (ppMatch) creature.passive_perception = parseInt(ppMatch[1]);
    creature.senses = senseStr.replace(/,?\s*Passive Perception\s+\d+/, '').split(',').map(s => s.trim()).filter(Boolean);
  }

  // Languages
  const langMatch = block.match(/\*\*Languages\*\*\s+(.+)/);
  if (langMatch) {
    const val = langMatch[1].trim();
    creature.languages = val.toLowerCase() === 'none' ? [] : val.split(',').map(s => s.trim());
  }

  // Challenge + XP + Proficiency
  const crMatch = block.match(/\*\*Challenge\*\*\s+([^\s(]+)\s*(?:\(([0-9,]+)\s*XP\))?/);
  if (crMatch) {
    creature.challenge_rating_display = crMatch[1];
    creature.challenge_rating = crMatch[1].includes('/') ? eval(crMatch[1]) : parseFloat(crMatch[1]);
    creature.xp = crMatch[2] ? parseInt(crMatch[2].replace(',', '')) : null;
  }
  const profMatch = block.match(/\*\*Proficiency Bonus\*\*\s+\+?(\d+)/);
  if (profMatch) creature.proficiency_bonus = parseInt(profMatch[1]);

  // Legendary check
  creature.is_legendary = /legendary/i.test(block);

  return creature;
}

// ── Split a file into individual creature blocks ──
function splitCreatureBlocks(content, fileName) {
  const blocks = [];

  // Skip ally files — those are NPCs, not monsters
  if (fileName.startsWith('ally-')) return blocks;

  // Try splitting on ## headers first (multi-creature files like stitches.md)
  const h2Parts = content.split(/(?=^## [^#])/m);
  // Only count H2 blocks that have their own AC/HP as separate creatures
  const h2Creatures = h2Parts.filter(p => {
    const t = p.trim();
    return t.startsWith('## ') && (/\*\*Armor Class\*\*/.test(t) || /\*\*Hit Points\*\*/.test(t));
  });

  if (h2Creatures.length > 0) {
    // Multi-creature file: each ## block with stats is a creature
    for (const part of h2Creatures) {
      const trimmed = part.trim();
      const header = trimmed.match(/^## (.+)/m)?.[1] || '';
      if (/DM (?:Notes|Reference|Guide)/i.test(header)) continue;
      if (/Swarm Tactics/i.test(header)) continue;
      if (!/\*\*Armor Class\*\*/.test(trimmed) && !/\*\*Hit Points\*\*/.test(trimmed)) continue;
      blocks.push({ header, content: trimmed, fileName });
    }
  } else {
    // Single-creature file with # header (e.g., vasilka.md)
    const trimmed = content.trim();
    if (/\*\*Armor Class\*\*/.test(trimmed) || /\*\*Hit Points\*\*/.test(trimmed)) {
      const header = trimmed.match(/^# (.+)/m)?.[1] || fileName.replace('.md', '');
      // Clean up the header (remove subtitle after em-dash)
      const cleanName = header.split(/\s*[—–-]\s*/)[0].trim();
      blocks.push({ header: cleanName, content: trimmed, fileName });
    }
  }

  return blocks;
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  STAT BLOCK SYNC${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  // Verify DB connection
  await pgPool.query('SELECT 1');
  log('Database connected.');

  // Find all stat block files
  if (!fs.existsSync(STATBLOCK_DIR)) {
    log(`No statBlocks directory found at ${STATBLOCK_DIR}`);
    process.exit(0);
  }

  const mdFiles = fs.readdirSync(STATBLOCK_DIR).filter(f => f.endsWith('.md'));
  log(`Found ${mdFiles.length} stat block files`);

  // Parse all creatures
  const creatures = [];
  for (const file of mdFiles) {
    const content = fs.readFileSync(path.join(STATBLOCK_DIR, file), 'utf-8');
    const blocks = splitCreatureBlocks(content, file);
    for (const block of blocks) {
      const creature = parseCreatureBlock(block.content, file);
      if (creature.name) creatures.push(creature);
    }
  }

  log(`Parsed ${creatures.length} creature stat blocks`);
  if (VERBOSE) {
    for (const c of creatures) {
      log(`  ${c.name} — CR ${c.challenge_rating_display || '?'}, AC ${c.armor_class || '?'}, HP ${c.average_hit_points || '?'}`);
    }
  }

  if (DRY_RUN) {
    log('\nDRY RUN — no database changes made.');
    await pgPool.end();
    return;
  }

  // Upsert into monsters table
  let upserted = 0;
  for (const c of creatures) {
    const slug = `hotd-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`;
    const id = `hotd-${slug}`;

    try {
      await pgPool.query(`
        INSERT INTO monsters (
          id, name, slug, source, source_id, source_page,
          size, type, sub_types, alignment,
          challenge_rating, challenge_rating_display, xp, proficiency_bonus,
          armor_class, armor_class_type, hit_points, average_hit_points, hit_dice,
          initiative_bonus, ability_scores, speed,
          skills, saving_throws, senses, passive_perception,
          damage_resistances, damage_immunities, damage_vulnerabilities, condition_immunities,
          languages, environments, description_text,
          is_legendary, has_lair, raw_json, avatar_url
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17, $18, $19,
          $20, $21, $22,
          $23, $24, $25, $26,
          $27, $28, $29, $30,
          $31, $32, $33,
          $34, $35, $36, $37
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          size = EXCLUDED.size,
          type = EXCLUDED.type,
          alignment = EXCLUDED.alignment,
          challenge_rating = EXCLUDED.challenge_rating,
          challenge_rating_display = EXCLUDED.challenge_rating_display,
          xp = EXCLUDED.xp,
          proficiency_bonus = EXCLUDED.proficiency_bonus,
          armor_class = EXCLUDED.armor_class,
          armor_class_type = EXCLUDED.armor_class_type,
          hit_points = EXCLUDED.hit_points,
          average_hit_points = EXCLUDED.average_hit_points,
          hit_dice = EXCLUDED.hit_dice,
          ability_scores = EXCLUDED.ability_scores,
          speed = EXCLUDED.speed,
          skills = EXCLUDED.skills,
          saving_throws = EXCLUDED.saving_throws,
          senses = EXCLUDED.senses,
          passive_perception = EXCLUDED.passive_perception,
          damage_resistances = EXCLUDED.damage_resistances,
          damage_immunities = EXCLUDED.damage_immunities,
          condition_immunities = EXCLUDED.condition_immunities,
          languages = EXCLUDED.languages,
          description_text = EXCLUDED.description_text,
          is_legendary = EXCLUDED.is_legendary,
          avatar_url = EXCLUDED.avatar_url,
          raw_json = EXCLUDED.raw_json
      `, [
        id, c.name, slug, SOURCE, c.source_file, 0,
        c.size, c.type, [], c.alignment,
        c.challenge_rating, c.challenge_rating_display, c.xp, c.proficiency_bonus,
        c.armor_class, c.armor_class_type, c.hit_points, c.average_hit_points, c.hit_dice,
        null, JSON.stringify(c.ability_scores), JSON.stringify(c.speed),
        JSON.stringify(c.skills), c.saving_throws, c.senses.map(s => s.trim()), c.passive_perception,
        c.damage_resistances, c.damage_immunities, c.damage_vulnerabilities, c.condition_immunities,
        c.languages, [], c.description_text,
        c.is_legendary, c.has_lair, JSON.stringify({ source: SOURCE, file: c.source_file }), c.avatar_url,
      ]);
      upserted++;
      if (VERBOSE) log(`  Upserted: ${c.name}`);
    } catch (err) {
      log(`  ERROR upserting ${c.name}: ${err.message}`);
    }
  }

  // Count totals
  const { rows: [totals] } = await pgPool.query(
    "SELECT count(*) as total, count(*) FILTER (WHERE source = $1) as homebrew FROM monsters", [SOURCE]
  );

  log(`\nUpserted: ${upserted}/${creatures.length}`);
  log(`Total monsters: ${totals.total} (${totals.homebrew} homebrew)`);

  await pgPool.end();
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
