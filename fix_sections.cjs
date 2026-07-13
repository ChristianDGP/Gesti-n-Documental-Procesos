const fs = require('fs');
const content = fs.readFileSync('views/Reports.tsx', 'utf8');
const lines = content.split('\n');

// 3042
lines[3041] = lines[3041].replace('</div>', '</section>');
// 3127
lines[3126] = lines[3126].replace('</div>', '</section>');
// 3197
lines[3196] = lines[3196].replace('</div>', '</section>');
// 4156
lines[4155] = lines[4155].replace('</div>', '</section>');
// 4158
lines[4157] = lines[4157].replace('</div>', '</section>');

fs.writeFileSync('views/Reports.tsx', lines.join('\n'));
console.log('SUCCESS');
