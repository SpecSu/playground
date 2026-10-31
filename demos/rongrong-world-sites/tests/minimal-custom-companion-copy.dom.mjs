import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ExchangeAssetCard,{EXCHANGE_LABELS} from '../src/minimal/ExchangeAssetCard.tsx';
import {BoardingAnimalChoices} from '../src/minimal/BoardingAnimalCards.tsx';
import {publicExchangeAsset} from '../src/minimal/exchange-authority.ts';
import {createCreativeAnimal} from '../src/minimal/creative-lifecycle.ts';
import {createMinimalState} from '../src/minimal/model.ts';
const T=1793000000000;
const custom={id:'custom',kind:'custom-creature',templateId:'poop-pal',name:'便便小伙伴',prompt:'圆圆的伙伴',createdAt:T,hatchedAt:T,jobId:'job',origin:'mock',location:'ground',position:{x:2,z:2}};
test('custom exchange cards say 小伙伴 without renaming the stored animal kind or ordinary animal/egg labels',()=>{
 const animal=createCreativeAnimal(custom),publicAsset=publicExchangeAsset({kind:'animal',data:animal,origin:'mock'}),html=renderToStaticMarkup(createElement(ExchangeAssetCard,{asset:publicAsset}));
 assert.equal(publicAsset.kind,'animal');assert.equal(publicAsset.detail,'自定义小伙伴');assert.ok(html.includes('<small>小伙伴</small>'));assert.ok(!html.includes('<small>动物</small>'));assert.equal(EXCHANGE_LABELS['custom-creature'],'小伙伴');assert.equal(EXCHANGE_LABELS.animal,'动物');assert.equal(EXCHANGE_LABELS.egg,'动物蛋');
 const archive=publicExchangeAsset({kind:'custom-creature',data:custom,origin:'mock'});assert.equal(archive.detail,'自定义小伙伴');assert.ok(renderToStaticMarkup(createElement(ExchangeAssetCard,{asset:archive})).includes('<small>小伙伴</small>'));
});
test('custom sample boarding cards retain the no-pairing limit and call only that category 小伙伴',()=>{
 const state=createMinimalState(T);state.animals=[createCreativeAnimal(custom)];const farm={state,creative:{version:1,assets:[custom],jobs:[]}};const html=renderToStaticMarkup(createElement(BoardingAnimalChoices,{farm,now:T+200000,label:'选择伙伴',selectedId:'',onSelect(){}}));assert.ok(html.includes('自定义小伙伴'));assert.ok(html.includes('暂不支持配对'));assert.ok(!html.includes('自定义伙伴'));
});
