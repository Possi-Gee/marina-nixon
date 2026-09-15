const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');
const lines = content.split('\n');

console.log('--- chkStep2 (5430 to 5510) ---');
console.log(lines.slice(5430, 5510).join('\n'));
