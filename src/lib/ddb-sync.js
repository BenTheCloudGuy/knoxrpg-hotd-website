// ══════════════════════════════════════════════════════════════
// ── D&D BEYOND CHARACTER SYNC (single source of truth) ───────
// Pulls the full character payload from the D&D Beyond character
// service and applies the comprehensive update to
// `hotd_player_characters`. Both the in-app `Sync from DDB`
// button (src/routes/dm-admin-api.js) and the standalone CLI
// (scripts/sync-ddb-characters.js) delegate here so the two
// paths can never drift apart again.
//
// Owned by DDB: every column listed in DDB_OWNED_FIELDS below.
// NOT owned by DDB and never written here: `dm_notes` (GM-only),
// `player_name`, `id`, `ddb_character_id`, `created_at`.
// ══════════════════════════════════════════════════════════════

const { pgPool } = require("../db/pool");
const ddbClient = require("./ddb-client");

const DDB_API = "https://character-service.dndbeyond.com/character/v5/character";

const STAT_NAMES = { 1: "strength", 2: "dexterity", 3: "constitution", 4: "intelligence", 5: "wisdom", 6: "charisma" };

const SKILL_STAT = {
  Acrobatics: 2, "Animal Handling": 5, Arcana: 4, Athletics: 1, Deception: 6,
  History: 4, Insight: 5, Intimidation: 6, Investigation: 4, Medicine: 5,
  Nature: 4, Perception: 5, Performance: 6, Persuasion: 6, Religion: 4,
  "Sleight of Hand": 2, Stealth: 2, Survival: 5,
};

const ALIGNMENTS = [
  "", "Lawful Good", "Neutral Good", "Chaotic Good",
  "Lawful Neutral", "True Neutral", "Chaotic Neutral",
  "Lawful Evil", "Neutral Evil", "Chaotic Evil",
];

// ── Primitive helpers ────────────────────────────────────────
function mod(score) { return Math.floor(((score || 10) - 10) / 2); }
function trunc(s, n) {
  if (!s) return "";
  const str = String(s).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return str.length > n ? str.slice(0, n).trimEnd() + "…" : str;
}
function proficiencyBonus(level) {
  if (level <= 4) return 2;
  if (level <= 8) return 3;
  if (level <= 12) return 4;
  if (level <= 16) return 5;
  return 6;
}

// ── Ability scores (race + class + item + feat + condition modifiers,
//     then override). Mirrors DDB's own computation order. ────────
function computeAbilityScores(data) {
  const scores = {};
  for (const s of (data.stats || [])) scores[s.id] = s.value || 10;
  for (const b of (data.bonusStats || [])) {
    if (b.value) scores[b.id] = (scores[b.id] || 10) + b.value;
  }
  for (const cat of ["race", "class", "background", "item", "feat", "condition"]) {
    for (const m of (data.modifiers?.[cat] || [])) {
      if (m.type === "bonus" && m.subType?.endsWith("-score")) {
        const statName = m.subType.replace("-score", "");
        const statId = Object.entries(STAT_NAMES).find(([, v]) => v === statName)?.[0];
        if (statId) scores[parseInt(statId)] = (scores[parseInt(statId)] || 10) + (m.value || 0);
      }
      if (m.type === "set" && m.subType?.endsWith("-score")) {
        const statName = m.subType.replace("-score", "");
        const statId = Object.entries(STAT_NAMES).find(([, v]) => v === statName)?.[0];
        if (statId && m.value > (scores[parseInt(statId)] || 0)) scores[parseInt(statId)] = m.value;
      }
    }
  }
  for (const o of (data.overrideStats || [])) {
    if (o.value !== null && o.value !== undefined) scores[o.id] = o.value;
  }
  return scores;
}

