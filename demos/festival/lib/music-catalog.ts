import { RECORDED_MUSIC_ASSETS } from './music-assets.ts';

/** Historical wire IDs remain readable; only canonical recordings are selectable. */
export const TRACK_IDS = ['neon-house', 'midnight-techno', 'mirrorball-disco', 'sun-goes-down', 'arabic-nights', 'deep-woyak', 'filtered-chords', 'runway-poise', 'tech-house-groove', 'understated-groove', 'meditative-groove'] as const;
export type TrackId = (typeof TRACK_IDS)[number];
export type MusicSection = 'intro' | 'build' | 'drop' | 'break' | 'return';
export interface MusicCue {
  readonly startMs: number;
  readonly section: MusicSection;
  readonly energy: number;
  readonly kickOn: boolean;
}
export interface ClubTrack {
  readonly id: TrackId;
  readonly title: string;
  readonly artist: string;
  readonly genre: string;
  readonly description: string;
  readonly bpm: number;
  readonly beatsPerBar: number;
  readonly bars: number;
  readonly loopBeats: number;
  readonly durationMs: number;
  readonly durationSeconds: number;
  readonly downbeatOffsetMs: number;
  readonly original: false;
  /** Measured constant loudness matching, separate from the listener's volume. */
  readonly playbackGain: number;
  readonly color: string;
  readonly audioUrl: string;
  readonly audioBytes: number;
  readonly audioSha256: string;
  readonly creditsUrl: string;
  readonly sourceUrl: string;
  readonly licenseUrl: string | null;
  readonly rightsKind?: 'cc-by' | 'user-authorized-demo';
  readonly attribution: string;
  readonly changes: string;
  readonly sections: readonly MusicCue[];
  readonly envelope: { readonly stepMs: number; readonly values: readonly number[] };
}

type RecordedMetadata = Omit<ClubTrack, 'durationSeconds' | 'bars' | 'color' | 'original'>;
const COLORS = { 'neon-house': '#67dfff', 'midnight-techno': '#a78bfa', 'mirrorball-disco': '#ff80ca', 'sun-goes-down': '#ffc675', 'arabic-nights': '#ff927a', 'deep-woyak': '#8fe2b1', 'filtered-chords': '#67dfff', 'runway-poise': '#ffc675', 'tech-house-groove': '#a78bfa', 'understated-groove': '#8fe2b1', 'meditative-groove': '#c9a5ff' };
export const MUSIC_CATALOG: readonly ClubTrack[] = Object.freeze(
  (RECORDED_MUSIC_ASSETS as readonly RecordedMetadata[]).map((asset) => Object.freeze({
    ...asset,
    durationSeconds: asset.durationMs / 1000,
    bars: asset.loopBeats / asset.beatsPerBar,
    color: COLORS[asset.id],
    original: false as const,
  })),
);
export const DEFAULT_TRACK_ID: TrackId = 'filtered-chords';
export function isTrackId(value: unknown): value is TrackId {
  return typeof value === 'string' && (TRACK_IDS as readonly string[]).includes(value);
}
export function getTrack(id: string): ClubTrack {
  const canonical = ['neon-house', 'midnight-techno', 'mirrorball-disco', 'sun-goes-down', 'deep-woyak'].includes(id) ? 'arabic-nights' : id;
  const track = MUSIC_CATALOG.find((item) => item.id === canonical);
  if (!track) throw new RangeError(`Unknown track: ${id}`);
  return track;
}

