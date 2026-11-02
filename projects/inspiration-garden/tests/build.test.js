import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildSite} from '../scripts/build.mjs';
test('static build includes runtime and referenced art only, excluding diagnostics, docs, raw sources and hosting credentials',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'garden-build-'));
 try{
  const result=await buildSite({root:path.resolve('.'),output:dir});assert.ok(result.files>20);
  for(const file of ['index.html','styles.css','src/app.js','src/state.js','assets/art-manifest.json','assets/avatar-manifest.json'])assert.ok((await fs.stat(path.join(dir,file))).isFile());
  for(const file of ['work','docs','.git','.openai','tests','scripts','assets/atlases/basic-plants-v1.png'])await assert.rejects(fs.stat(path.join(dir,file)),{code:'ENOENT'});
  const html=await fs.readFile(path.join(dir,'index.html'),'utf8');assert.match(html,/src="\.\/src\/app.js"/);
  const manifest=JSON.parse(await fs.readFile(path.join(dir,'assets/art-manifest.json'),'utf8'));
  for(const sprite of Object.values(manifest.sprites))assert.ok((await fs.stat(path.join(dir,sprite.image))).isFile());
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('static build emits explicit revalidation headers for mutable HTML modules manifests and sprite URLs',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'garden-headers-'));try{
  await buildSite({root:path.resolve('.'),output:dir});const headers=await fs.readFile(path.join(dir,'_headers'),'utf8');
  assert.match(headers,/Cache-Control: public, max-age=0, must-revalidate/);assert.match(headers,/\/src\/\*/);assert.match(headers,/\/assets\/\*/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('approved optional expression atlas is packaged only through its own manifest references',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'garden-expression-'));try{
  await buildSite({root:path.resolve('.'),output:dir});const m=JSON.parse(await fs.readFile(path.join(dir,'assets/interaction-art-manifest.json'),'utf8'));assert.equal(m.approved,true);
  assert.ok((await fs.stat(path.join(dir,m.image))).isFile());assert.equal(Object.keys(m.animations).length,2);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('essential first-paint atlas decoded budget stays below twenty MiB as optional families are added',async()=>{
 const manifest=JSON.parse(await fs.readFile('assets/art-manifest.json','utf8'));const essential=Object.values(manifest.atlases).filter(a=>a.preload);
 assert.ok(essential.reduce((bytes,a)=>bytes+(a.decodedRGBABytes??a.width*a.height*4),0)<=20*1024*1024);
});
test('source album explicitly packages approved derivatives but never a private user photo directory',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'garden-album-'));try{await buildSite({root:path.resolve('.'),output:dir});const album=JSON.parse(await fs.readFile(path.join(dir,'assets/memory-album-manifest.json'),'utf8'));assert.match(album.disclosure,/虚构/);assert.equal(album.preload,false);assert.equal(Object.keys(album.frames).length,10);assert.ok((await fs.stat(path.join(dir,album.image))).isFile());for(const item of Object.values(album.frames))if(item.image)assert.deepEqual(await fs.readFile(path.join(dir,item.image)),await fs.readFile(item.image));await assert.rejects(fs.stat(path.join(dir,'work/references')),{code:'ENOENT'});}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('structured avatar portrait shared with front/back packages exactly that atlas and no old screenshot',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'garden-cast-')),output=path.join(root,'dist');try{await fs.mkdir(path.join(root,'assets'));await fs.mkdir(path.join(root,'src'));for(const file of ['index.html','styles.css','src/app.js'])await fs.writeFile(path.join(root,file),'');await fs.writeFile(path.join(root,'assets/cast.png'),'fixture');await fs.mkdir(path.join(root,'assets/audio'));await fs.writeFile(path.join(root,'assets/audio/legacy-sale-coins.wav'),'fixture');await fs.mkdir(path.join(root,'assets/backgrounds'));await fs.writeFile(path.join(root,'assets/backgrounds/ocean-b-cloud-emerald-v1.webp'),'fixture');await fs.writeFile(path.join(root,'assets/art-manifest.json'),JSON.stringify({sprites:{}}));await fs.writeFile(path.join(root,'assets/garden-compositions.json'),JSON.stringify({gardens:[]}));const ref={image:'assets/cast.png',frame:{x:0,y:0,w:20,h:20}};await fs.writeFile(path.join(root,'assets/avatar-manifest.json'),JSON.stringify({avatars:{niulai:{front:ref,back:ref,portrait:ref}}}));await buildSite({root,output});assert.deepEqual((await fs.readdir(path.join(output,'assets'))).sort(),['art-manifest.json','audio','avatar-manifest.json','cast.png','garden-compositions.json']);}finally{await fs.rm(root,{recursive:true,force:true});}
});

test('flat sea package excludes previous illustration, alternate previews and private work',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'garden-flat-sea-'));try{await buildSite({root:path.resolve('.'),output:dir});await assert.rejects(fs.stat(path.join(dir,'assets/backgrounds')),{code:'ENOENT'});await assert.rejects(fs.stat(path.join(dir,'work/ocean-options')),{code:'ENOENT'});}finally{await fs.rm(dir,{recursive:true,force:true});}
});
