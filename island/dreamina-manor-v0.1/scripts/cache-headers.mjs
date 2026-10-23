import fs from 'node:fs';
const path='dist/client/_headers';
let text=fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
// Only content-versioned packets are immutable; mutable GLB URLs are deliberately excluded.
for(const kind of ['seed','bait'])for(let tier=1;tier<=5;tier++){
 const route=`/assets/world/icons/${kind}-${tier}-botanical-v10b.svg`;
 if(!text.includes(route))text+=`\n${route}\n  Cache-Control: public, max-age=31536000, immutable\n`;
}
fs.writeFileSync(path,text);
