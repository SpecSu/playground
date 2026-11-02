export interface StickVector { x: number; y: number }
export function normalizeStick(x: number, y: number): StickVector {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
  const length = Math.hypot(x, y);
  if (length < .08) return { x: 0, y: 0 };
  const scale = Math.max(1, length);
  return { x: x / scale, y: y / scale };
}
export function stickFromPoint(x: number, y: number, bounds: { left: number; top: number; width: number; height: number }): StickVector {
  const radius = Math.max(1, Math.min(bounds.width, bounds.height) * .32);
  return normalizeStick((x - bounds.left - bounds.width / 2) / radius, (bounds.top + bounds.height / 2 - y) / radius);
}
const keys: Record<string, StickVector> = {
  ArrowLeft: { x: -1, y: 0 }, KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }, KeyD: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: 1 }, KeyW: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 }, KeyS: { x: 0, y: -1 },
};
/** Owns gesture identity, so cancellation never resumes on a stray move/repeat. */
export class JoystickInput {
  pointerId: number | null = null;
  private held = new Set<string>();
  beginPointer(id: number, button: number, primary: boolean, enabled: boolean) {
    if (!enabled || !primary || button !== 0 || this.pointerId !== null) return false;
    this.held.clear(); this.pointerId = id; return true;
  }
  acceptsPointer(id: number) { return this.pointerId === id; }
  endPointer(id: number) { if (!this.acceptsPointer(id)) return false; this.reset(); return true; }
  reset() { this.pointerId = null; this.held.clear(); }
  hasKeys() { return this.held.size > 0; }
  private keyboardVector() {
    let x = 0, y = 0;
    this.held.forEach(key => { x += keys[key].x; y += keys[key].y; });
    return normalizeStick(x, y);
  }
  keyDown(code: string, repeat: boolean, enabled: boolean): StickVector | null {
    if (!enabled || !keys[code] || this.pointerId !== null || repeat && !this.held.has(code)) return null;
    this.held.add(code); return this.keyboardVector();
  }
  keyUp(code: string): StickVector | null {
    if (!this.held.delete(code)) return null;
    return this.keyboardVector();
  }
}
