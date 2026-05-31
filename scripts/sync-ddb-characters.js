#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
// D&D Beyond Character Sync — CLI wrapper around the shared
// `src/lib/ddb-sync.js` lib. The same lib also powers the in-app
// `Sync from DDB` button in the GM Player Workspace, so the two
// code paths can never drift apart.
//
// Use this script for batch ops (cron, CI, manual recovery).
// Flags: --reindex   (run embed-pipeline --source character after sync)
//        --id <id>   (only sync the given DDB character id)
// ══════════════════════════════════════════════════════════════

const path = require("path");
const childProc = require("child_process");
const { pgPool } = require(path.join(__dirname, "..", "src", "db", "pool"));
const { syncCharacterFromDDB } = require(path.join(__dirname, "..", "src", "lib", "ddb-sync"));

function parseFlags(argv) {
  const out = { reindex: false, onlyId: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--reindex") out.reindex = true;
    if (argv[i] === "--id" && argv[i + 1]) { out.onlyId = parseInt(argv[++i], 10); }
  }
  return out;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  console.log("=== D&D Beyond Character Sync ===\n");

  let q = "SELECT id, ddb_character_id, character_name, player_name FROM hotd_player_characters WHERE ddb_character_id IS NOT NULL";
  const params = [];
  if (flags.onlyId != null) {
    q += " AND ddb_character_id = $1";
    params.push(flags.onlyId);
  }
  q += " ORDER BY character_name";
  const { rows } = await pgPool.query(q, params);
  console.log(`Found ${rows.length} character(s) with a DDB id.\n`);

  let okCount = 0;
  let failCount = 0;
  for (const row of rows) {
    process.stdout.write(`Syncing ${row.character_name} (DDB ${row.ddb_character_id})... `);
    try {
      const r = await syncCharacterFromDDB(row.ddb_character_id, row.id);
      okCount++;
      console.log("OK");
      console.log(`  ${r.message}`);
    } catch (err) {
      failCount++;
      console.log("FAIL");
      console.error(`  ${err.message}`);
    }
  }

  console.log(`\n=== ${okCount} synced, ${failCount} failed ===`);

  if (flags.reindex && okCount > 0) {
    console.log("\nRunning embed-pipeline --source character --mode incremental...");
    const result = childProc.spawnSync(
      "node",
      [path.join(__dirname, "embed-pipeline.js"), "--source", "character", "--mode", "incremental"],
      { stdio: "inherit", timeout: 5 * 60 * 1000 }
    );
    if (result.status !== 0) console.error(`embed-pipeline exited ${result.status}`);
  }

  await pgPool.end();
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
