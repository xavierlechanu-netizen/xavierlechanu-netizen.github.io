const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

const domSecurityScript = `
    <!-- Phase 3 : Zero-Trust DOM Security -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js"></script>
    <script src="/js/dom-security.js"></script>
`;

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // 1. Remplace onclick= par data-action= (insensible à la casse, guillemets simples ou doubles)
    const onclickRegex = /\bonclick\s*=\s*(['"])(.*?)\1/gi;
    if (onclickRegex.test(content)) {
        content = content.replace(onclickRegex, 'data-action=$1$2$1');
        modified = true;
    }

    // 2. Pour les HTML : injecter dom-security dans le head
    if (filePath.endsWith('.html') && !content.includes('dom-security.js')) {
        const headMatch = content.match(/<head[^>]*>/i);
        if (headMatch) {
            const headEnd = headMatch.index + headMatch[0].length;
            content = content.slice(0, headEnd) + domSecurityScript + content.slice(headEnd);
            modified = true;
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`[SECURED] ${filePath}`);
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
            if (fullPath.endsWith('.js') || fullPath.endsWith('.html')) {
                processFile(fullPath);
            }
        }
    }
}

console.log("Démarrage du processus de sécurisation (Phase 3)...");
walkDir(srcDir);
console.log("Migration terminée avec succès !");
