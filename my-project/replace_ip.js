import fs from 'fs';
import path from 'path';

function walkDir(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walkDir(file));
        } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
            results.push(file);
        }
    });
    return results;
}

const dir = 'c:/Users/achou/Documents/GitHub/el_merk_suivi/my-project/app';
const files = walkDir(dir);

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes('http://197.140.9.103')) {
        content = content.replace(/http:\/\/197\.140\.9\.103/g, 'http://localhost:3000');
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated ${file}`);
    }
});
