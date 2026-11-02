import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {DEMO_VARIETIES} from '../src/catalogue.js';
import {createState,reduce,isValidVariety} from '../src/state.js';
import {validateState} from '../src/storage.js';
const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/v6-demo-varieties.json',import.meta.url)));
test('all published v6 immutable demo records retain immutable content while old tariffs stay raw and load-valid after acquisition',()=>{
 for(const [id,v] of Object.entries(baseline)){assert.deepEqual({...DEMO_VARIETIES[id],seedPrice:v.seedPrice,salePrice:v.salePrice,growMs:v.growMs},v,id);assert.equal(isValidVariety(v),true);const s=createState(1000,'old-acquisition');s.varieties[id]=v;s.inventory[id]=1;s.discovered.push(id);assert.equal(validateState(s),true);}
});
test('mutable garden rearrangement cannot change canonical original authors and new giant owners are explicit',async()=>{
 const source=fs.readFileSync(new URL('../src/catalogue.js',import.meta.url),'utf8').replace("import {COMPOSITIONS} from './gardens-data.js';","const COMPOSITIONS=[{owner:{id:'wrong-author',name:'Wrong',avatar:'niulai'},plants:[],cells:[],edges:[],spawn:[0,0],ownerPosition:[0,0]}];").replace("'./estate-content.js'",JSON.stringify(new URL('../src/estate-content.js',import.meta.url).href)).replace("'./plant-pricing.js'",JSON.stringify(new URL('../src/plant-pricing.js',import.meta.url).href)).replace("'./footprints.js'",JSON.stringify(new URL('../src/footprints.js',import.meta.url).href)).replace("'./blueprints.js'",JSON.stringify(new URL('../src/blueprints.js',import.meta.url).href)).replace("'./advanced-catalogue.js'",JSON.stringify(new URL('../src/advanced-catalogue.js',import.meta.url).href));
 const rearranged=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 for(const [id,v] of Object.entries(baseline))assert.equal(rearranged.DEMO_VARIETIES[id].authorId,v.authorId,id);
 assert.equal(DEMO_VARIETIES['demo-giant_moon_mushroom'].authorId,'demo-bear');assert.equal(DEMO_VARIETIES['demo-giant_bubble_lotus'].authorId,'demo-frog');
});
