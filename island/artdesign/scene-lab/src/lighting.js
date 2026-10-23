import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function createLighting(scene, renderer) {
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  const environment = new RoomEnvironment();
  const pmrem = new T.PMREMGenerator(renderer);
  const env = pmrem.fromScene(environment, .06);
  scene.environment = env.texture; environment.dispose(); pmrem.dispose();
  const sun = new T.DirectionalLight('#ffffff', 2.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: .1, far: 32 });
  sun.shadow.bias = -.00015; sun.shadow.normalBias = .015; sun.shadow.radius = 5;
  const hemi = new T.HemisphereLight('#e8f2ff', '#aaa48c', .45);
  const fill = new T.DirectionalLight('#d3e9fa', .35); fill.position.set(-4, 5, 5);
  scene.add(sun, sun.target, hemi, fill);
  let preset = 'neutral', angle = 135;
  function apply() {
    const dusk = preset === 'dusk', warm = preset === 'sun';
    sun.color.set(dusk ? '#ffc08c' : warm ? '#fff0cf' : '#ffffff');
    sun.intensity = dusk ? 2 : warm ? 3.1 : 2.4;
    sun.position.set(Math.sin(angle * Math.PI / 180) * 9, dusk ? 4.8 : 11, Math.cos(angle * Math.PI / 180) * 9);
    hemi.color.set(dusk ? '#9bacf5' : '#e3f2ff'); hemi.groundColor.set(dusk ? '#876b7c' : '#b3aa86');
    hemi.intensity = dusk ? .35 : .5;
    fill.intensity = dusk ? .22 : .65;
    scene.environmentIntensity = dusk ? .2 : .3;
    scene.background = new T.Color(dusk ? '#9eabb4' : warm ? '#e7ede4' : '#eff1eb');
  }
  apply();
  return { sun, setPreset(value) { preset = value; apply(); }, setAngle(value) { angle = value; apply(); }, dispose() { env.dispose(); scene.remove(sun, sun.target, hemi, fill); } };
}
