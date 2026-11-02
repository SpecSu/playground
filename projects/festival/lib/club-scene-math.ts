/** Pure choreography shared by every viewer; no frame delta or random state. */
export type ClubAction = 'dance' | 'bounce' | 'spin' | 'wave';
export interface DancePose {
  lift: number;
  sway: number;
  turn: number;
  lean: number;
  leftArm: number;
  rightArm: number;
  leftLeg: number;
  rightLeg: number;
  headTilt: number;
}

const TAU = Math.PI * 2;

export function beatAt(nowServerMs: number, startedAt: number, bpm: number): number {
  return Math.max(0, nowServerMs - startedAt) * bpm / 60_000;
}

export function stablePhase(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (hash >>> 0) / 4294967296;
}

/** Ground basis: u is camera-horizontal, v approaches the isometric camera. */
export function stagePosition(u: number, v: number): { x: number; z: number } {
  return { x: (u + v) * Math.SQRT1_2, z: (v - u) * Math.SQRT1_2 };
}

// Ten stable seats surround a protected central DJ footprint. No shuffling on join.
const SLOTS = [
  [-2.8, 2.8], [2.8, 2.8], [-3.2, 0], [3.2, 0],
  [-2.8, -2.8], [2.8, -2.8], [0, -3.4], [0, 3.4],
  [-1.5, 5.2], [1.5, 5.2],
].map(([u, v]) => stagePosition(u, v));

export function clubCameraFrustum(width: number, height: number) {
  const aspect = Math.max(1, width) / Math.max(1, height);
  const viewHeight = Math.max(10.2, 10.8 / aspect);
  const viewWidth = viewHeight * aspect;
  return { left: -viewWidth / 2, right: viewWidth / 2, top: viewHeight / 2, bottom: -viewHeight / 2 };
}

export function dancerSlot(slot: number): { x: number; z: number } {
  const index = ((Math.trunc(slot) % SLOTS.length) + SLOTS.length) % SLOTS.length;
  return { ...SLOTS[index] };
}

export function choreographyAt(beat: number, action: ClubAction, phase: number, reducedMotion: boolean): DancePose {
  const t = beat * TAU;
  const offset = phase * TAU;
  if (reducedMotion) return { lift: 0, sway: 0, turn: 0, lean: 0, leftArm: -0.3, rightArm: 0.3, leftLeg: 0, rightLeg: 0, headTilt: 0 };
  const bounce = (1 - Math.cos(t)) * 0.5;
  const sway = Math.sin(t * 0.5 + offset);
  const pose: DancePose = {
    lift: bounce * 0.11,
    sway: sway * 0.1,
    turn: Math.sin(t * 0.25 + offset) * 0.15,
    lean: sway * 0.1,
    leftArm: -0.55 - Math.sin(t * 0.5) * 0.43,
    rightArm: 0.55 + Math.cos(t * 0.5) * 0.43,
    leftLeg: Math.sin(t * 0.5) * 0.28,
    rightLeg: -Math.sin(t * 0.5) * 0.28,
    headTilt: Math.sin(t * 0.5 + 0.3) * 0.1,
  };
  if (action === 'bounce') {
    pose.lift = bounce * 0.52;
    pose.sway = 0;
    pose.leftArm = -0.6 - bounce * 0.65;
    pose.rightArm = 0.6 + bounce * 0.65;
    pose.leftLeg = bounce * 0.2;
    pose.rightLeg = -bounce * 0.2;
  } else if (action === 'spin') {
    pose.turn = beat * Math.PI * 0.5 + offset;
    pose.lift = bounce * 0.05;
    pose.leftArm = -1.5;
    pose.rightArm = 1.5;
    pose.lean = 0;
  } else if (action === 'wave') {
    pose.leftArm = -0.3;
    pose.rightArm = 2.5 + Math.sin(t) * 0.36;
    pose.headTilt = -0.15;
    pose.lift *= 0.6;
  }
  return pose;
}

export function pixelRatio(deviceRatio: number): number {
  return Number.isFinite(deviceRatio) && deviceRatio > 0 ? Math.min(deviceRatio, 1.5) : 1;
}

export function createDisposalScope() {
  const resources = new Set<{ dispose(): void }>();
  let disposed = false;
  return {
    track<T extends { dispose(): void }>(resource: T): T {
      if (disposed) resource.dispose();
      else resources.add(resource);
      return resource;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const resource of resources) resource.dispose();
      resources.clear();
    },
  };
}
