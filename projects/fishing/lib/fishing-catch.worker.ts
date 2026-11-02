import { solveFishingCatchSteps, type FishingCatchSolveInput } from './fishing-catch-solver.ts';
import { drainFishingSteps } from './fishing-surface-contact.ts';
const scope = self as unknown as { onmessage: ((event: MessageEvent<{ id: number; input: FishingCatchSolveInput }>) => void) | null; postMessage(message: unknown): void };
scope.onmessage = event => {
  const { id, input } = event.data;
  try { scope.postMessage({ id, result: drainFishingSteps(solveFishingCatchSteps(input)) }); }
  catch (error) { scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }); }
};
