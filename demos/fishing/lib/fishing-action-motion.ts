import type { FishingState } from './fishing-types.ts';

export type FishingActionStage = 'idle' | 'windup' | 'cast' | 'flight' | 'waiting' | 'bite' | 'reel' | 'lift' | 'holding';
/** Visual-only tracks. They never change the authoritative fishing phase or deadlines. */
export interface FishingActionPose {
  stage: FishingActionStage;
  /** One-handed upright rest pose, blended out as the cast begins. */
  restProgress: number;
  rodPitch: number;
  bodyLean: number;
  /** Height/reach offsets expressed as a fraction of the avatar's natural height. */
  gripLift: number;
  gripReach: number;
  castFlight: number;
  haulProgress: number;
  showcaseProgress: number;
  rodVisible: boolean;
  lineVisible: boolean;
  catchVisible: boolean;
  settled: boolean;
}
export const FISHING_CAST_DURATION_MS = 1540;
export const FISHING_HAUL_DURATION_MS = 1450;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
type Keyframe = readonly [ms: number, pitch: number, lean: number, lift: number, reach: number];
const CAST_KEYS: readonly Keyframe[] = [
  [0, 0, 0, 0, 0],
  [320, -1.4, .14, .12, -.12],
  [520, .24, -.12, .035, .1],
  [960, .1, -.035, .015, .035],
  [1540, 0, 0, 0, 0],
];
const HAUL_KEYS: readonly Keyframe[] = [
  [0, 0, 0, 0, 0],
  [280, -.95, .13, .1, -.07],
  [700, -1.2, .1, .16, -.09],
  [1020, -.62, .055, .09, -.04],
  [1450, 0, 0, 0, 0],
];
function poseAt(keys: readonly Keyframe[], elapsed: number) {
  let index = 1;
  while (index < keys.length - 1 && elapsed > keys[index][0]) index++;
  const a = keys[index - 1], b = keys[index], t = smooth((elapsed - a[0]) / (b[0] - a[0]));
  return { rodPitch: a[1] + (b[1] - a[1]) * t, bodyLean: a[2] + (b[2] - a[2]) * t,
    gripLift: a[3] + (b[3] - a[3]) * t, gripReach: a[4] + (b[4] - a[4]) * t };
}
function age(nowMs: number, startedAt: number | undefined) {
  return startedAt !== undefined && Number.isFinite(startedAt) && Number.isFinite(nowMs)
    ? Math.max(0, nowMs - startedAt) : Infinity;
}
/** Sample the same action on every client, including after refresh or a late snapshot. */
export function sampleFishingAction(state: FishingState, nowMs: number, reducedMotion = false): FishingActionPose {
  const waiting = state.phase === 'waiting' || state.phase === 'bite', holding = state.phase === 'holding';
  const result: FishingActionPose = { stage: holding ? 'holding' : waiting ? state.phase as 'waiting' | 'bite' : 'idle',
    restProgress: state.phase === 'idle' || state.phase === 'escaped' ? 1 : 0,
    rodPitch: 0, bodyLean: 0, gripLift: 0, gripReach: 0,
    castFlight: 1, haulProgress: holding ? 1 : 0, showcaseProgress: holding ? 1 : 0,
    rodVisible: !holding, lineVisible: waiting, catchVisible: holding, settled: true };
  if (reducedMotion) return result;
  const castAge = age(nowMs, state.castAt);
  if (state.phase === 'waiting' && castAge < FISHING_CAST_DURATION_MS) {
    Object.assign(result, poseAt(CAST_KEYS, castAge));
    result.restProgress = 1 - smooth(castAge / 240);
    result.stage = castAge < 320 ? 'windup' : castAge < 520 ? 'cast' : 'flight';
    result.castFlight = smooth((castAge - 520) / 860);
    result.settled = false;
  } else if (state.phase === 'bite') {
    // A small, stable tension pose. Ambient movement is handled by the avatar.
    result.rodPitch = -.1;
    result.bodyLean = .025;
  }
  const haulAge = age(nowMs, state.catch?.caughtAt);
  if (holding && haulAge < FISHING_HAUL_DURATION_MS) {
    Object.assign(result, poseAt(HAUL_KEYS, haulAge));
    result.stage = haulAge < 280 ? 'reel' : haulAge < 1020 ? 'lift' : 'holding';
    result.haulProgress = smooth((haulAge - 280) / (FISHING_HAUL_DURATION_MS - 280));
    result.showcaseProgress = smooth((haulAge - 1020) / 230);
    result.catchVisible = haulAge >= 280;
    // Stow the rod as the support pose opens; fish and palms arrive together.
    result.rodVisible = haulAge < 1020;
    result.lineVisible = haulAge < 1020;
    result.settled = false;
  }
  return result;
}

/** Per-visible-actor visual clock; server phases and deadlines always take priority. */
export class FishingActionTimeline {
  private observed = false;
  private visualNow = -Infinity;
  private readonly casts = new Map<string, number>();
  private readonly catches = new Map<string, number>();

  sample(state: FishingState, serverNowMs: number, visualNowMs: number, reducedMotion = false): FishingActionPose {
    const previousClock = this.visualNow;
    this.visualNow = Math.max(this.visualNow, Number.isFinite(visualNowMs) ? visualNowMs : 0);
    const clock = this.visualNow, continuouslyVisible = this.observed && clock - previousClock <= 1000;
    const castKey = state.castId ?? (Number.isFinite(state.castAt) ? `at:${state.castAt}` : undefined);
    const catchKey = state.catch?.id;
    const observe = (key: string | undefined, starts: Map<string, number>, startedAt: number | undefined, duration: number) => {
      if (!key) return;
      if (!starts.has(key)) {
        const authoritativeAge = age(serverNowMs, startedAt);
        // A cold observer sees the real current pose. An actor already on screen
        // receives a readable gesture even when the command ACK took two seconds.
        // Old remote records and a suspended-tab return retain their true age.
        const initialAge = continuouslyVisible && authoritativeAge <= 5000 ? Math.min(120, authoritativeAge) : authoritativeAge;
        starts.set(key, clock - initialAge);
      }
      if (reducedMotion) starts.set(key, Math.min(starts.get(key)!, clock - duration));
    };
    observe(castKey, this.casts, state.castAt, FISHING_CAST_DURATION_MS);
    observe(catchKey, this.catches, state.catch?.caughtAt, FISHING_HAUL_DURATION_MS);
    this.observed = true;
    if (state.phase === 'waiting' && castKey) {
      const elapsed = clock - this.casts.get(castKey)!;
      return sampleFishingAction({ ...state, castAt: serverNowMs - elapsed }, serverNowMs, reducedMotion);
    }
    if (state.phase === 'holding' && state.catch && catchKey) {
      const elapsed = clock - this.catches.get(catchKey)!;
      return sampleFishingAction({ ...state, catch: { ...state.catch, caughtAt: serverNowMs - elapsed } }, serverNowMs, reducedMotion);
    }
    // In particular, bite/escape never wait for a delayed casting animation.
    return sampleFishingAction(state, serverNowMs, reducedMotion);
  }
}
