#!/usr/bin/env node
// Rewrites all 45 realm markdown files using FRHoF parsed content as primary source
// Pairs images from Chapter 2 of FRHoF with each realm
// Adds campaign DM Notes for campaign-relevant realms

const fs = require('fs');
const path = require('path');

const REALMS_DIR = path.join(__dirname, '..', 'src', 'hotd-campaign', 'data', 'realms');
const PARSED_JSON = path.join(__dirname, '..', 'tmp', 'frhof-raw', 'realms-parsed.json');
const HTML_FILE = path.join(__dirname, '..', 'tmp', 'frhof-raw', 'guide-to-realms-cookie.html');

const parsed = JSON.parse(fs.readFileSync(PARSED_JSON, 'utf8'));
const html = fs.readFileSync(HTML_FILE, 'utf8');

// Extract Dalelands and Moonsea from HTML since parser missed them
function extractHtmlSection(startId, endId) {
  const start = html.indexOf(`id="${startId}"`);
  const end = html.indexOf(`id="${endId}"`);
  if (start === -1 || end === -1) return '';
  const section = html.substring(start, end);
  return section.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Clean parsed text - remove HTML artifacts, image captions, map labels
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\s*Map:.*?View Player Version\s*/gs, '\n')
    .replace(/\s*Map\s+\d+\.\d+:.*?View Player Version\s*/gs, '\n')
    .replace(/\s*Mike Schley\s*/g, '\n')
    .replace(/\s*View Player Version\s*/g, '\n')
    // Remove image caption blocks (Artist Name\n pattern)
    .replace(/\n\s*[A-Z][a-z]+ [A-Z]'?[A-Za-z]+\s*\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Convert FRHoF text to markdown format
function frhofToMarkdown(text, realmTitle) {
  if (!text) return '';
  let clean = cleanText(text);

  // Remove the leading header (e.g. "####   Aglarond")
  clean = clean.replace(/^#{1,6}\s+.*?\n+/m, '');
  // Remove overview box HTML remnants
  clean = clean.replace(/###?\s+.*?Overview[\s\S]*?Threats:.*?\n+/m, '');
  // Remove image caption blocks
  clean = clean.replace(/\s+[A-Z][a-z]+ [A-Z][a-z']+\s*$/gm, ''); // Artist credits

  // Convert "*** Location. ***" to "### Location"
  clean = clean.replace(/\*\*\*\s*(.*?)\.\s*\*\*\*/g, (_, name) => `### ${name.trim()}`);

  // Clean up multiple blank lines
  clean = clean.replace(/\n{3,}/g, '\n\n');

  return clean.trim();
}

// Parse FRHoF text into intro and locations
function parseRealmContent(text) {
  if (!text) return { intro: '', locations: [] };

  let clean = cleanText(text);

  // Remove headers
  clean = clean.replace(/^#{1,6}\s+.*?\n+/m, '');

  // Clean overview box remnants
  clean = clean.replace(/Overview[\s\S]*?Threats:.*?\n/m, '');
  clean = clean.replace(/\s+-\s+\*\*At a Glance:\*\*.*$/gm, '');
  clean = clean.replace(/\s+-\s+\*\*Realms:\*\*.*$/gm, '');
  clean = clean.replace(/\s+-\s+\*\*Languages:\*\*.*$/gm, '');
  clean = clean.replace(/\s+-\s+\*\*Landmarks:\*\*.*$/gm, '');
  clean = clean.replace(/\s+-\s+\*\*Threats:\*\*.*$/gm, '');
  clean = clean.replace(/Map:.*?Mike Schley/gs, '');
  clean = clean.replace(/Map\s+\d+\.\d+:.*?Mike Schley/gs, '');

  // Use regex to find *** Name. *** patterns (the FRHoF location format)
  const locationRegex = /\*\*\*\s*(.*?)\.\s*\*\*\*/g;
  const locationMatches = [];
  let match;
  while ((match = locationRegex.exec(clean)) !== null) {
    locationMatches.push({
      name: match[1].trim(),
      fullMatch: match[0],
      index: match.index,
      endIndex: match.index + match[0].length
    });
  }

  // Extract intro (everything before the first location)
  let intro;
  if (locationMatches.length > 0) {
    intro = clean.substring(0, locationMatches[0].index).trim();
  } else {
    intro = clean.trim();
  }

  // Remove artist credits that appear on their own line
  intro = intro.replace(/^\s*[A-Z][a-z]+ [A-Z]'?[A-Za-z]+\s*$/gm, '').trim();
  intro = intro.replace(/\n{3,}/g, '\n\n').trim();

  // Extract locations
  const locations = [];
  for (let i = 0; i < locationMatches.length; i++) {
    const loc = locationMatches[i];
    const nextIndex = (i + 1 < locationMatches.length) ? locationMatches[i + 1].index : clean.length;
    let desc = clean.substring(loc.endIndex, nextIndex).trim();
    // Clean artist credits from description
    desc = desc.replace(/^\s*[A-Z][a-z]+ [A-Z]'?[A-Za-z]+\s*$/gm, '').trim();
    if (loc.name && desc) {
      locations.push({ name: loc.name, desc });
    }
  }

  return { intro, locations };
}

// Parse HTML-extracted text (Dalelands, Moonsea) which uses "Name. Description" format
function parseHtmlRealmContent(text) {
  if (!text) return { intro: '', locations: [] };

  // Remove the leading ID tag remnant
  let clean = text.replace(/^id="[^"]*"\s*data-content-chunk-id="[^"]*">\s*/m, '');

  // Remove any trailing HTML tag fragments
  clean = clean.replace(/<[^>]*$/g, '');

  // The HTML-stripped text has location names as "Name. Description" pattern
  // FRHoF HTML uses bold for location names: *** Name. *** in the markdown source
  // But in HTML-stripped text, these appear as "Name. Description" where Name is the location
  // Let me look for the pattern of sentences that start location descriptions

  // For Dalelands/Moonsea, the format after HTML stripping is:
  // "RealmName Full intro text... LocationName. Location description... NextLocation. ..."
  // We need to identify location names. They follow a pattern in the original HTML of <strong> tags.

  // Since we stripped HTML, we look for known location name patterns
  // These are typically short capitalized phrases followed by a period and space
  const locationNames = [];

  // Dalelands locations
  const dalelLocs = ['Dales Compact', 'Archenbridge', 'Cormanthor', 'Myth Drannor', 'Scardale Town', 'Shadowdale Town'];
  // Moonsea locations
  const moonseaLocs = ['Hillsfar', 'Melvaunt', 'The Moonsea', 'Mulmaster', 'Point Iron', 'Quivering Forest', 'Thar', 'Zhentil Keep'];

  const allLocs = [...dalelLocs, ...moonseaLocs];

  const locations = [];
  let introEnd = clean.length;
  let firstLocIdx = clean.length;

  for (const locName of allLocs) {
    const idx = clean.indexOf(locName + '.');
    if (idx === -1) continue;
    if (idx < firstLocIdx) firstLocIdx = idx;
  }

  // Find intro
  const intro = clean.substring(0, firstLocIdx).trim()
    .replace(/^\s*\w+\s+/, '') // Remove the redundant title word at start
    .trim();

  // Extract each location
  const foundLocs = [];
  for (const locName of allLocs) {
    const idx = clean.indexOf(locName + '.');
    if (idx === -1) continue;
    foundLocs.push({ name: locName, index: idx });
  }
  foundLocs.sort((a, b) => a.index - b.index);

  for (let i = 0; i < foundLocs.length; i++) {
    const loc = foundLocs[i];
    const startIdx = loc.index + loc.name.length + 2; // skip "Name. "
    const endIdx = (i + 1 < foundLocs.length) ? foundLocs[i + 1].index : clean.length;
    let desc = clean.substring(startIdx, endIdx).trim();
    // Remove HTML fragments
    desc = desc.replace(/<[^>]*$/g, '').trim();
    if (desc) {
      locations.push({ name: loc.name, desc });
    }
  }

  return { intro, locations };
}

// Region overview data
const regionOverviews = {
  'ArcaneEmpires': {
    glance: 'Arcane magic profoundly influences these cultures: sorcery in Aglarond, wizardry in Thay, and warlock pacts in Rashemen.',
    region: 'Arcane Empires',
    languages: 'Aglarondan, Rashemi, Thayan'
  },
  'Anauroch': {
    glance: 'A wasteland, once the thriving heart of the Netherese empire, inexorably spreads into surrounding lands.',
    region: 'Anauroch',
    languages: 'Midani (Bedine), Netherese (Shade)'
  },
  'ForgottenLands': {
    glance: 'Booming trade cities dot rugged wilds in a diverse region that bursts with untapped wealth: gemstone-studded mountains, powerful primal magic, and relics of buried kingdoms.',
    region: 'Forgotten Lands',
    languages: 'Damaran'
  },
  'Heartlands': {
    glance: 'These are lands of chivalrous knights, dastardly despots, rich and scheming merchants, and backwoods farmers just trying to make a living.',
    region: 'Heartlands',
    languages: 'Chondathan, Damaran'
  },
  'LandsofIntrigue': {
    glance: 'These wealthy mercantile realms each keep a close eye on each other while carefully tending to their own political turmoil.',
    region: 'Lands of Intrigue',
    languages: 'Alzhedo, Chondathan'
  },
  'TheNorth': {
    glance: 'In this harsh and beautiful wilderness, nothing lasts and survival is a day-to-day concern.',
    region: 'The North',
    languages: 'Bothii, Chondathan, Illuskan, Reghedjic'
  },
  'OldEmpires': {
    glance: 'Living deities walk among mortals, leading their followers into cycles of terrible wars followed by golden ages.',
    region: 'Old Empires',
    languages: 'Chessentan, Mulhorandi, Untheric'
  },
  'SwordCoast': {
    glance: 'This cosmopolitan region is famous for its large cities and the Realms-shattering menaces that threaten them.',
    region: 'Sword Coast',
    languages: 'Chondathan'
  },
  'TracklessSea': {
    glance: 'Each island realm is its own small, self-contained pocket of culture, from the ancient traditions of the Moonshaes to innovative Lantan.',
    region: 'Trackless Sea',
    languages: 'Lantanese, Illuskan, Chondathan'
  },
  'VilhonReach': {
    glance: 'The Emerald Enclave helps to maintain balance between people and nature in this region.',
    region: 'Vilhon Reach',
    languages: 'Chondathan, Shaaran, Turmic'
  },
  'Beyond': {
    glance: 'Distant lands and island realms that lie at the edges of Faerunian knowledge and exploration.',
    region: 'Beyond the Map',
    languages: 'Various'
  }
};

// Realm file -> FRHoF section ID mapping
const realmToSection = {
  'anauroch': 'Anauroch',
  'aglarond': 'Aglarond',
  'rashemen': 'Rashemen',
  'thay': 'Thay',
  'damara': 'Damara',
  'great-dale': 'GreatDale',
  'impiltur': 'Impiltur',
  'narfell': 'Narfell',
  'thesk': 'Thesk',
  'the-vast': 'TheVast',
  'cormyr': 'Cormyr',
  'the-dalelands': 'Dalelands',  // extracted from HTML
  'the-moonsea': 'Moonsea',      // extracted from HTML
  'sembia': 'Sembia',
  'amn': 'Amn',
  'calimshan': 'Calimshan',
  'tethyr': 'Tethyr',
  'icewind-dale': 'IcewindDale',
  'kingdom-of-many-arrows': 'KingdomofManyArrows',
  'lords-alliance': 'TheNorthLordsAlliance',
  'luskan': 'Luskan',
  'menzoberranzan': 'Menzoberranzan',
  'northern-dwarfholds': 'NorthernDwarfholds',
  'savage-frontier': 'SavageFrontier',
  'chessenta': 'Chessenta',
  'mulhorand': 'Mulhorand',
  'unther': 'Unther',
  'sword-coast': 'SwordCoastLordsAlliance',
  'elturgard': 'Elturgard',
  'najara': 'Najara',
  'lantan': 'Lantan',
  'mintarn': 'Mintarn',
  'the-moonshae-isles': 'MoonshaeIsles',
  'chondath': 'Chondath',
  'sespech': 'Sespech',
  'shining-plains': 'ShiningPlains',
  'turmish': 'Turmish',
  'independent-city-states': 'IndependentCityStates',
  'chult': 'Chult',
  'evermeet': 'Evermeet',
  'lake-of-steam': 'LakeofSteam',
  'the-shaar': 'TheShaar',
  'sossal': 'Sossal',
};

// Realm file -> region group mapping
const realmToRegion = {
  'anauroch': 'Anauroch',
  'aglarond': 'ArcaneEmpires',
  'rashemen': 'ArcaneEmpires',
  'thay': 'ArcaneEmpires',
  'damara': 'ForgottenLands',
  'great-dale': 'ForgottenLands',
  'impiltur': 'ForgottenLands',
  'narfell': 'ForgottenLands',
  'thesk': 'ForgottenLands',
  'the-vast': 'ForgottenLands',
  'cormyr': 'Heartlands',
  'the-dalelands': 'Heartlands',
  'the-moonsea': 'Heartlands',
  'sembia': 'Heartlands',
  'amn': 'LandsofIntrigue',
  'calimshan': 'LandsofIntrigue',
  'tethyr': 'LandsofIntrigue',
  'icewind-dale': 'TheNorth',
  'kingdom-of-many-arrows': 'TheNorth',
  'lords-alliance': 'TheNorth',
  'luskan': 'TheNorth',
  'menzoberranzan': 'TheNorth',
  'northern-dwarfholds': 'TheNorth',
  'savage-frontier': 'TheNorth',
  'chessenta': 'OldEmpires',
  'mulhorand': 'OldEmpires',
  'unther': 'OldEmpires',
  'sword-coast': 'SwordCoast',
  'elturgard': 'SwordCoast',
  'najara': 'SwordCoast',
  'lantan': 'TracklessSea',
  'mintarn': 'TracklessSea',
  'the-moonshae-isles': 'TracklessSea',
  'chondath': 'VilhonReach',
  'sespech': 'VilhonReach',
  'shining-plains': 'VilhonReach',
  'turmish': 'VilhonReach',
  'independent-city-states': 'VilhonReach',
  'chult': 'Beyond',
  'evermeet': 'Beyond',
  'lake-of-steam': 'Beyond',
  'the-shaar': 'Beyond',
  'sossal': 'Beyond',
};

// Image mapping: realm file -> { map, art }
const realmImages = {
  'anauroch': { map: 'map-02.002-anauroch.jpg', art: '02-004.netherese-ruins-in-anauroch.png', artCaption: 'Netherese ruins in Anauroch' },
  'aglarond': { map: 'map-02.003-aglarond-and-thay.jpg', artCaption: '' },
  'rashemen': { map: 'map-02.004-rashemen.jpg', artCaption: '' },
  'thay': { map: 'map-02.003-aglarond-and-thay.jpg', art: '02-005.thay-citadel.png', artCaption: 'Szass Tam rules Thay from the Citadel, his fortress on Thaymount' },
  'damara': { map: 'map-02.005-forgotten-lands.jpg', art: '02-006.white-worm.png', artCaption: 'The White Worm takes Karlach, Astarion, and Shadowheart by surprise' },
  'great-dale': { map: 'map-02.005-forgotten-lands.jpg' },
  'impiltur': { map: 'map-02.005-forgotten-lands.jpg' },
  'narfell': { map: 'map-02.005-forgotten-lands.jpg' },
  'thesk': { map: 'map-02.005-forgotten-lands.jpg' },
  'the-vast': { map: 'map-02.005-forgotten-lands.jpg', art: '02-006.white-worm.png', artCaption: 'The White Worm takes Karlach, Astarion, and Shadowheart by surprise' },
  'cormyr': { map: 'map-02.006-heartlands.jpg' },
  'the-dalelands': { map: 'map-02.006-heartlands.jpg', art: '02-007.ruins-of-myth-drannor.png', artCaption: 'The ruins of Myth Drannor lie at the heart of Cormanthor' },
  'the-moonsea': { map: 'map-02.006-heartlands.jpg' },
  'sembia': { map: 'map-02.006-heartlands.jpg', art: '02-007.ruins-of-myth-drannor.png', artCaption: 'The ruins of Myth Drannor lie at the heart of Cormanthor' },
  'amn': { map: 'map-02.007-lands-of-intrigue.jpg' },
  'calimshan': { map: 'map-02.007-lands-of-intrigue.jpg' },
  'tethyr': { map: 'map-02.007-lands-of-intrigue.jpg', art: '02-008.deryan-kaya-educates.png', artCaption: 'Kaya educates' },
  'icewind-dale': { map: 'map-02.008-the-north.jpg', art: '02-009.ice-caves.png', artCaption: 'Ice caves leading to the Underdark have tempted many adventurers into danger' },
  'kingdom-of-many-arrows': { map: 'map-02.008-the-north.jpg' },
  'lords-alliance': { map: 'map-02.008-the-north.jpg' },
  'luskan': { map: 'map-02.008-the-north.jpg' },
  'menzoberranzan': { map: 'map-02.008-the-north.jpg' },
  'northern-dwarfholds': { map: 'map-02.008-the-north.jpg' },
  'savage-frontier': { map: 'map-02.008-the-north.jpg', art: '02-009.ice-caves.png', artCaption: 'Ice caves leading to the Underdark have tempted many adventurers into danger' },
  'chessenta': { map: 'map-02.009-old-empires.jpg' },
  'mulhorand': { map: 'map-02.009-old-empires.jpg' },
  'unther': { map: 'map-02.009-old-empires.jpg', art: '02-010.messemprars-terraced-gardens.png', artCaption: 'Ningal, Chosen of Selune, takes her ease in Messemprar\'s terraced gardens' },
  'sword-coast': { map: 'map-02.010-sword-coast.jpg', art: '02-011.trolls-in-the-trollclaws.png', artCaption: 'Trolls in the Trollclaws' },
  'elturgard': { map: 'map-02.010-sword-coast.jpg' },
  'najara': { map: 'map-02.010-sword-coast.jpg' },
  'lantan': { map: 'map-02.011-lantan.jpg' },
  'mintarn': { map: 'map-02.011-lantan.jpg' },
  'the-moonshae-isles': { map: 'map-02.012-moonshae-isles.jpg', art: '02-012.whalers-in-the-trackless-sea.png', artCaption: 'Whalers in the Trackless Sea' },
  'chondath': { map: 'map-02.014-vilhon-reach.jpg' },
  'sespech': { map: 'map-02.014-vilhon-reach.jpg' },
  'shining-plains': { map: 'map-02.014-vilhon-reach.jpg' },
  'turmish': { map: 'map-02.014-vilhon-reach.jpg' },
  'independent-city-states': { map: 'map-02.014-vilhon-reach.jpg', art: '02-013.seven-sentinels-of-silvanus.png', artCaption: 'The Seven Sentinels of Silvanus protect Ilighon, home of the Emerald Enclave' },
  'chult': { map: 'map-faerun.jpg', art: '02-014.island-of-evermeet.png', artCaption: 'The island of Evermeet was created in the Sundering' },
  'evermeet': { map: 'map-faerun.jpg', art: '02-014.island-of-evermeet.png', artCaption: 'The island of Evermeet was created in the Sundering' },
  'lake-of-steam': { map: 'map-faerun.jpg' },
  'the-shaar': { map: 'map-faerun.jpg' },
  'sossal': { map: 'map-02.005-forgotten-lands.jpg' },
};

// Display names for realm files
const realmDisplayNames = {
  'anauroch': 'Anauroch',
  'aglarond': 'Aglarond',
  'rashemen': 'Rashemen',
  'thay': 'Thay',
  'damara': 'Damara',
  'great-dale': 'Great Dale',
  'impiltur': 'Impiltur',
  'narfell': 'Narfell',
  'thesk': 'Thesk',
  'the-vast': 'The Vast',
  'cormyr': 'Cormyr',
  'the-dalelands': 'The Dalelands',
  'the-moonsea': 'The Moonsea',
  'sembia': 'Sembia',
  'amn': 'Amn',
  'calimshan': 'Calimshan',
  'tethyr': 'Tethyr',
  'icewind-dale': 'Icewind Dale',
  'kingdom-of-many-arrows': 'Kingdom of Many-Arrows',
  'lords-alliance': 'Lords\' Alliance',
  'luskan': 'Luskan',
  'menzoberranzan': 'Menzoberranzan',
  'northern-dwarfholds': 'Northern Dwarfholds',
  'savage-frontier': 'Savage Frontier',
  'chessenta': 'Chessenta',
  'mulhorand': 'Mulhorand',
  'unther': 'Unther',
  'sword-coast': 'Sword Coast',
  'elturgard': 'Elturgard',
  'najara': 'Najara',
  'lantan': 'Lantan',
  'mintarn': 'Mintarn',
  'the-moonshae-isles': 'Moonshae Isles',
  'chondath': 'Chondath',
  'sespech': 'Sespech',
  'shining-plains': 'Shining Plains',
  'turmish': 'Turmish',
  'independent-city-states': 'Independent City-States',
  'chult': 'Chult',
  'evermeet': 'Evermeet',
  'lake-of-steam': 'Lake of Steam',
  'the-shaar': 'The Shaar',
  'sossal': 'Sossal',
};

// Also include BaldursGate and Waterdeep content for sword-coast
const swordCoastExtra = {
  'BaldursGate': parsed['BaldursGate'],
  'Waterdeep': parsed['Waterdeep'],
};

// DM Notes for campaign-relevant realms
const dmNotes = {
  'anauroch': `## DM Notes

Anauroch is the former heartland of the Netherese Empire, founded around -3,859 DR. The campaign's Netheril dates differ from some published sources. The hidden research complex of Thul Avenar lies beneath the mountains at the desert's edge, where Netherese arcanists attempted to harness forces older than the Weave. The Great Machine within Thul Avenar partially activated during Karsus's Folly, contributing to planar instability that persists to this day.

The return and fall of Shade Enclave (1372-1487 DR) is directly connected to current events. Shadovar agents sought artifacts related to the Great Machine before their city fell. Some of these agents may still operate in the region.

The Zhentarim maintain active interest in Anauroch's trade routes and buried Netherese sites. Several artifacts recovered from the desert have appeared in markets across the Sword Coast and the Forgotten Lands.`,

  'damara': `## DM Notes

Damara is a central location in the Halls of the Damned campaign. The Von Zarovich dynasty ruled Damara from approximately -300 DR until the dynasty's collapse following Strahd's curse. Viktor Von Zarovich founded the kingdom and established his capital at Heliogabalus within the Barony of Morov, a province he named after his wife Isolde Morovich. The barony was built upon the ruins of an ancient Netherese outpost. King Barov I, King Vladimir, and King Barov II expanded and strengthened the realm before Strahd Von Zarovich's transformation into a vampire lord shattered the dynasty's power.

The Frostmantle dynasty took control in 1285 DR under Irik Frostmantle, with support from House Williams. The current ruler, King Yarin Frostmantle, is a petty and oppressive tyrant. His son, Prince Ian Frostmantle, was severely wounded investigating events in Valls.

In 1496 DR, cultists under Lady Elysra Nivariel Williams breached a hidden planar gateway beneath the city of Valls, a major citadel of the Order of the Yellow Rose. Dark energies from the Shadowfell poured into the region, overwhelming the city with supernatural horrors. The Fall of Valls is one of the defining events of the campaign.

The Order of the Yellow Rose, founded in 75 DR, guards the Keys of Shorthagot and maintains watch over the planar instability caused by the Netherese complex of Thul Avenar beneath the nearby mountains.

The Monastery of the Yellow Rose's sacred remorhaz-taming rites at the Glacier of the White Worm, described in FRHoF, connect to the Order's deep ties to this land and its spiritual traditions.`,

  'narfell': `## DM Notes

Ancient Narfell's demon-worshiping past is directly relevant to current campaign events. The demonic relics and weapons being recovered from buried Nar cities, and the rise of new Nar demonologists at Bildoobaris, represent a growing threat that could compound the supernatural dangers already unleashed by the Fall of Valls.

The ruins of Dun-Tharos in the nearby Dunwood (see Great Dale) were the former capital of ancient Narfell. The demonic powers once controlled by Nar conjurers are connected to the same planar instabilities the Order of the Yellow Rose was established to guard against.`,

  'impiltur': `## DM Notes

Impiltur's history of grappling with demon incursions mirrors Damara's current crisis. The realm's proximity to the Forgotten Lands makes it a potential ally or refuge as events in Damara escalate. The Warswords' practice of deputizing adventurers as "swordpoints" could provide the party with legal authority when operating in Impiltur's territory.`,

  'the-dalelands': `## DM Notes

The Quivering Forest's connection to Barovia, mentioned in the Moonsea section of FRHoF, is significant. Though the mists have cleared, creatures from Barovia still haunt those woods. This represents one of the points where Strahd's domain has touched the Material Plane, and it may be relevant if the party seeks information about Barovia from the outside world.`,

  'the-moonsea': `## DM Notes

The Quivering Forest connection to Barovia is critically important. FRHoF confirms that travelers who entered the Quivering Forest once emerged in Barovia, a Domain of Dread within the Shadowfell. The mists have since cleared, but werewolves, vampires, and other creatures from Barovia still haunt the woods. Barovia's influence even granted new powers to Jeny Greenteeth, a legendary hag of the forest. This is one of the few canonical connections between the Material Plane and Strahd's domain.`,

  'evermeet': `## DM Notes

Evermeet's creation during the Sundering is tied to the same ancient elven high magic that created the mythals and other powerful magical constructs encountered throughout the campaign. The island's position at a conjunction of three planes (Material, Feywild, and Arvandor) makes it relevant to any planar-focused storylines.`,

  'sword-coast': `## DM Notes

The Sword Coast's major cities, particularly Waterdeep and Baldur's Gate, serve as the primary connection points between the campaign's northeastern frontier and the wider world of Faerun. News and rumors from Damara, Vaasa, and the Forgotten Lands filter through Sword Coast merchant networks. The Lords' Alliance's interest in regional stability could draw attention to the crisis in the east.`,
};

// Get FRHoF text for a realm
function getRealmText(realmFile) {
  const sectionId = realmToSection[realmFile];
  if (!sectionId) return null;

  // Special cases: Dalelands and Moonsea extracted from HTML
  if (sectionId === 'Dalelands') {
    return extractHtmlSection('Dalelands', 'Moonsea');
  }
  if (sectionId === 'Moonsea') {
    return extractHtmlSection('Moonsea', 'Sembia');
  }

  const section = parsed[sectionId];
  if (!section) return null;

  // For Sossal, trim footer HTML
  if (sectionId === 'Sossal') {
    const text = section.text;
    // Find where the actual content ends (before footer HTML)
    const footerStart = text.indexOf('\n    \n\n    \n');
    if (footerStart > 0) {
      return text.substring(0, footerStart).trim();
    }
    // Alternative: just take first ~700 chars (the actual content)
    const contentEnd = text.indexOf('sculpted by the minds');
    if (contentEnd > 0) {
      return text.substring(0, text.indexOf('\n', contentEnd + 50)).trim();
    }
  }

  return section.text;
}

// Build markdown for a single realm
function buildRealmMarkdown(realmFile) {
  const displayName = realmDisplayNames[realmFile];
  const images = realmImages[realmFile] || {};
  const regionKey = realmToRegion[realmFile];
  const overview = regionOverviews[regionKey] || {};
  const rawText = getRealmText(realmFile);

  if (!rawText) {
    console.log(`  SKIP: No FRHoF content for ${realmFile}`);
    return null;
  }

  // Parse content
  let contentResult;
  if (realmFile === 'the-dalelands' || realmFile === 'the-moonsea') {
    contentResult = parseHtmlRealmContent(rawText);
  } else {
    contentResult = parseRealmContent(rawText);
  }
  const { intro, locations } = contentResult;

  // Build markdown
  let md = `# ${displayName}\n\n`;

  // Map image
  if (images.map) {
    md += `![Map: ${overview.region || displayName}](../../images/realms/${images.map})\n\n`;
  }

  // At a Glance box
  if (overview.glance) {
    md += `> **At a Glance:** ${overview.glance}\n`;
    md += `> **Region:** ${overview.region}\n`;
    if (overview.languages) {
      md += `> **Languages:** ${overview.languages}\n`;
    }
    md += `\n`;
  }

  // Intro text
  if (intro) {
    // Clean up the intro - replace em-dashes with commas
    let cleanIntro = intro.replace(/—/g, ',');
    // Remove duplicate header if present
    cleanIntro = cleanIntro.replace(new RegExp(`^\\s*${displayName}\\s*\n+`, 'i'), '');
    // Remove section ID remnants
    cleanIntro = cleanIntro.replace(/^id="[^"]*"[^>]*>\s*/gm, '');
    cleanIntro = cleanIntro.replace(/data-content-chunk-id="[^"]*"\s*>/g, '');
    // Remove overview box content that leaked into intro
    cleanIntro = cleanIntro.replace(/^\s*Overview\s*$/gm, '');
    cleanIntro = cleanIntro.replace(/^\s*- \*\*At a Glance:\*\*.*$/gm, '');
    cleanIntro = cleanIntro.replace(/^\s*- \*\*Realms:\*\*.*$/gm, '');
    cleanIntro = cleanIntro.replace(/^\s*- \*\*Languages:\*\*.*$/gm, '');
    cleanIntro = cleanIntro.replace(/^\s*- \*\*Landmarks:\*\*.*$/gm, '');
    cleanIntro = cleanIntro.replace(/^\s*- \*\*Threats:\*\*.*$/gm, '');
    // Remove map caption remnants
    cleanIntro = cleanIntro.replace(/^\s*Map:?\s+\S+.*$/gm, '');
    cleanIntro = cleanIntro.replace(/^\s*Map\s+\d+\.\d+:.*$/gm, '');
    // Remove image caption/credit lines (e.g. "Gavin O'Donnell", "Erel Maatita")
    cleanIntro = cleanIntro.replace(/^\s*[A-Z][a-z]+ [A-Z]'?[A-Za-z]+\s*$/gm, '');
    // Remove leftover Szass Tam rules... caption
    cleanIntro = cleanIntro.replace(/^\s*Szass Tam rules.*$/gm, '');
    cleanIntro = cleanIntro.replace(/^\s*kaya educates\s*$/gm, '');
    cleanIntro = cleanIntro.replace(/^\s*Ice caves leading.*$/gm, '');
    cleanIntro = cleanIntro.replace(/^\s*The White Worm takes.*$/gm, '');
    cleanIntro = cleanIntro.replace(/^\s*Ningal, Chosen.*$/gm, '');
    cleanIntro = cleanIntro.replace(/^\s*The Seven Sentinels.*$/gm, '');
    cleanIntro = cleanIntro.replace(/^\s*The island of Evermeet was.*$/gm, '');
    cleanIntro = cleanIntro.replace(/^\s*The ruins of Myth Drannor.*$/gm, '');
    cleanIntro = cleanIntro.replace(/\n{3,}/g, '\n\n').trim();
    md += cleanIntro + '\n\n';
  }

  // Art image (after intro, before locations)
  if (images.art && images.artCaption) {
    md += `![${images.artCaption}](../../images/realms/${images.art})\n\n`;
  }

  // Notable locations
  if (locations.length > 0) {
    md += `## Notable Locations\n\n`;
    for (const loc of locations) {
      let desc = loc.desc.replace(/—/g, ',');
      // Remove image caption lines that leaked into descriptions
      desc = desc.replace(/^\s*Szass Tam rules.*$/gm, '').trim();
      desc = desc.replace(/^\s*[A-Z][a-z]+ [A-Z]'?[A-Za-z]+\s*$/gm, '').trim();
      desc = desc.replace(/^\s*kaya educates\s*$/gm, '').trim();
      desc = desc.replace(/^\s*Ice caves leading.*$/gm, '').trim();
      desc = desc.replace(/^\s*The White Worm takes.*$/gm, '').trim();
      desc = desc.replace(/^\s*Ningal, Chosen.*$/gm, '').trim();
      desc = desc.replace(/^\s*The Seven Sentinels.*$/gm, '').trim();
      desc = desc.replace(/^\s*The island of Evermeet was.*$/gm, '').trim();
      desc = desc.replace(/^\s*The ruins of Myth Drannor.*$/gm, '').trim();
      desc = desc.replace(/\n{3,}/g, '\n\n').trim();
      md += `### ${loc.name}\n\n${desc}\n\n`;
    }
  }

  // Special: sword-coast gets Baldur's Gate and Waterdeep as additional locations
  if (realmFile === 'sword-coast') {
    const bg = parsed['BaldursGate'];
    const wd = parsed['Waterdeep'];
    if (bg) {
      const bgParsed = parseRealmContent(bg.text);
      if (bgParsed.intro) {
        md += `### Baldur's Gate\n\n${bgParsed.intro.replace(/—/g, ',')}\n\n`;
      }
      for (const loc of bgParsed.locations) {
        md += `### ${loc.name}\n\n${loc.desc.replace(/—/g, ',')}\n\n`;
      }
    }
    if (wd) {
      const wdParsed = parseRealmContent(wd.text);
      if (wdParsed.intro) {
        md += `### Waterdeep\n\n${wdParsed.intro.replace(/—/g, ',')}\n\n`;
      }
      for (const loc of wdParsed.locations) {
        md += `### ${loc.name}\n\n${loc.desc.replace(/—/g, ',')}\n\n`;
      }
    }
  }

  // DM Notes
  if (dmNotes[realmFile]) {
    md += `---\n\n${dmNotes[realmFile]}\n`;
  }

  return md;
}

// Main execution
console.log('Rewriting realm files using FRHoF content...\n');

const skipped = [];
const written = [];
const skipFiles = ['barovia', 'vaasa']; // Keep existing content

for (const realmFile of Object.keys(realmToSection)) {
  if (skipFiles.includes(realmFile)) {
    console.log(`  KEEP: ${realmFile}.md (no FRHoF coverage)`);
    skipped.push(realmFile);
    continue;
  }

  const md = buildRealmMarkdown(realmFile);
  if (md) {
    const filePath = path.join(REALMS_DIR, `${realmFile}.md`);
    fs.writeFileSync(filePath, md);
    console.log(`  WROTE: ${realmFile}.md`);
    written.push(realmFile);
  } else {
    skipped.push(realmFile);
  }
}

console.log(`\nDone! Wrote ${written.length} files, skipped ${skipped.length}`);
