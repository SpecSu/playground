import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import * as lighting from '../src/desert/artwork-lighting.ts';
import {createInstallation,disposeInstallation,updateInstallationAnimation} from '../src/desert/installations.ts';
import {createDreaminaMonument} from '../src/desert/monument.ts';
import {createInstallationConstruction} from '../src/desert/construction.ts';

type Shader = Parameters<THREE.Material['onBeforeCompile']>[0];
function materials(root:THREE.Group){const result=new Set<THREE.MeshStandardMaterial>();root.traverse(node=>{if(node instanceof THREE.Mesh){for(const m of Array.isArray(node.material)?node.material:[node.material])if(m instanceof THREE.MeshStandardMaterial)result.add(m);}});return [...result];}
function compile(material:THREE.Material){const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader} as Shader;material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);return shader;}
function signature(root:THREE.Group){return materials(root).map(m=>[m.color.getHex(),m.emissive.getHex(),m.emissiveIntensity,m.opacity,m.roughness,m.metalness,m.transparent]);}
function dispose(root:THREE.Group,kind:number|'monument'){if(kind!=='monument'){disposeInstallation(root);return;}root.traverse(n=>{if(n instanceof THREE.Mesh){n.geometry.dispose();for(const m of Array.isArray(n.material)?n.material:[n.material])m.dispose();}});root.clear();}

for(const kind of [...Array.from({length:12},(_,i)=>i),'monument'] as const){
  test(`artwork ${kind} adds form-following emission without changing defaults, draws, or material colours`,()=>{
    assert.equal(typeof lighting.createArtworkLighting,'function');
    const root=kind==='monument'?createDreaminaMonument():createInstallation(kind,23),before=signature(root);
    let draws=0;root.traverse(n=>{if(n instanceof THREE.Mesh)draws++;});
    const controller=lighting.createArtworkLighting(root,kind);
    controller.update(2,undefined);
    const shaders=materials(root).map(compile);
    assert.ok(shaders.length>=2);
    for(const shader of shaders){assert.equal(shader.uniforms.uArtworkLightEnabled.value,0);assert.match(shader.fragmentShader,/totalEmissiveRadiance \+=/);}
    controller.update(2,{mode:'chase',palette:'aurora',startedAt:0});
    for(const shader of shaders){assert.equal(shader.uniforms.uArtworkLightEnabled.value,1);assert.equal(shader.uniforms.uArtworkLightMode.value,1);}
    assert.deepEqual(signature(root),before);
    let afterDraws=0,lights=0;root.traverse(n=>{if(n instanceof THREE.Mesh)afterDraws++;if(n instanceof THREE.Light)lights++;});
    assert.equal(afterDraws,draws);assert.equal(lights,0);
    controller.update(3,null);for(const shader of shaders)assert.equal(shader.uniforms.uArtworkLightEnabled.value,0);
    controller.dispose();assert.deepEqual(signature(root),before);dispose(root,kind);
  });
}

test('lighting composes with every construction colour shader and leaves shadow growth intact',()=>{
  for(let kind=0;kind<12;kind++){
    const root=createInstallation(kind,4),construction=createInstallationConstruction(root,4);
    const oldHooks=materials(root).map(m=>m.onBeforeCompile);
    const controller=lighting.createArtworkLighting(root,kind);
    for(const material of materials(root)){
      const shader=compile(material);
      assert.ok(shader.uniforms.uConstructionSeconds);assert.ok(shader.uniforms.uArtworkLightEnabled);
      assert.match(shader.vertexShader,/aBuildAnchor/);assert.match(shader.vertexShader,/aArtworkLightPosition/);
      assert.match(material.customProgramCacheKey(),/installation-construction-v1/);
    }
    controller.dispose();materials(root).forEach((m,i)=>assert.equal(m.onBeforeCompile,oldHooks[i]));
    construction.dispose();disposeInstallation(root);
  }
});

test('shared baked geometry does not cause another artwork to inherit lighting',()=>{
  const a=createInstallation(2,4),b=createInstallation(2,4);
  const ca=lighting.createArtworkLighting(a,2),cb=lighting.createArtworkLighting(b,2);
  const sa=compile(materials(a)[0]),sb=compile(materials(b)[0]);
  ca.update(5,{mode:'pulse',palette:'candy',startedAt:0});cb.update(5,undefined);
  assert.equal(sa.uniforms.uArtworkLightEnabled.value,1);assert.equal(sb.uniforms.uArtworkLightEnabled.value,0);
  assert.notEqual(sa.uniforms.uArtworkLightEnabled,sb.uniforms.uArtworkLightEnabled);
  ca.dispose();cb.dispose();disposeInstallation(a);disposeInstallation(b);
});

