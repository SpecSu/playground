// 天然物种主躯干轮廓统计：node --import ./tools/v09a/three_loader.mjs tools/v091/bp_stat.mjs
import { marineBlueprint } from '../../src/marine.js';
import { SPECIES } from '../../src/fishes.js';
for (const sp of SPECIES) {
  const b = marineBlueprint(sp.id);
  if (!b) { console.log(sp.id, 'NULL'); continue; }
  let mh = 0, mu = 0, mw = 0; b.h.forEach((h, i) => { if (h > mh) { mh = h; mu = b.u[i]; mw = b.w[i]; } });
  const at = (u) => { let i = b.u.findIndex((x) => x >= u); return b.h[Math.max(0, i)].toFixed(3); };
  console.log(sp.id.padEnd(14), 'n', b.u.length, 'mh', mh.toFixed(3), 'pk', mu.toFixed(2), 'w/h', (mw / mh).toFixed(2), 'h@.05', at(0.05), 'h@.95', at(0.95), b.back, b.belly);
}