export interface TrackTiming {
  playing: boolean;
  elapsedMs: number;
  startsInMs: number;
  positionMs: number;
  positionSeconds: number;
  durationMs: number;
  progress: number;
  /** Local beat/bar wraps through the preceding beat during a recorded lead-in. */
  beat: number;
  beatPhase: number;
  absoluteBeat: number;
  bar: number;
  loop: number;
  pulse: number;
}
const clamp = (value: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
const modulo = (value: number, length: number) => ((value % length) + length) % length;

/** Audio, progress and visual phase share the same server epoch and actual clip length. */
export function getTrackTiming(trackOrId: ClubTrack | string, startsAtServerMs: number, nowServerMs: number): TrackTiming {
  if (!Number.isFinite(startsAtServerMs) || !Number.isFinite(nowServerMs)) throw new RangeError('Track timing requires finite timestamps');
  const track = typeof trackOrId === 'string' ? getTrack(trackOrId) : trackOrId;
  const rawElapsed = nowServerMs - startsAtServerMs;
  const elapsedMs = Math.max(0, rawElapsed);
  const roundoff = Math.max(1e-7, elapsedMs * Number.EPSILON * 4);
  const quotient = elapsedMs / track.durationMs;
  const nearestLoop = Math.round(quotient);
  const loop = Math.abs(quotient - nearestLoop) * track.durationMs < roundoff ? nearestLoop : Math.floor(quotient);
  const rawPosition = elapsedMs - loop * track.durationMs;
  const positionMs = Math.abs(rawPosition) < roundoff ? 0 : rawPosition;
  // Re-anchor musical phase on every recording loop. Duration is never inferred
  // from a nominal BPM: codec/sample rounding must not accumulate visual drift.
  const beatFloat = (positionMs - track.downbeatOffsetMs) * track.bpm / 60000;
  const nearestBeat = Math.round(beatFloat);
  const preciseBeat = Math.abs(beatFloat - nearestBeat) < 1e-9 ? nearestBeat : beatFloat;
  // Keep a signed pre-downbeat phase. Clamping here would freeze choreography
  // during every lead-in and jump at the loop seam, especially for long offsets.
  const wholeBeat = Math.floor(preciseBeat);
  const beat = modulo(wholeBeat, track.loopBeats);
  const beatPhase = preciseBeat - wholeBeat;
  return {
    playing: rawElapsed >= 0, elapsedMs, startsInMs: Math.max(0, -rawElapsed),
    positionMs, positionSeconds: positionMs / 1000, durationMs: track.durationMs,
    progress: positionMs / track.durationMs,
    beat, beatPhase, absoluteBeat: loop * track.loopBeats + wholeBeat,
    bar: Math.floor(beat / track.beatsPerBar), loop,
    pulse: rawElapsed >= 0 && positionMs >= track.downbeatOffsetMs ? Math.exp(-beatPhase * 9) : 0,
  };
}

export interface MusicSectionEnergy {
  section: MusicSection;
  sectionIndex: number;
  sectionProgress: number;
  bar: number;
  energy: number;
  beatPulse: number;
  downbeat: number;
  build: number;
  drop: number;
  kickOn: boolean;
}

function recordingEnvelope(track: ClubTrack, positionMs: number): number {
  const { values, stepMs } = track.envelope;
  const frame = positionMs / stepMs;
  const index = Math.min(values.length - 1, Math.floor(frame));
  const next = Math.min(index + 1, values.length - 1);
  return clamp(values[index] + (values[next] - values[index]) * (frame - Math.floor(frame)));
}

/**
 * Real recording cues plus a compact offline RMS envelope, sampled by shared time.
 * Pass TrackTiming for exact clip time. A numeric musical beat remains supported
 * for existing callers, but cannot represent a pre-downbeat lead-in precisely.
 */
export function getMusicSectionEnergy(trackOrId: ClubTrack | string, timingOrBeat: TrackTiming | number): MusicSectionEnergy {
  const track = typeof trackOrId === 'string' ? getTrack(trackOrId) : trackOrId;
  let timing: TrackTiming;
  if (typeof timingOrBeat === 'number') {
    if (!Number.isFinite(timingOrBeat)) throw new RangeError('Music energy requires a finite beat');
    const beat = Math.max(0, timingOrBeat);
    const position = modulo(beat, track.loopBeats) * 60000 / track.bpm + track.downbeatOffsetMs;
    timing = getTrackTiming(track, 0, Math.min(position, track.durationMs - 0.000001));
  } else {
    timing = timingOrBeat;
    if (!Number.isFinite(timing.positionMs) || !Number.isFinite(timing.beatPhase)) throw new RangeError('Music energy requires finite timing');
  }
  const position = timing.positionMs;
  let sectionIndex = 0;
  while (sectionIndex < track.sections.length - 1 && position >= track.sections[sectionIndex + 1].startMs) sectionIndex++;
  const cue = track.sections[sectionIndex];
  const end = track.sections[sectionIndex + 1]?.startMs ?? track.durationMs;
  const localMs = Math.max(0, position - cue.startMs);
  const sectionProgress = clamp(localMs / (end - cue.startMs));
  const active = timing.playing && position >= track.downbeatOffsetMs;
  const kickOn = active && cue.kickOn;
  const beatInBar = modulo(timing.beat + timing.beatPhase, track.beatsPerBar);
  return {
    section: cue.section, sectionIndex, sectionProgress, bar: timing.bar,
    energy: timing.playing ? clamp(recordingEnvelope(track, position) * 0.75 + cue.energy * 0.25) : 0,
    beatPulse: kickOn ? timing.pulse : 0,
    downbeat: kickOn ? Math.exp(-beatInBar * 9) : 0,
    build: timing.playing && cue.section === 'build' ? sectionProgress : 0,
    drop: timing.playing && (cue.section === 'drop' || cue.section === 'return') ? Math.exp(-localMs * track.bpm / 60000 * 0.55) : 0,
    kickOn,
  };
}
