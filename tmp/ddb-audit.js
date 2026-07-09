#!/usr/bin/env node
// Temp: enumerate DDB-owned sources via entitlement-respecting content services,
// map sourceId -> book code via config/json, and dump JSON for the audit report.
const fs = require('fs');
const path = require('path');

const COBALT = process.env.DDB_COBALT_TOKEN;
if (!COBALT) { console.error('Set DDB_COBALT_TOKEN'); process.exit(1); }

async function bearer() {
  const r = await fetch('https://auth-service.dndbeyond.com/v1/cobalt-token', {
    method: 'POST', headers: { Cookie: `CobaltSession=${COBALT}` },
  });
  if (!r.ok) throw new Error(`cobalt ${r.status}`);
  return (await r.json()).token;
}

async function main() {
  let token = await bearer();
  let H = () => ({ Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' });

  // 1. config/json -> source catalog
  const cfg = await (await fetch('https://www.dndbeyond.com/api/config/json', { headers: H() })).json();
  const srcMap = new Map();       // id -> {code,title,catId}
  const catMap = new Map();       // catId -> name
  for (const c of (cfg.sourceCategories || [])) catMap.set(c.id, c.name);
  for (const s of (cfg.sources || [])) {
    srcMap.set(s.id, { code: (s.name || '').toLowerCase(), title: s.description || s.name, catId: s.sourceCategoryId });
  }
  console.log(`Catalog: ${srcMap.size} sources, ${catMap.size} categories`);

  // 2. page monster-service, collect per-source counts
  const monSrc = new Map();  // sourceId -> count of monsters
  let skip = 0, take = 100, total = Infinity, page = 0;
  while (skip < total) {
    const url = `https://monster-service.dndbeyond.com/v1/Monster?skip=${skip}&take=${take}`;
    let resp = await fetch(url, { headers: H() });
    if (resp.status === 401) { token = await bearer(); resp = await fetch(url, { headers: H() }); }
    if (!resp.ok) { console.error(`monster page ${page} -> ${resp.status}`); break; }
    const j = await resp.json();
    total = j.pagination?.total ?? total;
    for (const m of (j.data || [])) {
      for (const s of (m.sources || [])) {
        monSrc.set(s.sourceId, (monSrc.get(s.sourceId) || 0) + 1);
      }
    }
    skip += take; page++;
    if (page % 10 === 0) console.log(`  monsters paged ${Math.min(skip, total)}/${total}`);
    if (page > 80) break; // safety
  }
  console.log(`Monsters total(entitled): ${total}, distinct owned sources w/ monsters: ${monSrc.size}`);

  // 3. build owned-source report
  const owned = [];
  for (const [id, count] of monSrc.entries()) {
    const meta = srcMap.get(id) || { code: `id${id}`, title: `Unknown (${id})`, catId: null };
    owned.push({ id, code: meta.code, title: meta.title, category: catMap.get(meta.catId) || '?', monsters: count });
  }
  owned.sort((a, b) => (a.category + a.title).localeCompare(b.category + b.title));

  const out = {
    generatedAt: new Date().toISOString(),
    monstersEntitledTotal: total,
    catalogSourceCount: srcMap.size,
    ownedSourcesWithMonsters: owned,
    fullCatalog: [...srcMap.entries()].map(([id, m]) => ({ id, code: m.code, title: m.title, category: catMap.get(m.catId) || '?' })),
  };
  fs.writeFileSync(path.join(__dirname, 'ddb-audit.json'), JSON.stringify(out, null, 2));
  console.log(`\nWrote tmp/ddb-audit.json`);
  console.log('\nOwned sources (with monsters):');
  for (const o of owned) console.log(`  [${o.category}] ${o.code.padEnd(12)} ${o.monsters.toString().padStart(4)}  ${o.title}`);
}

main().catch(e => { console.error(e); process.exit(1); });
