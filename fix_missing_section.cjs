const fs = require('fs');
let content = fs.readFileSync('views/Reports.tsx', 'utf8');
content = content.replace('                    </div>\n                )}\n                {(activeTab === \'BI\'', '                    </div>\n                )}\n                </section>\n                )}\n                {(activeTab === \'BI\'');
fs.writeFileSync('views/Reports.tsx', content);
console.log('SUCCESS');
