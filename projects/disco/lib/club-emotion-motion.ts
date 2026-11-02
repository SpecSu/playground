/** Accepted personal reactions use one six-second wall-clock phrase, not music tempo. */
export const EMOTION_DURATION_MS = 6000;
export const EMOTION_ACTIONS = ['love', 'laugh', 'punch', 'ghost'] as const;
export type EmotionAction = typeof EMOTION_ACTIONS[number];
export function isEmotionAction(action: string): action is EmotionAction {
  return (EMOTION_ACTIONS as readonly string[]).includes(action);
}

const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const pulse = (time: number, start: number, end: number) => time > start && time < end ? Math.sin((time - start) / (end - start) * Math.PI) ** 2 : 0;
// A quick extension and decisive recoil make each hit read as a strike.
const strike = (time: number, peak: number) => smooth((time - peak + 100) / 100) * (1 - smooth((time - peak) / 200));
const REST = Object.freeze({ weight: 0, hug: 0, chuckle: 0, sway: 0, leftPunch: 0, rightPunch: 0, anticipation: 0, spooky: 0 });

/** Analytic sampling allows late joins, dropped frames and repeated commands to seek exactly. */
export function emotionMotionAt(action: EmotionAction, elapsedMs: number) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || elapsedMs >= EMOTION_DURATION_MS) return REST;
  const weight = smooth(elapsedMs / 450) * (1 - smooth((elapsedMs - 5100) / 900));
  const seconds = elapsedMs / 1000;
  return {
    weight,
    hug: action === 'love' ? (.65 + .35 * Math.sin(seconds * Math.PI) ** 2) * weight : 0,
    chuckle: action === 'laugh' ? Math.sin(seconds * Math.PI * 6) * weight : 0,
    sway: Math.sin(seconds * Math.PI * (action === 'laugh' ? .8 : .65)) * weight,
    leftPunch: action === 'punch' ? (strike(elapsedMs, 920) + strike(elapsedMs, 2320) + strike(elapsedMs, 3720)) * weight : 0,
    rightPunch: action === 'punch' ? (strike(elapsedMs, 1620) + strike(elapsedMs, 3020) + strike(elapsedMs, 4420)) * weight : 0,
    anticipation: action === 'punch' ? pulse(elapsedMs, 100, 710) * weight : 0,
    spooky: action === 'ghost' ? Math.sin(seconds * Math.PI * 2.4) * weight : 0,
  };
}
