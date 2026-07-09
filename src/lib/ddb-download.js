// ══════════════════════════════════════════════════════════════
// ── D&D BEYOND CONTENT DOWNLOADER (pod-callable) ──────────────
// Pulls owned D&D Beyond content (monsters, magic items, feats) for a
// given set of sources (books / drops) from the entitlement-respecting
// DDB services and upserts it into the local content tables, so the RAG
// embed step (ddb-audit.embedMissing) can pick it up.
//
// This is the in-app, per-source generalization of scripts/munch-ddb-drops.js
// (which is Drops-only). Auth is sourced through ddb-client (KV-backed
// cobalt token → bearer). Used by the "Sync Missing → RAG" action.
//
// One catalog scan services any number of requested sources: monsters are
// paged from monster-service, items/feats come from character game-data.
// Each entity is assigned to the first of its sources that was requested.
// ══════════════════════════════════════════════════════════════

const ddbClient = require("./ddb-client");

const CONFIG_URL = "https://www.dndbeyond.com/api/config/json";
const MONSTER_URL = "https://monster-service.dndbeyond.com/v1/Monster";
const ITEMS_URL = "https://character-service.dndbeyond.com/character/v5/game-data/items";
const FEATS_URL = "https://character-service.dndbeyond.com/character/v5/game-data/feats";

