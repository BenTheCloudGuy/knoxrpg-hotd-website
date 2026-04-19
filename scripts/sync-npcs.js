#!/usr/bin/env node
// sync-npcs.js — Upsert npcs.json into hotd_npcs table (keyed on npcid)
// Usage: node scripts/sync-npcs.js [--dry-run]
//
// Env: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');

const NPC_FILE = path.resolve(__dirname, '../src/hotd-campaign/data/npcs.json');

const COLUMNS = [
  'npcid', 'name', 'race', 'npc_class', 'location', 'status',
  'alignment_tag', 'portrait_url', 'description', 'dm_notes',
  'associations', 'sort_order', 'is_hidden'
];

async function main() {
  const raw = fs.readFileSync(NPC_FILE, 'utf8');
  const npcs = JSON.parse(raw);

  if (!Array.isArray(npcs) || npcs.length === 0) {
    console.error('ERROR: npcs.json is empty or not an array');
    process.exit(1);
  }

  // Validate every NPC has a npcid
  const missing = npcs.filter(n => n.npcid == null);
  if (missing.length > 0) {
    console.error('ERROR: NPCs missing npcid:', missing.map(n => n.name).join(', '));
    process.exit(1);
  }

  // Check for duplicate npcids
  const ids = npcs.map(n => n.npcid);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) {
    console.error('ERROR: Duplicate npcids:', [...new Set(dupes)].join(', '));
    process.exit(1);
  }

  console.log(`Loaded ${npcs.length} NPCs from npcs.json`);
  if (DRY_RUN) console.log('DRY RUN — no database changes will be made\n');

  const client = new Client();
  await client.connect();
  console.log('Connected to database\n');

  let upserted = 0;
  let unchanged = 0;
  let errors = 0;

  for (const npc of npcs) {
    const values = [
      npc.npcid,
      npc.name || '',
      npc.race || '',
      npc.npc_class || '',
      npc.location || '',
      npc.status || 'Unknown',
      npc.alignment_tag || 'neutral',
      npc.portrait_url || '',
      npc.description || '',
      npc.dm_notes || '',
      JSON.stringify(npc.associations || []),
      npc.sort_order || 0,
      npc.is_hidden != null ? npc.is_hidden : true
    ];

    if (DRY_RUN) {
      console.log(`  [dry-run] Would upsert npcid=${npc.npcid} "${npc.name}"`);
      upserted++;
      continue;
    }

    try {
      const result = await client.query(`
        INSERT INTO hotd_npcs (npcid, name, race, npc_class, location, status,
          alignment_tag, portrait_url, description, dm_notes,
          associations, sort_order, is_hidden)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (npcid) DO UPDATE SET
          name = EXCLUDED.name,
          race = EXCLUDED.race,
          npc_class = EXCLUDED.npc_class,
          location = EXCLUDED.location,
          status = EXCLUDED.status,
          alignment_tag = EXCLUDED.alignment_tag,
          portrait_url = EXCLUDED.portrait_url,
          description = EXCLUDED.description,
          dm_notes = EXCLUDED.dm_notes,
          associations = EXCLUDED.associations,
          sort_order = EXCLUDED.sort_order,
          is_hidden = EXCLUDED.is_hidden
      `, values);

      upserted++;
      console.log(`  ✓ npcid=${npc.npcid} "${npc.name}"`);
    } catch (err) {
      errors++;
      console.error(`  ✗ npcid=${npc.npcid} "${npc.name}": ${err.message}`);
    }
  }

  // Remove NPCs from DB that are no longer in npcs.json
  if (!DRY_RUN) {
    const npcIds = npcs.map(n => n.npcid);
    const orphans = await client.query(
      'DELETE FROM hotd_npcs WHERE npcid IS NOT NULL AND npcid != ALL($1::int[]) RETURNING npcid, name',
      [npcIds]
    );
    if (orphans.rowCount > 0) {
      console.log(`\nRemoved ${orphans.rowCount} orphaned NPCs:`);
      orphans.rows.forEach(r => console.log(`  - npcid=${r.npcid} "${r.name}"`));
    }
  }

  await client.end();

  console.log(`\nDone: ${upserted} upserted, ${errors} errors`);
  if (errors > 0) process.exit(1);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
