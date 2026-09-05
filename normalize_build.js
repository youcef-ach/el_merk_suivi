const fs = require('fs');
const p = 'my-project/build/server/index.js';
let content = fs.readFileSync(p, 'utf8');
if (content.includes('var assetsBuildDirectory = "build\\\\client";')) {
  content = content.replace('var assetsBuildDirectory = "build\\\\client";', 'var assetsBuildDirectory = "build/client";');
  fs.writeFileSync(p, content, 'utf8');
  console.log('Replaced with forward slash!');
} else {
  console.log('Already normalized or not found');
}