// ── Text helpers (parity with munch-ddb-drops.js) ─────────────
function stripHtml(html) {
  return (html || "")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\u2022 ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&rsquo;/g, "\u2019").replace(/&[a-z]+;/g, "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function decodeEntities(text) {
  return (text || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&rsquo;/g, "\u2019").replace(/&nbsp;/g, " ");
}
function slugify(name) {
  return String(name).toLowerCase().replace(/[\u2018\u2019']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function crDisplay(value) {
  if (value === 0.125) return "1/8";
  if (value === 0.25) return "1/4";
  if (value === 0.5) return "1/2";
  return String(value);
}
function abilityMod(score) { const m = Math.floor((score - 10) / 2); return (m >= 0 ? "+" : "") + m; }

// ── Config maps ───────────────────────────────────────────────
async function loadConfig(H) {
  const cfg = await apiGet(CONFIG_URL, H);
  const byId = (arr, val) => new Map((arr || []).map((x) => [x.id, val ? val(x) : x]));
  const sources = new Map((cfg.sources || []).map((s) => [s.id, { code: (s.name || "").toLowerCase(), title: decodeEntities(s.description || s.name) }]));
  const codeToId = new Map();
  for (const [id, meta] of sources) if (meta.code) codeToId.set(meta.code, id);
  return {
    sources, codeToId,
    cr: byId(cfg.challengeRatings),
    size: byId(cfg.creatureSizes, (x) => x.name),
    type: byId(cfg.monsterTypes, (x) => x.name),
    align: byId(cfg.alignments, (x) => x.name),
    stat: byId(cfg.stats, (x) => x.key),
    move: byId(cfg.movements, (x) => x.name),
  };
}
function sourceInfo(maps, sourceId) { return maps.sources.get(sourceId) || { code: `id${sourceId}`, title: `Source ${sourceId}` }; }

// Pick the first of an entity's sources that was requested (targetIds Set).
function pickSource(entitySources, targetIds, maps) {
  const s = (entitySources || []).find((x) => targetIds.has(x.sourceId));
  if (!s) return null;
  return { sourceId: s.sourceId, page: s.pageNumber ?? null, ...sourceInfo(maps, s.sourceId) };
}

async function apiGet(url, H) {
  const resp = await fetch(url, { headers: H });
  if (!resp.ok) throw new Error(`GET ${url} -> ${resp.status}`);
  return resp.json();
}

// ── MONSTERS ──────────────────────────────────────────────────
function composeMonsterText(m, maps, src) {
  const size = maps.size.get(m.sizeId) || "";
  const type = (maps.type.get(m.typeId) || "").toLowerCase();
  const align = maps.align.get(m.alignmentId) || "unaligned";
  const cr = maps.cr.get(m.challengeRatingId) || {};
  const speedStr = (m.movements || []).map((mv) => {
    const name = maps.move.get(mv.movementId) || "Walk";
    return name === "Walk" ? `${mv.speed} ft.` : `${name.toLowerCase()} ${mv.speed} ft.`;
  }).join(", ");
  const abilities = (m.stats || []).sort((a, b) => a.statId - b.statId)
    .map((s) => `${maps.stat.get(s.statId) || "?"} ${s.value} (${abilityMod(s.value)})`).join("  ");
  const dice = m.hitPointDice && m.hitPointDice.diceString ? m.hitPointDice.diceString : "";
  const lines = [
    `# ${m.name}`,
    `${size} ${type}, ${align}`.replace(/\s+/g, " ").trim(),
    `Source: ${src.title} (${src.code})${src.page ? ", p. " + src.page : ""}`,
    "",
    `AC ${m.armorClass}${m.armorClassDescription ? " (" + m.armorClassDescription + ")" : ""}`,
    `HP ${m.averageHitPoints}${dice ? " (" + dice + ")" : ""}`,
    speedStr ? `Speed ${speedStr}` : null,
    `CR ${crDisplay(cr.value)}${cr.xp != null ? " (" + cr.xp.toLocaleString() + " XP" : ""}${cr.proficiencyBonus != null ? "; PB +" + cr.proficiencyBonus + ")" : cr.xp != null ? ")" : ""}`,
    "",
    abilities || null,
    m.skillsHtml ? `Skills ${stripHtml(m.skillsHtml)}` : null,
    m.sensesHtml ? `Senses ${stripHtml(m.sensesHtml)}` : null,
    m.passivePerception != null ? `Passive Perception ${m.passivePerception}` : null,
    m.conditionImmunitiesHtml ? `Condition Immunities ${stripHtml(m.conditionImmunitiesHtml)}` : null,
    m.languageDescription ? `Languages ${stripHtml(m.languageDescription)}` : null,
  ];
  const section = (label, html) => { const txt = stripHtml(html); return txt ? `\n${label}:\n${txt}` : ""; };
  const body = [
    m.characteristicsDescription ? "\n" + stripHtml(m.characteristicsDescription) : "",
    section("Traits", m.specialTraitsDescription),
    section("Actions", m.actionsDescription),
    section("Bonus Actions", m.bonusActionsDescription),
    section("Reactions", m.reactionsDescription),
    section("Legendary Actions", m.legendaryActionsDescription),
    section("Mythic Actions", m.mythicActionsDescription),
    section("Lair", m.lairDescription),
  ].join("");
  return lines.filter((l) => l !== null).join("\n") + "\n" + body;
}
function mapMonsterRow(m, maps, src) {
  const cr = maps.cr.get(m.challengeRatingId) || {};
  const abilityScores = {};
  for (const s of (m.stats || [])) abilityScores[maps.stat.get(s.statId) || String(s.statId)] = s.value;
  const speed = (m.movements || []).map((mv) => ({ type: maps.move.get(mv.movementId) || "Walk", speed: mv.speed, notes: mv.notes || null }));
  return {
    id: String(m.id), name: m.name, slug: `${m.id}-${slugify(m.name)}`,
    source: src.code, source_id: String(src.sourceId), source_page: src.page,
    size: maps.size.get(m.sizeId) || null, type: maps.type.get(m.typeId) || null, alignment: maps.align.get(m.alignmentId) || null,
    challenge_rating: cr.value != null ? cr.value : null, challenge_rating_display: cr.value != null ? crDisplay(cr.value) : null,
    xp: cr.xp != null ? cr.xp : null, proficiency_bonus: cr.proficiencyBonus != null ? cr.proficiencyBonus : null,
    armor_class: m.armorClass ?? null, armor_class_type: m.armorClassDescription || null,
    hit_points: m.hitPointDice && m.hitPointDice.diceString ? m.hitPointDice.diceString : (m.averageHitPoints != null ? String(m.averageHitPoints) : null),
    average_hit_points: m.averageHitPoints ?? null, hit_dice: m.hitPointDice && m.hitPointDice.diceString ? m.hitPointDice.diceString : null,
    initiative_bonus: m.initiativeBonus ?? null, ability_scores: JSON.stringify(abilityScores), speed: JSON.stringify(speed),
    passive_perception: m.passivePerception ?? null, description_text: composeMonsterText(m, maps, src),
    is_legendary: !!m.isLegendary, has_lair: !!m.hasLair, raw_json: JSON.stringify(m), avatar_url: m.avatarUrl || null,
  };
}
async function upsertMonster(pgPool, r) {
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
      has_lair=EXCLUDED.has_lair, raw_json=EXCLUDED.raw_json, avatar_url=EXCLUDED.avatar_url`,
    [r.id, r.name, r.slug, r.source, r.source_id, r.source_page, r.size, r.type, r.alignment,
     r.challenge_rating, r.challenge_rating_display, r.xp, r.proficiency_bonus, r.armor_class, r.armor_class_type,
     r.hit_points, r.average_hit_points, r.hit_dice, r.initiative_bonus, r.ability_scores, r.speed, r.passive_perception,
     r.description_text, r.is_legendary, r.has_lair, r.raw_json, r.avatar_url]);
}

// ── MAGIC ITEMS ───────────────────────────────────────────────
function composeItemText(it, src) {
  const attune = it.canAttune ? ` (requires attunement${it.attunementDescription ? " " + stripHtml(it.attunementDescription) : ""})` : "";
  const header = `${it.type || "Wondrous item"}${it.rarity ? ", " + it.rarity.toLowerCase() : ""}${attune}`;
  return [`# ${it.name}`, header, `Source: ${src.title} (${src.code})${src.page ? ", p. " + src.page : ""}`, "", stripHtml(it.description)].filter(Boolean).join("\n");
}
function mapItemRow(it, src) {
  return {
    id: String(it.id), name: it.name, slug: `${it.id}-${slugify(it.name)}`,
    source: src.code, source_id: String(src.sourceId), source_page: src.page,
    type: it.type || null, item_type: it.subType || null, rarity: it.rarity || null, requires_attunement: !!it.canAttune,
    cost: it.cost != null ? String(it.cost) : null, weight: it.weight != null ? String(it.weight) : null,
    description_text: composeItemText(it, src), description_detail: stripHtml(it.description),
    is_homebrew: !!it.isHomebrew, raw_json: JSON.stringify(it), avatar_url: it.avatarUrl || it.largeAvatarUrl || null,
  };
}
async function upsertItem(pgPool, r) {
  await pgPool.query(`
    INSERT INTO magic_items (id, name, slug, source, source_id, source_page, type, item_type, rarity,
      requires_attunement, cost, weight, description_text, description_detail, is_homebrew, raw_json, avatar_url)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17)
    ON CONFLICT (id) DO UPDATE SET
      name=EXCLUDED.name, slug=EXCLUDED.slug, source=EXCLUDED.source, source_id=EXCLUDED.source_id,
      source_page=EXCLUDED.source_page, type=EXCLUDED.type, item_type=EXCLUDED.item_type, rarity=EXCLUDED.rarity,
      requires_attunement=EXCLUDED.requires_attunement, cost=EXCLUDED.cost, weight=EXCLUDED.weight,
      description_text=EXCLUDED.description_text, description_detail=EXCLUDED.description_detail,
      is_homebrew=EXCLUDED.is_homebrew, raw_json=EXCLUDED.raw_json, avatar_url=EXCLUDED.avatar_url`,
    [r.id, r.name, r.slug, r.source, r.source_id, r.source_page, r.type, r.item_type, r.rarity,
     r.requires_attunement, r.cost, r.weight, r.description_text, r.description_detail, r.is_homebrew, r.raw_json, r.avatar_url]);
}

// ── FEATS ─────────────────────────────────────────────────────
function composeFeatText(ft, src) {
  const prereq = Array.isArray(ft.prerequisites) && ft.prerequisites.length ? ft.prerequisites.map((p) => p.description).filter(Boolean).join("; ") : "";
  return [`# ${ft.name}`, prereq ? `Prerequisite: ${stripHtml(prereq)}` : null, `Source: ${src.title} (${src.code})${src.page ? ", p. " + src.page : ""}`, "", stripHtml(ft.description)].filter(Boolean).join("\n");
}
function mapFeatRow(ft, src) {
  return {
    id: String(ft.id), name: ft.name, slug: ft.slug ? String(ft.slug) : `${ft.id}-${slugify(ft.name)}`,
    source: src.code, source_id: String(src.sourceId), source_page: src.page, stat_improvement: false,
    snippet: ft.snippet || null, description_text: composeFeatText(ft, src), description_detail: stripHtml(ft.description),
    is_homebrew: !!ft.isHomebrew, raw_json: JSON.stringify(ft),
  };
}
async function upsertFeat(pgPool, r) {
  await pgPool.query(`
    INSERT INTO feats (id, name, slug, source, source_id, source_page, stat_improvement, snippet,
      description_text, description_detail, is_homebrew, raw_json)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      name=EXCLUDED.name, slug=EXCLUDED.slug, source=EXCLUDED.source, source_id=EXCLUDED.source_id,
      source_page=EXCLUDED.source_page, stat_improvement=EXCLUDED.stat_improvement, snippet=EXCLUDED.snippet,
      description_text=EXCLUDED.description_text, description_detail=EXCLUDED.description_detail,
      is_homebrew=EXCLUDED.is_homebrew, raw_json=EXCLUDED.raw_json`,
    [r.id, r.name, r.slug, r.source, r.source_id, r.source_page, r.stat_improvement, r.snippet,
     r.description_text, r.description_detail, r.is_homebrew, r.raw_json]);
}

// ── Orchestration ─────────────────────────────────────────────
// Resolve requested source codes/ids to a Set of numeric DDB source ids.
function resolveTargetIds(maps, { sourceCodes = [], sourceIds = [] }) {
  const ids = new Set();
  for (const id of sourceIds) { const n = parseInt(id, 10); if (Number.isFinite(n)) ids.add(n); }
  for (const code of sourceCodes) { const id = maps.codeToId.get(String(code).toLowerCase()); if (id != null) ids.add(id); }
  return ids;
}

// Download all requested sources' monsters/items/feats into the DB.
// opts: { sourceCodes?, sourceIds?, types? = ['monsters','items','feats'], onLog? }
async function downloadSources(pgPool, opts = {}) {
  const types = opts.types && opts.types.length ? opts.types : ["monsters", "items", "feats"];
  const log = typeof opts.onLog === "function" ? opts.onLog : () => {};
  const H = await ddbClient.bearerHeaders();
  const maps = await loadConfig(H);
  const targetIds = resolveTargetIds(maps, opts);
  if (!targetIds.size) { const e = new Error("No matching D&D Beyond sources to download"); e.reason = "no-sources"; throw e; }

  const result = { requested: targetIds.size, monsters: 0, items: 0, feats: 0, bySource: {} };
  const bump = (code, kind) => { (result.bySource[code] = result.bySource[code] || { monsters: 0, items: 0, feats: 0 })[kind]++; };

  if (types.includes("monsters")) {
    log("Scanning monsters\u2026");
    let skip = 0, take = 100, total = Infinity, page = 0;
    while (skip < total) {
      const j = await apiGet(`${MONSTER_URL}?skip=${skip}&take=${take}`, H);
      total = j.pagination?.total ?? total;
      for (const m of (j.data || [])) {
        const src = pickSource(m.sources, targetIds, maps);
        if (!src) continue;
        await upsertMonster(pgPool, mapMonsterRow(m, maps, src));
        result.monsters++; bump(src.code, "monsters");
      }
      skip += take; page++;
      if (page % 15 === 0) log(`  scanned ${Math.min(skip, total)}/${total} monsters (matched ${result.monsters})`);
      if (page > 120) break;
    }
    log(`Monsters imported: ${result.monsters}`);
  }

  if (types.includes("items")) {
    log("Fetching magic items\u2026");
    const all = (await apiGet(ITEMS_URL, H)).data || [];
    for (const it of all) {
      const src = pickSource(it.sources, targetIds, maps);
      if (!src || !it.magic) continue;
      await upsertItem(pgPool, mapItemRow(it, src));
      result.items++; bump(src.code, "items");
    }
    log(`Magic items imported: ${result.items}`);
  }

  if (types.includes("feats")) {
    log("Fetching feats\u2026");
    const all = (await apiGet(FEATS_URL, H)).data || [];
    for (const ft of all) {
      const src = pickSource(ft.sources, targetIds, maps);
      if (!src) continue;
      await upsertFeat(pgPool, mapFeatRow(ft, src));
      result.feats++; bump(src.code, "feats");
    }
    log(`Feats imported: ${result.feats}`);
  }

  return result;
}

module.exports = { downloadSources, loadConfig };