// ── AC: equipped armor + shield + unarmored defense (Barbarian /
//     Monk) + flat bonuses + DDB override. ─────────────────────
function computeAC(data, scores) {
  const dexMod = mod(scores[2]);
  let baseAC = 10 + dexMod;
  let hasArmor = false;
  let hasShield = false;

  for (const item of (data.inventory || [])) {
    if (!item.equipped) continue;
    const def = item.definition;
    if (!def?.armorTypeId) continue;
    const ac = def.armorClass || 0;
    switch (def.armorTypeId) {
      case 1: baseAC = ac + dexMod; hasArmor = true; break;
      case 2: baseAC = ac + Math.min(dexMod, 2); hasArmor = true; break;
      case 3: baseAC = ac; hasArmor = true; break;
      case 4: hasShield = true; break;
    }
  }
  if (hasShield) baseAC += 2;

  if (!hasArmor) {
    for (const cat of ["race", "class", "background", "feat"]) {
      for (const m of (data.modifiers?.[cat] || [])) {
        if (m.type === "set" && m.subType === "unarmored-armor-class") {
          const barbarianAC = 10 + dexMod + mod(scores[3]);
          if (barbarianAC > baseAC) baseAC = barbarianAC;
        }
        if (m.type === "set" && m.subType === "monk-unarmored-movement") {
          const monkAC = 10 + dexMod + mod(scores[5]);
          if (monkAC > baseAC) baseAC = monkAC;
        }
      }
    }
  }

  for (const cat of ["race", "class", "background", "item", "feat", "condition"]) {
    for (const m of (data.modifiers?.[cat] || [])) {
      if (m.type === "bonus" && m.subType === "armor-class") baseAC += (m.value || 0);
    }
  }
  if (data.overrideDefenseStats?.armorClass) baseAC = data.overrideDefenseStats.armorClass;
  return baseAC;
}

function computeMaxHP(data, scores) {
  const conMod = mod(scores[3]);
  const totalLevel = (data.classes || []).reduce((s, c) => s + (c.level || 0), 0);
  let maxHP = (data.baseHitPoints || 0) + conMod * totalLevel;
  for (const cat of ["race", "class", "background", "item", "feat"]) {
    for (const m of (data.modifiers?.[cat] || [])) {
      if (m.type === "bonus" && m.subType === "hit-points-per-level") {
        maxHP += (m.value || 0) * totalLevel;
      }
    }
  }
  if (data.bonusHitPoints) maxHP += data.bonusHitPoints;
  if (data.overrideHitPoints) maxHP = data.overrideHitPoints;
  return maxHP;
}