test('reduced motion freezes patterns and burn suspension restores original ceremony',()=>{
  const root=createInstallation(0,1),controller=lighting.createArtworkLighting(root,0),shader=compile(materials(root)[0]);
  const selection={mode:'sweep' as const,palette:'solar' as const,startedAt:0};
  controller.update(10,selection,{reducedMotion:true});const time=shader.uniforms.uArtworkLightTime.value;
  controller.update(30,selection,{reducedMotion:true});assert.equal(shader.uniforms.uArtworkLightTime.value,time);
  controller.update(31,selection,{active:false});assert.equal(shader.uniforms.uArtworkLightEnabled.value,0);
  controller.update(32,selection,{active:true});assert.equal(shader.uniforms.uArtworkLightEnabled.value,1);
  updateInstallationAnimation(root,0,{active:true});updateInstallationAnimation(root,1,{active:true});
  assert.equal(shader.uniforms.uArtworkLightEnabled.value,1);
  controller.dispose();controller.dispose();disposeInstallation(root);
});

test('four palettes and fast smooth patterns are distinct without all-dark flashing',()=>{
  assert.equal(typeof lighting.sampleArtworkLightPattern,'function');
  assert.equal(Object.keys(lighting.ARTWORK_LIGHT_PALETTES).length,4);
  const signatures=new Set<string>();
  for(const mode of ['pulse','chase','sweep','spark'] as const){
    const values=Array.from({length:120},(_,i)=>lighting.sampleArtworkLightPattern(mode,i/60,{x:.3,y:.6,z:-.4}));
    assert.ok(Math.max(...values)-Math.min(...values)>.25);
    assert.ok(Math.min(...values)>=.12);assert.ok(Math.max(...values)<=1);
    for(let i=1;i<values.length;i++)assert.ok(Math.abs(values[i]-values[i-1])<.3);
    signatures.add(JSON.stringify(values));
  }
  assert.equal(signatures.size,4);
});

test('all patterns close smoothly on a twenty-second cycle for persistent monument precision',()=>{
  for(const mode of ['pulse','chase','sweep','spark'] as const){
    for(const point of [{x:.3,y:.6,z:-.4},{x:-.8,y:.2,z:.7}]){
      const a=lighting.sampleArtworkLightPattern(mode,0,point),b=lighting.sampleArtworkLightPattern(mode,20,point);
      assert.ok(Math.abs(a-b)<1e-8,`${mode} must close without a persisted-clock jump`);
    }
  }
});

// Conservative exact surface-area bound: clip each triangle to the entire
// nonzero support of the sparse mask (including its soft feather). No pixels,
// vertex-count proxy, or brightness-weighted estimate is used.
function accentCoverage(root:THREE.Group,kind:number|'monument'){
  const height=kind==='monument'?29.2:Number(root.userData.height);
  const radius=kind==='monument'?15:Number(root.userData.footprintRadius);
  const area=(vertices:THREE.Vector3[])=>{
    let sum=0;for(let i=1;i+1<vertices.length;i++)sum+=new THREE.Vector3().subVectors(vertices[i],vertices[0]).cross(new THREE.Vector3().subVectors(vertices[i+1],vertices[0])).length()/2;return sum;
  };
  const clip=(vertices:THREE.Vector3[],axis:'y'|'z',limit:number,above:boolean)=>{
    const result:THREE.Vector3[]=[];
    for(let i=0;i<vertices.length;i++){
      const a=vertices[i],b=vertices[(i+1)%vertices.length];
      const insideA=above?a[axis]>=limit:a[axis]<=limit,insideB=above?b[axis]>=limit:b[axis]<=limit;
      if(insideA)result.push(a);
      if(insideA!==insideB)result.push(a.clone().lerp(b,(limit-a[axis])/(b[axis]-a[axis])));
    }return result;
  };
  let total=0,lit=0;root.updateWorldMatrix(true,true);
  root.traverse(node=>{
    if(!(node instanceof THREE.Mesh)||!(node.material instanceof THREE.MeshStandardMaterial))return;
    const position=node.geometry.getAttribute('position'),index=node.geometry.index;
    for(let i=0;i<(index?.count??position.count);i+=3){
      const vertices=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(position,index?index.getX(i+j):i+j).applyMatrix4(node.matrixWorld));
      total+=area(vertices);
      if(!lighting.artworkLightRole(kind,node.material.name))continue;
      if(kind==='monument'){
        for(const center of [.405,.465])lit+=area(clip(clip(vertices,'y',(center-.003)*height,true),'y',(center+.003)*height,false));
      }else if(kind===3||kind===6||kind===9){lit+=area(clip(vertices,'y',({3:.46,6:.55,9:.81}[kind]??0)*height,true));}
      else if(kind===8)lit+=area(clip(clip(vertices,'z',-.024*radius,true),'z',.024*radius,false));
      else lit+=area(vertices);
    }
  });return lit/total;
}

