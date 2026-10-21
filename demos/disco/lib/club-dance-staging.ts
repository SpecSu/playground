import * as THREE from 'three';
import { getTrackTiming, getMusicSectionEnergy, type MusicSectionEnergy } from './music-catalog.ts';
import { DANCE_TRACK, DANCE_TRACK_BEATS_MS, DANCE_TRACK_SECTIONS } from './dance-track.ts';
import { stagePosition, stablePhase } from './club-scene-math.ts';
import { generateDanceChart, DANCE_LANES, type DanceNote } from './dance-machine.ts';
import { danceCurtainCallPose } from './dance-curtain-call.ts';
import { applyArticulatedDance } from './club-directional-dance.ts';
import { DanceInputMotion } from './club-dance-input-motion.ts';
import type { AvatarRig } from './club-scene-world.ts';

export interface DanceStageRound { version?: 1 | 2; id: string; startsAt: number; endsAt: number }
export interface DanceStageFeedback { direction: 'left' | 'up' | 'down' | 'right'; at: number }
/** Round playback temporarily owns both avatar beats and lighting energy. */
export function danceStageTiming(track: { id: string; startedAt: number }, round: (DanceStageRound & { trackId: string }) | null | undefined, now: number) {
  if (round?.trackId === DANCE_TRACK.id && danceStageActive(round, now)) {
    const elapsed = Math.max(0, now - round.startsAt);
    let beatIndex = 0;
    while (beatIndex < DANCE_TRACK_BEATS_MS.length - 1 && DANCE_TRACK_BEATS_MS[beatIndex + 1] <= elapsed) beatIndex++;
    const beatStart = DANCE_TRACK_BEATS_MS[beatIndex];
    const beatLength = (DANCE_TRACK_BEATS_MS[beatIndex + 1] ?? beatStart + 60000 / DANCE_TRACK.bpm) - beatStart;
    const beat = beatIndex + (elapsed - beatStart) / beatLength;
    let sectionIndex = 0;
    while (sectionIndex < DANCE_TRACK_SECTIONS.length - 1 && DANCE_TRACK_SECTIONS[sectionIndex + 1].startMs <= elapsed) sectionIndex++;
    const cue = DANCE_TRACK_SECTIONS[sectionIndex];
    const playing = now >= round.startsAt;
    const phase = ((beat % 1) + 1) % 1;
    const progress = Math.max(0, Math.min(1, (elapsed - cue.startMs) / (cue.endMs - cue.startMs)));
    const section: MusicSectionEnergy = {
      section: cue.energy >= 0.9 ? 'drop' : cue.energy >= 0.7 ? 'build' : 'break',
      sectionIndex, sectionProgress: progress, bar: Math.floor(beat / 4),
      energy: playing ? cue.energy : 0,
      beatPulse: playing ? Math.exp(-phase * 9) : 0,
      downbeat: playing ? Math.exp(-(((beat % 4) + 4) % 4) * 9) : 0,
      build: cue.energy >= 0.7 && cue.energy < 0.9 ? progress : 0,
      drop: cue.energy >= 0.9 ? Math.exp(-progress * 12) : 0,
      kickOn: playing && cue.energy > 0.4,
    };
    return { beat, section };
  }
  const source = round && danceStageActive(round, now) ? { id: round.trackId, startedAt: round.startsAt } : track;
  const timing = getTrackTiming(source.id, source.startedAt, now);
  return { beat: timing.absoluteBeat + timing.beatPhase, section: getMusicSectionEnergy(source.id, timing) };
}

export const DANCE_STAGE_HEADING = Math.PI / 4;
export const DANCE_SELF_V = 5.7;

/** Presentation coordinates only: shared routes, slots and movement samples remain untouched. */
export function danceStagePosition(index: number, own: boolean) {
  if (own) return stagePosition(0, DANCE_SELF_V);
  // Two flanking columns use the existing floor, rather than packing doubled
  // skins into the former 1.45 m crowd grid. The ninth peer is behind the DJ;
  // the tenth centre-front seat is used only when there is no local dancer.
  if (index >= 8) return stagePosition(0, index === 8 ? -5.5 : 3.5);
  const side = index % 2 === 0 ? -1 : 1;
  const pair = Math.floor(index / 2);
  return stagePosition(side * 3.2, 3.5 - pair * 3);
}