// ── Skills (with prof / expertise / half-prof + flat bonuses) ─
function extractSkills(data, scores, profBonus) {
  const proficient = new Set();
  const expertise = new Set();
  const halfProf = new Set();
  const bonuses = {};

  for (const cat of ["race", "class", "background", "item", "feat"]) {
    for (const m of (data.modifiers?.[cat] || [])) {
      const name = m.friendlySubtypeName || m.subType;
      if (!name) continue;
      if (m.type === "proficiency") proficient.add(name);
      if (m.type === "expertise") expertise.add(name);
      if (m.type === "half-proficiency") halfProf.add(name);
      if (m.type === "bonus" && m.subType && !m.subType.endsWith("-score") && m.subType !== "armor-class" && m.subType !== "hit-points-per-level") {
        bonuses[name] = (bonuses[name] || 0) + (m.value || 0);
      }
    }
  }

  return Object.entries(SKILL_STAT).map(([skillName, statId]) => {
    const statMod = mod(scores[statId]);
    const isProf = proficient.has(skillName);
    const isExpert = expertise.has(skillName);
    const isHalf = halfProf.has(skillName);
    let m = statMod;
    if (isExpert) m += profBonus * 2;
    else if (isProf) m += profBonus;
    else if (isHalf) m += Math.floor(profBonus / 2);
    if (bonuses[skillName]) m += bonuses[skillName];
    return {
      name: skillName,
      stat: STAT_NAMES[statId],
      modifier: m,
      proficient: isProf || isExpert,
      expertise: isExpert,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function extractSavingThrows(data, scores, profBonus) {
  const proficient = new Set();
  for (const cat of ["race", "class", "background", "item", "feat"]) {
    for (const m of (data.modifiers?.[cat] || [])) {
      if (m.type === "proficiency" && m.subType?.endsWith("-saving-throws")) {
        proficient.add(m.subType.replace("-saving-throws", ""));
      }
    }
  }
  const out = [];
  for (let id = 1; id <= 6; id++) {
    const statName = STAT_NAMES[id];
    const isProf = proficient.has(statName);
    out.push({
      name: statName,
      modifier: mod(scores[id]) + (isProf ? profBonus : 0),
      proficient: isProf,
    });
  }
  return out;
}

// ── Attacks: every equipped weapon plus actions that have damage ─
function extractAttacks(data, scores, profBonus) {
  const out = [];
  for (const item of (data.inventory || [])) {
    const def = item.definition;
    if (!def?.damage || !def.attackType) continue;
    const isRanged = def.attackType === 2;
    const isFinesse = (def.properties || []).some(p => p.name === "Finesse");
    const statId = isRanged
      ? 2
      : (isFinesse ? (mod(scores[2]) >= mod(scores[1]) ? 2 : 1) : 1);
    const atkMod = mod(scores[statId]) + profBonus;
    const dmgMod = mod(scores[statId]);
    const dmgStr = `${def.damage.diceString}${dmgMod >= 0 ? "+" : ""}${dmgMod}`;
    const props = (def.properties || []).map(p => p.name);
    const range = def.range
      ? (def.longRange ? `${def.range} ft./${def.longRange} ft.` : `${def.range} ft.`)
      : "5 ft.";
    out.push({
      name: def.name,
      range,
      hit: `+${atkMod}`,
      damage: dmgStr,
      damageType: def.damageType || "",
      equipped: item.equipped || false,
      properties: props,
    });
  }
  return out;
}

// ── Inventory items (everything carried) ─────────────────────
function itemTypeLabel(def) {
  if (!def) return "Misc";
  if (def.armorTypeId) return "Armor";
  if (def.attackType) return "Weapon";
  if (def.filterType === "Wondrous Item") return "Wondrous Item";
  if (def.filterType === "Potion") return "Potion";
  if (def.filterType === "Scroll") return "Scroll";
  if (def.filterType === "Ring") return "Ring";
  if (def.filterType === "Rod") return "Rod";
  if (def.filterType === "Staff") return "Staff";
  if (def.filterType === "Wand") return "Wand";
  if (def.filterType === "Ammunition") return "Ammunition";
  if (def.filterType === "Tool") return "Tool";
  return def.filterType || "Misc";
}

function extractEquipment(data) {
  return (data.inventory || []).map(item => {
    const def = item.definition || {};
    return {
      name: def.name || "Unknown",
      quantity: item.quantity || 1,
      equipped: item.equipped || false,
      type: itemTypeLabel(def),
      rarity: def.rarity || "Common",
      magical: !!def.magic,
      requiresAttunement: !!def.canAttune,
      attuned: !!item.isAttuned,
      weight: def.weight || 0,
      description: trunc(def.description, 300),
    };
  });
}

// ── Spells (class + race + feat + item + background, deduped
//     by name+level). Includes school, casting time, range,
//     components, duration so the GM workspace can show a real
//     spell card and so RAG can match by school/component. ────
function extractSpells(data) {
  const sources = [
    ...(data.classSpells || []).map(s => ({ src: "class", spells: s.spells || [] })),
    ...(data.spells?.race || []).map(s => ({ src: "race", spells: [s] })),
    ...(data.spells?.feat || []).map(s => ({ src: "feat", spells: [s] })),
    ...(data.spells?.item || []).map(s => ({ src: "item", spells: [s] })),
    ...(data.spells?.background || []).map(s => ({ src: "background", spells: [s] })),
  ];
  const seen = new Set();
  const out = [];
  for (const { src, spells } of sources) {
    for (const sp of spells) {
      const def = sp.definition;
      if (!def) continue;
      const key = `${def.name.toLowerCase()}-${def.level || 0}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const comps = [];
      if (def.components?.includes(1)) comps.push("V");
      if (def.components?.includes(2)) comps.push("S");
      if (def.components?.includes(3)) comps.push("M");
      out.push({
        name: def.name,
        level: def.level || 0,
        school: def.school || "",
        castingTime: def.activation?.activationType
          ? `${def.activation.activationTime || 1} ${def.activation.activationType === 1 ? "action" : def.activation.activationType === 3 ? "bonus action" : def.activation.activationType === 4 ? "reaction" : def.activation.activationType === 6 ? "minute" : "unit"}`
          : "",
        range: def.range?.rangeValue ? `${def.range.rangeValue} ft.` : (def.range?.origin || ""),
        components: comps.join(", "),
        duration: def.duration?.durationInterval
          ? `${def.duration.durationInterval} ${def.duration.durationUnit || ""}`.trim()
          : (def.concentration ? "Concentration" : ""),
        concentration: !!def.concentration,
        ritual: !!def.ritual,
        prepared: sp.prepared || sp.alwaysPrepared || false,
        alwaysPrepared: !!sp.alwaysPrepared,
        source: src,
        description: trunc(def.description, 300),
      });
    }
  }
  return out;
}

// ── Spell slots per level (uses + remaining). Important for
//     long-rest tracking but DDB does not auto-reset, so the
//     "used" count reflects in-game state at last save. ───────
function extractSpellSlots(data) {
  const slots = [];
  // 2024 path: data.spellSlots is a top-level array.
  if (Array.isArray(data.spellSlots)) {
    for (const s of data.spellSlots) {
      slots.push({
        level: s.level,
        max: s.available + s.used || s.available || 0,
        used: s.used || 0,
        remaining: Math.max(0, (s.available || 0) - (s.used || 0)),
      });
    }
  }
  // Legacy path: per-class spellSlots.
  for (const cls of (data.classes || [])) {
    for (const s of (cls.spellSlots || [])) {
      if (slots.find(x => x.level === s.level)) continue;
      slots.push({
        level: s.level,
        max: s.available + s.used || s.available || 0,
        used: s.used || 0,
        remaining: Math.max(0, (s.available || 0) - (s.used || 0)),
      });
    }
  }
  // Pact magic (Warlock) reported separately.
  if (data.pactMagic && Array.isArray(data.pactMagic)) {
    for (const s of data.pactMagic) {
      slots.push({
        level: s.level,
        max: (s.available || 0) + (s.used || 0),
        used: s.used || 0,
        remaining: Math.max(0, (s.available || 0) - (s.used || 0)),
        pact: true,
      });
    }
  }
  return slots.sort((a, b) => a.level - b.level);
}

// ── Hit Dice per class (used at short rest) ──────────────────
function extractHitDice(data) {
  return (data.classes || []).map(cls => ({
    class: cls.definition?.name || "Unknown",
    die: cls.definition?.hitDice ? `d${cls.definition.hitDice}` : "",
    max: cls.level || 0,
    used: cls.hitDiceUsed || 0,
    remaining: Math.max(0, (cls.level || 0) - (cls.hitDiceUsed || 0)),
  }));
}

function extractCurrencies(data) {
  const c = data.currencies || {};
  return {
    cp: c.cp || 0,
    sp: c.sp || 0,
    ep: c.ep || 0,
    gp: c.gp || 0,
    pp: c.pp || 0,
  };
}

function extractDeathSaves(data) {
  const d = data.deathSaves || {};
  return { success: d.successCount || 0, fail: d.failCount || 0 };
}

function extractConditions(data) {
  return (data.conditions || []).map(c => {
    if (c.level && c.level > 1) return `${c.name || c.definition?.name || "Unknown"} ${c.level}`;
    return c.name || c.definition?.name || "Unknown";
  }).filter(Boolean).join(", ");
}

// ── Features (class + subclass + racial + feats) with rules
//     text so the GM workspace can show a real feature card. ──
function extractFeatures(data) {
  const out = [];
  const seen = new Set();

  for (const cls of (data.classes || [])) {
    for (const feat of (cls.classFeatures || [])) {
      const def = feat.definition;
      if (!def?.name || seen.has(def.name)) continue;
      if (def.requiredLevel && def.requiredLevel > cls.level) continue;
      seen.add(def.name);
      out.push({
        name: def.name,
        source: cls.definition?.name || "Class",
        classLevel: def.requiredLevel || 1,
        description: trunc(def.description || def.snippet, 400),
      });
    }
    if (cls.subclassDefinition) {
      for (const feat of (cls.subclassDefinition.classFeatures || [])) {
        if (!feat?.name || seen.has(feat.name)) continue;
        if (feat.requiredLevel && feat.requiredLevel > cls.level) continue;
        seen.add(feat.name);
        out.push({
          name: feat.name,
          source: cls.subclassDefinition.name,
          classLevel: feat.requiredLevel || 1,
          description: trunc(feat.description || feat.snippet, 400),
        });
      }
    }
  }
  for (const trait of (data.race?.racialTraits || [])) {
    const def = trait.definition;
    if (!def?.name || seen.has(def.name)) continue;
    seen.add(def.name);
    out.push({
      name: def.name,
      source: data.race?.fullName || "Race",
      description: trunc(def.description || def.snippet, 400),
    });
  }
  for (const feat of (data.feats || [])) {
    const def = feat.definition;
    if (!def?.name || seen.has(def.name)) continue;
    seen.add(def.name);
    out.push({
      name: def.name,
      source: "Feat",
      description: trunc(def.description || def.snippet, 400),
    });
  }
  return out;
}

// ── Proficiencies (armor/weapon/tool/languages) ──────────────
function extractProficiencies(data) {
  const armor = new Set();
  const weapon = new Set();
  const tool = new Set();
  const languages = new Set();

  for (const cat of ["race", "class", "background", "item", "feat"]) {
    for (const m of (data.modifiers?.[cat] || [])) {
      if (m.type !== "proficiency") continue;
      const name = m.friendlySubtypeName || m.subType || "";
      if (!name) continue;
      if (m.entityTypeId === 174869515 || /armor|shield/i.test(name)) armor.add(name);
      else if (m.entityTypeId === 1782728300 || /weapon|sword|bow|axe|dagger|mace|hammer|crossbow|pike|halberd|lance|trident|net|javelin|dart|sling|blowgun|whip|flail|morningstar|scimitar|rapier|shortsword|longsword|greatsword|handaxe|battleaxe|greataxe|glaive|spear|quarterstaff|club|greatclub|maul|war pick|warhammer|martial|simple/i.test(name)) weapon.add(name);
      else if (m.entityTypeId === 2103445194 || /tools|kit|supplies|instrument|set|game/i.test(name)) tool.add(name);
      else if (m.entityTypeId === 906033267 || /common|elvish|dwarvish|draconic|celestial|infernal|abyssal|primordial|sylvan|undercommon|deep speech|giant|gnomish|goblin|halfling|orc|thieves/i.test(name)) languages.add(name);
    }
  }
  return {
    armor: [...armor].join(", "),
    weapon: [...weapon].join(", "),
    tool: [...tool].join(", "),
    languages: [...languages].join(", "),
  };
}

function extractSenses(data) {
  const senses = new Set();
  for (const trait of (data.race?.racialTraits || [])) {
    const n = trait.definition?.name;
    if (n === "Darkvision") senses.add("Darkvision 60 ft.");
    if (n === "Superior Darkvision") senses.add("Darkvision 120 ft.");
    if (n === "Blindsight") senses.add("Blindsight");
    if (n === "Tremorsense") senses.add("Tremorsense");
    if (n === "Truesight") senses.add("Truesight");
  }
  return [...senses].join(", ");
}

// ── Fetch + transform: returns the full UPDATE row. No DB write. ─
async function fetchDDBCharacter(ddbId, { timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  // Authenticated first (syncs PRIVATE campaign characters) when a cobalt
  // token is configured; fall back to unauthenticated (public characters).
  let headers;
  try { if (await ddbClient.getCobaltToken()) headers = await ddbClient.bearerHeaders(); } catch (_) { headers = undefined; }
  let resp;
  try {
    resp = await fetch(`${DDB_API}/${ddbId}`, { signal: controller.signal, headers });
    if ((resp.status === 401 || resp.status === 403) && headers) {
      resp = await fetch(`${DDB_API}/${ddbId}`, { signal: controller.signal });
    }
  } finally {
    clearTimeout(t);
  }
  if (!resp.ok) {
    const e = new Error(`DDB API returned ${resp.status}`);
    e.reason = (resp.status === 401 || resp.status === 403) ? "character-private" : (resp.status === 404 ? "character-not-found" : "ddb-error");
    throw e;
  }
  const json = await resp.json();
  if (!json?.data) throw new Error("No data in DDB response");
  return json.data;
}

function buildSyncRowFromDDB(data) {
  const scores = computeAbilityScores(data);
  const totalLevel = (data.classes || []).reduce((s, c) => s + (c.level || 0), 0);
  const profBonus = proficiencyBonus(totalLevel);
  const maxHP = computeMaxHP(data, scores);
  const currentHP = Math.max(0, maxHP - (data.removedHitPoints || 0));
  const ac = computeAC(data, scores);
  const initiative = mod(scores[2]);

  const classesDetail = (data.classes || []).map(c => ({
    name: c.definition?.name || "?",
    level: c.level || 0,
    subclass: c.subclassDefinition?.name || null,
    hitDie: c.definition?.hitDice ? `d${c.definition.hitDice}` : "",
  }));
  const classSummary = classesDetail
    .map(c => c.subclass ? `${c.name} / ${c.subclass} ${c.level}` : `${c.name} ${c.level}`)
    .join(" · ");

  const skills = extractSkills(data, scores, profBonus);
  const savingThrows = extractSavingThrows(data, scores, profBonus);
  const attacks = extractAttacks(data, scores, profBonus);
  const equipment = extractEquipment(data);
  const spells = extractSpells(data);
  const spellSlots = extractSpellSlots(data);
  const hitDice = extractHitDice(data);
  const currencies = extractCurrencies(data);
  const deathSaves = extractDeathSaves(data);
  const conditions = extractConditions(data);
  const features = extractFeatures(data);
  const profs = extractProficiencies(data);
  const senses = extractSenses(data);

  const passivePerception = 10 + (skills.find(s => s.name === "Perception")?.modifier ?? mod(scores[5]));
  const passiveInvestigation = 10 + (skills.find(s => s.name === "Investigation")?.modifier ?? mod(scores[4]));
  const passiveInsight = 10 + (skills.find(s => s.name === "Insight")?.modifier ?? mod(scores[5]));

  return {
    character_name: data.name || "",
    level: totalLevel,
    race: data.race?.fullName || data.race?.baseName || "",
    class_summary: classSummary,
    subclass: classesDetail[0]?.subclass || "",
    classes_detail: JSON.stringify(classesDetail),
    armor_class: ac,
    hit_points: currentHP,
    max_hit_points: maxHP,
    temp_hit_points: data.temporaryHitPoints || 0,
    speed: data.race?.weightSpeeds?.normal?.walk || 30,
    initiative,
    proficiency_bonus: profBonus,
    strength: scores[1] || 10,
    dexterity: scores[2] || 10,
    constitution: scores[3] || 10,
    intelligence: scores[4] || 10,
    wisdom: scores[5] || 10,
    charisma: scores[6] || 10,
    saving_throws: JSON.stringify(savingThrows),
    skills: JSON.stringify(skills),
    attacks: JSON.stringify(attacks),
    equipment: JSON.stringify(equipment),
    spells: JSON.stringify(spells),
    spell_slots: JSON.stringify(spellSlots),
    hit_dice: JSON.stringify(hitDice),
    currencies: JSON.stringify(currencies),
    death_saves: JSON.stringify(deathSaves),
    conditions,
    features: JSON.stringify(features),
    passive_perception: passivePerception,
    passive_investigation: passiveInvestigation,
    passive_insight: passiveInsight,
    senses,
    languages: profs.languages,
    armor_proficiencies: profs.armor,
    weapon_proficiencies: profs.weapon,
    tool_proficiencies: profs.tool,
    alignment: data.alignmentId ? (ALIGNMENTS[data.alignmentId] || "") : "",
    background: data.background?.definition?.name || "",
    avatar_url: data.decorations?.avatarUrl || data.avatarUrl || "",
    gender: data.gender || "",
    faith: data.faith || "",
    personality_traits: data.traits?.personalityTraits || "",
    ideals: data.traits?.ideals || "",
    bonds: data.traits?.bonds || "",
    flaws: data.traits?.flaws || "",
    backstory: data.notes?.backstory || "",
    notes: data.notes?.otherNotes || "",
    raw_json: JSON.stringify(data),
  };
}

// Columns the lib writes on every sync. Anything NOT in this list
// is left untouched (notably `dm_notes`, `player_name`, `id`,
// `ddb_character_id`, `created_at`).
const DDB_OWNED_FIELDS = [
  "character_name", "level", "race", "class_summary", "subclass", "classes_detail",
  "armor_class", "hit_points", "max_hit_points", "temp_hit_points",
  "speed", "initiative", "proficiency_bonus",
  "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma",
  "saving_throws", "skills", "attacks", "equipment", "spells",
  "spell_slots", "hit_dice", "currencies", "death_saves", "conditions",
  "features", "passive_perception", "passive_investigation", "passive_insight",
  "senses", "languages", "armor_proficiencies", "weapon_proficiencies", "tool_proficiencies",
  "alignment", "background", "avatar_url", "gender", "faith",
  "personality_traits", "ideals", "bonds", "flaws",
  "backstory", "notes", "raw_json",
];

// ── Public: fetch DDB + update DB. Returns a summary object. ─
async function syncCharacterFromDDB(ddbId, localId, { timeoutMs = 10000 } = {}) {
  const data = await fetchDDBCharacter(ddbId, { timeoutMs });
  const row = buildSyncRowFromDDB(data);

  const values = DDB_OWNED_FIELDS.map(f => row[f]);
  const setClause = DDB_OWNED_FIELDS.map((f, i) => `${f} = $${i + 1}`).join(", ");
  values.push(localId);
  await pgPool.query(
    `UPDATE hotd_player_characters SET ${setClause}, updated_at = NOW() WHERE id = $${values.length}`,
    values
  );

  return {
    ok: true,
    character_name: row.character_name,
    level: row.level,
    race: row.race,
    class_summary: row.class_summary,
    ac: row.armor_class,
    max_hp: row.max_hit_points,
    spell_count: JSON.parse(row.spells).length,
    equipment_count: JSON.parse(row.equipment).length,
    feature_count: JSON.parse(row.features).length,
    attack_count: JSON.parse(row.attacks).length,
    message: `${row.character_name} synced (L${row.level} ${row.race} ${row.class_summary} · AC ${row.armor_class} · HP ${row.max_hit_points} · ${JSON.parse(row.spells).length} spells · ${JSON.parse(row.equipment).length} items · ${JSON.parse(row.features).length} features).`,
  };
}

module.exports = {
  syncCharacterFromDDB,
  fetchDDBCharacter,
  buildSyncRowFromDDB,
  DDB_OWNED_FIELDS,
};
