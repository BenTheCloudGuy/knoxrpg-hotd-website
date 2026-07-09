const path = require("path");

// ── Server Configuration ──────────────────────────────────────
const PORT = parseInt(process.env.PORT || "3000", 10);
const isDevSlot = (process.env.PG_MI_USER || "").includes("/slots/dev");
const MAIN_SITE = isDevSlot ? "https://dev-web.knoxrpg.com" : "https://web.knoxrpg.com";
const STATIC_ROOT = path.join(__dirname, "hotd-campaign");
const STORAGE_ACCOUNT_NAME = process.env.STORAGE_ACCOUNT_NAME || "cloudgeekcusgaming01";
// Historically derived from Arc managed identity; now signals production
// hosting so auth cookies can scope to the public domain.
const isAzure = process.env.NODE_ENV === "production";
const HOTD_CONTENT_DIR = process.env.HOTD_CONTENT_DIR || "";
// Writable overlay for user-uploaded assets. When set, the server serves
// `/hotd-content/*` from this directory first and falls back to
// HOTD_CONTENT_DIR (which is mounted read-only from the NAS in prod).
// All uploads from `uploadBlobToStorage` land here.
const HOTD_UPLOADS_DIR = process.env.HOTD_UPLOADS_DIR || "";

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
  {
    label: "Home", dropdown: [
      { label: "Dashboard", href: "/" },
      { label: "FoundryVTT", href: "https://hotd-foundry.knoxrpg.com", external: true },
      { label: "Account", href: "/account", sessionAware: true },
    ]
  },
  {
    label: "Game Info", dropdown: [
      { label: "Calendar", href: "/calendar" },
      { label: "History", href: "/history" },
      { label: "Realms", href: "/realms" },
      { label: "Maps", href: "/maps" },
      { label: "Notable Groups", href: "/groups" },
      { label: "Art & Images", href: "/art" },
      { label: "House Rules", href: "/house-rules", submenu: [
        { label: "Overcasting", href: "/overcasting" },
        { label: "Circle Magic", href: "/circle-magic" },
      ]},
      { label: "DM AI", href: "/dungeon-master" },
    ]
  },
  {
    label: "Campaign", dropdown: [
      { label: "Characters", href: "/characters" },
      { label: "NPCs", href: "/npcs" },
      { label: "Sessions", href: "/sessions" },
      { label: "Artifacts", href: "/artifacts" },
      { label: "Handouts", href: "/handouts" },
      { label: "Search", href: "/search" },
    ]
  },
  {
    label: "\u2699 DM Command Center", adminOnly: true, dropdown: [
      { header: "AI Tools" },
      { label: "DM Chat", href: "/dm-admin#chat" },
      { label: "Image Studio", href: "/dm-admin#images" },
      { header: "Campaign" },
      { label: "Notebook", href: "/dm-admin#notes" },
      { label: "Player Characters", href: "/characters/admin" },
      { label: "Map Markers", href: "/map/admin" },
      { label: "NPCs", href: "/dm-admin#npcs" },
      { label: "Calendar Admin", href: "/calendar/admin" },
      { label: "Artifacts Admin", href: "/artifacts/admin" },
      { label: "Item Cards", href: "/dm-admin#cards" },
      { label: "Handouts Admin", href: "/handouts/admin" },
      { header: "DDB" },
      { label: "DDB Content", href: "/dm-admin#ddb" },
      { header: "Config" },
      { label: "AI Config", href: "/dm-admin#ai" },
      { label: "Search", href: "/dm-admin#search" },
      { label: "Campaign Data", href: "/dm-admin#campaign" },
      { label: "Bulk Upload", href: "/bulk-upload/admin" },
      { label: "Users", href: "/dm-admin#users" },
    ]
  },
];

const NAV_RIGHT_ITEMS = [];

// ── Campaign Search Index ─────────────────────────────────────
const campaignPages = [
  { title: "Home", href: "/", category: "Page", body: "Halls of the Damned campaign hub landing page dashboard" },
  { title: "House Rules", href: "/house-rules", category: "Page", body: "Campaign house rules custom rules reference" },
  { title: "Overcasting", href: "/overcasting", category: "Page", body: "Overcasting house rules pushing beyond spell slot limits hit dice constitution" },
  { title: "Circle Magic", href: "/circle-magic", category: "Page", body: "Circle magic cooperative spellcasting circle enhancements empower heighten widen" },
  { title: "Calendar", href: "/calendar", category: "Campaign", body: "Calendar of Harptos game world calendar tracking dates and events" },
  { title: "Maps", href: "/maps", category: "Campaign", body: "Acquired maps from campaign adventures" },
  { title: "NPCs", href: "/npcs", category: "Campaign", body: "Notable NPCs allies enemies persons of interest encountered" },
  { title: "Sessions", href: "/sessions", category: "Campaign", body: "Session logs summaries of each game session" },
  { title: "History", href: "/history", category: "Campaign", body: "Historical breakdown of campaign world key events lore" },
  { title: "Artifacts", href: "/artifacts", category: "Campaign", body: "Legendary items artifacts encountered or possessed" },
  { title: "Handouts", href: "/handouts", category: "Campaign", body: "Campaign handouts and artifact media for players" },
  { title: "Notable Groups", href: "/groups", category: "Campaign", body: "Notable groups organizations factions encountered during the campaign" },
  { title: "Realms", href: "/realms", category: "Game Info", body: "Realms of Faerun regions nations kingdoms lands geography Forgotten Realms campaign world" },
  { title: "DM AI", href: "/dungeon-master", category: "Tool", body: "AI chatbot for D&D rules spells monsters items classes" },
];

module.exports = {
  PORT,
  MAIN_SITE,
  STATIC_ROOT,
  STORAGE_ACCOUNT_NAME,
  HOTD_CONTENT_DIR,
  HOTD_UPLOADS_DIR,
  isAzure,
  HARPTOS_MONTHS,
  ordinal,
  NAV_ITEMS,
  NAV_RIGHT_ITEMS,
  campaignPages,
};
