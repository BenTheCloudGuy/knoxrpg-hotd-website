// Export all item content from the database into individual markdown files.
// Files are written under /items/ in type subdirectories:
//   Magic items:    items/magic-items/<name>.md
//   Non-magical:    items/treasure/<name>.md
//   Weapons:        items/weapons/<name>.md
//   Armor:          items/armor/<name>.md
// Each file has YAML front-matter followed by the available details.

const fs = require("fs");
const path = require("path");
const { pgPool } = require("../src/db/pool");
const { baseSlug, GEN_IMAGE_DIR } = require("./lib-item-base");

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^\-|\-$/g, "");
}

function yamlVal(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/"/g, '\\"');
}

const outDir = path.join(process.cwd(), "items");

function write(name, subdir, frontLines, bodyLines) {
  const dir = path.join(outDir, subdir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${slugify(name)}.md`);
  const frontMatter = ["---", ...frontLines, "---"].join("\n");
  const body = bodyLines.filter((l) => l !== null && l !== undefined && l !== "").join("\n\n");
  fs.writeFileSync(filePath, `${frontMatter}\n\n# ${name}\n\n${body}\n`, "utf8");
}

const MAGIC_TYPE_DIRS = {
  Weapon: "weapons",
  WondrousItem: "wondrous-items",
  Armor: "armor",
  Potion: "potions",
  Ring: "rings",
  Staff: "staffs",
  Scroll: "scrolls",
  Rod: "rods",
  Wand: "wands",
};

async function exportMagicItems() {
  const res = await pgPool.query(
    `SELECT name, rarity, type, requires_attunement, description_text, source, source_page, avatar_url FROM magic_items`,
  );
  // Map base-slug -> a remote avatar_url so variants inherit a sibling's image.
  const baseRemote = new Map();
  for (const r of res.rows) {
    const url = r.avatar_url && r.avatar_url.trim();
    if (url) {
      const bs = baseSlug(r.name);
      if (!baseRemote.has(bs)) baseRemote.set(bs, url);
    }
  }
  for (const i of res.rows) {
    const typeDir = MAGIC_TYPE_DIRS[i.type] || "other";
    const bs = baseSlug(i.name);
    let img = "";
    let imgRef = "";
    const ownUrl = i.avatar_url && i.avatar_url.trim();
    if (ownUrl) {
      img = ownUrl;
      imgRef = ownUrl;
    } else if (baseRemote.has(bs)) {
      img = baseRemote.get(bs);
      imgRef = img;
    } else if (fs.existsSync(path.join(GEN_IMAGE_DIR, `${bs}.png`))) {
      // Locally generated art lives in items/magic-items/images/.
      // From items/magic-items/<type>/<item>.md that's ../images/<bs>.png
      img = `../images/${bs}.png`;
      imgRef = img;
    }
    const front = [
      `title: "${yamlVal(i.name)}"`,
      `category: Magic Item`,
      `rarity: ${yamlVal(i.rarity)}`,
      `type: ${yamlVal(i.type)}`,
      `requires_attunement: ${i.requires_attunement ? "Yes" : "No"}`,
      `source: ${yamlVal(i.source)}${i.source_page ? ", pg. " + i.source_page : ""}`,
    ];
    if (img) front.push(`image: ${img}`);
    const body = [];
    if (imgRef) body.push(`![${i.name.replace(/[\[\]]/g, "")}](${imgRef})`);
    body.push(i.description_text || "");
    write(i.name, path.join("magic-items", typeDir), front, body);
  }
  return res.rows.length;
}

async function exportItems() {
  const res = await pgPool.query(
    `SELECT name, category, type, weight, cost, amount, storage, source FROM items`,
  );
  for (const i of res.rows) {
    const details = [];
    if (i.category) details.push(`- **Category:** ${i.category}`);
    if (i.type) details.push(`- **Type:** ${i.type}`);
    if (i.cost) details.push(`- **Cost:** ${i.cost}`);
    if (i.weight) details.push(`- **Weight:** ${i.weight}`);
    if (i.amount) details.push(`- **Amount:** ${i.amount}`);
    if (i.storage) details.push(`- **Storage:** ${i.storage}`);
    if (i.source) details.push(`- **Source:** ${i.source}`);
    write(
      i.name,
      "treasure",
      [
        `title: "${yamlVal(i.name)}"`,
        `category: ${yamlVal(i.category) || "Adventuring Gear"}`,
        `type: ${yamlVal(i.type)}`,
        `cost: ${yamlVal(i.cost)}`,
        `weight: ${yamlVal(i.weight)}`,
        `source: ${yamlVal(i.source)}`,
      ],
      [details.join("\n")],
    );
  }
  return res.rows.length;
}

async function exportWeapons() {
  const res = await pgPool.query(
    `SELECT name, category, damage, properties, mastery, weight, cost, source FROM weapons`,
  );
  for (const i of res.rows) {
    const details = [];
    if (i.category) details.push(`- **Category:** ${i.category}`);
    if (i.damage) details.push(`- **Damage:** ${i.damage}`);
    if (i.properties) details.push(`- **Properties:** ${i.properties}`);
    if (i.mastery) details.push(`- **Mastery:** ${i.mastery}`);
    if (i.cost) details.push(`- **Cost:** ${i.cost}`);
    if (i.weight) details.push(`- **Weight:** ${i.weight}`);
    if (i.source) details.push(`- **Source:** ${i.source}`);
    write(
      i.name,
      "weapons",
      [
        `title: "${yamlVal(i.name)}"`,
        `category: Weapon`,
        `weapon_category: ${yamlVal(i.category)}`,
        `damage: ${yamlVal(i.damage)}`,
        `cost: ${yamlVal(i.cost)}`,
        `weight: ${yamlVal(i.weight)}`,
        `source: ${yamlVal(i.source)}`,
      ],
      [details.join("\n")],
    );
  }
  return res.rows.length;
}

async function exportArmor() {
  const res = await pgPool.query(
    `SELECT name, armor_category, armor_class, strength, stealth, weight, cost, source FROM armor`,
  );
  for (const i of res.rows) {
    const details = [];
    if (i.armor_category) details.push(`- **Category:** ${i.armor_category}`);
    if (i.armor_class) details.push(`- **Armor Class:** ${i.armor_class}`);
    if (i.strength) details.push(`- **Strength:** ${i.strength}`);
    if (i.stealth) details.push(`- **Stealth:** ${i.stealth}`);
    if (i.cost) details.push(`- **Cost:** ${i.cost}`);
    if (i.weight) details.push(`- **Weight:** ${i.weight}`);
    if (i.source) details.push(`- **Source:** ${i.source}`);
    write(
      i.name,
      "armor",
      [
        `title: "${yamlVal(i.name)}"`,
        `category: Armor`,
        `armor_category: ${yamlVal(i.armor_category)}`,
        `armor_class: ${yamlVal(i.armor_class)}`,
        `cost: ${yamlVal(i.cost)}`,
        `weight: ${yamlVal(i.weight)}`,
        `source: ${yamlVal(i.source)}`,
      ],
      [details.join("\n")],
    );
  }
  return res.rows.length;
}

async function main() {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const magic = await exportMagicItems();
  const items = await exportItems();
  const weapons = await exportWeapons();
  const armor = await exportArmor();
  console.log(`Exported to ${outDir}:`);
  console.log(`  ${magic} magic items`);
  console.log(`  ${items} non-magical items`);
  console.log(`  ${weapons} weapons`);
  console.log(`  ${armor} armor`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
