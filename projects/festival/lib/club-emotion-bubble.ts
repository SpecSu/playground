import type * as THREE from 'three';
import type { Participant } from './room-types';
import { avatarLabelAnchor } from './club-camera.ts';
import { activePersonalAction } from './room-action-state.ts';

const EMOTION_BUBBLES = {
  love: { emoji: '❤️', label: '喜欢' },
  laugh: { emoji: '🤣', label: '大笑' },
  punch: { emoji: '🥊', label: '挥拳攻击' },
  ghost: { emoji: '👻', label: '搞怪' },
} as const;
type EmotionBubbleAction = keyof typeof EMOTION_BUBBLES;
export interface EmotionBubbleFrame {
  action: EmotionBubbleAction;
  emoji: string;
  label: string;
  scale: number;
  opacity: number;
}
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

/** Presentation only: accepted/optimistic timestamps, never music time or ambient route actions. */
export function emotionBubbleAt(participant: Pick<Participant, 'action' | 'actionAt' | 'actionUntil' | 'joinedAt'> | null | undefined, nowServer: number, reducedMotion = false): EmotionBubbleFrame | null {
  const action = activePersonalAction(participant, nowServer);
  if (!participant || !action || !Object.hasOwn(EMOTION_BUBBLES, action) ||
    !Number.isFinite(participant.actionAt) || !Number.isFinite(participant.actionUntil) || participant.actionAt < participant.joinedAt) return null;
  const emotion = action as EmotionBubbleAction;
  const elapsed = nowServer - participant.actionAt;
  const remaining = participant.actionUntil! - nowServer;
  // The panel itself stays at a fixed world anchor; only its compact pop scales.
  const scale = reducedMotion ? 1 : elapsed < 160 ? 0.72 + 0.4 * smooth(elapsed / 160) : 1.12 - 0.12 * smooth((elapsed - 160) / 200);
  return { action: emotion, ...EMOTION_BUBBLES[emotion], scale, opacity: smooth(remaining / 600) };
}

/** Rest-height anchor above the fixed nickname, independent of all animated bones. */
export function emotionBubbleAnchor(navigationRoot: THREE.Object3D, height: number, target: THREE.Vector3, preset: string): THREE.Vector3 {
  avatarLabelAnchor(navigationRoot, height, target, preset);
  target.y += 0.42;
  return target;
}

/** Caller first checks the body is visible. Clamp the full panel, including its tail,
 * when its taller anchor leaves a phone viewport. The scratch vector is reused.
 */
export function projectEmotionBubble(point: THREE.Vector3, camera: THREE.Camera, width: number, height: number, scratch: THREE.Vector3, nameplateY?: number) {
  const inverse = camera.matrixWorldInverse.elements;
  const cameraZ = inverse[2] * point.x + inverse[6] * point.y + inverse[10] * point.z + inverse[14];
  if (cameraZ >= -0.08 || width < 68 || height < 72) return null;
  scratch.copy(point).project(camera);
  if (!Number.isFinite(scratch.x + scratch.y + scratch.z) || scratch.z < -1 || scratch.z > 1) return null;
  const x = (scratch.x * 0.5 + 0.5) * width;
  const y = Math.min((-scratch.y * 0.5 + 0.5) * height, nameplateY === undefined ? Infinity : nameplateY - 28);
  // 46px panel × 1.12 maximum pop = 51.52px. Keep its full top in view,
  // without an extra margin that would push the frog's bubble into its name.
  return { x: Math.max(34, Math.min(width - 34, x)), y: Math.max(52, Math.min(height - 12, y)), depth: scratch.z };
}
