import * as THREE from 'three';
import { constrainManualPosition, type ManualPoint } from './club-manual-motion.ts';

export interface ScreenPoint { x: number; y: number }
export interface FloorBounds { left: number; top: number; width: number; height: number }
interface FloorPointer { pointerId: number; clientX: number; clientY: number; button: number; isPrimary: boolean; pointerType: string; timeStamp: number }
const inside = (point: ScreenPoint, bounds: FloorBounds) => [point.x, point.y, bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isFinite) && bounds.width > 0 && bounds.height > 0 && point.x >= bounds.left && point.x <= bounds.left + bounds.width && point.y >= bounds.top && point.y <= bounds.top + bounds.height;

/** CSS-pixel intent classifier. Once a gesture drags, returning cannot turn it into a tap. */
export class FloorPointerGesture {
 private pointer: { id: number; origin: ScreenPoint; last: ScreenPoint; at: number; threshold: number; dragged: boolean } | null = null;
 get pointerId() { return this.pointer?.id ?? null; }
 begin(event: FloorPointer) {
  if (this.pointer) { if (this.pointer.id !== event.pointerId) this.cancel(); return false; }
  if (!event.isPrimary || event.button !== 0 || !Number.isFinite(event.clientX + event.clientY + event.timeStamp)) return false;
  const point = { x: event.clientX, y: event.clientY };
  this.pointer = { id: event.pointerId, origin: point, last: point, at: event.timeStamp, threshold: event.pointerType === 'touch' ? 10 : 6, dragged: false };
  return true;
 }
 move(event: Pick<FloorPointer, 'pointerId' | 'clientX' | 'clientY'>): ScreenPoint | null {
  const pointer = this.pointer;
  if (!pointer || pointer.id !== event.pointerId || !Number.isFinite(event.clientX + event.clientY)) return null;
  const point = { x: event.clientX, y: event.clientY };
  if (!pointer.dragged && Math.hypot(point.x - pointer.origin.x, point.y - pointer.origin.y) <= pointer.threshold) return null;
  pointer.dragged = true;
  const delta = { x: point.x - pointer.last.x, y: point.y - pointer.last.y }; pointer.last = point;
  return delta;
 }
 end(event: Pick<FloorPointer, 'pointerId' | 'clientX' | 'clientY' | 'timeStamp'>, bounds: FloorBounds): ScreenPoint | null {
  const pointer = this.pointer;
  if (!pointer || pointer.id !== event.pointerId) return null;
  this.pointer = null;
  const point = { x: event.clientX, y: event.clientY }, elapsed = event.timeStamp - pointer.at;
  return !pointer.dragged && elapsed >= 0 && elapsed <= 350 && Math.hypot(point.x - pointer.origin.x, point.y - pointer.origin.y) <= pointer.threshold && inside(point, bounds) ? point : null;
 }
 cancel() { this.pointer = null; }
}

/** Pick visible ground, then resolve its nearest safe walking endpoint. The
 * rendered floor extends beyond navigation bounds, without a visible boundary.
 * Ground taps there should still respond without changing collision limits. */
export function pickClubFloor(point: ScreenPoint, bounds: FloorBounds, camera: THREE.Camera, floor: THREE.Object3D, blockers: readonly THREE.Object3D[]): ManualPoint | null {
 if (!inside(point, bounds)) return null;
 const ray = new THREE.Raycaster();
 ray.setFromCamera(new THREE.Vector2((point.x - bounds.left) / bounds.width * 2 - 1, 1 - (point.y - bounds.top) / bounds.height * 2), camera);
 floor.updateWorldMatrix(true, false);
 const hit = ray.intersectObject(floor, false)[0];
 if (!hit) return null;
 // Match the production shader's fully transparent rim; faint visible ground
 // stays selectable, but the invisible remainder of the plane is background.
 const extent = floor.userData.floorPickExtent;
 if (Number.isFinite(extent) && Math.max(Math.abs(hit.point.x), Math.abs(hit.point.z)) >= extent - 1e-9) return null;
 const meshes: THREE.Object3D[] = [];
 for (const root of blockers) {
  root.updateWorldMatrix(true, true);
  root.traverseVisible(node => {
   // A booth includes its soft shadow plane; alpha-mapped decoration is not a
   // solid even where Three.js raycasting intersects its invisible pixels.
   if (node.userData.floorPickThrough) return;
   if (!(node instanceof THREE.Mesh) || !(Array.isArray(node.material) ? node.material : [node.material]).some(material => material.visible)) return;
   // Skinned mesh bounding volumes otherwise describe an earlier animation frame.
   if (node instanceof THREE.SkinnedMesh) { node.skeleton.update(); node.computeBoundingBox(); node.computeBoundingSphere(); }
   meshes.push(node);
  });
 }
 if (ray.intersectObjects(meshes, false).some(block => block.distance < hit.distance - .001)) return null;
 return constrainManualPosition(hit.point);
}
