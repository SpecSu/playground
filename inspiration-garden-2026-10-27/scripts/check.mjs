import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const files=[...(await fs.readdir('src')).filter(f=>f.endsWith('.js')).map(f=>`src/${f}`),...(await fs.readdir('scripts')).filter(f=>f.endsWith('.mjs')).map(f=>`scripts/${f}`)];
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0){console.error(result.stderr);process.exit(result.status??1);}}
console.log(`Syntax checked ${files.length} runtime/build modules.`);
