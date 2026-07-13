const fs = require('fs');
const content = fs.readFileSync('views/Reports.tsx', 'utf8');
const lines = content.split('\n');

// the exact line `)}` was removed. 
// Let's use `git status`? No, no git repository. 
// Can I see the missing brackets?

