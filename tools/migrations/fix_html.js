const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (path.basename(fullPath) !== 'js' && path.basename(fullPath) !== 'css' && path.basename(fullPath) !== 'assets') {
                walkDir(fullPath);
            }
        } else if (fullPath.endsWith('.html')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;
            
            // Fix js/ to /js/
            const jsRegex = /<script([^>]*)src=["']js\//g;
            if (jsRegex.test(content)) {
                content = content.replace(jsRegex, '<script$1src="/js/');
                modified = true;
            }

            // Fix css/ to /css/
            const cssRegex = /<link([^>]*)href=["']css\//g;
            if (cssRegex.test(content)) {
                content = content.replace(cssRegex, '<link$1href="/css/');
                modified = true;
            }

            if (modified) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`Fixed paths in ${path.basename(fullPath)}`);
            }
        }
    }
}

walkDir(srcDir);
