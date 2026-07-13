const fs = require('fs');
let content = fs.readFileSync('views/Reports.tsx', 'utf8');

// The pattern is:
// </section>
// </div>
// )}
// And we want:
// </div>
// </section>
// )}

content = content.replace(/<\/section>\n(\s*)<\/div>\n(\s*)\)}/g, '</div>\n$1</section>\n$2)}');

fs.writeFileSync('views/Reports.tsx', content);
console.log('SUCCESS');
