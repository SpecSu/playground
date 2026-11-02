import fs from 'node:fs/promises';
import {avatarImageURLs,avatarHasReferences} from '../src/avatar-references.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const generated=content=>'// Generated from assets/garden-compositions.json by scripts/build.mjs.\nexport const COMPOSITIONS = '+JSON.stringify(content.gardens,null,2)+';\n';
export async function syncContent(root=ROOT){const compositions=JSON.parse(await fs.readFile(path.join(root,'assets/garden-compositions.json'),'utf8'));await fs.writeFile(path.join(root,'src/gardens-data.js'),generated(compositions));}
const safeRelative=file=>typeof file==='string'&&file.startsWith('assets/')&&!file.split('/').includes('..')&&!file.includes('\\')&&!file.includes('://');
export async function buildSite({root=ROOT,output=path.join(root,'dist')}={}){
 root=path.resolve(root);output=path.resolve(output);if(output===root)throw new Error('Output must not be the project root.');
 const art=JSON.parse(await fs.readFile(path.join(root,'assets/art-manifest.json'),'utf8'));
 const avatars=JSON.parse(await fs.readFile(path.join(root,'assets/avatar-manifest.json'),'utf8'));
 const compositions=JSON.parse(await fs.readFile(path.join(root,'assets/garden-compositions.json'),'utf8'));
 const files=new Set(['index.html','styles.css','assets/art-manifest.json','assets/avatar-manifest.json','assets/garden-compositions.json','assets/audio/legacy-sale-coins.wav']);
 for(const file of await fs.readdir(path.join(root,'src')))if(file.endsWith('.js'))files.add(`src/${file}`);
 for(const sprite of Object.values(art.sprites??{})){if(!safeRelative(sprite.image))throw new Error('Invalid plant image path.');files.add(sprite.image);}
 for(const avatar of Object.values(avatars.avatars??{})){if(!avatarHasReferences(avatar))throw new Error('Incomplete avatar image references.');for(const file of [...avatarImageURLs(avatar),avatar.portraitPreview?.image].filter(Boolean)){if(!safeRelative(file))throw new Error('Invalid avatar image path.');files.add(file);}}
 try{
  const interaction=JSON.parse(await fs.readFile(path.join(root,'assets/interaction-art-manifest.json'),'utf8'));
  if(interaction.approved){files.add('assets/interaction-art-manifest.json');for(const animation of Object.values(interaction.animations??{}))for(const frame of Object.values(animation.frames??{})){if(!safeRelative(frame.image))throw new Error('Invalid interaction frame path.');files.add(frame.image);}}
 }catch(error){if(error.code!=='ENOENT')throw error;}
 try{
  const album=JSON.parse(await fs.readFile(path.join(root,'assets/memory-album-manifest.json'),'utf8'));if(!safeRelative(album.image))throw new Error('Invalid fictional album path.');files.add('assets/memory-album-manifest.json');files.add(album.image);for(const frame of Object.values(album.frames??{}))if(frame.image){if(!safeRelative(frame.image))throw new Error('Invalid source album image.');files.add(frame.image);}
 }catch(error){if(error.code!=='ENOENT')throw error;}
 let photoManifest=null;try{photoManifest=await fs.readFile(path.join(root,'assets/photo-samples-manifest.json'),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
 if(photoManifest!==null){
  const photos=JSON.parse(photoManifest);
  if(photos.approved!==true||photos.version!==1||photos.ownerAvatarKey!=='human-subeike'||!photos.photos||Array.isArray(photos.photos))throw new Error('Unapproved offline selfie manifest.');
  const allowed=new Set(['demo-frog-sea','demo-kelly-music','demo-bear-moon','demo-lx-tech']);
  for(const [id,p]of Object.entries(photos.photos)){if(!allowed.has(id)||!/^assets\/photos\/[A-Za-z0-9_-]+\.png$/.test(p.image)||!Number.isInteger(p.width)||!Number.isInteger(p.height)||p.width<=0||p.height<=0||p.width>4096||p.height>4096)throw new Error('Invalid offline selfie path or dimensions.');const bytes=await fs.readFile(path.join(root,p.image));if(bytes.length<24||bytes.length>16*1024*1024||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==p.width||bytes.readUInt32BE(20)!==p.height)throw new Error('Invalid offline selfie PNG.');files.add(p.image);}
  files.add('assets/photo-samples-manifest.json');
 }
 let wardrobeRaw=null;try{wardrobeRaw=await fs.readFile(path.join(root,'assets/wardrobe-manifest.json'),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
 if(wardrobeRaw){const wardrobe=JSON.parse(wardrobeRaw);if(wardrobe.characterId!=='human-subeike')throw new Error('Invalid wardrobe identity.');files.add('assets/wardrobe-manifest.json');for(const outfit of Object.values(wardrobe.outfits??{})){if(!avatarHasReferences(outfit))throw new Error('Incomplete outfit.');for(const file of [...avatarImageURLs(outfit),outfit.preview?.image,outfit.portraitPreview?.image].filter(Boolean)){if(!safeRelative(file))throw new Error('Invalid outfit image.');files.add(file);}}}
 // Validate the entire whitelist before replacing dist. Never copy a workspace wholesale.
 let bytes=0;for(const file of files){const stat=await fs.stat(path.join(root,file));if(!stat.isFile())throw new Error(`Missing runtime file: ${file}`);bytes+=stat.size;}
 await fs.mkdir(output,{recursive:true});
 for(const file of await fs.readdir(output)){await fs.rm(path.join(output,file),{recursive:true,force:true});}
 for(const file of files){const target=path.join(output,file);await fs.mkdir(path.dirname(target),{recursive:true});if(file==='src/gardens-data.js')await fs.writeFile(target,generated(compositions));else await fs.copyFile(path.join(root,file),target);}
 const headers=['/','/index.html','/styles.css','/src/*','/assets/*'].map(route=>`${route}\n  Cache-Control: public, max-age=0, must-revalidate\n`).join('\n');
 await fs.writeFile(path.join(output,'_headers'),headers);
 return {files:files.size+1,bytes:bytes+Buffer.byteLength(headers),output};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.includes('--sync'))await syncContent();
 const result=await buildSite();console.log(`Built ${result.files} runtime files (${(result.bytes/1024/1024).toFixed(2)} MB) → ${result.output}`);
}
