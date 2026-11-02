import test from 'node:test';
import assert from 'node:assert/strict';
import * as ui from '../src/ui.js';

test('preserves disco glyphs while matching ENCORE lime/pink and complementary lavender/mint',()=>{
 assert.deepEqual(ui.DIRECTIONS?.map(d=>[d.symbol,d.color]),[['←','#f56aa8'],['↓','#b7a4ff'],['↑','#ddff72'],['→','#7ee5cc']]);
});
test('loading only reports measured progress and never invents decode percentages',()=>{
 assert.equal(typeof ui.loadingPresentation,'function');
 assert.equal(ui.loadingPresentation('model',{phase:'loading',progress:.42}).percent,42);
 assert.equal(ui.loadingPresentation('song',{phase:'decoding'}).percent,null);
 assert.equal(ui.loadingPresentation('model',{phase:'loading'}).percent,null);
 assert.equal(ui.loadingPresentation('model',{phase:'ready'}).percent,100);
 assert.equal(ui.loadingPresentation('song',{phase:'error'}).error,true);
});

test('all four glyph colors retain at least 4.5:1 contrast against dark key surface',()=>{
 const luminance=hex=>{const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
 for(const direction of ui.DIRECTIONS)assert.ok((luminance(direction.color)+.05)/(luminance('#201e27')+.05)>=4.5,direction.symbol);
});

test('personal avatar only exposes owned outfits, while original dancers keep three looks',()=>{
 assert.equal(typeof ui.availableOutfits,'function');
 assert.deepEqual(ui.availableOutfits('jiaxin',{unlocked:false,outfits:[]}),[]);
 assert.deepEqual(ui.availableOutfits('jiaxin',{unlocked:true,outfits:[0]}),[0]);
 assert.deepEqual(ui.availableOutfits('jiaxin',{unlocked:true,outfits:[0,2,2,99]}),[0]);
 assert.deepEqual(ui.availableOutfits('jiji',{}),[0,1,2]);
});

test('download completion is not model assembly completion and loading phases stay truthful',()=>{
 assert.equal(ui.loadingPresentation('model',{phase:'loading',progress:1}).percent,null);
 assert.match(ui.loadingPresentation('model',{phase:'loading',progress:1}).detail,/装配/);
 assert.equal(ui.loadingPresentation('model',{phase:'loading',progress:null}).percent,null);
});
