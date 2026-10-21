import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
async function load(){const url=new URL('../scripts/qa/room-cookie-jar.mjs',import.meta.url);assert.ok(await readFile(url,'utf8').then(()=>true,()=>false),'QA cookie handling must preserve separate response cookies');return import(url.href);}

test('Cloudflare bot cookie refresh cannot replace the guest capability in hosted QA',async()=>{
  const {mergeResponseCookies}=await load();
  const initial=mergeResponseCookies('', ['club_device=guest-one; Path=/; HttpOnly; Secure','__cf_bm=bot-one; Path=/; HttpOnly']);
  const updated=mergeResponseCookies(initial,['__cf_bm=bot-two; Path=/; HttpOnly']);
  assert.equal(updated,'club_device=guest-one; __cf_bm=bot-two');
  assert.equal(mergeResponseCookies(updated,[]),updated);
});

test('QA cookie merge keeps clients separate and removes only explicitly expired cookies',async()=>{
  const {mergeResponseCookies}=await load();
  assert.equal(mergeResponseCookies('club_device=guest-two; __cf_bm=bot-two',['__cf_bm=; Max-Age=0; Path=/']),'club_device=guest-two');
  assert.equal(mergeResponseCookies('', ['club_device=guest-three; Path=/']),'club_device=guest-three');
});
