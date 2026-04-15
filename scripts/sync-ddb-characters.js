#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
// D&D Beyond Character Sync — fetches latest data from DDB API
// and updates hotd_player_characters in PostgreSQL.
// ══════════════════════════════════════════════════════════════

const { Pool } = require("pg");

const pgPool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || "5432", 10),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: false,
  max: 2,
});

const DDB_API = "https://character-service.dndbeyond.com/character/v5/character";

const STAT_NAMES = { 1: "strength", 2: "dexterity", 3: "constitution", 4: "intelligence", 5: "wisdom", 6: "charisma" };
const STAT_ABBR = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" };
const SKILL_STAT = {
  Acrobatics: 2, "Animal Handling": 5, Arcana: 4, Athletics: 1, Deception: 6,
  History: 4, Insight: 5, Intimidation: 6, Investigation: 4, Medicine: 5,
  Nature: 4, Perception: 5, Performance: 6, Persuasion: 6, Religion: 4,
  "Sleight of Hand": 2, Stealth: 2, Survival: 5,
};
const SAVE_STAT = { 1: "strength", 2: "dexterity", 3: "constitution", 4: "intelligence", 5: "wisdom", 6: "charisma" };

// ── Compute final ability scores ──────────────────────────────
function computeAbilityScores(data) {
  const scores = {};
  for (const s of data.stats) scores[s.id] = s.value || 10;

  // Apply bonus stats (manual overrides in DDB)
  for (const b of (data.bonusStats || [])) {
    if (b.value) scores[b.id] = (scores[b.id] || 10) + b.value;
  }

  // Apply modifier bonuses from all categories
  const categories = ["race", "class", "background", "item", "feat", "condition"];
  for (const cat of categories) {
    const mods = data.modifiers?.[cat] || [];
    for (const m of mods) {
      if (m.type === "bonus" && m.subType && m.subType.endsWith("-score")) {
        const statName = m.subType.replace("-score", "");
        const statId = Object.entries(STAT_NAMES).find(([, v]) => v === statName)?.[0];
        if (statId) scores[parseInt(statId)] = (scores[parseInt(statId)] || 10) + (m.value || 0);
      }
    }
  }

  // Apply override stats (takes precedence over everything)
  for (const o of (data.overrideStats || [])) {
    if (o.value !== null && o.value !== undefined) scores[o.id] = o.value;
  }

  return scores;
}

function mod(score) { return Math.floor((score - 10) / 2); }

// ── Compute proficiency bonus from total level ────────────────
function proficiencyBonus(level) {
  if (level <= 4) return 2;
  if (level <= 8) return 3;
  if (level <= 12) return 4;
  if (level <= 16) return 5;
  return 6;
}

// ── Compute AC from inventory and modifiers ───────────────────
function computeAC(data, scores) {
  const dexMod = mod(scores[2] || 10);
  let baseAC = 10 + dexMod; // unarmored default

  // Check for equipped armor
  const inventory = data.inventory || [];
  let hasArmor = false;
  let hasShield = false;

  for (const item of inventory) {
    if (!item.equipped) continue;
    const def = item.definition;
    if (!def) continue;

    if (def.armorTypeId) {
      // Armor
      const armorAC = def.armorClass || 0;
      switch (def.armorTypeId) {
        case 1: // Light
          baseAC = armorAC + dexMod;
          hasArmor = true;
          break;
        case 2: // Medium
          baseAC = armorAC + Math.min(dexMod, 2);
          hasArmor = true;
          break;
        case 3: // Heavy
          baseAC = armorAC;
          hasArmor = true;
          break;
        case 4: // Shield
          hasShield = true;
          break;
      }
    }
  }

  if (hasShield) baseAC += 2;

  // Check for unarmored defense (Barbarian: 10 + DEX + CON, Monk: 10 + DEX + WIS)
  if (!hasArmor) {
    const categories = ["race", "class", "background", "feat"];
    for (const cat of categories) {
      for (const m of (data.modifiers?.[cat] || [])) {
        if (m.type === "set" && m.subType === "unarmored-armor-class") {
          // Barbarian unarmored
          const barbarianAC = 10 + dexMod + mod(scores[3] || 10);
          if (barbarianAC > baseAC) baseAC = barbarianAC;
        }
        if (m.type === "set" && m.subType === "monk-unarmored-movement") {
          const monkAC = 10 + dexMod + mod(scores[5] || 10);
          if (monkAC > baseAC) baseAC = monkAC;
        }
      }
    }
  }

  // Add AC bonuses from modifiers (e.g. fighting styles, items)
  const categories = ["race", "class", "background", "item", "feat", "condition"];
  for (const cat of categories) {
    for (const m of (data.modifiers?.[cat] || [])) {
      if (m.type === "bonus" && m.subType === "armor-class") {
        baseAC += m.value || 0;
      }
    }
  }

  // Check for AC override
  if (data.overrideDefenseStats?.armorClass) {
    baseAC = data.overrideDefenseStats.armorClass;
  }

  return baseAC;
}

