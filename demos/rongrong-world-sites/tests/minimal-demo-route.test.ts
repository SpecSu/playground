import test from 'node:test';import assert from 'node:assert/strict';
import {selectFarmRoute} from '../src/entry-route.ts';
test('explicit name including invalid names takes precedence over every legacy route',()=>{for(const name of ['twx','', '../bad'])for(const flag of ['legacy','harvest','convoy','animationLab'])assert.equal(selectFarmRoute(`?name=${encodeURIComponent(name)}&${flag}=1`),'minimal');});
test('without name route precedence stays unchanged',()=>{assert.equal(selectFarmRoute('?animationLab&legacy'),'animationLab');assert.equal(selectFarmRoute('?harvest&convoy'),'harvest');assert.equal(selectFarmRoute('?convoy&legacy'),'convoy');assert.equal(selectFarmRoute('?legacy'),'estate');assert.equal(selectFarmRoute(''),'minimal');});
