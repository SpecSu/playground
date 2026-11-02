/** Daylight preset from the authorized artdesign reference. Does not add or overwrite a dusk preset. */
import * as T from 'three';import{RoomEnvironment}from'three/addons/environments/RoomEnvironment.js';
export function createDaylight(scene,renderer){
 const previous={background:scene.background,environment:scene.environment,environmentIntensity:scene.environmentIntensity,toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure};
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NeutralToneMapping;renderer.toneMappingExposure=1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
 const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer),env=pmrem.fromScene(room,.06);room.dispose();pmrem.dispose();scene.environment=env.texture;scene.environmentIntensity=.3;scene.background=new T.Color('#e7ede4');
 const sun=new T.DirectionalLight('#fff0cf',3.1);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:.1,far:80});sun.shadow.bias=-.00015;sun.shadow.normalBias=.015;sun.shadow.radius=5;
 const hemi=new T.HemisphereLight('#e3f2ff','#b3aa86',.5),fill=new T.DirectionalLight('#d3e9fa',.65);fill.position.set(-4,5,5);scene.add(sun,sun.target,hemi,fill);
 function setCentre(p,extent=12){sun.position.set(p.x+6.364,11,p.z-6.364);sun.target.position.set(p.x,0,p.z);Object.assign(sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent});sun.shadow.camera.updateProjectionMatrix();}
 setCentre(new T.Vector3());
 return {sun,setCentre,dispose(){env.dispose();scene.remove(sun,sun.target,hemi,fill);scene.background=previous.background;scene.environment=previous.environment;scene.environmentIntensity=previous.environmentIntensity;renderer.toneMapping=previous.toneMapping;renderer.toneMappingExposure=previous.exposure;sun.shadow.map?.dispose();}};
}
