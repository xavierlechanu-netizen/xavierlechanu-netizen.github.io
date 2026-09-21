const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const publicJsDir = path.join(srcDir, 'public', 'js');
if (!fs.existsSync(publicJsDir)) fs.mkdirSync(publicJsDir, { recursive: true });

function extractInlineScripts(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const fileNameBase = path.basename(filePath, '.html');
    
    // Expression régulière pour trouver <script> (sans src) ... </script>
    const scriptRegex = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    let scriptCount = 0;
    
    // On extrait et remplace tout d'un coup en utilisant replace
    content = content.replace(scriptRegex, (fullMatch, scriptContent, offset) => {
        // Ignorer les scripts de type JSON-LD
        if (fullMatch.includes('type="application/ld+json"')) {
            return fullMatch;
        }
        
        // Si le script est vide ou contient juste des espaces
        if (!scriptContent.trim()) {
            return '';
        }
        
        scriptCount++;
        const externalFileName = `inline-${fileNameBase}-${scriptCount}.js`;
        const externalFilePath = path.join(publicJsDir, externalFileName);
        
        // Sauvegarder le contenu dans un fichier externe
        fs.writeFileSync(externalFilePath, scriptContent.trim(), 'utf8');
        
        // Retourner la balise de remplacement
        return `<script src="/js/${externalFileName}"></script>`;
    });

    if (scriptCount > 0) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`[CSP] Extracted ${scriptCount} inline scripts from ${fileNameBase}.html`);
    }
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== 'public') { // Ne pas scanner le dossier public pour les HTML
                walkDir(fullPath);
            }
        } else {
            if (fullPath.endsWith('.html')) {
                extractInlineScripts(fullPath);
            }
        }
    }
}

console.log("Démarrage de l'extraction des scripts inline (Strict CSP)...");
walkDir(srcDir);
console.log("Extraction terminée !");
