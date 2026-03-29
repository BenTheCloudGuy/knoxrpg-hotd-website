const path = require("path");

// ── Server Configuration ──────────────────────────────────────
const PORT = parseInt(process.env.PORT || "3000", 10);
const isDevSlot = (process.env.PG_MI_USER || "").includes("/slots/dev");
const MAIN_SITE = isDevSlot ? "https://dev-web.knoxrpg.com" : "https://web.knoxrpg.com";
const STATIC_ROOT = path.join(__dirname, "hotd-campaign");
const STORAGE_ACCOUNT_NAME = process.env.STORAGE_ACCOUNT_NAME || "knoxrpgwebsitestore";
const isAzure = !!(process.env.WEBSITE_INSTANCE_ID || process.env.IDENTITY_ENDPOINT);
const HOTD_CONTENT_DIR = process.env.HOTD_CONTENT_DIR || "";
const KEY_VAULT_NAME = process.env.KEY_VAULT_NAME || "knoxrpg-website-kv";
const KEY_VAULT_URL = `https://${KEY_VAULT_NAME}.vault.azure.net`;
const OPENAI_KV_SECRET_NAME = process.env.OPENAI_KV_SECRET_NAME || "openai-api-key";

// ── Harptos Calendar Data ─────────────────────────────────────
const HARPTOS_MONTHS = [
  { idx: 1, name: "Hammer", nickname: "Deepwinter", weather: "Bitter cold, heavy snow, howling blizzards", description: "The first month. Biting, numbing cold grips the land." },
  { idx: 2, name: "Alturiak", nickname: "The Claw of Winter", weather: "Freezing winds, ice storms, deep snowdrifts", description: "Named for the claws of cold that rake the land." },
  { idx: 3, name: "Ches", nickname: "The Claw of the Sunsets", weather: "Thawing begins, cold rains, muddy roads", description: "Spring approaches; sunsets grow longer and more vivid." },
  { idx: 4, name: "Tarsakh", nickname: "The Claw of the Storms", weather: "Thunderstorms, strong winds, spring flooding", description: "Storms rage as winter fights its retreat." },
  { idx: 5, name: "Mirtul", nickname: "The Melting", weather: "Warm rains, mild days, last frost danger", description: "The world blooms. Rivers swell with snowmelt." },
  { idx: 6, name: "Kythorn", nickname: "The Time of Flowers", weather: "Warm, sunny, gentle breezes", description: "Flowers carpet the fields; the land is lush and green." },
  { idx: 7, name: "Flamerule", nickname: "Summertide", weather: "Hot, humid, occasional thunderstorms", description: "The peak of summer's heat. Long, sweltering days." },
  { idx: 8, name: "Eleasis", nickname: "Highsun", weather: "Hot, dry, clear skies", description: "The sun blazes at its zenith. Droughts may threaten." },
  { idx: 9, name: "Eleint", nickname: "The Fading", weather: "Cooling, misty mornings, early frosts", description: "Leaves turn; the world begins to fade toward winter." },
  { idx: 10, name: "Marpenoth", nickname: "Leaffall", weather: "Brisk, windy, colorful foliage", description: "Leaves fall in golden drifts. Harvest festivals abound." },
  { idx: 11, name: "Uktar", nickname: "The Rotting", weather: "Cold rains, fog, first snows", description: "Decay sets in. The dead are honored this month." },
  { idx: 12, name: "Nightal", nickname: "The Drawing Down", weather: "Heavy snow, short days, long nights", description: "The year draws to a close in darkness and cold." },
];

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Navigation Items ──────────────────────────────────────────
const NAV_ITEMS = [
  { label: "Home", href: "/" },
  {
    label: "Game Info", dropdown: [
      { label: "Calendar", href: "/calendar" },
      { label: "History", href: "/history" },
      { label: "Art & Images", href: "/art" },
      { label: "House Rules", href: "/house-rules" },
      { label: "FoundryVTT", href: "https://hotd-foundry.knoxrpg.com", external: true },
    ]
  },
  {
    label: "Campaign", dropdown: [
      { label: "Characters", href: "/characters" },
      { label: "Maps", href: "/maps" },
      { label: "NPCs", href: "/npcs" },
      { label: "Sessions", href: "/sessions" },
      { label: "Artifacts", href: "/artifacts" },
      { label: "Handouts", href: "/handouts" },
      { label: "Journal", href: "/journal" },
    ]
  },
];

const NAV_RIGHT_ITEMS = [
  { label: "DM AI", href: "/dungeon-master", icon: "&#129302;" },
  { label: "KnoxRPG", href: MAIN_SITE, external: true, icon: "&#127760;" },
];

// ── Campaign Search Index ─────────────────────────────────────
const campaignPages = [
  { title: "Home", href: "/", category: "Page", body: "Halls of the Damned campaign hub landing page dashboard" },
  { title: "House Rules", href: "/house-rules", category: "Page", body: "Campaign house rules custom rules reference" },
  { title: "Calendar", href: "/calendar", category: "Campaign", body: "Calendar of Harptos game world calendar tracking dates and events" },
  { title: "Maps", href: "/maps", category: "Campaign", body: "Acquired maps from campaign adventures" },
  { title: "NPCs", href: "/npcs", category: "Campaign", body: "Notable NPCs allies enemies persons of interest encountered" },
  { title: "Sessions", href: "/sessions", category: "Campaign", body: "Session logs summaries of each game session" },
  { title: "History", href: "/history", category: "Campaign", body: "Historical breakdown of campaign world key events lore" },
  { title: "Artifacts", href: "/artifacts", category: "Campaign", body: "Legendary items artifacts encountered or possessed" },
  { title: "Handouts", href: "/handouts", category: "Campaign", body: "Campaign handouts and artifact media for players" },
  { title: "Adventure Journal", href: "/journal", category: "Campaign", body: "Shared adventure journal notes session log real-time collaborative" },
  { title: "DM AI", href: "/dungeon-master", category: "Tool", body: "AI chatbot for D&D rules spells monsters items classes" },
];

module.exports = {
  PORT,
  MAIN_SITE,
  STATIC_ROOT,
  STORAGE_ACCOUNT_NAME,
  HOTD_CONTENT_DIR,
  isAzure,
  KEY_VAULT_NAME,
  KEY_VAULT_URL,
  OPENAI_KV_SECRET_NAME,
  HARPTOS_MONTHS,
  ordinal,
  NAV_ITEMS,
  NAV_RIGHT_ITEMS,
  campaignPages,
};
