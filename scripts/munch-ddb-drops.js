#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
// ── D&D BEYOND DROPS MUNCH ────────────────────────────────────
// Pulls D&D Beyond Drops subscriber content (monsters, magic items,
// feats) from the entitlement-respecting DDB services and upserts it
// into the local content tables so the RAG embed pipeline can pick it
// up. DDB Drops is a rolling monthly feed, so this is meant to run on
// a schedule (re-run picks up new drops via ON CONFLICT upserts).
//
// After a successful run, embed the new rows with:
//   node scripts/embed-ddb-content.js --phase 2 --mode incremental
//
// Usage:
//   node scripts/munch-ddb-drops.js [--sources 272,283]
//                                   [--only monsters,items,feats]
//                                   [--dry-run] [--verbose]
//
// Env:
//   DDB_COBALT_TOKEN   (Cobalt session token for DDB auth)
//   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
//
// Default source IDs: 272 = D&D Beyond Drops (ddbd),
//                     283 = Para-elemental Sticker Pack (ddbdsp)
// ══════════════════════════════════════════════════════════════

const { Pool } = require('pg');

// ── CLI args ──────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
}
const SOURCE_IDS = getArg('sources', '272,283')
  .split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);
const ONLY = getArg('only', 'monsters,items,feats')
  .split(',').map(s => s.trim().toLowerCase());
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

const COBALT = process.env.DDB_COBALT_TOKEN;
if (!COBALT) { console.error('ERROR: set DDB_COBALT_TOKEN'); process.exit(1); }

// ── Endpoints ─────────────────────────────────────────────────
const COBALT_URL = 'https://auth-service.dndbeyond.com/v1/cobalt-token';
const CONFIG_URL = 'https://www.dndbeyond.com/api/config/json';
const MONSTER_URL = 'https://monster-service.dndbeyond.com/v1/Monster';
const ITEMS_URL = 'https://character-service.dndbeyond.com/character/v5/game-data/items';
const FEATS_URL = 'https://character-service.dndbeyond.com/character/v5/game-data/feats';
const UA = 'Mozilla/5.0';

// ── Database ──────────────────────────────────────────────────
const pgPool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: false,
  max: 3,
});

// ── Helpers ───────────────────────────────────────────────────
function log(msg) { console.log(`  ${msg}`); }
function heading(s) { console.log(`\n${'═'.repeat(60)}\n  ${s}\n${'═'.repeat(60)}`); }
function vlog(msg) { if (VERBOSE) console.log(`    ${msg}`); }

function stripHtml(html) {
  return (html || '')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&rsquo;/g, '\u2019').replace(/&[a-z]+;/g, '')
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeEntities(text) {
  return (text || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&rsquo;/g, '\u2019').replace(/&nbsp;/g, ' ');
}

