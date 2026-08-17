const fs = require('fs');
const path = require('path');

function walk(dir, extensions, excludeDirs) {
    let results = [];
    let list = fs.readdirSync(dir);
    list.forEach(function(file) {
        if (excludeDirs.includes(file)) return;
        file = path.join(dir, file);
        let stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file, extensions, excludeDirs));
        } else {
            let ext = path.extname(file).toLowerCase();
            if (extensions.includes(ext) || ext === '') {
                results.push(file);
            }
        }
    });
    return results;
}

const extensions = ['.js', '.html', '.css', '.md', '.json', '.ts', '.tsx', '.vue', '.java', '.kt', '.swift', '.gradle'];
const excludeDirs = ['node_modules', '.git', 'dist', 'build', '.gemini', 'assets', 'img', 'images'];

const files = walk('.', extensions, excludeDirs);

let totalLines = 0;
let fileCount = 0;
for (const file of files) {
    try {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n').length;
        totalLines += lines;
        fileCount++;
    } catch (e) {
        // ignore binary files or read errors
    }
}

console.log(JSON.stringify({ files: fileCount, lines: totalLines }));
