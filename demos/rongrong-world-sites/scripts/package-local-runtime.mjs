import {cpSync,existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1];
if(!args.includes('--out')||!args.includes('--previous'))throw Error('Expected --out NEW_DIRECTORY --previous VERIFIED_PREVIOUS_PACKAGE');
const out=resolve(value('--out')),previous=resolve(value('--previous'));
if(existsSync(out))throw Error('Output must be a new empty path; never overwrite a release');
const old=JSON.parse(readFileSync(join(previous,'MANIFEST.json'),'utf8'));
if(!['d5decf5aa2cde2c9260bce2e4c430c3982e10840','a9cb1efe2b0f1cba1c7a4b0375c65b5ebf4c6a41','3934b1052bf2a45bd786d023676cfe56176532df','7c8ef53d4e734a9825009b65161ce2ce16c2e477','78b71cb544d34a7cf53cfa2484b06de0261d2ae4'].includes(old.sourceCommit))throw Error('Unexpected previous runtime');
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const [name,record]of Object.entries(old.files)){const p=join(previous,name);if(!existsSync(p)||lstatSync(p).isSymbolicLink()||hash(readFileSync(p))!==record.sha256)throw Error('Previous package hash mismatch: '+name);}
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim())throw Error('Commit exact source before packaging');
execFileSync(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'build','--config','local/vite.config.ts'],{cwd:root,stdio:'inherit'});
mkdirSync(out,{recursive:true});cpSync(join(root,'dist-local'),join(out,'dist'),{recursive:true});
// Keep only immutable historical hashed JS/CSS for an already-open r3, r4, r5, r6 or r7 tab.
// Never copy its old index, model files, server or databases over the new release.
let retained=0;for(const name of readdirSync(join(previous,'dist/assets'))){if(!/\.(?:js|css)$/.test(name))continue;const p=join(previous,'dist/assets',name),dest=join(out,'dist/assets',name);if(existsSync(dest)){if(hash(readFileSync(dest))!==hash(readFileSync(p)))throw Error('Hashed chunk collision');continue;}cpSync(p,dest);retained++;}
const runtime=join(out,'runtime');mkdirSync(runtime);for(const directory of ['src','server','local'])cpSync(join(root,directory),join(runtime,directory),{recursive:true});
const pkg=JSON.parse(readFileSync(join(previous,'runtime/package.json'),'utf8'));pkg.scripts={start:'node --experimental-strip-types server/index-v34-local-demo.ts'};
writeFileSync(join(runtime,'package.json'),JSON.stringify(pkg,null,2)+'\n');cpSync(join(previous,'runtime/package-lock.json'),join(runtime,'package-lock.json'));
writeFileSync(join(out,'start-local.sh'),'#!/bin/sh\nset -eu\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\n: "${FARM_DEMO_DB:?Set the verified existing absolute named-demo SQLite path}"\n: "${FARM_DB:?Set the verified existing legacy SQLite path for alias protection}"\nNODE=${NODE_BIN:-node}\n"$NODE" -e \'const [a,b]=process.versions.node.split(".").map(Number);if(a<24||(a===24&&b<9))throw Error("Node >=24.9 required")\'\nexport FARM_NAMED_DEMO=1 FARM_NAMED_REQUIRE_MODELS=1 FARM_DIST="$HERE/dist" PORT=5190\nexec "$NODE" --experimental-strip-types "$HERE/runtime/server/index-v34-local-demo.ts"\n',{mode:0o755});
cpSync(join(root,'local/README.md'),join(out,'README.md'));
const files={};function walk(dir){for(const name of readdirSync(dir).sort()){const p=join(dir,name),stat=lstatSync(p);if(stat.isSymbolicLink())throw Error('No symlinks in portable payload');if(stat.isDirectory())walk(p);else{const bytes=readFileSync(p);files[relative(out,p)]={bytes:bytes.length,sha256:hash(bytes)};}}}walk(out);
const models=Object.fromEntries(Object.entries(files).filter(([name])=>name.startsWith('dist/')&&name.endsWith('.glb')));if(Object.keys(models).length!==60)throw Error('Expected all 60 models including school run and four supplied landmarks');
const interior=files['dist/models/interiors/pyramid.spz'];if(!interior||interior.bytes!==12015743||interior.sha256!=='e5976754bd1278f83b8d55f99524da47db9e07af6cad8b06647811b15cea611a')throw Error('Interior byte identity mismatch');
const manifest={interiorCount:1,schema:'farm-named-demo-runtime/v2',baseHostedCommit:'8e74c79369b1f2184964c7230b18cd33afcf6984',sourceCommit:head,previousRuntimeSource:old.sourceCommit,listener:'127.0.0.1:5190',namespace:'farm-local-demo-v1',data:'External existing FARM_DEMO_DB only; no bundled database/browser storage',formalAccounts:'Unsupported locally; link to verified hosted root',retainedCompatibilityChunks:retained,modelCount:60,files};
writeFileSync(join(out,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');files['MANIFEST.json']={sha256:hash(readFileSync(join(out,'MANIFEST.json')))};
writeFileSync(join(out,'SHA256SUMS'),Object.entries(files).map(([name,d])=>d.sha256+'  '+name).join('\n')+'\n');
console.log(JSON.stringify({out,head,files:Object.keys(files).length,models:60,retainedCompatibilityChunks:retained}));
