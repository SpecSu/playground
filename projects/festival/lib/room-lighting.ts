import { LIGHT_MODES } from './room-types';
import type { LightMode, RoomLightCycle } from './room-types';

export const LIGHT_IDLE_INTERVAL_MS = 60_000;

/** Project one persisted manual choice on the shared clock, without events or writes. */
export function lightModeAt(cycle: RoomLightCycle | undefined, serverNow: number, fallback: LightMode = 'neon'): LightMode {
  if (!cycle || !Number.isFinite(cycle.startedAt) || !Number.isFinite(serverNow)) return fallback;
  const index = LIGHT_MODES.indexOf(cycle.mode);
  if (index < 0) return fallback;
  const elapsed = Math.max(0, serverNow - cycle.startedAt);
  const steps = Math.floor(elapsed / LIGHT_IDLE_INTERVAL_MS);
  return LIGHT_MODES[(index + steps % LIGHT_MODES.length) % LIGHT_MODES.length];
}
