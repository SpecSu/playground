import * as THREE from 'three';

/** One fixed grip axis with a slender blank that flexes smoothly into the tip. */
export function createFishingRod(material: THREE.Material, reelMaterial: THREE.Material) {
  const rod = new THREE.Group();
  const joint = new THREE.Vector3(.02, .9, .85);
  const axis = joint.clone().normalize();
  const activeTip = new THREE.Vector3(.03, 1.42, 1.8);
  const upperLength = activeTip.distanceTo(joint);
  const straightTip = joint.clone().addScaledVector(axis, upperLength);
  const tip = activeTip.clone();
  const up = new THREE.Vector3(0, 1, 0);
  const segment = (start: THREE.Vector3, end: THREE.Vector3, bottom: number, top: number, name: string, surface = material) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, start.distanceTo(end), 10), surface);
    mesh.name = name;
    mesh.position.copy(start).add(end).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(up, end.clone().sub(start).normalize());
    rod.add(mesh);
    return mesh;
  };
  // Wrist contact keeps the same origin and axis; the small sleeve and ferrule
  // distinguish the grip without making the entire blank look like a handle.
  segment(new THREE.Vector3(), joint, .016, .011, 'rod-handle-segment');
  segment(axis.clone().multiplyScalar(.015), axis.clone().multiplyScalar(.29), .018, .017, 'rod-grip');
  segment(axis.clone().multiplyScalar(.29), axis.clone().multiplyScalar(.308), .0175, .0175, 'rod-ferrule', reelMaterial);

  // The quadratic control point lies on the fixed lower shaft. This makes the
  // flex tangent-continuous at the join, including during the straight rest pose.
  const curve = new THREE.QuadraticBezierCurve3(joint, joint.clone().addScaledVector(axis, upperLength * .5), tip);
  const sections = 40, sides = 10;
  const geometry = new THREE.TubeGeometry(curve, sections, .011, sides, false);
  const upper = new THREE.Mesh(geometry, material);
  upper.name = 'rod-tip-segment';
  rod.add(upper);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  position.setUsage(THREE.DynamicDrawUsage); normal.setUsage(THREE.DynamicDrawUsage);
  const center = new THREE.Vector3(), tangent = new THREE.Vector3(), binormal = new THREE.Vector3();
  const side = new THREE.Vector3().crossVectors(axis, activeTip).normalize();
  const radial = new THREE.Vector3();

  const reel = new THREE.Mesh(new THREE.TorusGeometry(.054, .011, 8, 16), reelMaterial);
  reel.name = 'rod-reel';
  reel.position.set(-.1, .18, .25); reel.rotation.y = Math.PI / 2; rod.add(reel);
  segment(axis.clone().multiplyScalar(.19), reel.position, .005, .005, 'rod-reel-mount', reelMaterial);

  let previousProgress = -1;
  const updateRestPose = (progress: number) => {
    const rest = THREE.MathUtils.clamp(progress, 0, 1);
    if (rest === previousProgress) return;
    previousProgress = rest;
    tip.copy(activeTip).lerp(straightTip, rest);
    for (let i = 0; i <= sections; i++) {
      const t = i / sections, radius = THREE.MathUtils.lerp(.011, .0035, t);
      curve.getPoint(t, center); curve.getTangent(t, tangent);
      binormal.crossVectors(tangent, side).normalize();
      for (let j = 0; j <= sides; j++) {
        const angle = j / sides * Math.PI * 2, index = i * (sides + 1) + j;
        radial.copy(side).multiplyScalar(-Math.cos(angle)).addScaledVector(binormal, Math.sin(angle));
        position.setXYZ(index, center.x + radial.x * radius, center.y + radial.y * radius, center.z + radial.z * radius);
        normal.setXYZ(index, radial.x, radial.y, radial.z);
      }
    }
    position.needsUpdate = normal.needsUpdate = true;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  };
  updateRestPose(0);
  return Object.assign(rod, { tip, updateRestPose });
}
