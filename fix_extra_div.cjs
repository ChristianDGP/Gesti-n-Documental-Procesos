const fs = require('fs');
let content = fs.readFileSync('views/Reports.tsx', 'utf8');
content = content.replace('                                </div>\n                    </div>\n                    </div>\n                )}', '                                </div>\n                    </div>\n                )}');
fs.writeFileSync('views/Reports.tsx', content);
console.log('SUCCESS');
