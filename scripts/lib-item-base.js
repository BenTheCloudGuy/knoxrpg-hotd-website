// Shared helper: normalize a magic item name to a "base" key so that
// variants (", +1", ", Cold", " (Brass)") collapse to one image.
const path = require("path");

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^\-|\-$/g, "");
}

// Strip trailing ", <variant>" and parenthetical "(...)" qualifiers.
function baseName(name) {
  return String(name)
    .split(",")[0]
    .replace(/\s*\(.*?\)\s*/g, " ")
    .trim();
}

function baseSlug(name) {
  return slugify(baseName(name));
}

// Single shared store for generated item art, referenced relatively from
// any items/magic-items/<type>/<item>.md via ../images/<base-slug>.png
const GEN_IMAGE_DIR = path.join(process.cwd(), "items", "magic-items", "images");

module.exports = { slugify, baseName, baseSlug, GEN_IMAGE_DIR };
