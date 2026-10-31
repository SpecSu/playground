import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {deriveWeather,automaticWeather,lightningStrength,WEATHER_KINDS} from '../src/minimal/weather.ts';
import {WeatherWorld} from '../src/minimal/weather-world.ts';
test('UTC+8 daylight and manual previews do not depend on machine timezone',()=>{
 const noon=Date.parse('2026-10-23T04:00:00Z'),midnight=Date.parse('2026-10-23T16:00:00Z');
 assert.equal(deriveWeather(noon).localHour,12);assert.equal(deriveWeather(noon).daylight,1);assert.equal(deriveWeather(midnight).phase,'night');assert.equal(deriveWeather(midnight).daylight,0);
 assert.equal(deriveWeather(midnight,{time:'day',weather:'snow'}).kind,'snow');assert.equal(deriveWeather(midnight,{time:'day'}).daylight,1);assert.equal(deriveWeather(noon,{time:'night'}).daylight,0);
});
test('automatic weather is stable within a four-hour slot and includes all supported types',()=>{
 const start=Date.parse('2026-10-23T00:00:00Z');assert.equal(deriveWeather(start).kind,deriveWeather(start+14399999).kind);
 const kinds=new Set<string>();for(let i=-200;i<200;i++){assert.equal(automaticWeather(i),automaticWeather(i));kinds.add(automaticWeather(i));}assert.equal(kinds.size,WEATHER_KINDS.length);
 for(let h=0;h<48;h+=.125){const s=deriveWeather(start+h*3600000);assert.ok(s.daylight>=0&&s.daylight<=1);}
});
test('storm illumination is gentle, sparse and disabled for reduced motion',()=>{
 let starts=0,previous=false;for(let t=0;t<100;t+=.01){const x=lightningStrength(t,'storm');assert.ok(x>=0&&x<=.16);if(x>0&&!previous)starts++;previous=x>0;assert.equal(lightningStrength(t,'storm',true),0);assert.equal(lightningStrength(t,'rain'),0);}assert.ok(starts<=6);
});
test('3D weather reuses its bounded particle buffer and restores the scene when disposed',()=>{
 const scene=new THREE.Scene(),background=new THREE.Color('#DCECCF'),fog=new THREE.Fog('#DCECCF',23,53);scene.background=background;scene.fog=fog;
 const hemisphere=new THREE.HemisphereLight('#FFF8E5','#92A079',1.7),key=new THREE.DirectionalLight('#FFF0D1',2.2),fill=new THREE.DirectionalLight('#DEEADC',.75);scene.add(hemisphere,key,fill);
 const layer=new WeatherWorld(scene,{hemisphere,key,fill,reducedMotion:true}),attribute=layer.precipitation.geometry.attributes.position,buffer=attribute.array;
 assert.equal(layer.clouds.children.length,1);assert.ok(attribute.count<=256);
 for(const kind of WEATHER_KINDS){for(let i=0;i<240;i++)layer.update(deriveWeather(0,{weather:kind,time:'night'}),1/60,i/60,{x:4,z:3});assert.equal(layer.precipitation.geometry.attributes.position,attribute);assert.equal(attribute.array,buffer);assert.equal(layer.precipitation.visible,kind==='snow');assert.equal(layer.rain.visible,['rain','storm'].includes(kind));assert.notEqual(layer.rain.geometry,layer.precipitation.geometry);assert.ok(hemisphere.intensity>=1);assert.ok(key.intensity>.4);}
 assert.ok(layer.shopLight.intensity>0);assert.ok(Array.from(buffer).every(Number.isFinite));
 layer.dispose();layer.dispose();assert.equal(scene.children.length,3);assert.equal(scene.background,background);assert.equal(scene.fog,fog);assert.equal(key.intensity,2.2);assert.equal(hemisphere.intensity,1.7);
});
