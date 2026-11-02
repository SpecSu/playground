/** Offline, dependency-free reassembly of the exact delivered binary assets. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const digest=/^[a-f0-9]{64}$/;
function resolveSafe(relative){
 if(typeof relative!=='string'||!relative||relative.includes('\\')||path.posix.isAbsolute(relative)||relative.split('/').some(p=>p==='..'||p==='.'||!p)||relative.includes('\0'))throw Error('Unsafe asset path');
 const full=path.resolve(root,...relative.split('/'));
 if(!full.startsWith(root+path.sep))throw Error('Path escapes project');
 return full;
}
async function guardParents(full){
 const relative=path.relative(root,full);let current=root;
 for(const part of relative.split(path.sep)){
  current=path.join(current,part);
  try{const stat=await fs.lstat(current);if(stat.isSymbolicLink())throw Error('Refusing symlink: '+path.relative(root,current));}catch(e){if(e.code!=='ENOENT')throw e;}
 }
}
async function matching(file,size,hash){
 try{await guardParents(file);const stat=await fs.stat(file);if(!stat.isFile()||stat.size!==size)return false;return sha(await fs.readFile(file))===hash;}catch(e){if(e.code==='ENOENT')return false;throw e;}
}
async function main(){
 const manifestPath=resolveSafe('ASSET_PARTS.json');await guardParents(manifestPath);
 const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
 if(manifest.version!==1||!Array.isArray(manifest.assets))throw Error('Unsupported asset manifest');
 const destinations=new Set();
 // Validate ALL metadata and paths before any writes.
 for(const asset of manifest.assets){
  if(!digest.test(asset.sha256)||!Number.isSafeInteger(asset.bytes)||asset.bytes<=0||!Array.isArray(asset.paths)||!asset.paths.length||!Array.isArray(asset.parts)||!asset.parts.length)throw Error('Invalid asset entry');
  let bytes=0;
  for(const [i,part]of asset.parts.entries()){
   if(part.path!==`.asset-parts/${asset.sha256}/part-${String(i).padStart(4,'0')}`||!digest.test(part.sha256)||!Number.isSafeInteger(part.bytes)||part.bytes<=0||part.bytes>1572864)throw Error('Invalid part entry');
   resolveSafe(part.path);bytes+=part.bytes;
  }
  if(bytes!==asset.bytes)throw Error('Part-size total mismatch');
  for(const relative of asset.paths){
   if(!relative.startsWith('public/')&&!relative.startsWith('dist/'))throw Error('Restore destinations must be public/ or dist/');
   if(destinations.has(relative))throw Error('Duplicate destination');destinations.add(relative);await guardParents(resolveSafe(relative));
  }
 }
 let restored=0,skipped=0;
 for(const asset of manifest.assets){
  const missing=[];
  for(const relative of asset.paths){if(await matching(resolveSafe(relative),asset.bytes,asset.sha256))skipped++;else missing.push(relative);}
  if(!missing.length)continue;
  const chunks=[];
  for(const part of asset.parts){
   const file=resolveSafe(part.path);await guardParents(file);
   let buffer;try{buffer=await fs.readFile(file);}catch(e){throw Error(`Missing/unreadable part ${part.path}: ${e.code||e.message}`);}
   if(buffer.length!==part.bytes||sha(buffer)!==part.sha256)throw Error('Corrupt part: '+part.path);
   chunks.push(buffer);
  }
  const data=Buffer.concat(chunks);
  if(data.length!==asset.bytes||sha(data)!==asset.sha256)throw Error('Reassembled asset checksum mismatch: '+asset.sha256);
  for(const relative of missing){
   const destination=resolveSafe(relative);await guardParents(destination);await fs.mkdir(path.dirname(destination),{recursive:true});
   const temporary=destination+'.restore-'+crypto.randomBytes(8).toString('hex');
   try{
    await fs.writeFile(temporary,data,{flag:'wx'});
    if(!(await matching(temporary,asset.bytes,asset.sha256)))throw Error('Written asset checksum mismatch');
    await guardParents(destination);await fs.rename(temporary,destination);restored++;
   }finally{await fs.rm(temporary,{force:true});}
  }
 }
 console.log(`Assets ready: ${restored} restored, ${skipped} already correct. No network access used.`);
}
main().catch(error=>{console.error('Asset restoration failed:',error.message);process.exitCode=1;});
