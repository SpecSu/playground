// Adapted from the owner-approved boat source, commit 55de7c92b90d54665d4f4772b793aa5be46e856b.
import { solveFishingCatchSteps } from './fishing-catch-solver.js';
import { drainFishingSteps } from './fishing-surface-contact.js';
const scope = self;
scope.onmessage = event => {
    const { id, input } = event.data;
    try {
        scope.postMessage({ id, result: drainFishingSteps(solveFishingCatchSteps(input, provisional => scope.postMessage({ id, provisional }))) });
    }
    catch (error) {
        scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
};
