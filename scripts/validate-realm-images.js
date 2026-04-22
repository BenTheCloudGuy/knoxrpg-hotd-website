const fs = require('fs');
const path = require('path');
const realmsDir = path.join(__dirname, '..', 'src', 'hotd-campaign', 'data', 'realms');
const files = fs.readdirSync(realmsDir).filter(f => f.endsWith('.md'));
const missing = [];
const valid = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(realmsDir, file), 'utf8');
  const imgRegex = /\!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = imgRegex.exec(content)) !== null) {
    const alt = match[1];
    const ref = match[2];
    const absPath = path.resolve(realmsDir, ref);
    if (fs.existsSync(absPath)) {
      valid.push({ file, alt, ref });
    } else {
      missing.push({ file, alt, ref });
    }
  }
  // Check if file has NO images at all
  if (imgRegex.lastIndex === 0 && content.indexOf('![') === -1) {
    missing.push({ file, alt: '(none)', ref: 'NO IMAGE REFERENCES IN FILE' });
  }
}

console.log('=== MISSING / BROKEN IMAGES ===');
if (missing.length === 0) {
  console.log('None - all images valid.');
} else {
  missing.forEach(m => console.log('  MISSING: ' + m.file.padEnd(30) + m.ref));
}
console.log('\n=== VALID IMAGES (' + valid.length + ') ===');
valid.forEach(o => console.log('  OK: ' + o.file.padEnd(30) + o.ref));
