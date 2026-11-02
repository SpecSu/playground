/** Input guards shared by keyboard/touch judging. Chart time is server-relative. */
export function danceKeyLane(key: string, repeat: boolean, typing: boolean): number | null {
  if (repeat || typing) return null;
  const lane = ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'].indexOf(key);
  return lane < 0 ? null : lane;
}
type Note = { id: number; lane: number; atMs: number };
export function chooseDanceNote<T extends Note>(chart: readonly T[], consumed: ReadonlySet<number>, lane: number, elapsed: number): T | undefined {
  return chart.filter(note => note.lane === lane && !consumed.has(note.id) && Math.abs(note.atMs - elapsed) <= 180).sort((a,b) => Math.abs(a.atMs-elapsed)-Math.abs(b.atMs-elapsed))[0];
}
export function expiredDanceNotes<T extends Note>(chart: readonly T[], consumed: ReadonlySet<number>, elapsed: number): T[] {
  return chart.filter(note => !consumed.has(note.id) && elapsed - note.atMs > 180);
}
export function canPlayDanceRound(joined: boolean, inRoster: boolean, firstSeenAt: number, startsAt: number): boolean {
  return joined && inRoster && firstSeenAt <= startsAt;
}
