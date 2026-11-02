// v0.9 C 截图机器人：定义 window.__bot(opts) —— 自动抛竿 → 咬钩 → 扬竿 → 收线，直到抱鱼（hold）
// opts.item = 道具 id（强制钓上道具）；opts.ocean = 1（强制海洋回流合成鱼）；opts.force = 物种 id
window.__bot = (opts = {}) => new Promise((res) => {
  Object.assign(G.dbg, { item: opts.item || null, ocean: opts.ocean ?? undefined, force: opts.force || null });
  const K = (t) => window.dispatchEvent(new KeyboardEvent(t, { code: 'Space', bubbles: true }));
  let held = false, phase = 'go', n = 0;
  const dn = () => { if (!held) { K('keydown'); held = true; } }, up = () => { if (held) { K('keyup'); held = false; } };
  const tick = () => {
    const p = G.player, s = p.state;
    if (++n > 60 * 90) return res('timeout ' + s);
    if (document.querySelector('#modal.show .btn-p')) document.querySelector('#modal.show .btn-p').click();
    if (phase === 'go') { if (s === 'idle') dn(); else if (s === 'charge' && p.power > 0.6) { up(); phase = 'wait'; } }
    else if (phase === 'wait') { if (s === 'float') { p.nibbles = []; if (p.biteAt > p.t + 0.3) p.biteAt = p.t + 0.3; } if (s === 'bite') { dn(); phase = 'fight'; } }
    else if (phase === 'fight') {
      if (s === 'fight') { if (p.dist > 1.3) p.dist = 1.3; p.jumped = true; }
      if (s === 'hold') { up(); G.dbg.item = null; G.dbg.ocean = undefined; G.dbg.force = null; return res({ sp: p.v.sp, item: p.v.item?.id, synth: !!(p.v.syn || p.v.sp === 'synth'), name: p.v.name, gen: p.v.gen, creator: p.v.creator, cm: p.v.cm }); }
      if (s === 'idle' || s === 'fail') phase = 'go';
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
return 'bot ready';
