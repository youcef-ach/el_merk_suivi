import fs from 'fs';
import path from 'path';

function walkDir(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            if (!file.includes('node_modules') && !file.includes('.git') && !file.includes('build')) {
                results = results.concat(walkDir(file));
            }
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
    let changed = false;
    
    if (content.includes('http://localhost:3000/virtual-inspections')) {
        content = content.replace(/http:\/\/localhost:3000\/virtual-inspections/g, 'http://localhost:9000/virtual-inspections');
        changed = true;
    }
    if (content.includes('http://localhost:3000/virtual-tours')) {
        content = content.replace(/http:\/\/localhost:3000\/virtual-tours/g, 'http://localhost:9000/virtual-tours');
        changed = true;
    }
    
    if (changed) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Fixed MinIO URLs in ${file}`);
    }
});
