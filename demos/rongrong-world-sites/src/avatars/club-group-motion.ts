// Type-only compatibility for the archived avatar renderer. Farm has its own events.
export interface GroupPose {
  readonly kind: 'train' | 'wave' | 'unison' | 'battle' | 'grid';
  readonly version?: 1 | 2 | 3;
  readonly phase: 'prepare' | 'perform' | 'return';
  readonly beat: number;
  readonly weight: number;
  readonly wave: number;
  /** Per-dancer participation: held low at zero, full call/jump at one. */
  readonly activation?: number;
  /** Finite shared-clock somersault time; -1 holds the grounded recovery pose. */
  readonly backflipElapsedMs?: number;
  /** Whole-rig lift owned by the shared train clock, including boarding. */
  readonly trainLift?: number;
  readonly trainHop?: number;
  readonly trainPhase?: 'jump' | 'hop' | 'rise' | 'ride' | 'sink';
}
