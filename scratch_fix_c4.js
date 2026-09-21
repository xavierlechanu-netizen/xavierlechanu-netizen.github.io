const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));
let count = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  
  // 1. Remove type="module" from config.js
  const regex1 = /<script\s+type="module"\s+src="(\/?(?:dist\/)?js\/config\.js[^"]*)"/g;
  if (regex1.test(content)) {
    content = content.replace(regex1, '<script src="$1"');
    changed = true;
  }
  
  // 2. Fix the firebase.initializeApp block
  const oldInitBlock = /if \(!firebase\.apps\.length\) firebase\.initializeApp\(CONFIG\.FIREBASE\);/g;
  
  // If it doesn't already have the safe check
  if (content.includes('firebase.initializeApp(CONFIG.FIREBASE)') && !content.includes('typeof CONFIG !== "undefined"')) {
    content = content.replace(oldInitBlock, 'if (typeof CONFIG !== "undefined" && CONFIG.FIREBASE) { if (!firebase.apps.length) firebase.initializeApp(CONFIG.FIREBASE); } else { console.error("[Nexus Atlas] CONFIG non chargé"); }');
    content = content.replace(/(?<!length\) )firebase\.initializeApp\(CONFIG\.FIREBASE\);/g, 'if (typeof CONFIG !== "undefined" && CONFIG.FIREBASE) { if (!firebase.apps.length) firebase.initializeApp(CONFIG.FIREBASE); } else { console.error("[Nexus Atlas] CONFIG non chargé"); }');
    changed = true;
  }
  
  if (changed) {
    fs.writeFileSync(file, content);
    console.log('Fixed ' + file);
    count++;
  }
});
console.log('Fixed ' + count + ' files.');
