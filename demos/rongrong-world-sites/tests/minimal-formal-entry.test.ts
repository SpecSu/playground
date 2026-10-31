import test from 'node:test';
import assert from 'node:assert/strict';
import {formalBoardingEntry} from '../src/minimal/formal-boarding-entry.ts';

test('supported local hostnames use the fixed online formal root, never local identity or storage',()=>{
 for(const hostname of ['localhost','127.0.0.1'])assert.deepEqual(formalBoardingEntry(hostname),{
  href:'https://fluffy-farm-companions.tangguozhou.chatgpt.site/',
  local:true,
 });
});
test('SSR, hosted and malformed hostnames cannot redirect to an input-derived destination',()=>{
 for(const hostname of [undefined,'','farm.example','localhost.attacker.example','127.0.0.1.attacker.example','localhost:5190','http://localhost:5190/?uid=private','localhost@attacker.example','localhost\n','[::1]','::1']){
  assert.deepEqual(formalBoardingEntry(hostname),{href:'/',local:false},String(hostname));
 }
});