function slugify(name) {
  return String(name).toLowerCase()
    .replace(/[\u2018\u2019']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function crDisplay(value) {
  if (value === 0.125) return '1/8';
  if (value === 0.25) return '1/4';
  if (value === 0.5) return '1/2';
  return String(value);
}

function abilityMod(score) {
  const m = Math.floor((score - 10) / 2);
  return (m >= 0 ? '+' : '') + m;
}

let _bearer = null;
let _bearerAt = 0;
async function getBearer(force) {
  // Cobalt bearer TTL ~300s; refresh proactively.
  if (!force && _bearer && (Date.now() - _bearerAt) < 240_000) return _bearer;
  const r = await fetch(COBALT_URL, { method: 'POST', headers: { Cookie: `CobaltSession=${COBALT}` } });
  if (!r.ok) throw new Error(`cobalt exchange failed (${r.status})`);
  const b = await r.json();
  if (!b.token) throw new Error('no bearer token returned');
  _bearer = b.token; _bearerAt = Date.now();
  vlog(`bearer refreshed (ttl ${b.ttl}s)`);
  return _bearer;
}

async function apiGet(url) {
  let token = await getBearer();
  let resp = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': UA } });
  if (resp.status === 401) {
    token = await getBearer(true);
    resp = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': UA } });
  }
  if (!resp.ok) throw new Error(`GET ${url} -> ${resp.status}`);
  return resp.json();
}

// ── Config lookup maps ────────────────────────────────────────
async function loadConfig() {
  const cfg = await apiGet(CONFIG_URL);
  const byId = (arr, val) => new Map((arr || []).map(x => [x.id, val ? val(x) : x]));
  return {
    sources: new Map((cfg.sources || []).map(s => [s.id, { code: (s.name || '').toLowerCase(), title: decodeEntities(s.description || s.name) }])),
    cr: byId(cfg.challengeRatings),
    size: byId(cfg.creatureSizes, x => x.name),
    type: byId(cfg.monsterTypes, x => x.name),
    align: byId(cfg.alignments, x => x.name),
    stat: byId(cfg.stats, x => x.key),
    move: byId(cfg.movements, x => x.name),
  };
}

function sourceInfo(maps, sourceId) {
  return maps.sources.get(sourceId) || { code: `id${sourceId}`, title: `Source ${sourceId}` };
}

function pickDropsSource(entitySources, maps) {
  const s = (entitySources || []).find(x => SOURCE_IDS.includes(x.sourceId));
  if (!s) return null;
  return { sourceId: s.sourceId, page: s.pageNumber ?? null, ...sourceInfo(maps, s.sourceId) };
}

// ══════════════════════════════════════════════════════════════
// MONSTERS
// ══════════════════════════════════════════════════════════════
function composeMonsterText(m, maps, src) {
  const size = maps.size.get(m.sizeId) || '';
  const type = (maps.type.get(m.typeId) || '').toLowerCase();
  const align = maps.align.get(m.alignmentId) || 'unaligned';
  const cr = maps.cr.get(m.challengeRatingId) || {};
  const speedStr = (m.movements || []).map(mv => {
    const name = maps.move.get(mv.movementId) || 'Walk';
    return name === 'Walk' ? `${mv.speed} ft.` : `${name.toLowerCase()} ${mv.speed} ft.`;
  }).join(', ');
  const abilities = (m.stats || [])
    .sort((a, b) => a.statId - b.statId)
    .map(s => `${maps.stat.get(s.statId) || '?'} ${s.value} (${abilityMod(s.value)})`)
    .join('  ');
  const dice = m.hitPointDice && m.hitPointDice.diceString ? m.hitPointDice.diceString : '';

  const lines = [
    `# ${m.name}`,
    `${size} ${type}, ${align}`.replace(/\s+/g, ' ').trim(),
    `Source: ${src.title} (${src.code})${src.page ? ', p. ' + src.page : ''}`,
    '',
    `AC ${m.armorClass}${m.armorClassDescription ? ' (' + m.armorClassDescription + ')' : ''}`,
    `HP ${m.averageHitPoints}${dice ? ' (' + dice + ')' : ''}`,
    speedStr ? `Speed ${speedStr}` : null,
    `CR ${crDisplay(cr.value)}${cr.xp != null ? ' (' + cr.xp.toLocaleString() + ' XP' : ''}${cr.proficiencyBonus != null ? '; PB +' + cr.proficiencyBonus + ')' : cr.xp != null ? ')' : ''}${m.initiativeBonus != null ? `; Initiative +${m.initiativeBonus}` : ''}`,
    '',
    abilities || null,
    m.skillsHtml ? `Skills ${stripHtml(m.skillsHtml)}` : null,
    m.sensesHtml ? `Senses ${stripHtml(m.sensesHtml)}` : null,
    m.passivePerception != null ? `Passive Perception ${m.passivePerception}` : null,
    m.conditionImmunitiesHtml ? `Condition Immunities ${stripHtml(m.conditionImmunitiesHtml)}` : null,
    m.languageDescription ? `Languages ${stripHtml(m.languageDescription)}` : null,
  ];

  const section = (label, html) => {
    const txt = stripHtml(html);
    return txt ? `\n${label}:\n${txt}` : '';
  };
  const body = [
    m.characteristicsDescription ? '\n' + stripHtml(m.characteristicsDescription) : '',
    section('Traits', m.specialTraitsDescription),
    section('Actions', m.actionsDescription),
    section('Bonus Actions', m.bonusActionsDescription),
    section('Reactions', m.reactionsDescription),
    section('Legendary Actions', m.legendaryActionsDescription),
    section('Mythic Actions', m.mythicActionsDescription),
    section('Lair', m.lairDescription),
  ].join('');

  return lines.filter(l => l !== null).join('\n') + '\n' + body;
}

function mapMonsterRow(m, maps, src) {
  const cr = maps.cr.get(m.challengeRatingId) || {};
  const abilityScores = {};
  for (const s of (m.stats || [])) abilityScores[maps.stat.get(s.statId) || String(s.statId)] = s.value;
  const speed = (m.movements || []).map(mv => ({ type: maps.move.get(mv.movementId) || 'Walk', speed: mv.speed, notes: mv.notes || null }));
  return {
    id: String(m.id),
    name: m.name,
    slug: `${m.id}-${slugify(m.name)}`,
    source: src.code,
    source_id: String(src.sourceId),
    source_page: src.page,
    size: maps.size.get(m.sizeId) || null,
    type: maps.type.get(m.typeId) || null,
    alignment: maps.align.get(m.alignmentId) || null,
    challenge_rating: cr.value != null ? cr.value : null,
    challenge_rating_display: cr.value != null ? crDisplay(cr.value) : null,
    xp: cr.xp != null ? cr.xp : null,
    proficiency_bonus: cr.proficiencyBonus != null ? cr.proficiencyBonus : null,
    armor_class: m.armorClass ?? null,
    armor_class_type: m.armorClassDescription || null,
    hit_points: m.hitPointDice && m.hitPointDice.diceString ? m.hitPointDice.diceString : (m.averageHitPoints != null ? String(m.averageHitPoints) : null),
    average_hit_points: m.averageHitPoints ?? null,
    hit_dice: m.hitPointDice && m.hitPointDice.diceString ? m.hitPointDice.diceString : null,
    initiative_bonus: m.initiativeBonus ?? null,
    ability_scores: JSON.stringify(abilityScores),
    speed: JSON.stringify(speed),
    passive_perception: m.passivePerception ?? null,
    description_text: composeMonsterText(m, maps, src),
    is_legendary: !!m.isLegendary,
    has_lair: !!m.hasLair,
    raw_json: JSON.stringify(m),
    avatar_url: m.avatarUrl || null,
  };
}

async function munchMonsters(maps) {
  heading('MONSTERS');
  const rows = [];
  let skip = 0, take = 100, total = Infinity, page = 0;
  while (skip < total) {
    const j = await apiGet(`${MONSTER_URL}?skip=${skip}&take=${take}`);
    total = j.pagination?.total ?? total;
    for (const m of (j.data || [])) {
      const src = pickDropsSource(m.sources, maps);
      if (src) rows.push(mapMonsterRow(m, maps, src));
    }
    skip += take; page++;
    if (page % 15 === 0) log(`scanned ${Math.min(skip, total)}/${total} monsters...`);
    if (page > 100) break;
  }
  log(`Matched ${rows.length} Drops monsters`);
  for (const r of rows) vlog(`monster: ${r.name} [${r.source}] CR ${r.challenge_rating_display}`);
  await upsertMonsters(rows);
  return rows.length;
}

async function upsertMonsters(rows) {
  if (DRY_RUN) { log(`DRY RUN: would upsert ${rows.length} monsters`); return; }
  let n = 0;
  for (const r of rows) {
    await pgPool.query(`
      INSERT INTO monsters (id, name, slug, source, source_id, source_page, size, type, alignment,
        challenge_rating, challenge_rating_display, xp, proficiency_bonus, armor_class, armor_class_type,
        hit_points, average_hit_points, hit_dice, initiative_bonus, ability_scores, speed, passive_perception,
        description_text, is_legendary, has_lair, raw_json, avatar_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21::jsonb,$22,$23,$24,$25,$26::jsonb,$27)
      ON CONFLICT (id) DO UPDATE SET
        name=EXCLUDED.name, slug=EXCLUDED.slug, source=EXCLUDED.source, source_id=EXCLUDED.source_id,
        source_page=EXCLUDED.source_page, size=EXCLUDED.size, type=EXCLUDED.type, alignment=EXCLUDED.alignment,
        challenge_rating=EXCLUDED.challenge_rating, challenge_rating_display=EXCLUDED.challenge_rating_display,
        xp=EXCLUDED.xp, proficiency_bonus=EXCLUDED.proficiency_bonus, armor_class=EXCLUDED.armor_class,
        armor_class_type=EXCLUDED.armor_class_type, hit_points=EXCLUDED.hit_points,
        average_hit_points=EXCLUDED.average_hit_points, hit_dice=EXCLUDED.hit_dice,
        initiative_bonus=EXCLUDED.initiative_bonus, ability_scores=EXCLUDED.ability_scores,
        speed=EXCLUDED.speed, passive_perception=EXCLUDED.passive_perception,
        description_text=EXCLUDED.description_text, is_legendary=EXCLUDED.is_legendary,
        has_lair=EXCLUDED.has_lair, raw_json=EXCLUDED.raw_json, avatar_url=EXCLUDED.avatar_url
    `, [
      r.id, r.name, r.slug, r.source, r.source_id, r.source_page, r.size, r.type, r.alignment,
      r.challenge_rating, r.challenge_rating_display, r.xp, r.proficiency_bonus, r.armor_class, r.armor_class_type,
      r.hit_points, r.average_hit_points, r.hit_dice, r.initiative_bonus, r.ability_scores, r.speed, r.passive_perception,
      r.description_text, r.is_legendary, r.has_lair, r.raw_json, r.avatar_url,
    ]);
    n++;
  }
  log(`Upserted ${n} monsters`);
}

// ══════════════════════════════════════════════════════════════
// MAGIC ITEMS
// ══════════════════════════════════════════════════════════════
function composeItemText(it, src) {
  const attune = it.canAttune
    ? ` (requires attunement${it.attunementDescription ? ' ' + stripHtml(it.attunementDescription) : ''})`
    : '';
  const header = `${it.type || 'Wondrous item'}${it.rarity ? ', ' + it.rarity.toLowerCase() : ''}${attune}`;
  return [
    `# ${it.name}`,
    header,
    `Source: ${src.title} (${src.code})${src.page ? ', p. ' + src.page : ''}`,
    '',
    stripHtml(it.description),
  ].filter(Boolean).join('\n');
}

function mapItemRow(it, src) {
  return {
    id: String(it.id),
    name: it.name,
    slug: `${it.id}-${slugify(it.name)}`,
    source: src.code,
    source_id: String(src.sourceId),
    source_page: src.page,
    type: it.type || null,
    item_type: it.subType || null,
    rarity: it.rarity || null,
    requires_attunement: !!it.canAttune,
    cost: it.cost != null ? String(it.cost) : null,
    weight: it.weight != null ? String(it.weight) : null,
    description_text: composeItemText(it, src),
    description_detail: stripHtml(it.description),
    is_homebrew: !!it.isHomebrew,
    raw_json: JSON.stringify(it),
    avatar_url: it.avatarUrl || it.largeAvatarUrl || null,
  };
}

async function munchItems(maps) {
  heading('MAGIC ITEMS');
  const all = (await apiGet(ITEMS_URL)).data || [];
  const rows = [];
  let skippedMundane = 0;
  for (const it of all) {
    const src = pickDropsSource(it.sources, maps);
    if (!src) continue;
    if (!it.magic) { skippedMundane++; vlog(`skip non-magic item: ${it.name}`); continue; }
    rows.push(mapItemRow(it, src));
  }
  log(`Matched ${rows.length} Drops magic items (skipped ${skippedMundane} non-magic)`);
  for (const r of rows) vlog(`item: ${r.name} [${r.source}] ${r.rarity || ''}`);
  await upsertItems(rows);
  return rows.length;
}

async function upsertItems(rows) {
  if (DRY_RUN) { log(`DRY RUN: would upsert ${rows.length} magic items`); return; }
  let n = 0;
  for (const r of rows) {
    await pgPool.query(`
      INSERT INTO magic_items (id, name, slug, source, source_id, source_page, type, item_type, rarity,
        requires_attunement, cost, weight, description_text, description_detail, is_homebrew, raw_json, avatar_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17)
      ON CONFLICT (id) DO UPDATE SET
        name=EXCLUDED.name, slug=EXCLUDED.slug, source=EXCLUDED.source, source_id=EXCLUDED.source_id,
        source_page=EXCLUDED.source_page, type=EXCLUDED.type, item_type=EXCLUDED.item_type, rarity=EXCLUDED.rarity,
        requires_attunement=EXCLUDED.requires_attunement, cost=EXCLUDED.cost, weight=EXCLUDED.weight,
        description_text=EXCLUDED.description_text, description_detail=EXCLUDED.description_detail,
        is_homebrew=EXCLUDED.is_homebrew, raw_json=EXCLUDED.raw_json, avatar_url=EXCLUDED.avatar_url
    `, [
      r.id, r.name, r.slug, r.source, r.source_id, r.source_page, r.type, r.item_type, r.rarity,
      r.requires_attunement, r.cost, r.weight, r.description_text, r.description_detail, r.is_homebrew, r.raw_json, r.avatar_url,
    ]);
    n++;
  }
  log(`Upserted ${n} magic items`);
}

// ══════════════════════════════════════════════════════════════
// FEATS
// ══════════════════════════════════════════════════════════════
function composeFeatText(ft, src) {
  const prereq = Array.isArray(ft.prerequisites) && ft.prerequisites.length
    ? ft.prerequisites.map(p => p.description).filter(Boolean).join('; ')
    : '';
  return [
    `# ${ft.name}`,
    prereq ? `Prerequisite: ${stripHtml(prereq)}` : null,
    `Source: ${src.title} (${src.code})${src.page ? ', p. ' + src.page : ''}`,
    '',
    stripHtml(ft.description),
  ].filter(Boolean).join('\n');
}

function mapFeatRow(ft, src) {
  return {
    id: String(ft.id),
    name: ft.name,
    slug: ft.slug ? String(ft.slug) : `${ft.id}-${slugify(ft.name)}`,
    source: src.code,
    source_id: String(src.sourceId),
    source_page: src.page,
    stat_improvement: false,
    snippet: ft.snippet || null,
    description_text: composeFeatText(ft, src),
    description_detail: stripHtml(ft.description),
    is_homebrew: !!ft.isHomebrew,
    raw_json: JSON.stringify(ft),
  };
}

async function munchFeats(maps) {
  heading('FEATS');
  const all = (await apiGet(FEATS_URL)).data || [];
  const rows = [];
  for (const ft of all) {
    const src = pickDropsSource(ft.sources, maps);
    if (src) rows.push(mapFeatRow(ft, src));
  }
  log(`Matched ${rows.length} Drops feats`);
  for (const r of rows) vlog(`feat: ${r.name} [${r.source}]`);
  await upsertFeats(rows);
  return rows.length;
}

async function upsertFeats(rows) {
  if (DRY_RUN) { log(`DRY RUN: would upsert ${rows.length} feats`); return; }
  let n = 0;
  for (const r of rows) {
    await pgPool.query(`
      INSERT INTO feats (id, name, slug, source, source_id, source_page, stat_improvement, snippet,
        description_text, description_detail, is_homebrew, raw_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        name=EXCLUDED.name, slug=EXCLUDED.slug, source=EXCLUDED.source, source_id=EXCLUDED.source_id,
        source_page=EXCLUDED.source_page, stat_improvement=EXCLUDED.stat_improvement, snippet=EXCLUDED.snippet,
        description_text=EXCLUDED.description_text, description_detail=EXCLUDED.description_detail,
        is_homebrew=EXCLUDED.is_homebrew, raw_json=EXCLUDED.raw_json
    `, [
      r.id, r.name, r.slug, r.source, r.source_id, r.source_page, r.stat_improvement, r.snippet,
      r.description_text, r.description_detail, r.is_homebrew, r.raw_json,
    ]);
    n++;
  }
  log(`Upserted ${n} feats`);
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log(`\nDDB Drops munch — sources [${SOURCE_IDS.join(', ')}] — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  const maps = await loadConfig();
  for (const id of SOURCE_IDS) {
    const s = sourceInfo(maps, id);
    log(`source ${id} = ${s.code} (${s.title})`);
  }

  const counts = { monsters: 0, items: 0, feats: 0 };
  if (ONLY.includes('monsters')) counts.monsters = await munchMonsters(maps);
  if (ONLY.includes('items')) counts.items = await munchItems(maps);
  if (ONLY.includes('feats')) counts.feats = await munchFeats(maps);

  heading('SUMMARY');
  log(`Monsters: ${counts.monsters}`);
  log(`Magic items: ${counts.items}`);
  log(`Feats: ${counts.feats}`);
  if (!DRY_RUN && (counts.monsters + counts.items + counts.feats) > 0) {
    log('');
    log('Next: embed the new rows into the RAG with:');
    log('  node scripts/embed-ddb-content.js --phase 2 --mode incremental');
  }

  await pgPool.end();
}

main().catch(async (err) => {
  console.error('\nDrops munch failed:', err.message);
  try { await pgPool.end(); } catch (_) {}
  process.exit(1);
});
