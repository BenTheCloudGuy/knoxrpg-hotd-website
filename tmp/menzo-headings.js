const fs = require('fs');
const html = fs.readFileSync('tmp/menzo-raw/oota-city-of-spiders.html', 'utf8');

// Find section heading patterns - DDB uses heading-anchor class
const headingRegex = /class="[^"]*heading-anchor[^"]*"[^>]*>\s*([^<]+)/gi;
let m;
while ((m = headingRegex.exec(html)) !== null) {
  console.log(m[1].trim());
}
console.log('\n--- also check h3/h4 with id ---');
const h3Regex = /<h[2-5][^>]*id="([^"]*)"[^>]*>/gi;
while ((m = h3Regex.exec(html)) !== null) {
  console.log(m[1]);
}
