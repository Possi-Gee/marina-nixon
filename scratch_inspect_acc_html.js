const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');
const lines = content.split('\n');

const accStart = lines.findIndex(l => l.includes('<section id="account">'));
const accEnd = lines.findIndex(l => l.includes('</section>') && lines.indexOf(l) > accStart);

console.log('Account start line:', accStart + 1, 'End line:', accEnd + 1);
console.log('Sidebar preview:');
console.log(lines.slice(accStart, accStart + 70).join('\n'));