test('only sparse named accents can emit, with a conservative surface-coverage bound per design',()=>{
  const maxima=Array(13).fill(0);
  const bounds=[.09,.05,.13,.12,.09,.15,.19,.07,.05,.03,.18,.13,.031];
  for(const seed of [4,23,81])for(const kind of [...Array.from({length:12},(_,i)=>i),'monument'] as const){
    const root=kind==='monument'?createDreaminaMonument():createInstallation(kind,seed);
    const coverage=accentCoverage(root,kind),i=kind==='monument'?12:kind;
    maxima[i]=Math.max(maxima[i],coverage);
    assert.ok(coverage>0,`${kind} must retain a selected accent`);
    assert.ok(coverage<bounds[i],`${kind} lights ${(coverage*100).toFixed(2)}% of surface, exceeding its ${bounds[i]*100}% budget`);
    const controller=lighting.createArtworkLighting(root,kind);
    for(const material of materials(root)){
      const shader=compile(material);
      assert.equal(shader.uniforms.uArtworkLightRole.value,lighting.artworkLightRole(kind,material.name));
      assert.match(shader.fragmentShader,/uArtworkLightEnabled>\.5 && uArtworkLightRole>\.5/);
      assert.doesNotMatch(shader.fragmentShader,/artRim|artworkLightEtching/);
      if(!lighting.artworkLightRole(kind,material.name))for(let y=0;y<=1;y+=.1)
        assert.equal(lighting.sampleArtworkLightMask(kind,material.name,{x:.2,y,z:0}),0);
    }
    controller.dispose();dispose(root,kind);
  }
  console.log('Conservative luminous surface bounds (%):',maxima.map(n=>(n*100).toFixed(2)).join(', '));
});

test('body materials are explicitly excluded and narrow accents do not bleed into adjacent surfaces',()=>{
  const bodies=['dust white ceramic','bright mirror fragments','porcelain whale bone','cream cast terrazzo','dark petrol enamel','ivory sailcloth','seafoam opal glass petals','surplus olive enamel','red oxide monolith','chalk white brutalist concrete','pearlescent canopy','cobalt folded sheet'];
  bodies.forEach((name,kind)=>assert.equal(lighting.artworkLightRole(kind,name),0));
  for(let kind=0;kind<12;kind++)assert.equal(lighting.artworkLightRole(kind,'unrecognized body material'),0);
  assert.equal(lighting.artworkLightRole('monument','weathered stone foundation'),0);
  for(const y of [.1,.3,.39,.42,.45,.48,.7,.9])assert.equal(lighting.sampleArtworkLightMask('monument','weathered warm limestone',{x:.4,y,z:0}),0);
  for(const y of [.405,.465])assert.equal(lighting.sampleArtworkLightMask('monument','weathered warm limestone',{x:.4,y,z:0}),1);
  assert.equal(lighting.sampleArtworkLightMask(3,'electric ultramarine',{x:0,y:.2,z:0}),0);
  assert.equal(lighting.sampleArtworkLightMask(6,'weathered brass',{x:0,y:.1,z:0}),0);
  assert.equal(lighting.sampleArtworkLightMask(8,'polished solar edge',{x:0,y:.5,z:.03}),0);
  assert.equal(lighting.sampleArtworkLightMask(9,'vermilion destination door',{x:0,y:.4,z:0}),0);
});

test('all compatible palette keys now use restrained warm desert colours',()=>{
  for(const palette of Object.values(lighting.ARTWORK_LIGHT_PALETTES))for(const hex of palette){
    const n=parseInt(hex.slice(1),16),r=n>>16,g=(n>>8)&255,b=n&255;
    assert.ok(r>=g&&g>=b,`${hex} should remain warm rather than cyan or violet neon`);
    assert.ok(r-b<150,`${hex} should avoid extreme saturation`);
  }
});
