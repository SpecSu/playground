import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inflateSync} from 'node:zlib';
import {DEMO_GARDENS,allCatalogueVarieties} from '../src/catalogue.js';
import {footprintOf,plantCenter,buildingCells} from '../src/footprints.js';
import {isoPoint,stableSceneZoom} from '../src/scene-math.js';
import {frameAdvancedCanopies} from '../src/content-framing.js';
// Read-only original RGBA8 source-alpha probes; no image modification or browser dependency.
function pngAlpha(file){const b=fs.readFileSync(file),w=b.readUInt32BE(16),h=b.readUInt32BE(20);assert.equal(b[24],8);assert.equal(b[25],6);assert.equal(b[28],0);const chunks=[];for(let at=8;at<b.length;){const n=b.readUInt32BE(at),type=b.toString('ascii',at+4,at+8);if(type==='IDAT')chunks.push(b.subarray(at+8,at+8+n));at+=12+n;}const raw=inflateSync(Buffer.concat(chunks)),stride=w*4,data=Buffer.alloc(stride*h);let at=0;const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};for(let y=0;y<h;y++){const f=raw[at++];for(let x=0;x<stride;x++){const a=x>=4?data[y*stride+x-4]:0,up=y?data[(y-1)*stride+x]:0,c=y&&x>=4?data[(y-1)*stride+x-4]:0;data[y*stride+x]=(raw[at++]+[0,a,up,Math.floor((a+up)/2),paeth(a,up,c)][f])&255;}}return (x,y)=>data[(y*w+x)*4+3];}

const art=JSON.parse(fs.readFileSync('assets/art-manifest.json')).sprites;
const cast=JSON.parse(fs.readFileSync('assets/avatar-manifest.json')).avatars;
const vars=allCatalogueVarieties();
function actors(g){return [{role:'host',key:g.avatarKey,...g.ownerPosition},{role:'player',key:'human-subeike',...g.tiles.find(t=>t.id===g.spawnTileId)}];}
function bounds(key,center,scale=1,dy=8){const s=art[key],f=s.frame,a=s.anchor,b=s.alphaBounds??{x:0,y:0,w:f.w,h:f.h},w=s.width*scale,h=w*f.h/f.w,p=isoPoint(center.x,center.y);return {key,x:p.x+(b.x/f.w-a[0])*w,y:p.y+dy+(b.y/f.h-a[1])*h,w:b.w/f.w*w,h:b.h/f.h*h};}
function foreground(g,actor){const depth=actor.x+actor.y+(actor.role==='host'?.08:.1);return [
 ...g.plants.map(p=>({depth:g.tiles.find(t=>t.id===p.tileId).x+g.tiles.find(t=>t.id===p.tileId).y+(footprintOf(vars[p.varietyId])[0]===2?2:.05),...bounds(vars[p.varietyId].artKey,plantCenter(g,p,vars[p.varietyId]),p.scale??1)})),
 ...g.exhibits.map(e=>{const cells=buildingCells(g,e),x=(Math.min(...cells.map(c=>c.x))+Math.max(...cells.map(c=>c.x)))/2,y=(Math.min(...cells.map(c=>c.y))+Math.max(...cells.map(c=>c.y)))/2;return {depth:e.x+e.y+2,...bounds(e.artKey,{x,y},e.scale??1,6)};}),
 ...g.props.filter(p=>p.layer!=='ground').map(p=>({depth:p.x+p.y,...bounds(p.artKey,p,p.scale??1,4)}))
 ].filter(p=>p.depth>depth);}
test('every initial host and player has opaque face/torso samples outside all foreground artwork bounds',()=>{
 for(const g of DEMO_GARDENS)for(const actor of actors(g)){const c=cast[actor.key],a=c.front,alpha=pngAlpha(a.image),h=c.displayHeight/78*70,w=h*a.frame.w/a.frame.h,p=isoPoint(actor.x,actor.y);let visible=0;
 for(const u of [.35,.45,.55,.65])for(const v of [.2,.35,.5,.65]){if(alpha(a.frame.x+Math.floor(u*a.frame.w),a.frame.y+Math.floor(v*a.frame.h))<32)continue;visible++;const point={x:p.x+(u-a.anchor.x)*w,y:p.y+6+(v-a.anchor.y)*h};for(const b of foreground(g,actor))assert.equal(point.x>=b.x&&point.x<=b.x+b.w&&point.y>=b.y&&point.y<=b.y+b.h,false,`${g.id} ${actor.role} covered by ${b.key}`);}
 assert.ok(visible>=8,`${g.id} ${actor.role}: only ${visible} opaque body probes`);}
});
test('all initial greeting actors fit inside phone and desktop-shell safe viewport without panning',()=>{
 for(const g of DEMO_GARDENS)for(const [width,height]of [[360,640],[390,844],[440,900]]){const trayHeight=87,pts=g.tiles.map(t=>isoPoint(t.x,t.y)),cx=(Math.min(...pts.map(p=>p.x))+Math.max(...pts.map(p=>p.x)))/2,cy=(Math.min(...pts.map(p=>p.y))+Math.max(...pts.map(p=>p.y)))/2,zoom=stableSceneZoom(g.tiles,width,height,trayHeight),camera={zoom,x:width/2-cx*zoom,y:115+Math.max(260,height-trayHeight-180)*.55-cy*zoom};Object.assign(camera,frameAdvancedCanopies({world:g,varieties:vars,sprite:key=>art[key],width,height,trayHeight,zoom,time:1}));
 for(const actor of actors(g)){const c=cast[actor.key],s=c.front,h=c.displayHeight/78*70*camera.zoom,w=h*s.frame.w/s.frame.h,p=isoPoint(actor.x,actor.y,camera),x=p.x-w*s.anchor.x,y=p.y+6*camera.zoom-h*s.anchor.y;assert.ok(x>=12&&x+w<=width-12,`${g.id} ${actor.role} clipped horizontally at ${width}x${height}`);assert.ok(y>=125&&y+h<=height-trayHeight-8,`${g.id} ${actor.role} behind chrome at ${width}x${height}`);}}
});
