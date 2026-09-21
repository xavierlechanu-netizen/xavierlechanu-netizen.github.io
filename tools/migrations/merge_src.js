const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir, { recursive: true });

function getNewestFile(file1, file2) {
    if (!fs.existsSync(file1)) return file2;
    if (!fs.existsSync(file2)) return file1;
    
    const stat1 = fs.statSync(file1);
    const stat2 = fs.statSync(file2);
    
    return stat1.mtimeMs > stat2.mtimeMs ? file1 : file2;
}

function copyNewest(source1, source2, dest) {
    const newest = getNewestFile(source1, source2);
    if (newest && fs.existsSync(newest)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(newest, dest);
        console.log(`Copied ${newest} to ${dest}`);
    }
}

// 1. Merge HTML files
const htmlFiles = new Set([
    ...fs.readdirSync(__dirname).filter(f => f.endsWith('.html')),
    ...(fs.existsSync('public') ? fs.readdirSync('public').filter(f => f.endsWith('.html')) : [])
]);

for (const file of htmlFiles) {
    copyNewest(
        path.join(__dirname, file),
        path.join(__dirname, 'public', file),
        path.join(srcDir, file)
    );
}

// 2. Merge JS files
const jsFiles = new Set();
const scanJs = (dir) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
        if (f.endsWith('.js')) jsFiles.add(f);
    });
};
scanJs(path.join(__dirname, 'js'));
scanJs(path.join(__dirname, 'public', 'js'));

for (const file of jsFiles) {
    copyNewest(
        path.join(__dirname, 'js', file),
        path.join(__dirname, 'public', 'js', file),
        path.join(srcDir, 'js', file)
    );
}

// 3. Move CSS and assets
const copyDir = (src, dest) => {
    if (!fs.existsSync(src)) return;
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(file => {
        const srcPath = path.join(src, file);
        const destPath = path.join(dest, file);
        if (fs.statSync(srcPath).isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            if (!fs.existsSync(destPath) || fs.statSync(srcPath).mtimeMs > fs.statSync(destPath).mtimeMs) {
                fs.copyFileSync(srcPath, destPath);
                console.log(`Copied ${srcPath} to ${destPath}`);
            }
        }
    });
};

copyDir(path.join(__dirname, 'css'), path.join(srcDir, 'css'));
copyDir(path.join(__dirname, 'public', 'css'), path.join(srcDir, 'css'));

copyDir(path.join(__dirname, 'assets'), path.join(srcDir, 'assets'));
copyDir(path.join(__dirname, 'public', 'assets'), path.join(srcDir, 'assets'));

console.log("Merge completed successfully!");
