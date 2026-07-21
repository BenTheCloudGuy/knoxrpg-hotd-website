// ══════════════════════════════════════════════════════════════
// ── HOMEBREW CATEGORY SCHEMAS ─────────────────────────────────
// Drives the DDB Authoring forms (§4), DM-AI generation (§5), the
// RAG embed text, and the local-DB mirror (§6). One entry per DDB
// homebrew category. `magic-item` is the fully-mapped reference;
// the others carry sensible field sets (author + Save + Embed work
// for all; DDB push is magic-item-only until per-category recon).
//
// Field types: text | textarea | number | checkbox | select(options)
// ══════════════════════════════════════════════════════════════

const RARITY_OPTS = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact", "Varies", "Unknown"];
const MI_TYPE_OPTS = ["Wondrous Item", "Ring", "Rod", "Potion", "Scroll", "Staff", "Wand"];
const BASE_ITEM_TYPE_OPTS = ["Item", "Armor", "Weapon"];
const ARMOR_DEX_OPTS = ["Full", "Max 2", "None"];
const ARMOR_STEALTH_OPTS = ["None", "Disadvantage"];
const SCHOOLS = ["Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"];
const SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];
const MONSTER_TYPES = ["Aberration", "Beast", "Celestial", "Construct", "Dragon", "Elemental", "Fey", "Fiend", "Giant", "Humanoid", "Monstrosity", "Ooze", "Plant", "Undead"];
const CLASS_OPTS = ["Artificer", "Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"];

const CATEGORIES = {
  "magic-item": {
    label: "Magic Item",
    contentTable: "magic_items",
    sourceType: "ddb_magic_item",
    pushable: true,
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "version", label: "Version", type: "text" },
      { key: "rarity", label: "Rarity", type: "select", options: RARITY_OPTS },
      { key: "base_item_type", label: "Base Item Type", type: "select", options: BASE_ITEM_TYPE_OPTS },
      { key: "magic_item_type", label: "Magic Item Type", type: "select", options: MI_TYPE_OPTS },
      { key: "base_armor", label: "Base Armor (DDB id)", type: "text" },
      { key: "dexterity_modifier", label: "Armor Dex Modifier", type: "select", options: ARMOR_DEX_OPTS },
      { key: "strength_requirement", label: "Armor Strength Requirement", type: "text" },
      { key: "stealth_check", label: "Armor Stealth Check", type: "select", options: ARMOR_STEALTH_OPTS },
      { key: "base_weapon", label: "Base Weapon (DDB id)", type: "text" },
      { key: "requires_attunement", label: "Requires Attunement", type: "checkbox" },
      { key: "attunement_description", label: "Attunement (by whom)", type: "text" },
      { key: "weight", label: "Weight (lb)", type: "text" },
      { key: "description", label: "Description", type: "textarea", required: true },
    ],
    generate: {
      jsonKeys: ["name", "version", "rarity", "base_item_type", "magic_item_type", "base_armor", "dexterity_modifier", "strength_requirement", "stealth_check", "base_weapon", "requires_attunement", "attunement_description", "weight", "description"],
      system: "You are a D&D 5e (2024) magic item designer. Given a prompt, return ONE balanced homebrew magic item as strict JSON with keys: name (string), version (string, usually '1'), rarity (one of Common/Uncommon/Rare/Very Rare/Legendary/Artifact/Varies/Unknown), base_item_type (one of Item/Armor/Weapon), magic_item_type (one of Wondrous Item/Ring/Rod/Potion/Scroll/Staff/Wand), base_armor (string DDB id or ''), dexterity_modifier (one of Full/Max 2/None or ''), strength_requirement (string number or ''), stealth_check (one of None/Disadvantage or ''), base_weapon (string DDB id or ''), requires_attunement (boolean), attunement_description (string, e.g. 'by a spellcaster' or ''), weight (string, e.g. '1' or ''), description (string, full rules text with any bonuses, charges, activation). If base_item_type is Item, leave base_armor/base_weapon and armor-only fields empty. Keep power appropriate to rarity. No markdown, JSON only.",
    },
  },

  spell: {
    label: "Spell",
    contentTable: "spells",
    sourceType: "ddb_spell",
    pushable: true,
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "level", label: "Level (0=cantrip)", type: "number" },
      { key: "school", label: "School", type: "select", options: SCHOOLS },
      { key: "casting_time", label: "Casting Time", type: "text" },
      { key: "range", label: "Range", type: "text" },
      { key: "components", label: "Components", type: "text" },
      { key: "duration", label: "Duration", type: "text" },
      { key: "requires_concentration", label: "Concentration", type: "checkbox" },
      { key: "description", label: "Description", type: "textarea", required: true },
    ],
    generate: {
      jsonKeys: ["name", "level", "school", "casting_time", "range", "components", "duration", "requires_concentration", "description"],
      system: "You are a D&D 5e (2024) spell designer. Return ONE balanced homebrew spell as strict JSON: name, level (0-9), school (one of Abjuration/Conjuration/Divination/Enchantment/Evocation/Illusion/Necromancy/Transmutation), casting_time, range, components, duration, requires_concentration (boolean), description (full rules incl. higher-level scaling). Balance to level. JSON only.",
    },
  },

  monster: {
    label: "Monster",
    contentTable: "monsters",
    sourceType: "ddb_monster",
    pushable: true,
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "size", label: "Size", type: "select", options: SIZES },
      { key: "type", label: "Creature Type", type: "select", options: MONSTER_TYPES },
      { key: "alignment", label: "Alignment", type: "text" },
      { key: "challenge_rating", label: "CR", type: "text" },
      { key: "description", label: "Stat Block + Lore", type: "textarea", required: true },
    ],
    generate: {
      jsonKeys: ["name", "size", "type", "alignment", "challenge_rating", "description"],
      system: "You are a D&D 5e (2024) monster designer. Return ONE balanced homebrew monster as strict JSON: name, size (Tiny/Small/Medium/Large/Huge/Gargantuan), type (e.g. 'aberration'), alignment, challenge_rating (e.g. '5'), description (a COMPLETE 2024-format stat block: AC, HP + hit dice, Speed, ability scores with mods, saves/skills, senses, languages, traits, actions, bonus actions, reactions, legendary actions if any, then a short lore paragraph). Match offense/defense to the CR. JSON only.",
    },
  },

  feat: {
    label: "Feat",
    contentTable: "feats",
    sourceType: "ddb_feat",
    pushable: true,
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "prerequisite", label: "Prerequisite", type: "text" },
      { key: "description", label: "Description", type: "textarea", required: true },
    ],
    generate: {
      jsonKeys: ["name", "prerequisite", "description"],
      system: "You are a D&D 5e (2024) feat designer. Return ONE balanced homebrew feat as strict JSON: name, prerequisite (string or ''), description (bulleted benefits; may include a +1 ASI where appropriate). Keep it in line with official feat power. JSON only.",
    },
  },

  species: {
    label: "Species",
    contentTable: null, // races table columns differ; embed-only mirror for now
    sourceType: "ddb_race",
    pushable: true,
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "size", label: "Size", type: "select", options: SIZES },
      { key: "speed", label: "Speed", type: "text" },
      { key: "description", label: "Traits + Lore", type: "textarea", required: true },
    ],
    generate: {
      jsonKeys: ["name", "size", "speed", "description"],
      system: "You are a D&D 5e (2024) species (race) designer. Return ONE balanced homebrew species as strict JSON: name, size, speed (e.g. '30 feet'), description (all racial traits in 2024 format plus short lore). Keep trait budget in line with official 2024 species. JSON only.",
    },
  },

  subclass: {
    label: "Sub-Class",
    contentTable: null, // classes table; embed-only mirror for now
    sourceType: "ddb_class",
    pushable: true,
    fields: [
      { key: "name", label: "Subclass Name", type: "text", required: true },
      { key: "parent_class", label: "Parent Class", type: "select", options: CLASS_OPTS, required: true },
      { key: "description", label: "Features by Level + Lore", type: "textarea", required: true },
    ],
    generate: {
      jsonKeys: ["name", "parent_class", "description"],
      system: "You are a D&D 5e (2024) subclass designer. Return ONE balanced homebrew subclass as strict JSON: name, parent_class (e.g. 'Fighter'), description (subclass features listed by the class's subclass levels, 2024 format, plus a short theme paragraph). Balance to the parent class. JSON only.",
    },
  },

  background: {
    label: "Background",
    contentTable: "backgrounds",
    sourceType: "ddb_background",
    pushable: true,
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "feature_name", label: "Feature", type: "text" },
      { key: "description", label: "Proficiencies, Feat, Feature + Lore", type: "textarea", required: true },
    ],
    generate: {
      jsonKeys: ["name", "feature_name", "description"],
      system: "You are a D&D 5e (2024) background designer. Return ONE balanced homebrew background as strict JSON: name, feature_name (string), description (2024-format: ability scores, a feat, skill/tool proficiencies, equipment, and the background feature, plus short lore). JSON only.",
    },
  },
};

