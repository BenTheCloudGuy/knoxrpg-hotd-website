// ══════════════════════════════════════════════════════════════
// foundry-actors.js — map HotD website records to FoundryVTT dnd5e
// (v13, 5.2.x) Actor.create() payloads. Partial payloads are safe:
// Foundry/dnd5e fill defaults and drop unknown fields. Image URLs are
// returned as-stored (relative /hotd-content/* or absolute); the Foundry
// module resolves relative ones against its websiteUrl setting.
// ══════════════════════════════════════════════════════════════

// Full skill name -> dnd5e skill key.
const SKILL_KEYS = {
  "acrobatics": "acr", "animal handling": "ani", "arcana": "arc", "athletics": "ath",
  "deception": "dec", "history": "his", "insight": "ins", "intimidation": "itm",
  "investigation": "inv", "medicine": "med", "nature": "nat", "perception": "prc",
  "performance": "prf", "persuasion": "per", "religion": "rel", "sleight of hand": "slt",
  "stealth": "ste", "survival": "sur",
};
// Ability full name -> dnd5e ability key.
const ABILITY_KEYS = {
  strength: "str", dexterity: "dex", constitution: "con",
  intelligence: "int", wisdom: "wis", charisma: "cha",
};
// Monster ability_scores use uppercase 3-letter keys.
const MON_ABIL = { STR: "str", DEX: "dex", CON: "con", INT: "int", WIS: "wis", CHA: "cha" };
// dnd5e size + movement keys.
const SIZE_KEYS = { tiny: "tiny", small: "sm", medium: "med", large: "lg", huge: "huge", gargantuan: "grg" };
const MOVE_KEYS = { walk: "walk", fly: "fly", swim: "swim", climb: "climb", burrow: "burrow" };

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return Object.values(v);
  return [];
}

// ── Player character -> dnd5e "character" actor ──────────────────────────────
function mapPcToActor(r) {
  const abilities = {};
  for (const [full, key] of Object.entries(ABILITY_KEYS)) {
    abilities[key] = { value: Number(r[full]) || 10 };
  }
  // Saving throw proficiencies.
  for (const s of asArray(r.saving_throws)) {
    const k = ABILITY_KEYS[String(s.name || "").toLowerCase()];
    if (k && s.proficient) abilities[k].proficiency = 1;
  }
  // Skill proficiencies / expertise.
  const skills = {};
  for (const s of asArray(r.skills)) {
    const k = SKILL_KEYS[String(s.name || "").toLowerCase()];
    if (!k) continue;
    skills[k] = { value: s.expertise ? 2 : (s.proficient ? 1 : 0) };
  }
  const cur = (r.currencies && typeof r.currencies === "object") ? r.currencies : {};
  const currency = {
    pp: Number(cur.pp) || 0, gp: Number(cur.gp) || 0, ep: Number(cur.ep) || 0,
    sp: Number(cur.sp) || 0, cp: Number(cur.cp) || 0,
  };

  const bio = [];
  if (r.class_summary) bio.push(`<p><strong>Class:</strong> ${esc(r.class_summary)} (level ${esc(r.level)})</p>`);
  if (r.player_name) bio.push(`<p><strong>Player:</strong> ${esc(r.player_name)}</p>`);
  const meta = [r.race, r.gender, r.alignment, r.background, r.faith].filter(Boolean).map(esc).join(" · ");
  if (meta) bio.push(`<p>${meta}</p>`);
  const traits = [["Personality", r.personality_traits], ["Ideals", r.ideals], ["Bonds", r.bonds], ["Flaws", r.flaws]];
  for (const [label, v] of traits) if (v) bio.push(`<p><strong>${label}:</strong> ${esc(v)}</p>`);
  if (r.backstory) bio.push(`<h3>Backstory</h3><p>${esc(r.backstory).replace(/\n+/g, "</p><p>")}</p>`);
  const profs = [["Languages", r.languages], ["Armor", r.armor_proficiencies], ["Weapons", r.weapon_proficiencies], ["Tools", r.tool_proficiencies], ["Senses", r.senses]];
  const profStr = profs.filter(([, v]) => v).map(([l, v]) => `<strong>${l}:</strong> ${esc(v)}`).join("<br>");
  if (profStr) bio.push(`<p>${profStr}</p>`);
  if (r.dm_notes) bio.push(`<hr><p><em>DM notes:</em> ${esc(r.dm_notes)}</p>`);

  return {
    name: r.character_name || "Unnamed Character",
    type: "character",
    img: r.avatar_url || undefined,
    system: {
      abilities,
      attributes: {
        hp: { value: Number(r.hit_points) || 0, max: Number(r.max_hit_points) || 0, temp: Number(r.temp_hit_points) || 0 },
        ac: { calc: "flat", flat: Number(r.armor_class) || 10 },
        movement: { walk: Number(r.speed) || 30 },
      },
      skills,
      currency,
      details: {
        biography: { value: bio.join("\n") },
        alignment: r.alignment || "",
      },
    },
    prototypeToken: {
      name: r.character_name || "Unnamed Character",
      actorLink: true,
      disposition: 1,
      sight: { enabled: true },
      texture: { src: r.avatar_url || undefined },
      ring: { enabled: true },
    },
    flags: { "hotd-website-integration": { sourceType: "pc", sourceId: r.id, ddbId: r.ddb_character_id ? String(r.ddb_character_id) : null } },
  };
}

