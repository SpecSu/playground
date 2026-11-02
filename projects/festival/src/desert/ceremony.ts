import { clamp01, seededRandom, smoothstep } from './visual-math.ts';

export interface CeremonyRound { index: number; burnAt: number; ashesAt: number; endsAt: number }
export interface FestivalCeremonyState {
 elapsed: number;
 burning: boolean;
 night: number;
 intensity: number;
 turnRadians: number;
}
export const FESTIVAL_PHOTO_PEAK_SECONDS = 22;
export const FESTIVAL_PHOTO_LAST_SECONDS = 29;

/** All ceremonial cues seek the server clock, never accumulated frame time. */
export function festivalCeremonyAt(now: number, round: CeremonyRound | null): FestivalCeremonyState {
 if (!round || !Number.isFinite(now)) return { elapsed: 0, burning: false, night: 0, intensity: 0, turnRadians: 0 };
 const duration = Math.max(.001, (round.ashesAt - round.burnAt) / 1000);
 const elapsed = (now - round.burnAt) / 1000;
 const burning = elapsed >= 0 && now < round.ashesAt;
 const night = smoothstep(0, Math.min(9, duration * .3), elapsed) * (1 - smoothstep(round.ashesAt, round.endsAt, now));
 const intensity = burning ? smoothstep(0, 1.5, elapsed) * (1 - smoothstep(duration - 3, duration, elapsed)) : 0;
 const p = clamp01(elapsed / duration);
 // Eight complete turns, slowly accelerating and braking. The integral of a
 // raised cosine is continuous and ends on the original stone grain alignment.
 const turns = 8 * (p - Math.sin(p * Math.PI * 2) / (Math.PI * 2));
 return { elapsed, burning, night, intensity, turnRadians: burning ? turns * Math.PI * 2 : 0 };
}

export interface FestivalFireworkBurst {
 x: number; y: number; z: number; startsAt: number; duration: number; radius: number; color: number;
}
const COLORS = [0xffbf74, 0xffd59a, 0xffaa65, 0xffecd2, 0xffdba6, 0xffc28b] as const;

/** Broad spherical crowns stay near the monument inside the portrait aerial frustum. */
export function festivalFireworkSchedule(roundIndex: number): FestivalFireworkBurst[] {
 const random = seededRandom(roundIndex * 977 + 57177);
 return Array.from({ length: 20 }, (_, index) => {
  const angle = index * 2.399963 + random() * .35;
  const radius = 18 + random() * 14;
  return {
   x: Math.sin(angle) * radius,
   y: 41 + random() * 12,
   z: Math.cos(angle) * radius,
   startsAt: 1.1 + index * 1.43 + random() * .14,
   duration: 4.8 + random() * .45,
   radius: 18 + random() * 7,
   color: COLORS[index % COLORS.length],
  };
 });
}
