const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'src', 'hotd-campaign', 'data', 'npcs.json');
const npcs = JSON.parse(fs.readFileSync(FILE, 'utf8'));

// --- Portrait URL updates ---
// Map NPC names to new portrait filenames (only those that need updating)
const portraitUpdates = {
  // Previously empty -> new generated images (from earlier sessions)
  'Madam Eva': '/images/madam-eva.png',
  'Kasimir Velikov': '/images/kasimir-velikov.png',
  'The Abbot': '/images/the-abbot.png',
  'Mistress Clarissa Allyson': '/images/clarissa-allyson.png',
  'Brom Martikov': '/images/brom-martikov.png',
  'Arabelle Vanduva': '/images/arabelle-vanduva.png',
  'Lord Edmund Williams': '/images/lord-edmund-williams.png',
  'LeJean': '/images/lejean.png',
  'Captain Reaven "Emerald Eyes"': '/images/captain-reaven.png',
  'Kolyan Indirovich': '/images/kolyan-indirovich.png',
  'Vasilka': '/images/vasilka.png',

  // Previously empty -> new batch-generated images
  'Bildrath Cantemir': '/images/bildrath-cantemir.png',
  'Parriwimple': '/images/parriwimple.png',
  'Sarkov E\'Tressa': '/images/sarkov-etressa.png',
  'Luna E\'Tressa': '/images/luna-etressa.png',
  'Magda E\'Tressa': '/images/magda-etressa.png',
  'Ilyana Kostova': '/images/ilyana-kostova.png',
  'Klara Vorovich': '/images/klara-vorovich.png',
  'Bella Wormwiggle': '/images/bella-wormwiggle.png',
  'Offalia Wormwiggle': '/images/offalia-wormwiggle.png',
  'Yuri Skander': '/images/yuri-skander.png',
  'Iskander': '/images/iskander.png',
  'Askander': '/images/askander.png',
  'Uskander': '/images/uskander.png',
  'Eskander': '/images/eskander.png',
  'Oskander': '/images/oskander.png',
  'Nikolai Wachter Jr.': '/images/nikolai-wachter-jr.png',
  'Karl Wachter': '/images/karl-wachter.png',
  'Urwin Martikov': '/images/urwin-martikov.png',
  'Danika Dorakova Martikov': '/images/danika-martikov.png',
  'Adrian Martikov': '/images/adrian-martikov.png',
  'Stefania Martikov': '/images/stefania-martikov.png',
  'Elvir Martikov': '/images/elvir-martikov.png',
  'Bray Martikov': '/images/bray-martikov.png',
  'Kiara Toranescu': '/images/kiara-toranescu.png',
  'Duesius Toranescu': '/images/duesius-toranescu.png',
  'Jiro Toranescu': '/images/jiro-toranescu.png',
  'Ekrol Toranescu': '/images/ekrol-toranescu.png',
  'Anna Krezkova': '/images/anna-krezkova.png',

  // Old format -> new generated png (replacing book art or fixing filenames)
  'Strahd Von Zarovich': '/images/strahd-von-zarovich.png',
  'Father Alric Vendril': '/images/father-alric.png',
  'Velinka d\'Avenir': '/images/velinka-davenir.png',
};

// --- Visible NPCs (players have directly interacted with) ---
const visibleNpcs = new Set([
  'Strahd Von Zarovich',           // presence at funeral, letters, agents
  'Ireena Kolyana',                // Session 12+
  'Ismark Kolyanovich',            // Session 10+
  'Madam Eva',                     // Session 14
  'Rudolph Van Richten',           // Session 19+
  'Ezmerelda d\'Avenir',          // Session 19+
  'Kasimir Velikov',               // Session 25+
  'Baron Vargas Vallakovich',      // Session 19+
  'Lady Fiona Wachter',            // Session 25+
  'Izek Strazni',                  // Vallaki enforcer encounters
  'Father Donavich',               // Session 10+
  'Doru',                          // Session 10+
  'Morgantha Wormwiggle',          // Session 12 (pie lady)
  'Vladimir Horngaard',            // Session 22-23
  'Sir Godfrey Gwilym',            // Session 22-23
  'Emil Toranescu',                // Session 20 (Wizard Tower fight)
  'Baron Dmitri Krezkov',          // Session 22-23
  'The Abbot',                     // Session 22-23
  'Luvash Vanduva',                // Session 25+
  'Mad Mary Strazni',              // Session 12
  'Kaelin Stormraven',             // Session 3-4 (killed)
  'Seraphine Stormraven',          // Session 15-16 (killed)
  'Elandra Stormraven',            // Session 21 (killed)
  'Mistress Clarissa Allyson',     // Session 7, 24
  'Brom Martikov',                 // Session 19+
  'Arabelle Vanduva',              // Session 14, 17, 25
  'Lord Geoffrey Frostmantle',     // Session 2
  'Prince Ian Frostmantle',        // Session 2
  'Lady Elysra Nivariel Williams', // Session 7, 24
  'LeJean',                        // Session 7
  'Father Alric Vendril',          // Session 4 (killed)
  'Velinka d\'Avenir',             // Session 9
  'Garrick Ironbrow',              // Session 1-2
  'Gorak Broken Tusk',             // Session 1-2
  'Selene Brightwater',            // Session 1-2
  'Captain Reaven "Emerald Eyes"', // Session 1-2
  'Ser Brennor Cale',              // Session 4-5
  'Kolyan Indirovich',             // Session 12 (funeral)
  'Bildrath Cantemir',             // Session 12
  'Parriwimple',                   // Session 12
  'Sarkov E\'Tressa',              // Session 10
  'Luna E\'Tressa',                // Session 10
  'Magda E\'Tressa',               // Session 10
  'Ilyana Kostova',                // Session 10
  'Klara Vorovich',                // Session 10
  'Offalia Wormwiggle',            // Session 17-18
  'Iskander',                      // Session 19
  'Nikolai Wachter Jr.',           // Session 25
  'Karl Wachter',                  // Session 25 (killed)
  'Urwin Martikov',                // Session 19+
  'Danika Dorakova Martikov',      // Session 19
  'Adrian Martikov',               // Session 17 (telepathic contact)
  'Bray Martikov',                 // Session 27-28
  'Kiara Toranescu',               // Session 21
  'Duesius Toranescu',             // Session 21
  'Jiro Toranescu',                // Session 21
  'Anna Krezkova',                 // Session 22-23, 25
  'Vasilka',                       // Session 22-23, 27-28
]);

// Apply updates
let portraitCount = 0;
let visibleCount = 0;

npcs.forEach(npc => {
  // Update portrait_url
  if (portraitUpdates[npc.name] !== undefined) {
    const oldUrl = npc.portrait_url;
    npc.portrait_url = portraitUpdates[npc.name];
    console.log(`[PORTRAIT] ${npc.name}: "${oldUrl}" -> "${npc.portrait_url}"`);
    portraitCount++;
  }

  // Set visible
  if (visibleNpcs.has(npc.name)) {
    if (!npc.visible) {
      npc.visible = true;
      console.log(`[VISIBLE] ${npc.name}: set to true`);
      visibleCount++;
    }
  }
});

// Write back
fs.writeFileSync(FILE, JSON.stringify(npcs, null, 2) + '\n', 'utf8');
console.log(`\n=== Done: ${portraitCount} portrait URLs updated, ${visibleCount} NPCs set visible ===`);
