import assert from 'node:assert/strict';
import test from 'node:test';
import { danceKeyLane, chooseDanceNote, expiredDanceNotes, canPlayDanceRound } from '../lib/dance-input.ts';
test('arrow order is left up down right and repeats/typing never trigger', () => {
  assert.deepEqual(['ArrowLeft','ArrowUp','ArrowDown','ArrowRight'].map(key => danceKeyLane(key,false,false)),[0,1,2,3]);
  assert.equal(danceKeyLane('ArrowUp',true,false),null);
  assert.equal(danceKeyLane('ArrowUp',false,true),null);
  assert.equal(danceKeyLane('w',false,false),null);
});
test('nearest unconsumed note in the requested lane is selected only within window', () => {
  const chart = [{id:0,lane:0,atMs:1000},{id:1,lane:1,atMs:1000},{id:2,lane:0,atMs:1300}];
  assert.equal(chooseDanceNote(chart,new Set(),0,1130)?.id,0);
  assert.equal(chooseDanceNote(chart,new Set([0]),0,1130)?.id,2);
  assert.equal(chooseDanceNote(chart,new Set(),2,1000),undefined);
  assert.equal(chooseDanceNote(chart,new Set(),0,800),undefined);
  assert.deepEqual(expiredDanceNotes(chart,new Set([0]),1200).map(note=>note.id),[1]);
});
test('refresh and late arrival cannot produce a bogus partial score', () => {
  assert.equal(canPlayDanceRound(true,true,100,200),true);
  assert.equal(canPlayDanceRound(true,true,201,200),false);
  assert.equal(canPlayDanceRound(false,true,100,200),false);
  assert.equal(canPlayDanceRound(true,false,100,200),false);
});
