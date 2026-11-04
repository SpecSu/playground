// 游戏内自检：python3 tools/shot.py shots/v09/A "tank.png::@tools/v09a/tank.js::3"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 80 && !document.querySelector('#start.ready'); i++) await sleep(250);
document.querySelector('#start')?.click();
await sleep(1200);
document.querySelector('#modal.show .btn-p')?.click();
const S = await import('/src/synth.js');
const M = G.meta, mk = (id) => { const v = G.makeVariant(G.SPECIES.find((s) => s.id === id), 0); v.traits = []; return v; };
const add = [
  S.synthesize({ a: mk('clownfish'), b: mk('tuna'), item: 'suit', seed: 11, creator: 'me' }),
  S.synthesize({ a: mk('pufferfish'), b: mk('salmon'), item: 'toilet', seed: 12, creator: 'me' }),
  S.synthesize({ a: mk('tuna'), b: mk('mackerel'), item: 'gear', seed: 13, creator: 'me' }),
  S.synthesize({ a: mk('jellyfish'), b: mk('sardine'), item: 'umbrella', seed: 14, creator: 'me' }),
];
const giant = S.wildSynth(77, '@海雾'); giant.cm = 2400; add.push(giant);
add.push({ sp: 'synth', uid: 'hand-1', cm: 50, traits: [], name: '手写合成', syn: { plan: 'globe', head: 'spout', dor: { k: 'handle' }, tail: { k: 'fan' }, pect: { k: 'bow' }, app: ['tophat', 'pearls'], mat: 'ceramic', pal: ['#9fc7b4', '#f4efe2', '#c2563e', '#86ad9a'], pat: { k: 'dial', d: 4, a: 0.8 } } });
for (const v of add) M.addToTank(v);
M.save();
const thumbs = add.map((v) => { try { const u = G.fishThumb(v); return typeof u === 'string' ? u.length : (u ? 'obj' : 'null'); } catch (e) { return 'ERR ' + e.message; } });
G.openTank();
for (let i = 0; i < 240 && (G.tankUI.loading || !G.tankUI.isOpen); i++) await sleep(250);
await sleep(2500);
document.querySelector('.tk-tip button')?.click();
const E = G.aq?.ents; const ents = [...(E?.values ? E.values() : E || [])].filter((e) => e.v?.sp === 'synth');
const info = ents.map((e) => `${(e.v.name || '').slice(0, 8)}:L${e.v.cm}cm→L${(+e.L).toFixed(2)}/H${(+e.H).toFixed(2)}/${e.f.v.syn?.tail?.k}`);
return `synth in tank ${ents.length}/${add.length} · ${info.join(' ')} · thumbs ${thumbs.join(',')}`;
