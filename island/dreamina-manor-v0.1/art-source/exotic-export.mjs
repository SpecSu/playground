import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import * as THREE from 'three';import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {EXOTIC_PLANT_IDS,createExoticPlant} from '../lib/art/exotic-plants.js';
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}readAsDataURL(b){b.arrayBuffer().then(r=>{this.result='data:'+b.type+';base64,'+Buffer.from(r).toString('base64');this.onloadend?.();});}};
const out=path.resolve(fileURLToPath(new URL('../../manor-next-content-20261024/exotic-evidence/',import.meta.url)));fs.mkdirSync(out,{recursive:true});
const args=process.argv.slice(2),ids=args.length?args:EXOTIC_PLANT_IDS;
for(const id of ids){const p=createExoticPlant(id);p.setGrowth(1);p.update(0);p.root.updateMatrixWorld(true);const bb=new THREE.Box3().setFromObject(p.root);fs.writeFileSync(path.join(out,id+'.glb'),Buffer.from(await new GLTFExporter().parseAsync(p.root,{binary:true})));console.log(id,JSON.stringify({size:bb.getSize(new THREE.Vector3()).toArray(),min:bb.min.toArray()}));p.dispose();}
