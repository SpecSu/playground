import * as THREE from 'three';

/** Local-space arrival corridor. Turning the actor must not sweep a nearly
 * supported fish sideways through its palms. The final segment closes from
 * directly in front only after the support pose has finished opening. */
export function positionFishingCatchArrival(destination: THREE.Vector3, water: THREE.Vector3, contact: THREE.Vector3, size: THREE.Vector3, progress: number, direction = new THREE.Vector3(0, 0, 1)) {
  const p = THREE.MathUtils.clamp(progress, 0, 1), split = .96;
  const distance = Math.max(.8, (Math.abs(direction.x) * size.x + Math.abs(direction.z) * size.z) * .75);
  if (p < split) {
    const approach = THREE.MathUtils.smoothstep(p / split, 0, 1);
    destination.copy(water).lerp(contact, approach);
    destination.addScaledVector(direction, distance * approach);
    const clearance = contact.dot(direction) + distance - destination.dot(direction);
    // Enter the side corridor while the catch is still below the deck;
    // its first visible point remains the real bobber, without a sideways pop.
    if (clearance > 0) destination.addScaledVector(direction, clearance * THREE.MathUtils.smoothstep(p, 0, .3));
    destination.y += Math.sin(approach * Math.PI) * 1.1;
  } else {
    const settle = THREE.MathUtils.smoothstep((p - split) / (1 - split), 0, 1);
    destination.copy(contact).addScaledVector(direction, distance * (1 - settle));
  }
  return destination;
}
