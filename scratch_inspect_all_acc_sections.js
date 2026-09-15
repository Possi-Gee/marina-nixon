const fs = require('fs');
const lines = fs.readFileSync('index.html', 'utf8').split('\n');
lines.forEach((l, i) => {
  if (l.includes('id="as-') || l.includes('class="acc-section')) {
    console.log((i + 1) + ': ' + l.trim());
  }
});