export function danceStageActive(round: DanceStageRound | null | undefined, now: number): boolean {
  // Staging begins during the shared countdown, including viewers joining mid-round.
  return Boolean(round && now < round.endsAt);
}

export const DANCE_GESTURE_MS = 440;
/** Rubber-body envelope: continuous ease in/out rather than abruptly switched poses. */
export function danceDirectionalPose(direction: DanceStageFeedback['direction'], ageMs: number) {
  const t = Math.max(0, Math.min(1, ageMs / DANCE_GESTURE_MS));
  const pulse = ageMs >= 0 && ageMs < DANCE_GESTURE_MS ? Math.sin(Math.PI * t) ** 2 : 0;
  const side = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
  const rebound = direction === 'down' && t > 0.55 && t < 1 ? Math.sin(Math.PI * (t - 0.55) / 0.45) ** 2 : 0;
  return {
    sideways: side * pulse * 0.58,
    lean: -side * pulse * 0.24,
    lift: direction === 'up' ? pulse * 1.05 : rebound * 0.22,
    scaleY: direction === 'down' ? 1 - pulse * 0.43 : direction === 'up' ? 1 + pulse * 0.14 : 1 + pulse * 0.06,
    scaleWide: direction === 'down' ? 1 + pulse * 0.25 : direction === 'up' ? 1 - pulse * 0.08 : 1 - pulse * 0.035,
  };
}


/** All viewers predict the same score-chart moves. This is choreography, not remote input telemetry. */
export function danceChartFeedback(chart: readonly DanceNote[], startsAt: number, now: number): DanceStageFeedback | null {
  const elapsed = now - startsAt;
  let latest: DanceNote | undefined;
  for (const note of chart) { if (note.atMs > elapsed) break; latest = note; }
  return latest && elapsed - latest.atMs < DANCE_GESTURE_MS ? { direction: DANCE_LANES[latest.lane], at: startsAt + latest.atMs } : null;
}

/** Small local crowd timing variation, never presented as another player's real inputs. */
export function danceCrowdNoteOffset(actorKey: string, noteId: number): number {
  const actorOffset = (stablePhase(actorKey) * 2 - 1) * 75;
  const noteJitter = (stablePhase(`${actorKey}:note:${noteId}`) * 2 - 1) * 15;
  return Math.round(actorOffset + noteJitter);
}
export function danceCrowdChartFeedback(chart: readonly DanceNote[], startsAt: number, now: number, actorKey: string): DanceStageFeedback | null {
  let latest: DanceStageFeedback | null = null;
  for (const note of chart) {
    const at = startsAt + note.atMs + danceCrowdNoteOffset(actorKey, note.id);
    if (at > now) break;
    latest = { direction: DANCE_LANES[note.lane], at };
  }
  return latest && now - latest.at < DANCE_GESTURE_MS ? latest : null;
}

