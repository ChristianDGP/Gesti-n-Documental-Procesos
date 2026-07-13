const fs = require('fs');
const content = fs.readFileSync('views/Reports.tsx', 'utf8');
const lines = content.split('\n');

// Find Table 3 block
let start = -1;
let end = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Table 3 - Drill Down Detailed Progress count by State')) {
        start = i;
    }
    // We want the closing tag of Table 3.
    // It's the div before `</div></div>)}` which closes the false && block
    if (start !== -1 && lines[i].includes('                            </div>') && lines[i+1].includes('                        )}')) {
        end = i - 1; // get up to the closing div of the table
        break;
    }
}

if (start !== -1 && end !== -1) {
    const table3Lines = lines.slice(start, end + 1);
    
    // Find false && block
    let falseStart = -1;
    let falseEnd = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('{false && (')) {
            falseStart = i;
        }
        if (falseStart !== -1 && lines[i].includes('                        )}') && lines[i+1] && lines[i+1].includes('                    </section>')) {
            falseEnd = i;
            break;
        }
    }
    
    if (falseStart !== -1 && falseEnd !== -1) {
        // Find insert point (end of mapSubTab === 'REPORTS' block)
        let insertPoint = falseStart - 1;
        
        let newLines = [];
        for (let i = 0; i < lines.length; i++) {
            if (i === insertPoint) {
                newLines.push(lines[i]);
                newLines.push(...table3Lines);
            } else if (i >= falseStart && i <= falseEnd) {
                // skip
            } else {
                newLines.push(lines[i]);
            }
        }
        
        fs.writeFileSync('views/Reports.tsx', newLines.join('\n'));
        console.log('SUCCESS');
    } else {
        console.log('FAILED TO FIND FALSE BLOCK');
    }
} else {
    console.log('FAILED TO FIND TABLE 3. start=' + start + ' end=' + end);
}
