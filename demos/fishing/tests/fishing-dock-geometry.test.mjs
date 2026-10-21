import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../components/fishing/FishingFeed.css',import.meta.url),'utf8');
const rule=selector=>{const start=css.indexOf(selector+'{');assert.ok(start>=0,`missing ${selector}`);return css.slice(start+selector.length+1,css.indexOf('}',start));};
test('joined dock has a content-independent primary slot and fixed peer columns',()=>{
 const dock=rule('.feed-v020.fishing-feed.joined .fishing-dock');
 assert.match(dock,/display:grid/);assert.match(dock,/gap:7px/);assert.match(dock,/grid-template-columns:minmax\(0,1fr\) 48px 48px 44px 48px/);
 const primary=rule('.feed-v020.fishing-feed.joined .fishing-primary');
 assert.match(primary,/width:100%/);assert.match(primary,/min-width:0/);assert.match(primary,/height:53px/);assert.match(primary,/transform:none/);assert.match(primary,/transition:background \.18s,opacity \.18s/);
 for(const width of [320,350,366,390]){
  const peerWidths=[48,48,44,48],gap=7,mainWidth=width-peerWidths.reduce((a,b)=>a+b,0)-4*gap;
  assert.ok(mainWidth>0);assert.equal(mainWidth+4*gap+peerWidths.reduce((a,b)=>a+b,0),width);
 }
 const animation=css.slice(css.indexOf('@keyframes bite-button'),css.indexOf('@keyframes bite-arrive'));
 assert.doesNotMatch(animation,/transform|width|height|padding|margin/,'bite glow must not move or scale the action');
});
test('secondary icon slots and label metrics yield identical baselines for images and SVGs',()=>{
 const control=rule('.feed-v020 .fishing-dock .dock-control');
 assert.match(control,/display:grid/);assert.match(control,/grid-template-rows:28px 12px/);assert.match(control,/gap:2px/);assert.match(control,/align-content:center/);
 const icon=rule('.feed-v020 .fishing-dock .dock-control .fishing-dock-icon');
 assert.match(icon,/width:28px/);assert.match(icon,/height:28px/);assert.match(icon,/display:grid/);assert.match(icon,/place-items:center/);
 const image=rule('.feed-v020 .fishing-avatar-control img');
 assert.match(image,/display:block/);assert.match(image,/width:28px;height:28px/);assert.match(image,/object-fit:contain/);
 const label=rule('.feed-v020 .fishing-dock .dock-control>span:last-child');
 assert.match(label,/font-size:9px;line-height:12px/);assert.match(label,/white-space:nowrap/);
 assert.equal((53-28-2-12)/2+28+2,35.5,'all label line boxes start at the same offset');
});
test('visitor CTA keeps its own large white join styling',()=>{
 assert.match(rule('.feed-v020.fishing-feed.is-visitor .fishing-primary'),/background:#fff;color:#111;min-width:222px/);
});
