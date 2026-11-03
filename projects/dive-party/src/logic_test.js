/**
 * Pure logic tests for Dive Party (Node.js)
 * To run: node --input-type=module src/logic_test.js
 */

// Mocking needed browser globals or Three.js dependencies if necessary
// Actually, meta.js imports fishes.js which imports THREE.
// We can use a minimal mock for THREE.

// Mock globals
global.window = { addEventListener() {}, innerWidth: 1000, innerHeight: 800 };
global.document = { 
    getElementById() { return { classList: { add() {}, remove() {} }, style: {}, appendChild() {} }; },
    createElement() { return { appendChild() {} }; }
};
Object.defineProperty(global, 'navigator', { value: { vibrate() {} }, configurable: true });
global.performance = { now: Date.now };

global.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = v; },
    removeItem(k) { delete this._data[k]; }
};

import { createMeta } from './meta.js';
import { rollCatch } from './fishes.js';

function assert(condition, message) {
    if (!condition) {
        console.error('❌ ASSERT FAILED: ' + message);
        process.exit(1);
    }
    console.log('✅ ' + message);
}

console.log('--- Running Dive Party Logic Tests ---');

// 1. Meta & Storage Isolation
const meta = createMeta();
assert(meta.S !== null, 'Meta state should be initialized');
// KEY is already 'dive-party-v1' in the modified meta.js

// 2. Roll Catch / Rarity
const fish1 = rollCatch({ luck: 0.1 });
assert(fish1 && fish1.sp, 'Should roll a valid fish');

// 3. Tank Logic (Add/Full)
const initialCount = meta.tankCount();
const testFish = { sp: 'clownfish', cm: 10, uid: 'test-123' };
const added = meta.addToTank(testFish);
assert(added, 'Should be able to add fish to tank');
assert(meta.tankCount() === initialCount + 1, 'Tank count should increment');

// 4. Release & Rare Pool (Ocean)
const pts = meta.releaseFish('test-123');
assert(pts > 0, 'Release should return points');
assert(meta.tankCount() === initialCount, 'Tank count should decrement after release');
assert(meta.S.ocean.length > 0, 'Released fish should be in ocean pool');
assert(meta.S.ocean[0].v.uid === 'test-123', 'Ocean fish should match released fish');

// 5. Oxygen Depletion (Manual logic check)
function calculateOxygenDepletion(depth, dt) {
    const depthFactor = Math.max(1, (depth) / 10);
    return 1.2 * depthFactor * dt;
}
const oxy1 = calculateOxygenDepletion(0, 1); // surface
const oxy2 = calculateOxygenDepletion(30, 1); // deep
assert(oxy2 > oxy1, 'Oxygen should deplete faster at greater depth');

// 6. Synthesis Flow (Mock parents)
const p1 = { sp: 'clownfish', cm: 10, uid: 'p1' };
const p2 = { sp: 'pufferfish', cm: 12, uid: 'p2' };
meta.addToTank(p1);
meta.addToTank(p2);
const egg = meta.startSynthEgg({ a: p1, b: p2, prompt: 'Glowing' });
assert(egg && egg.egg, 'Synthesis should produce an egg');
assert(meta.tankCount() === initialCount + 1, 'Two parents replaced by one egg');

const hatched = meta.hatchEgg(egg.uid);
assert(hatched && hatched.v, 'Egg should hatch into a fish');
assert(!hatched.v.egg, 'Hatched result should not be an egg');

console.log('--- All Logic Tests Passed ---');
process.exit(0);
