import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {recordDiscovery,collectionVariants} from '../lib/game/collection.js';
import {createGame,applyCommand,publicGame} from '../lib/game/state.js';
const item={id:'qa-collection-item',kind:'plant',speciesId:'radish',mutation:'gold',standardSize:1,finalSize:1,value:30,location:{kind:'bag'}};
test('discovery keeps variants after selling, without retaining ownership or doubling a variant',()=>{
 const s=createGame('qa-collection',1);s.items=[structuredClone(item)];recordDiscovery(s,item);recordDiscovery(s,item);assert.deepEqual(s.discoveredVariants.radish,['gold']);
 const sold=applyCommand(s,{type:'sell',itemId:item.id},{now:10});assert.equal(sold.state.items.length,0);assert.deepEqual(sold.state.discoveredVariants.radish,['gold']);assert.equal(sold.state.discovered.radish,2);
});
test('older development state retains known owned variant before the last item leaves',()=>{
 const s=createGame('qa-collection-old',1);delete s.discoveredVariants;s.items=[structuredClone(item)];s.discovered.radish=1;
 const sold=applyCommand(s,{type:'sell',itemId:item.id},{now:10});assert.deepEqual(sold.state.discoveredVariants.radish,['gold']);assert.equal(sold.state.items.length,0);
});
test('uncollected seeded output cannot unlock collection and public visitors do not see private records',()=>{
 const s=createGame('qa-collection-hidden',1);s.jobs=[{product:item}];assert.deepEqual(collectionVariants(s),{});assert.equal(publicGame(s,2,{viewerUid:'qa-visitor'}).discoveredVariants,undefined);assert.deepEqual(publicGame(s,2).discoveredVariants,{});
});
test('collection renders real lazy silhouette assets with two groups and a three-column complete vertical grid',()=>{
 const ui=fs.readFileSync('components/manor/CollectionBook.tsx','utf8');assert.match(ui,/\['plant','fish'\]/);assert.match(ui,/entries.map/);assert.match(ui,/scrollTop=0/);const css=fs.readFileSync('app/globals.css','utf8');assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);assert.match(ui,/<ItemThumb defer fit silhouette=\{!found\}/);assert.match(ui,/巨型/);assert.match(ui,/金色/);assert.doesNotMatch(ui,/>\?<\//);
 const thumb=fs.readFileSync('components/manor/ItemThumb.tsx','utf8');assert.match(thumb,/IntersectionObserver/);assert.match(thumb,/itemThumbnail\(item,\{fit\}\)/);
});

test('collection mutation badges cannot squeeze species names out of their cards',()=>{const ui=fs.readFileSync('components/manor/CollectionBook.tsx','utf8'),css=fs.readFileSync('app/globals.css','utf8');assert.match(css,/grid-auto-rows:minmax\(144px,max-content\)/);assert.match(css,/item-card>\*\{flex-shrink:0\}/);assert.match(css,/min-height:28px;line-height:14px/);assert.doesNotMatch(ui,/found&&variants.length>0&&<div/);});
