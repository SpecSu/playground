import { ARTICULATED_GESTURE_MS, type DanceDirection } from './club-directional-dance.ts';
type Input = { direction: DanceDirection; at: number };
/** Local presentation only. Fresh up presses queue a bounce instead of resetting its preload. */
export class DanceInputMotion {
  private generation = '';
  private lastInputAt = -Infinity;
  private jumpStartedAt: number | null = null;
  private jumpQueued = false;
  sample(generation: string, input: Input | null | undefined, now: number): Input | null {
    if (generation !== this.generation) {
      this.generation = generation; this.lastInputAt = -Infinity; this.jumpStartedAt = null; this.jumpQueued = false;
    }
    if (input && input.at > this.lastInputAt && input.at <= now) {
      this.lastInputAt = input.at;
      if (input.direction === 'up' && now - input.at < ARTICULATED_GESTURE_MS) {
        if (this.jumpStartedAt !== null && input.at < this.jumpStartedAt + ARTICULATED_GESTURE_MS) this.jumpQueued = true;
        else { this.jumpStartedAt = input.at; this.jumpQueued = false; }
      } else { this.jumpStartedAt = null; this.jumpQueued = false; }
    }
    if (this.jumpStartedAt !== null && now >= this.jumpStartedAt + ARTICULATED_GESTURE_MS) {
      if (this.jumpQueued) { this.jumpStartedAt += ARTICULATED_GESTURE_MS; this.jumpQueued = false; }
      if (now >= this.jumpStartedAt + ARTICULATED_GESTURE_MS) this.jumpStartedAt = null;
    }
    if (this.jumpStartedAt !== null) return { direction: 'up', at: this.jumpStartedAt };
    return input && now >= input.at && now - input.at < ARTICULATED_GESTURE_MS ? input : null;
  }
}
