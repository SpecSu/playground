/** Playlist controls choose a target; only the room server changes the shared song/anchor. */
export function adjacentTrack<T extends { readonly id: string }>(tracks: readonly T[], currentId: string, direction: -1 | 1): T | null {
  if (tracks.length < 2) return null;
  const index = Math.max(0, tracks.findIndex((track) => track.id === currentId));
  return tracks[(index + direction + tracks.length) % tracks.length];
}

/** The server supplies the persisted room seed; this never reads a client RNG. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const order = [...items];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

type SharedControlState = {
  ready: boolean; pending: boolean; now: number; blockedUntil: number;
};

/** A connected listener can use shared controls without taking a dance-floor seat. */
export function canUseSharedControls(state: SharedControlState): boolean {
  return state.ready && !state.pending && state.now >= state.blockedUntil;
}

export function canNavigateTracks(state: SharedControlState & { trackCount: number }): boolean {
  return canUseSharedControls(state) && state.trackCount > 1;
}

/** Respect the server's retry window without silently queuing another shared change. */
export function controlRetryUntil(now: number, retryAfterMs?: number): number {
  return now + (Number.isFinite(retryAfterMs) ? Math.max(1, Math.min(60_000, retryAfterMs!)) : 1000);
}