// ── NPC -> dnd5e "npc" actor (narrative; no combat stats) ────────────────────
function dispositionFromStatus(status) {
  const s = String(status || "").toLowerCase();
  if (/ally|friend/.test(s)) return 1;
  if (/enemy|hostile|villain/.test(s)) return -1;
  return 0; // neutral
}

function mapNpcToActor(r) {
  const header = [r.race, r.npc_class, r.location, r.status].filter(Boolean).map(esc).join(" · ");
  const bio = [];
  if (header) bio.push(`<p><em>${header}</em></p>`);
  if (r.description) bio.push(`<p>${esc(r.description).replace(/\n+/g, "</p><p>")}</p>`);
  if (r.dm_notes) bio.push(`<hr><p><em>DM notes:</em> ${esc(r.dm_notes)}</p>`);

  return {
    name: r.name || "Unnamed NPC",
    type: "npc",
    img: r.portrait_url || undefined,
    system: {
      details: {
        biography: { value: bio.join("\n") },
        alignment: r.alignment_tag || "",
        type: { value: "humanoid", subtype: r.race || "" },
        source: { custom: "HotD Website" },
      },
    },
    prototypeToken: {
      name: r.name || "Unnamed NPC",
      actorLink: false,
      disposition: dispositionFromStatus(r.status),
      texture: { src: r.portrait_url || undefined },
      ring: { enabled: true },
    },
    flags: { "hotd-website-integration": { sourceType: "npc", sourceId: r.id } },
  };
}

// ── Monster -> dnd5e "npc" actor (full stat block from the RAG bestiary) ─────
function traitCustom(v) {
  return asArray(v).map((x) => String(x)).filter(Boolean).join("; ");
}

function mapMonsterToActor(r) {
  const scores = (r.ability_scores && typeof r.ability_scores === "object") ? r.ability_scores : {};
  const abilities = {};
  for (const [up, key] of Object.entries(MON_ABIL)) abilities[key] = { value: Number(scores[up]) || 10 };
  for (const sv of asArray(r.saving_throws)) {
    const k = MON_ABIL[String(sv).toUpperCase()];
    if (k) abilities[k].proficiency = 1;
  }

  const movement = {};
  for (const m of asArray(r.speed)) {
    const k = MOVE_KEYS[String(m && m.type || "").toLowerCase()];
    if (k) movement[k] = Number(m.speed) || 0;
  }
  if (!Object.keys(movement).length) movement.walk = 30;

  const senses = {};
  for (const s of asArray(r.senses)) {
    const mm = String(s).match(/(darkvision|blindsight|tremorsense|truesight)\s*(\d+)/i);
    if (mm) senses[mm[1].toLowerCase()] = Number(mm[2]);
  }

  const bio = [];
  if (r.description_text) bio.push(`<p>${esc(r.description_text).replace(/\n+/g, "</p><p>")}</p>`);
  const dmg = [
    ["Resistances", r.damage_resistances], ["Immunities", r.damage_immunities],
    ["Vulnerabilities", r.damage_vulnerabilities], ["Condition Immunities", r.condition_immunities],
  ].filter(([, v]) => asArray(v).length);
  if (dmg.length) bio.push("<p>" + dmg.map(([l, v]) => `<strong>${l}:</strong> ${esc(asArray(v).join(", "))}`).join("<br>") + "</p>");
  if (asArray(r.languages).length) bio.push(`<p><strong>Languages:</strong> ${esc(asArray(r.languages).join(", "))}</p>`);
  if (asArray(r.senses).length) bio.push(`<p><strong>Senses:</strong> ${esc(asArray(r.senses).join(", "))}</p>`);
  if (r.source) bio.push(`<p><em>Source: ${esc(r.source)}${r.source_page ? ` p.${esc(r.source_page)}` : ""}</em></p>`);

  return {
    name: r.name || "Unnamed Monster",
    type: "npc",
    img: r.avatar_url || undefined,
    system: {
      abilities,
      attributes: {
        hp: { value: Number(r.average_hit_points) || 0, max: Number(r.average_hit_points) || 0, formula: String(r.hit_dice || "") },
        ac: { calc: "flat", flat: Number(r.armor_class) || 10 },
        movement,
        senses,
      },
      details: {
        cr: (r.challenge_rating != null) ? Number(r.challenge_rating) : 0,
        alignment: r.alignment || "",
        type: { value: String(r.type || "").toLowerCase(), subtype: asArray(r.sub_types).join(", ") },
        biography: { value: bio.join("\n") },
        source: { custom: r.source || "HotD RAG" },
      },
      traits: {
        size: SIZE_KEYS[String(r.size || "medium").toLowerCase()] || "med",
        dr: { custom: traitCustom(r.damage_resistances) },
        di: { custom: traitCustom(r.damage_immunities) },
        dv: { custom: traitCustom(r.damage_vulnerabilities) },
        ci: { custom: traitCustom(r.condition_immunities) },
      },
    },
    prototypeToken: {
      name: r.name || "Unnamed Monster",
      actorLink: false,
      disposition: -1,
      texture: { src: r.avatar_url || undefined },
      ring: { enabled: true },
    },
    flags: { "hotd-website-integration": { sourceType: "monster", sourceId: String(r.id) } },
  };
}

module.exports = { mapPcToActor, mapNpcToActor, mapMonsterToActor };