const ORDER = ["magic-item", "feat", "spell", "monster", "species", "subclass", "background"];

function getCategory(cat) { return CATEGORIES[cat] || null; }
function categoryList() { return ORDER.map((k) => ({ key: k, label: CATEGORIES[k].label, pushable: !!CATEGORIES[k].pushable })); }

// Compose the RAG/description text for any category from its fields.
function composeText(cat, fields) {
  const def = CATEGORIES[cat]; if (!def) return "";
  const f = fields || {};
  const head = [];
  head.push(`# ${f.name || "Homebrew " + def.label}`);
  if (cat === "magic-item") {
    const t = f.base_item_type || f.magic_item_type || f.type || "";
    head.push(`${f.rarity || ""} ${t}${f.requires_attunement ? " (requires attunement" + (f.attunement_description ? " " + f.attunement_description : "") + ")" : ""}`.trim());
  }
  else if (cat === "spell") head.push(`${(f.level === 0 || f.level === "0") ? "Cantrip" : "Level " + (f.level || "?")} ${f.school || ""} spell`.trim());
  else if (cat === "monster") head.push(`${f.size || ""} ${f.type || ""}, ${f.alignment || "unaligned"} (CR ${f.challenge_rating || "?"})`.trim());
  else if (cat === "feat" && f.prerequisite) head.push(`Prerequisite: ${f.prerequisite}`);
  else if (cat === "species") head.push(`${f.size || ""}${f.speed ? ", Speed " + f.speed : ""}`.trim());
  else if (cat === "subclass") head.push(`${f.parent_class || ""} subclass`.trim());
  else if (cat === "background" && f.feature_name) head.push(`Feature: ${f.feature_name}`);
  head.push("Source: Homebrew (HotD)");
  return `${head.filter(Boolean).join("\n")}\n\n${f.description || ""}`.trim();
}

module.exports = { CATEGORIES, ORDER, getCategory, categoryList, composeText };
