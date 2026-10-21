import './room-loader.mjs';
import {MARINE_SPECIES} from '../lib/fishing-catalog.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../components/fishing/FishingFeed.css',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const rule=selector=>[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([,selectors])=>selectors.trim().split(',').includes(selector)).map(([, ,body])=>body).join(';');

test('single-line scene strip clears tabs with a faint divider above it',()=>{
 const strip=rule('.fishing-top-strip');assert.match(strip,/top:96px/);assert.match(strip,/height:38px/);assert.match(strip,/border-top:1px solid #ffffff20/);
 const source=readFileSync(new URL('../components/fishing/FishingFeed.tsx',import.meta.url),'utf8');assert.doesNotMatch(source,/className="ocean-title"|className="empty-yacht-note"/);assert.match(source,/className="fishing-top-strip"/);
});

test('angler nameplates stay text-only when selected, with a visible text focus cue',()=>{
 const base=rule('.feed-v020 .yacht-person-label');
 for(const declaration of ['background:transparent','border:0','box-shadow:none','backdrop-filter:none','-webkit-backdrop-filter:none'])assert.ok(base.includes(declaration),declaration);
 assert.match(base,/text-shadow:/);
 assert.match(rule('.feed-v020 .yacht-person-label.selected'),/background:transparent/);
 assert.match(rule('.feed-v020 .yacht-person-label:focus-visible'),/outline:none/);
 assert.match(rule('.feed-v020 .yacht-person-label:focus-visible .yacht-person-name'),/text-decoration:underline/);
});

test('catch broadcast stays in its quiet band above joined author and composer',()=>{
 const region=rule('.fishing-catch-broadcast-region');assert.match(region,/top:auto/);assert.match(region,/bottom:203px/);assert.match(region,/pointer-events:none/);
 const bannerBottom=844-86-203;assert.ok(bannerBottom+10<=565);assert.ok(bannerBottom<637);
 assert.match(rule('.fishing-feed.is-visitor .creator-caption'),/top:619px/);assert.match(rule('.feed-v020 .fishing-chat-composer'),/height:36px/);
});

test('held catch text gets a bounded translucent dark backing without capturing controls',()=>{
 const reveal=rule('.catch-reveal');
 assert.match(reveal,/background:linear-gradient\([^;]*#0[0-9a-f]{7}/);
 assert.match(reveal,/padding:10px 14px/);assert.match(reveal,/border-radius:16px/);
 assert.match(reveal,/text-shadow:0 1px 3px #000/);assert.match(reveal,/pointer-events:none/);
 assert.match(rule('.catch-reveal h2'),/line-height:32px/);
 assert.match(rule('.catch-eyebrow'),/line-height:12px/);
 assert.match(rule('.catch-reveal>div'),/line-height:17px/);
 assert.ok(MARINE_SPECIES.every(s=>[...s.description].length*9<=314),'all species descriptions fit the 314px content width at 9px');
 assert.match(rule('.catch-reveal p'),/line-height:13px/);
 // Backing stays between the held model and creator caption at canonical scale.
 assert.ok(445+20+12+32+9+17+6+13<=555);
});


test('held catch backing stays lightly transparent',()=>{
 const background=rule('.catch-reveal').match(/background:([^;]+)/)[1];
 const stops=[...background.matchAll(/#[0-9a-f]{6}([0-9a-f]{2})/gi)];
 assert.equal(stops.length,2);
 for(const [,alpha] of stops)assert.ok(parseInt(alpha,16)/255<=.4,'each dark gradient stop stays at or below 40% opacity');
});

test('held catch panel shares the lower controls horizontal margins',()=>{
 const shared=readFileSync(new URL('../components/FeedInterface.css',import.meta.url),'utf8');
 const controls=shared.match(/\.feed-v020 \.lower-controls\s*\{([^}]+)\}/)[1];
 for(const side of ['left','right']){
  const value=new RegExp(`${side}:\\s*(\\d+px)`);
  assert.equal(rule('.catch-reveal').match(value)[1],controls.match(value)[1],`${side} edge aligns with the controls`);
 }
});

test('chat focus removes the inner native rectangle and retains the visible caret and outer cue',()=>{
 for(const selector of ['.feed-v020.fishing-feed .fishing-chat-composer input:focus','.feed-v020.fishing-feed .fishing-chat-composer input:focus-visible']){
  const focused=rule(selector);
  for(const declaration of ['outline:none','box-shadow:none','border:0','caret-color:#ffffff'])assert.ok(focused.includes(declaration),`${selector}: ${declaration}`);
 }
 assert.match(rule('.feed-v020 .fishing-chat-composer.is-focused'),/border-color:#dff8f480/);
});

test('pointer focus has no tap outline while other keyboard controls keep a subtle focus cue',()=>{
 assert.match(rule('.feed-v020.fishing-feed :focus:not(:focus-visible)'),/outline:none/);
 assert.match(rule('.feed-v020.fishing-feed :focus-visible'),/outline:1px solid #dff8f480/);
 assert.match(rule('.feed-v020.fishing-feed'),/-webkit-tap-highlight-color:transparent/);
 assert.doesNotMatch(css,/(?:^|[},])\s*(?:\*|body|html|\.fishing-shell|\.fishing-feed|\.feed-v020\.fishing-feed)(?:\s+\*)?\s*\{[^}]*user-select:\s*none/);
});


test('speech is white at ninety percent opacity and focused composer stays translucent without a slab',()=>{
 for(const selector of ['.yacht-person-speech','.own .yacht-person-speech'])assert.match(rule(selector),/background:rgba\(255,255,255,\.9\)/);
 for(const selector of ['.feed-v020 .fishing-chat-composer.is-focused','.feed-v020.fishing-feed.chat-focused .fishing-chat-composer'])assert.match(rule(selector),/background:rgba\(8,18,24,\.72\)/);
 assert.match(rule('.feed-v020.fishing-feed.chat-focused .fishing-chat-composer'),/box-shadow:none/);
});

test('projected nameplate buttons override shared transform animation and touch opacity',()=>{
 // The global button animation otherwise interpolates each 34 ms projection for
 // 180 ms, leaving the DOM behind the current WebGL camera (and snapping on cull).
 const globals=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(globals,/button:not\(:disabled\)\{[^}]*transition:[^}]*transform/);
 assert.match(rule('.feed-v020 .yacht-person-label'),/transition:none/);
 assert.match(rule('.feed-v020 .yacht-person-label:active'),/opacity:1/);
});


test('emoji content retains the same padded ninety-percent-white bubble, shadow and tail as speech',()=>{
 const base=rule('.yacht-person-speech'),emote=rule('.yacht-person-speech.is-emote');
 assert.match(base,/padding:8px 12px/);assert.match(base,/background:rgba\(255,255,255,\.9\)/);assert.match(base,/box-shadow:0 2px 7px/);
 assert.doesNotMatch(emote,/(?:^|;)(?:padding|background|box-shadow|filter):/,'emote content must inherit the complete speech container');
 assert.doesNotMatch(rule('.yacht-person-speech.is-emote::after'),/display:none|border-top(?:-color)?:transparent/,'emoji retains the white bubble tail');
 assert.match(emote,/font-size:34px/);assert.match(emote,/line-height:42px/);assert.match(emote,/min-width:66px/);assert.match(emote,/max-width:66px/);
 assert.doesNotMatch(emote,/transform:|scale\(/,'world distance must never scale emoji typography');
});

test('emoji tray stays above its own penultimate action instead of the rightmost camera',()=>{
 assert.match(rule('.fishing-emote-tray'),/right:55px/);
});
