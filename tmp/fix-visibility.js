// Fix npcs.json: remove "visible" field, set is_hidden=false where visible was true
const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../src/hotd-campaign/data/npcs.json');
const npcs = JSON.parse(fs.readFileSync(file, 'utf8'));

let flipped = 0;
let removedVisible = 0;

for (const npc of npcs) {
  if (npc.visible === true) {
    npc.is_hidden = false;
    flipped++;
  }
  if ('visible' in npc) {
    delete npc.visible;
    removedVisible++;
  }
}

fs.writeFileSync(file, JSON.stringify(npcs, null, 2) + '\n', 'utf8');
console.log(`Done: flipped is_hidden to false on ${flipped} NPCs, removed "visible" from ${removedVisible} NPCs`);
