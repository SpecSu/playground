import test from 'node:test';
import assert from 'node:assert/strict';
import * as refs from '../src/avatar-references.js';
test('portrait reference normalizer supports legacy string and framed atlas without coercing objects to URLs',()=>{
 assert.deepEqual(refs.imageReference('assets/old.webp'),{image:'assets/old.webp'});const portrait={image:'assets/cast.png',frame:{x:20,y:30,w:80,h:90}};assert.deepEqual(refs.imageReference(portrait),portrait);
 for(const invalid of [null,{},[],{image:{}},{image:'x',frame:{x:0,y:0,w:0,h:80}},{image:'x',frame:{x:-1,y:0,w:80,h:80}}])assert.equal(refs.imageReference(invalid),null);
});
test('body and portrait references sharing one atlas deduplicate while requiring all three declared roles',()=>{
 const avatar={front:{image:'assets/cast.png'},back:{image:'assets/cast.png'},portrait:{image:'assets/cast.png',frame:{x:0,y:0,w:100,h:100}}};assert.deepEqual(refs.avatarImageURLs(avatar),['assets/cast.png']);assert.equal(refs.avatarHasReferences(avatar),true);assert.equal(refs.avatarHasReferences({...avatar,portrait:{}}),false);
});
