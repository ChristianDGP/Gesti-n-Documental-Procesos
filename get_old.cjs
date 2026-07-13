const fs = require('fs');
if(fs.existsSync('/tmp/run/run.log')) {
    console.log("Found run.log");
}
