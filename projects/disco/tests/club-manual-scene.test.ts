import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import test from 'node:test';
const scene=()=>readFileSync(new URL('../components/ClubScene.tsx',import.meta.url),'utf8');
test('scene bridges mutable stick input and movement samples without rebuilding its renderer',()=>{
 const source=scene();assert.match(source,/movementControl\?/);assert.match(source,/onMovementSample\?/);assert.match(source,/syncMovements/);assert.match(source,/movementVectorFromCamera/);assert.match(source,/headingLock: manualHeadingLock/);
});
test('scene lifecycle stops movement on lost context, blur and hidden document',()=>{
 const source=scene();assert.match(source,/window\.addEventListener\('blur', stopMovement\)/);assert.match(source,/visibilitychange/);assert.match(source,/window\.removeEventListener\('blur', stopMovement\)/);assert.match(source,/const markFailed[\s\S]*?stopMovement\(\)/);
});
