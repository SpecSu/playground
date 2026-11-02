import { DANCE_TRACK, DANCE_TRACK_CHART } from './dance-track.ts';
import type { AvatarPreset } from './room-types';

export const DANCE_LANES = ['left', 'up', 'down', 'right'] as const;
export const DANCE_DURATION_MS = DANCE_TRACK.durationMs;
export const DANCE_CHART_VERSION = 2 as const;
export const DANCE_MAX_NOTES = Math.max(116, DANCE_TRACK_CHART.length);
export const DANCE_LEAD_MS = 5_000;
export const DANCE_SUBMIT_GRACE_MS = 15_000;
export const DANCE_TRACK_ID = DANCE_TRACK.id;
export const DANCE_BPM = DANCE_TRACK.bpm;
export const DANCE_OFFSET_MS = DANCE_TRACK.offsetMs;
export const DANCE_HIT_WINDOW_MS = 180;
export type DanceJudgment = 'miss' | 'bad' | 'good' | 'cool';
export type DanceNote = { id: number; lane: 0 | 1 | 2 | 3; atMs: number };
export type DanceHit = { noteId: number; offsetMs: number };
export type DanceScore = { score: number; maxCombo: number; counts: Record<DanceJudgment, number> };
export type DanceResult = DanceScore & { actorId: string; submittedAt: number };
export type DanceRosterEntry = { id: string; name: string; preset: AvatarPreset; slot: number; isNpc: boolean };
export type DanceRound = {
  id: string; version: 1 | 2; seed: string; trackId: typeof DANCE_TRACK_ID | 'arabic-nights';
  createdAt: number; startsAt: number; endsAt: number;
  rosterFrozen: boolean; roster: DanceRosterEntry[]; results: DanceResult[];
};
export function danceRoundActive(round: DanceRound | undefined, now: number): boolean { return !!round && now < round.endsAt; }
export function danceRoundPhase(round: DanceRound, now: number): 'countdown' | 'playing' | 'results' {
  return now < round.startsAt ? 'countdown' : now < round.endsAt ? 'playing' : 'results';
}
function randomFor(seed: string) {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}
/** V1 stays readable for persisted rounds; V2 is the measured, authored song chart. */
export function generateDanceChart(seed: string, version: 1 | 2 = 1): DanceNote[] {
  if (version === 2) return DANCE_TRACK_CHART.map(note => ({ ...note }));
  const random = randomFor(seed);
  return Array.from({ length: 116 }, (_, id) => ({ id, lane: Math.floor(random() * 4) as DanceNote['lane'], atMs: 2257.5 + id * 500 }));
}
export function judgeDanceOffset(offsetMs: number): DanceJudgment {
  const distance = Math.abs(offsetMs);
  return distance <= 50 ? 'cool' : distance <= 110 ? 'good' : distance <= DANCE_HIT_WINDOW_MS ? 'bad' : 'miss';
}
/** Invalid/duplicate input is rejected at the command boundary; this also stays bounded for UI use. */
export function scoreDanceHits(chart: readonly DanceNote[], hits: readonly DanceHit[]): DanceScore {
  const byNote = new Map<number, number>();
  for (const hit of hits) if (!byNote.has(hit.noteId) && Number.isFinite(hit.offsetMs)) byNote.set(hit.noteId, hit.offsetMs);
  const counts: DanceScore['counts'] = { miss: 0, bad: 0, good: 0, cool: 0 };
  let score = 0, combo = 0, maxCombo = 0;
  for (const note of chart) {
    const offset = byNote.get(note.id), judgment = offset === undefined ? 'miss' : judgeDanceOffset(offset);
    counts[judgment]++;
    if (judgment === 'cool' || judgment === 'good') { combo++; maxCombo = Math.max(combo, maxCombo); } else combo = 0;
    score += { miss: 0, bad: 100, good: 500, cool: 1000 }[judgment];
  }
  return { score, maxCombo, counts };
}
/** Casual, reproducible opponents: no perfect NPC and no hidden skill escalation. */
export function scoreDanceNpc(seed: string, actorId: string, version: 1 | 2 = 1): DanceScore {
  const random = randomFor(`${seed}:${actorId}`), chart = generateDanceChart(seed, version);
  const hits = chart.flatMap(note => {
    const roll = random();
    return roll < 0.16 ? [] : [{ noteId: note.id, offsetMs: roll < 0.30 ? 150 : roll < 0.75 ? 80 : 20 }];
  });
  return scoreDanceHits(chart, hits);
}
