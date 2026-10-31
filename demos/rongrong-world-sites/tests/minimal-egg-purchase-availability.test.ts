import test from 'node:test';import assert from 'node:assert/strict';
import {createMinimalState,minimalCommand,MINIMAL_RULES} from '../src/minimal/model.ts';
import {eggPurchaseAvailability} from '../src/minimal/egg-catalog.ts';
const T=1_800_000_000_000;
function ready(){const s=createMinimalState(T);s.welcomeClaimed=true;s.coins=120;s.player={x:1,z:1};return s;}
test('shared purchase status covers authority locks without changing money or identities',()=>{
 const cases=[['unexplored',(s:ReturnType<typeof ready>)=>s,'forest'],['resources',(s:ReturnType<typeof ready>)=>{s.exploredBiomes.push('desert');return s;},'desert'],['funds',(s:ReturnType<typeof ready>)=>{s.coins=29;return s;},'grassland'],['distance',(s:ReturnType<typeof ready>)=>{s.player={x:4,z:4};return s;},'grassland'],['capacity',(s:ReturnType<typeof ready>)=>{for(let i=0;i<MINIMAL_RULES.maxAnimals;i++)s.eggs.push({id:`egg-${i}`,species:'sheep',source:'shop',location:'bag',sex:'female',size:'normal',boughtAt:T});return s;},'grassland']] as const;
 for(const [code,change,theme]of cases){const s=change(ready()),before=JSON.stringify(s),status=eggPurchaseAvailability(s,theme);assert.equal(status.available,false,code);assert.equal(status.code,code);const result=minimalCommand(s,{type:'buyEgg',theme},T);assert.equal(result.accepted,false,code);assert.equal(result.message,status.message);assert.equal(result.state.coins,s.coins);assert.deepEqual(result.state.eggs,s.eggs);assert.equal(JSON.stringify(s),before);}
});
test('purchase eligibility is not current hatch habitat, and transient UI locks do not alter authority',()=>{
 const s=ready();s.exploredBiomes.push('wetland');s.tiles=s.tiles.map(tile=>({...tile,terrain:'meadow'}));
 assert.equal(eggPurchaseAvailability(s,'wetland').available,true);assert.equal(eggPurchaseAvailability(s,'wetland',undefined,'上一条指令待确认').available,false);
 const bought=minimalCommand(s,{type:'buyEgg',theme:'wetland'},T);assert.equal(bought.accepted,true);assert.equal(bought.state.coins,90);assert.equal(bought.state.eggs[0].species,'duck');
});