/** Save and restore every render-only transform before simulation or cleanup. */
export class ClubDanceStaging {
  private saved: { root: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }[] = [];
  private savedNodes = new Set<THREE.Object3D>();
  private inputMotion = new DanceInputMotion();
  private chartKey = '';
  private chart: DanceNote[] = [];
  private save(root: THREE.Object3D) {
    if (this.savedNodes.has(root)) return;
    this.savedNodes.add(root);
    this.saved.push({ root, position: root.position.clone(), quaternion: root.quaternion.clone(), scale: root.scale.clone() });
  }
  private curtain(rig: AvatarRig, pose: NonNullable<ReturnType<typeof danceCurtainCallPose>>) {
    rig.root.rotation.y += pose.turn;
    // Bend above the planted legs. Quadrupeds keep their forelegs/chest grounded.
    const bones = new Map<string, THREE.Object3D>();
    let quadruped = false;
    rig.model.root.traverse(node => {
      if (node.userData.speciesRig === 'quadruped') quadruped = true;
      if ((node as THREE.Bone).isBone) bones.set(node.name, node);
    });
    const bend = (name: string, radians: number) => {
      const bone = bones.get(name);
      if (bone) { this.save(bone); bone.rotateX(radians * pose.bow); }
    };
    if (rig.preset === 'dj-kunkun') { bend('neck', 0.18); bend('head', 0.12); }
    else if (quadruped || rig.preset === 'dj-cockatoo') { bend('neck', 0.36); bend('head', 0.24); }
    else {
      const bodyGain = rig.preset === 'sword-shield-dog' || rig.preset === 'dog' ? 0.6 : 1;
      bend('spine', 0.54 * bodyGain); bend('chest', 0.12 * bodyGain); bend('neck', 0.08);
    }
    rig.model.root.updateMatrixWorld(true);
  }
  restore() {
    for (const { root, position, quaternion, scale } of this.saved) {
      root.position.copy(position); root.quaternion.copy(quaternion); root.scale.copy(scale);
    }
    this.saved = [];
    this.savedNodes.clear();
  }
  apply(rigs: readonly AvatarRig[], ownId: string | null, beat: number, reducedMotion: boolean, energy: number, now: number, feedback?: DanceStageFeedback | null, round?: (DanceStageRound & { seed: string }) | null, residentDj?: AvatarRig) {
    this.restore();
    if (round && this.chartKey !== `${round.seed}:${round.version}`) { this.chartKey = `${round.seed}:${round.version}`; this.chart = generateDanceChart(round.seed, round.version ?? 1); }
    const ceremony = danceCurtainCallPose(round, now, reducedMotion);
    const localInput = this.inputMotion.sample(`${round?.id ?? 'preview'}:${ownId}`, feedback, now);
    let index = 0;
    const ordered = [...rigs].filter(rig => rig.root.visible).sort((a, b) => a.slot - b.slot || a.id.localeCompare(b.id));
    for (const rig of ordered) {
      const own = rig.id === ownId;
      const position = danceStagePosition(own ? 0 : index++, own);
      this.save(rig.root);
      rig.root.position.set(position.x, 0, position.z);
      rig.root.rotation.set(0, DANCE_STAGE_HEADING, 0);
      const motion = { ...rig.motion, ...position, heading: DANCE_STAGE_HEADING, speed: 0, walkBlend: 0, action: 'dance' as const, sampleAtDistance: undefined };
      // The native dance changes bones too; restore those along with root transforms.
      rig.model.root.traverse(node => { if ((node as THREE.Bone).isBone) this.save(node); });
      // Original full skeletal dance continues beneath render-only rubber-body phrases.
      rig.model.update(ceremony ? 0 : beat, 'dance', Boolean(ceremony) || reducedMotion, Math.max(0.85, energy), motion);
      if (ceremony) { this.curtain(rig, ceremony); continue; }
      if (reducedMotion) continue;
      // Each viewer controls only their own avatar. All other actors are local
      // chart dancers with small stable timing offsets, not remote input telemetry.
      const gesture = own ? localInput : round ? danceCrowdChartFeedback(this.chart, round.startsAt, now, `${round.seed}:${rig.id}`) : null;
      if (!gesture) continue;
      applyArticulatedDance(rig, beat, gesture, now, node => this.save(node), 'overlay');
      const pose = danceDirectionalPose(gesture.direction, now - gesture.at);
      const offset = stagePosition(pose.sideways, 0);
      rig.root.position.x += offset.x; rig.root.position.z += offset.z;
      // Keep the wide animal support footprint above the floor during the original lean.
      rig.root.position.y += pose.lift + Math.abs(Math.sin(pose.lean)) * (rig.model.footprintRadius ?? 0) * Math.max(rig.root.scale.x, rig.root.scale.z) * pose.scaleWide;
      rig.root.rotateZ(pose.lean);
      rig.root.scale.multiply(new THREE.Vector3(pose.scaleWide, pose.scaleY, pose.scaleWide));
    }
    if (ceremony && residentDj?.root.visible) {
      this.save(residentDj.root);
      residentDj.model.update(0, 'dance', true, energy);
      this.curtain(residentDj, { ...ceremony, turn: 0 });
    }
  }
}
