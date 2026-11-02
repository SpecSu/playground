// 浏览器内自检：python3 tools/shot.py shots/v09/A1 "check.png::@tools/v09a/browser_check.js::1"
const S = await import('/src/synth_bridge.js');
const F = await import('/src/fishes.js');
const out = { STUB: S.STUB, fns: ['synthesize', 'previewHints', 'wildSynth', 'synthName', 'genomeOf', 'buildSynthModel', 'synthTags'].filter((k) => typeof S[k] !== 'function') };
const a = F.makeVariant(F.SPECIES_BY_ID['great-white'], 0), b = F.makeVariant(F.SPECIES_BY_ID.pufferfish, 0);
const v = S.synthesize({ a, b, item: 'toilet', prompt: '凶一点', seed: 42, creator: 'me' });
out.name = v.name; out.tags = S.synthTags(v); out.hint = S.previewHints({ a, b, item: 'toilet', prompt: '' });
out.wild = S.wildSynth(7, '@海雾').name; out.rename = S.synthName({ ...v, seed: 99 });
out.model = (() => { try { return String(S.buildSynthModel(v)?.type ?? null); } catch (e) { return 'ERR ' + e.message; } })();
out.fish = (() => { try { new F.Fish(v); return 'ok'; } catch (e) { return 'ERR ' + e.message; } })();
return JSON.stringify(out);