// ── Compute max HP ────────────────────────────────────────────
function computeMaxHP(data, scores) {
  const conMod = mod(scores[3] || 10);
  const totalLevel = (data.classes || []).reduce((s, c) => s + c.level, 0);
  let maxHP = (data.baseHitPoints || 0) + (conMod * totalLevel);

  // Add bonus HP from modifiers
  const categories = ["race", "class", "background", "item", "feat"];
  for (const cat of categories) {
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

// ── Extract skills with proficiency/expertise ─────────────────
function extractSkills(data, scores, profBonus) {
  // Collect proficiency and expertise from modifiers
  const proficient = new Set();
  const expertise = new Set();
  const halfProf = new Set();
  const bonuses = {};

  const categories = ["race", "class", "background", "item", "feat"];
  for (const cat of categories) {
    for (const m of (data.modifiers?.[cat] || [])) {
      if (m.type === "proficiency" && m.subType) proficient.add(m.friendlySubtypeName || m.subType);
      if (m.type === "expertise" && m.subType) expertise.add(m.friendlySubtypeName || m.subType);
      if (m.type === "half-proficiency" && m.subType) halfProf.add(m.friendlySubtypeName || m.subType);
      if (m.type === "bonus" && m.subType && !m.subType.endsWith("-score") && m.subType !== "armor-class" && m.subType !== "hit-points-per-level") {
        const name = m.friendlySubtypeName || m.subType;
        bonuses[name] = (bonuses[name] || 0) + (m.value || 0);
      }
    }
  }

  const skills = [];
  for (const [skillName, statId] of Object.entries(SKILL_STAT)) {
    const statMod = mod(scores[statId] || 10);
    const isProf = proficient.has(skillName);
    const isExpert = expertise.has(skillName);
    const isHalf = halfProf.has(skillName);

    let skillMod = statMod;
    if (isExpert) skillMod += profBonus * 2;
    else if (isProf) skillMod += profBonus;
    else if (isHalf) skillMod += Math.floor(profBonus / 2);

    if (bonuses[skillName]) skillMod += bonuses[skillName];

    skills.push({
      name: skillName,
      stat: STAT_NAMES[statId],
      modifier: skillMod,
      proficient: isProf || isExpert,
      expertise: isExpert,
    });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Extract saving throws ─────────────────────────────────────
function extractSavingThrows(data, scores, profBonus) {
  const proficient = new Set();
  const categories = ["race", "class", "background", "item", "feat"];
  for (const cat of categories) {
    for (const m of (data.modifiers?.[cat] || [])) {
      if (m.type === "proficiency" && m.subType && m.subType.endsWith("-saving-throws")) {
        const statName = m.subType.replace("-saving-throws", "");
        proficient.add(statName);
      }
    }
  }

  const saves = [];
  for (let id = 1; id <= 6; id++) {
    const statName = STAT_NAMES[id];
    const isProf = proficient.has(statName);
    const saveMod = mod(scores[id] || 10) + (isProf ? profBonus : 0);
    saves.push({ name: statName, modifier: saveMod, proficient: isProf });
  }
  return saves;
}

// ── Extract attacks ───────────────────────────────────────────
function extractAttacks(data, scores, profBonus) {
  const attacks = [];
  const inventory = data.inventory || [];

  for (const item of inventory) {
    const def = item.definition;
    if (!def || !def.damage) continue;
    if (!def.attackType) continue;

    const isRanged = def.attackType === 2;
    const isFinesse = (def.properties || []).some(p => p.name === "Finesse");
    const statId = isRanged ? 2 : (isFinesse ? (mod(scores[2]) >= mod(scores[1]) ? 2 : 1) : 1);
    const atkMod = mod(scores[statId] || 10) + profBonus;
    const dmgMod = mod(scores[statId] || 10);
    const dmgStr = `${def.damage.diceString}${dmgMod >= 0 ? "+" : ""}${dmgMod}`;

    const props = (def.properties || []).map(p => p.name).join(", ");
    const range = def.range ? (def.longRange ? `${def.range} ft./${def.longRange} ft.` : `${def.range} ft.`) : "5 ft.";

    attacks.push({
      name: def.name,
      range,
      hit: `+${atkMod}`,
      damage: dmgStr,
      damageType: def.damageType || "",
      equipped: item.equipped || false,
      notes: props,
    });
  }

  return attacks;
}

// ── Extract equipment ─────────────────────────────────────────
function extractEquipment(data) {
  return (data.inventory || []).map(item => ({
    name: item.definition?.name || "Unknown",
    quantity: item.quantity || 1,
    equipped: item.equipped || false,
  }));
}

// ── Extract spells ────────────────────────────────────────────
function extractSpells(data) {
  const spells = [];
  const sources = [
    ...(data.classSpells || []),
    ...(data.spells?.race || []),
    ...(data.spells?.feat || []),
    ...(data.spells?.item || []),
  ];

  for (const source of sources) {
    const spellList = source.spells || [];
    for (const sp of spellList) {
      const def = sp.definition;
      if (!def) continue;
      spells.push({
        name: def.name,
        level: def.level || 0,
        prepared: sp.prepared || sp.alwaysPrepared || false,
      });
    }
  }

  // Deduplicate
  const seen = new Set();
  return spells.filter(s => {
    const key = `${s.name}-${s.level}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Extract features ──────────────────────────────────────────
function extractFeatures(data) {
  const features = [];
  const seen = new Set();

  // Class features
  for (const cls of (data.classes || [])) {
    for (const feat of (cls.classFeatures || [])) {
      const def = feat.definition;
      if (!def || seen.has(def.name)) continue;
      seen.add(def.name);
      features.push({ name: def.name, source: def.sourcePageNumber ? `${cls.definition.name}` : cls.definition.name });
    }
    // Subclass features
    if (cls.subclassDefinition) {
      for (const feat of (cls.subclassDefinition.classFeatures || [])) {
        if (!feat || !feat.name || seen.has(feat.name)) continue;
        if (feat.requiredLevel > cls.level) continue;
        seen.add(feat.name);
        features.push({ name: feat.name, source: cls.subclassDefinition.name });
      }
    }
  }

  // Racial traits
  for (const trait of (data.race?.racialTraits || [])) {
    const def = trait.definition;
    if (!def || seen.has(def.name)) continue;
    seen.add(def.name);
    features.push({ name: def.name, source: data.race.fullName || "Race" });
  }

  // Feats
  for (const feat of (data.feats || [])) {
    const def = feat.definition;
    if (!def || seen.has(def.name)) continue;
    seen.add(def.name);
    features.push({ name: def.name, source: "Feat" });
  }

  return features;
}

// ── Extract proficiency strings ───────────────────────────────
function extractProficiencies(data) {
  const armor = new Set();
  const weapon = new Set();
  const tool = new Set();
  const languages = new Set();

  const categories = ["race", "class", "background", "item", "feat"];
  for (const cat of categories) {
    for (const m of (data.modifiers?.[cat] || [])) {
      if (m.type !== "proficiency") continue;
      const name = m.friendlySubtypeName || m.subType || "";
      if (!name) continue;
      if (m.entityTypeId === 174869515 || name.match(/armor|shield/i)) armor.add(name);
      else if (m.entityTypeId === 1782728300 || name.match(/weapon|sword|bow|axe|dagger|mace|hammer|crossbow|pike|halberd|lance|trident|net|javelin|dart|sling|blowgun|whip|flail|morningstar|scimitar|rapier|shortsword|longsword|greatsword|handaxe|battleaxe|greataxe|glaive|spear|quarterstaff|club|greatclub|maul|war pick|warhammer|martial|simple/i)) weapon.add(name);
      else if (m.entityTypeId === 2103445194 || name.match(/tools|kit|supplies|instrument|set|game/i)) tool.add(name);
      else if (m.entityTypeId === 906033267 || name.match(/common|elvish|dwarvish|draconic|celestial|infernal|abyssal|primordial|sylvan|undercommon|deep speech|giant|gnomish|goblin|halfling|orc|thieves/i)) languages.add(name);
    }
  }

  return {
    armor: [...armor].join(", "),
    weapon: [...weapon].join(", "),
    tool: [...tool].join(", "),
    languages: [...languages].join(", "),
  };
}

// ── Main sync function ────────────────────────────────────────
async function syncCharacter(ddbId, currentRow) {
  const res = await fetch(`${DDB_API}/${ddbId}`);
  if (!res.ok) {
    console.error(`  FAILED to fetch DDB ${ddbId}: ${res.status}`);
    return null;
  }
  const { data } = await res.json();
  if (!data) { console.error(`  No data for DDB ${ddbId}`); return null; }

  const scores = computeAbilityScores(data);
  const totalLevel = (data.classes || []).reduce((s, c) => s + c.level, 0);
  const profBonus = proficiencyBonus(totalLevel);
  const maxHP = computeMaxHP(data, scores);
  const currentHP = maxHP - (data.removedHitPoints || 0);
  const ac = computeAC(data, scores);
  const initiative = mod(scores[2] || 10);

  const classesDetail = (data.classes || []).map(c => ({
    name: c.definition.name,
    level: c.level,
    subclass: c.subclassDefinition?.name || null,
  }));
  const classSummary = classesDetail.map(c => c.subclass ? `${c.name} / ${c.subclass}` : c.name).join(" · ");

  const skills = extractSkills(data, scores, profBonus);
  const savingThrows = extractSavingThrows(data, scores, profBonus);
  const attacks = extractAttacks(data, scores, profBonus);
  const equipment = extractEquipment(data);
  const spells = extractSpells(data);
  const features = extractFeatures(data);
  const profs = extractProficiencies(data);

  const passivePerception = 10 + (skills.find(s => s.name === "Perception")?.modifier || mod(scores[5] || 10));
  const passiveInvestigation = 10 + (skills.find(s => s.name === "Investigation")?.modifier || mod(scores[4] || 10));
  const passiveInsight = 10 + (skills.find(s => s.name === "Insight")?.modifier || mod(scores[5] || 10));

  return {
    character_name: data.name,
    level: totalLevel,
    race: data.race?.fullName || "",
    class_summary: classSummary,
    subclass: classesDetail[0]?.subclass || "",
    classes_detail: JSON.stringify(classesDetail),
    armor_class: ac,
    hit_points: currentHP,
    max_hit_points: maxHP,
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
    features: JSON.stringify(features),
    passive_perception: passivePerception,
    passive_investigation: passiveInvestigation,
    passive_insight: passiveInsight,
    senses: (data.race?.racialTraits || []).some(t => t.definition?.name === "Darkvision") ? "Darkvision 60 ft." : "",
    languages: profs.languages,
    armor_proficiencies: profs.armor,
    weapon_proficiencies: profs.weapon,
    tool_proficiencies: profs.tool,
    alignment: data.alignmentId ? ["", "Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "True Neutral", "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil"][data.alignmentId] || "" : "",
    background: data.background?.definition?.name || "",
    avatar_url: data.decorations?.avatarUrl || "",
    gender: data.gender || "",
    faith: data.faith || "",
    personality_traits: data.traits?.personalityTraits || "",
    ideals: data.traits?.ideals || "",
    bonds: data.traits?.bonds || "",
    flaws: data.traits?.flaws || "",
    backstory: data.notes?.backstory || "",
    notes: data.notes?.otherNotes || "",
    temp_hit_points: data.temporaryHitPoints || 0,
    raw_json: JSON.stringify(data),
  };
}

// ── Run ───────────────────────────────────────────────────────
async function main() {
  console.log("=== D&D Beyond Character Sync ===\n");

  const { rows } = await pgPool.query("SELECT id, ddb_character_id, character_name, player_name FROM hotd_player_characters ORDER BY id");
  console.log(`Found ${rows.length} characters to sync.\n`);

  for (const row of rows) {
    if (!row.ddb_character_id) { console.log(`Skipping ${row.character_name} (no DDB ID)`); continue; }

    console.log(`Syncing: ${row.character_name} (DDB ID: ${row.ddb_character_id})...`);
    const updated = await syncCharacter(row.ddb_character_id, row);
    if (!updated) continue;

    // Build UPDATE query (exclude player_name — that's managed manually)
    const fields = Object.keys(updated);
    const setClauses = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");
    const values = fields.map(f => updated[f]);
    values.push(row.id);

    await pgPool.query(`UPDATE hotd_player_characters SET ${setClauses}, updated_at = NOW() WHERE id = $${values.length}`, values);

    console.log(`  ✓ ${updated.character_name} — Lvl ${updated.level} ${updated.race} ${updated.class_summary}`);
    console.log(`    STR ${updated.strength} DEX ${updated.dexterity} CON ${updated.constitution} INT ${updated.intelligence} WIS ${updated.wisdom} CHA ${updated.charisma}`);
    console.log(`    AC ${updated.armor_class} | HP ${updated.hit_points}/${updated.max_hit_points} | Init ${updated.initiative >= 0 ? "+" : ""}${updated.initiative} | Prof +${updated.proficiency_bonus}`);
  }

  console.log("\n=== Sync complete ===");
  await pgPool.end();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
