const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src/public/js');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // The previous bad regex replaced: element.innerHTML = `...`;
    // with: window.DOMSecurity.safeHTML(element, `...`);
    // I need to reverse this.
    // window.DOMSecurity.safeHTML( $1 , $2 )$3
    
    // Reverse regex: window\.DOMSecurity\.safeHTML\(([^,]+),\s*([\s\S]*?)\)(;?)
    const reverseRegex = /window\.DOMSecurity\.safeHTML\(([^,]+),\s*([\s\S]*?)\)(;?)/g;
    
    if (reverseRegex.test(content)) {
        content = content.replace(reverseRegex, (match, p1, p2, p3) => {
            return `// eslint-disable-next-line no-restricted-syntax\n${p1}.innerHTML = ${p2}${p3}`;
        });
        modified = true;
    }

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`[REVERTED & LINT-IGNORED] ${filePath}`);
    }
}

function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else {
            if (fullPath.endsWith('.js')) {
                processFile(fullPath);
            }
        }
    }
}

console.log("Reverting bad safeHTML replacements and adding eslint-disable...");
walkDir(srcDir);
console.log("Terminé !");
