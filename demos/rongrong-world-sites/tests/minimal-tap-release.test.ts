import test from 'node:test';
import assert from 'node:assert/strict';
import {createTapGate,isUnpressedMouseMove} from '../src/minimal/gesture.ts';

type PointerInput=Pick<PointerEvent,'pointerType'|'pointerId'|'button'|'buttons'|'clientX'|'clientY'>;
const pointer=(overrides:Partial<PointerInput>={}):PointerEvent=>({pointerType:'mouse',pointerId:1,button:0,buttons:1,clientX:10,clientY:10,...overrides}) as PointerEvent;

test('mouse release displaced 100px without a move event is not a tap when buttons is zero',()=>{
 const gate=createTapGate();
 gate.down(pointer());
 gate.up(pointer({clientX:110,buttons:0}));
 assert.equal(gate.consume(),false);
});

for(const pointerType of ['mouse','touch']){
 test(`${pointerType} release below the default 6px threshold remains a tap`,()=>{
  const gate=createTapGate();
  gate.down(pointer({pointerType}));
  gate.up(pointer({pointerType,clientX:15.9,buttons:0}));
  assert.equal(gate.consume(),true);
 });

 test(`${pointerType} release exactly at the default 6px threshold is not a tap`,()=>{
  const gate=createTapGate();
  gate.down(pointer({pointerType}));
  gate.up(pointer({pointerType,clientX:16,buttons:0}));
  assert.equal(gate.consume(),false);
 });

 test(`${pointerType} release checks radial displacement rather than each axis separately`,()=>{
  const gate=createTapGate();
  gate.down(pointer({pointerType}));
  gate.up(pointer({pointerType,clientX:14,clientY:15,buttons:0}));
  assert.equal(gate.consume(),false);
 });

 test(`${pointerType} drag cannot become a tap by returning to its start`,()=>{
  const gate=createTapGate();
  gate.down(pointer({pointerType}));
  gate.move(pointer({pointerType,clientX:20}));
  gate.move(pointer({pointerType}));
  gate.up(pointer({pointerType,buttons:0}));
  assert.equal(gate.consume(),false);
 });
}

test('a mismatched pointer release cannot qualify or revive the original tap',()=>{
 const gate=createTapGate();
 gate.down(pointer());
 gate.up(pointer({pointerId:2,buttons:0}));
 assert.equal(gate.consume(),false);
 gate.up(pointer({buttons:0}));
 assert.equal(gate.consume(),false);
});

test('unpressed mouse hover moves are ignored without ignoring pressed mouse or touch moves',()=>{
 assert.equal(isUnpressedMouseMove(pointer({buttons:0})),true);
 assert.equal(isUnpressedMouseMove(pointer()),false);
 assert.equal(isUnpressedMouseMove(pointer({pointerType:'touch',buttons:0})),false);
 const gate=createTapGate();
 gate.down(pointer());
 gate.move(pointer({clientX:110,buttons:0}));
 gate.up(pointer({buttons:0}));
 assert.equal(gate.consume(),true);
});

test('pinch releases never qualify as taps and a later single pointer can tap',()=>{
 const gate=createTapGate();
 gate.down(pointer({pointerType:'touch'}));
 gate.down(pointer({pointerType:'touch',pointerId:2,clientX:20}));
 gate.up(pointer({pointerType:'touch',pointerId:2,clientX:20,buttons:0}));
 assert.equal(gate.consume(),false);
 gate.up(pointer({pointerType:'touch',buttons:0}));
 assert.equal(gate.consume(),false);
 gate.down(pointer());
 gate.up(pointer({buttons:0}));
 assert.equal(gate.consume(),true);
});

test('cancel invalidates an active gesture and permits a later fresh tap',()=>{
 const gate=createTapGate();
 gate.down(pointer());
 gate.cancel();
 gate.up(pointer({buttons:0}));
 assert.equal(gate.consume(),false);
 gate.down(pointer());
 gate.up(pointer({buttons:0}));
 assert.equal(gate.consume(),true);
});

test('cancel clears release eligibility before the click consumes it',()=>{
 const gate=createTapGate();
 gate.down(pointer());
 gate.up(pointer({buttons:0}));
 gate.cancel();
 assert.equal(gate.consume(),false);
});

test('only a completed tap is eligible and it can be consumed once',()=>{
 const gate=createTapGate();
 assert.equal(gate.consume(),false);
 gate.down(pointer());
 assert.equal(gate.consume(),false);
 gate.up(pointer({buttons:0}));
 assert.equal(gate.consume(),true);
 assert.equal(gate.consume(),false);
});

test('a new pointerdown clears an earlier unconsumed tap',()=>{
 const gate=createTapGate();
 gate.down(pointer());
 gate.up(pointer({buttons:0}));
 gate.down(pointer());
 assert.equal(gate.consume(),false);
});

test('a non-primary mouse button does not qualify as a tap',()=>{
 const gate=createTapGate();
 gate.down(pointer({button:2,buttons:2}));
 gate.up(pointer({button:2,buttons:0}));
 assert.equal(gate.consume(),false);
});

test('a custom threshold applies to release displacement with the same exclusive boundary',()=>{
 const gate=createTapGate(10);
 gate.down(pointer());
 gate.up(pointer({clientX:19,buttons:0}));
 assert.equal(gate.consume(),true);
 gate.down(pointer());
 gate.up(pointer({clientX:20,buttons:0}));
 assert.equal(gate.consume(),false);
});
