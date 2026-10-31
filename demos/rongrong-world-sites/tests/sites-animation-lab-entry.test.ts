import './view-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Sites route selection gives animation lab priority without changing existing query entries',async()=>{
 const entry=await import('../src/main.tsx');
 assert.equal(typeof entry.selectSiteRoute,'function');
 for(const [query,expected] of [['','minimal'],['?legacy=1','estate'],['?convoy=a','convoy'],['?harvest=token','harvest'],['?animationLab=1','animationLab'],['?animationLab=0&harvest=token&legacy=1','animationLab']])assert.equal(entry.selectSiteRoute(query),expected);
});
test('Sites lab route retains its error boundary, viewport stylesheet, and prototype disclosure',()=>{
 const entry=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
 assert.match(entry,/AnimationLabBoundary/);assert.match(entry,/animation-lab\/animation-lab\.css/);assert.match(entry,/临时模型 · Blender 骨骼动画/);
 assert.doesNotMatch(entry,/createRoot\(/);
});
