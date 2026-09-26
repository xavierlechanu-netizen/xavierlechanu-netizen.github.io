const fs = require('fs');
const path = require('path');

const MOJIBAKE_MAP = [
  // Multi-byte or specific sequences
  ['Ã‰', 'É'],
  ['Ãˆ', 'È'],
  ['ÃŠ', 'Ê'],
  ['Ã‹', 'Ë'],
  ['Ã€', 'À'],
  ['Ã‚', 'Â'],
  ['Ã”', 'Ô'],
  ['Ã‡', 'Ç'],
  ['Ã©', 'é'],
  ['Ã¨', 'è'],
  ['Ãª', 'ê'],
  ['Ã«', 'ë'],
  ['Ã®', 'î'],
  ['Ã¯', 'ï'],
  ['Ã´', 'ô'],
  ['Ã¹', 'ù'],
  ['Ã»', 'û'],
  ['Ã§', 'ç'],
  ['Ãœ', 'Ü'],
  ['Ã¶', 'ö'],
  ['Ã¤', 'ä'],
  ['Ã&nbsp;', 'à&nbsp;'],
  ['Ã\u00a0', 'à '],
  ['Ã ', 'à '],
  ['â‚¬', '€'],
  ['â€™', '’'],
  ['â€“', '–'],
  ['â€”', '—'],
  ['Â°C', '°C'],
  ['Â·', '·'],
  ['Â«', '«'],
  ['Â»', '»'],
  ['Â', '']
];

function sanitizeString(content) {
  let result = content;
  for (const [bad, good] of MOJIBAKE_MAP) {
    result = result.split(bad).join(good);
  }
  return result;
}

function processDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      processDirectory(fullPath);
    } else if (entry.name.endsWith('.html') || entry.name.endsWith('.js')) {
      const original = fs.readFileSync(fullPath, 'utf8');
      const sanitized = sanitizeString(original);
      if (original !== sanitized) {
        fs.writeFileSync(fullPath, sanitized, 'utf8');
        console.log(`Cleaned mojibake in: ${fullPath}`);
      }
    }
  }
}

// 1. Sanitize src/public/screens
const srcPublicScreens = path.join(__dirname, '..', 'src', 'public', 'screens');
const rootScreens = path.join(__dirname, '..', 'screens');
const srcHtml = path.join(__dirname, '..', 'src');

console.log('Sanitizing screens in src/public/screens...');
processDirectory(srcPublicScreens);

// 2. Synchronize src/public/screens to root screens/
if (fs.existsSync(srcPublicScreens)) {
  if (!fs.existsSync(rootScreens)) {
    fs.mkdirSync(rootScreens, { recursive: true });
  }
  const files = fs.readdirSync(srcPublicScreens);
  for (const f of files) {
    const srcFile = path.join(srcPublicScreens, f);
    const dstFile = path.join(rootScreens, f);
    if (fs.statSync(srcFile).isFile()) {
      fs.copyFileSync(srcFile, dstFile);
    }
  }
  console.log(`Synchronized ${files.length} screen files from src/public/screens to screens/`);
}

// 3. Also check screens/ and src/ for any remaining mojibake
console.log('Sanitizing screens in screens/...');
processDirectory(rootScreens);

console.log('Sanitizing src/ *.html files...');
const srcFiles = fs.readdirSync(srcHtml);
for (const f of srcFiles) {
  if (f.endsWith('.html')) {
    const p = path.join(srcHtml, f);
    const orig = fs.readFileSync(p, 'utf8');
    const san = sanitizeString(orig);
    if (orig !== san) {
      fs.writeFileSync(p, san, 'utf8');
      console.log(`Cleaned mojibake in: ${p}`);
    }
  }
}

console.log('Sanitization complete.');
