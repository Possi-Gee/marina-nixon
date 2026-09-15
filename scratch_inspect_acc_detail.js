const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');
const lines = content.split('\n');

console.log('--- 1. as-dashboard (6026 to 6100) ---');
console.log(lines.slice(6025, 6090).join('\n'));

console.log('--- 2. as-orders & as-wishlist (6195 to 6235) ---');
console.log(lines.slice(6195, 6235).join('\n'));

console.log('--- 3. as-track (6230 to 6270) ---');
console.log(lines.slice(6230, 6270).join('\n'));

console.log('--- 4. as-profile (6265 to 6310) ---');
console.log(lines.slice(6265, 6310).join('\n'));

console.log('--- 5. as-settings (6300 to 6345) ---');
console.log(lines.slice(6300, 6345).join('\n'));
