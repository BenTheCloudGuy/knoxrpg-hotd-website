// add-art-gallery.js — Insert NPC portraits and group images into hotd_art table
// Usage: node scripts/add-art-gallery.js [--dry-run]

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  // Load NPCs with portraits
  const npcFile = path.resolve(__dirname, '../src/hotd-campaign/data/npcs.json');
  const npcs = JSON.parse(fs.readFileSync(npcFile, 'utf8'));
  const npcsWithPortrait = npcs.filter(n => n.portrait_url && n.is_hidden === false);

  // Load group images from organizations dir
  const orgDir = path.resolve(__dirname, '../src/hotd-campaign/images/organizations');
  let orgImages = [];
  if (fs.existsSync(orgDir)) {
    orgImages = fs.readdirSync(orgDir)
      .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .map(f => ({
        title: f.replace(/\.(png|jpg|jpeg|webp)$/i, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        image_url: `/images/organizations/${f}`
      }));
  }

  console.log(`Found ${npcsWithPortrait.length} visible NPC portraits`);
  console.log(`Found ${orgImages.length} group/organization images`);
  if (DRY_RUN) console.log('DRY RUN — no database changes\n');

  const client = new Client();
  await client.connect();
  console.log('Connected to database\n');

  // Check existing art entries to avoid duplicates
  const existing = await client.query('SELECT image_url FROM hotd_art');
  const existingUrls = new Set(existing.rows.map(r => r.image_url));
  console.log(`${existingUrls.size} existing art entries in database\n`);

  let inserted = 0;
  let skipped = 0;

  // Insert NPC portraits
  let sortOrder = 1;
  for (const npc of npcsWithPortrait) {
    if (existingUrls.has(npc.portrait_url)) {
      skipped++;
      continue;
    }
    const title = npc.name;
    const desc = `${npc.race} ${npc.npc_class} — ${npc.location}`;
    const category = 'NPC Portraits';

    if (DRY_RUN) {
      console.log(`  [dry-run] Would insert: "${title}" (${npc.portrait_url})`);
    } else {
      try {
        await client.query(
          'INSERT INTO hotd_art (title, image_url, description, category, sort_order) VALUES ($1, $2, $3, $4, $5)',
          [title, npc.portrait_url, desc, category, sortOrder]
        );
        console.log(`  + ${title}`);
      } catch (err) {
        console.error(`  x ${title}: ${err.message}`);
      }
    }
    inserted++;
    sortOrder++;
  }

  // Insert group images
  for (const org of orgImages) {
    if (existingUrls.has(org.image_url)) {
      skipped++;
      continue;
    }
    const category = 'Groups & Organizations';

    if (DRY_RUN) {
      console.log(`  [dry-run] Would insert: "${org.title}" (${org.image_url})`);
    } else {
      try {
        await client.query(
          'INSERT INTO hotd_art (title, image_url, description, category, sort_order) VALUES ($1, $2, $3, $4, $5)',
          [org.title, org.image_url, '', category, sortOrder]
        );
        console.log(`  + ${org.title}`);
      } catch (err) {
        console.error(`  x ${org.title}: ${err.message}`);
      }
    }
    inserted++;
    sortOrder++;
  }

  console.log(`\nDone: inserted ${inserted}, skipped ${skipped} (already existed)`);

  await client.end();
}

main().catch(err => { console.error(err); process.exit(1); });
