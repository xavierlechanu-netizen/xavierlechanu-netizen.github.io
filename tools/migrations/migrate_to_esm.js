const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src/public/js');

const excludeFiles = [
    'config.js', 
    'actionRegistry.js', 
    'dom-security.js', 
    'app-bundle.min.js', 
    'error-tracking.js', 
    'crypto-native.js'
];

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // 1. Remove legacy Firebase init blocks
    const legacyFirebaseInitRegex = /if\s*\(\s*typeof\s*CONFIG\s*!==\s*["']undefined["']\s*&&\s*CONFIG\.FIREBASE\s*\)\s*{[\s\S]*?(?:console\.error\("[^"]+"\);\s*}|})/g;
    if (legacyFirebaseInitRegex.test(content)) {
        content = content.replace(legacyFirebaseInitRegex, '');
        modified = true;
    }
    
    // Also remove simple window.db = firebase.firestore();
    content = content.replace(/window\.db\s*=\s*firebase\.firestore\(\);/g, '');
    content = content.replace(/window\.auth\s*=\s*firebase\.auth\(\);/g, '');

    // 2. Add ES imports if not already there
    if (!content.includes("import { db, auth")) {
        const imports = `import { db, auth, CONFIG, secureGetItem, secureSetItem } from './config.js';\nimport { registerAction } from './actionRegistry.js';\n\n`;
        content = imports + content;
        modified = true;
    }

    // 3. Scan for top-level functions and register them
    // Pattern matches: function myFunc( or async function myFunc(
    // We only want top-level, so we look for lines starting with function or async function
    const funcRegex = /^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/gm;
    let match;
    const funcsToRegister = [];
    while ((match = funcRegex.exec(content)) !== null) {
        funcsToRegister.push(match[1]);
    }

    if (funcsToRegister.length > 0) {
        let registryCode = `\n// --- Action Registry (ESM) ---\n`;
        let addedAny = false;
        for (const fn of funcsToRegister) {
            // Prevent duplicate registration if script is run multiple times
            if (!content.includes(`registerAction('${fn}'`)) {
                registryCode += `registerAction('${fn}', ${fn});\n`;
                addedAny = true;
            }
        }
        if (addedAny) {
            content += registryCode;
            modified = true;
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`[ESM-MIGRATED] ${path.basename(filePath)}`);
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
            if (fullPath.endsWith('.js') && !excludeFiles.includes(path.basename(fullPath))) {
                processFile(fullPath);
            }
        }
    }
}

console.log("Migration vers ES Modules (imports + Action Registry)...");
walkDir(srcDir);
console.log("Terminé !");
