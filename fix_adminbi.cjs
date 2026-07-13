const fs = require('fs');
let content = fs.readFileSync('views/Reports.tsx', 'utf8');
content = content.replace('<AdminBI hideHeader />\n                    </div>\n                )}', '<AdminBI hideHeader />\n                    </section>\n                )}');
fs.writeFileSync('views/Reports.tsx', content);
console.log('SUCCESS');
