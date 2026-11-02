/** Validate the actual upload archive, not only the local build directory. */
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const archive=process.argv[2];
if(!archive)throw new Error('Usage: node scripts/check-release-archive.mjs /absolute/site.tar.gz');
const entries=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).trim().split(/\r?\n/);
const read=p=>execFileSync('tar',['-xOf',archive,p],{encoding:'utf8'});
for(const required of ['dist/.openai/hosting.json','dist/server/index.js','dist/client/'])assert(entries.includes(required),`Missing ${required}`);
const hosting=JSON.parse(read('dist/.openai/hosting.json'));assert(hosting.project_id,'Missing Site identity');
if(hosting.d1){const path='dist/.openai/drizzle/meta/_journal.json';assert(entries.includes(path),'Missing hosted migration journal');const journal=JSON.parse(read(path));assert(journal.entries.length>0,'Empty hosted migration journal');for(const row of journal.entries){const sql=`dist/.openai/drizzle/${row.tag}.sql`;assert(entries.includes(sql),`Missing ${sql}`);assert(read(sql).trim(),`Empty ${sql}`);}}
for(const p of entries)assert(!/\/(?:qa-[a-z-]+|art-preview|art-study)(?:[./-]|$)|\.sqlite|\.blend|\.env(?:\.|$)/.test(p),`Private or QA file in artifact: ${p}`);
console.log(JSON.stringify({archive,projectId:hosting.project_id,entryAndMigrationPaths:'verified',files:entries.filter(p=>!p.endsWith('/')).length}));
