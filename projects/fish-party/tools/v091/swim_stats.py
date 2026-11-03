# 鱼出屏/回屏 & 大鱼掉头统计：python3 tools/v091/swim_stats.py OUT_DIR [秒=30]
import asyncio, sys, os, json
from playwright.async_api import async_playwright

OUT = (sys.argv[1] if len(sys.argv) > 1 else 'shots/v091/swim').rstrip('/') + '/'
SEC = int(sys.argv[2]) if len(sys.argv) > 2 else 30
os.makedirs(OUT, exist_ok=True)
OPEN = open(os.path.join(os.path.dirname(__file__), '../v09b/open.js')).read().split("const f = G.meta.tankFish()[0];")[0]
OPEN = OPEN.replace("['blue-tang', 'seahorse', 'mackerel', 'salmon']", "['blue-tang', 'seahorse', 'mackerel', 'salmon', 'clownfish', 'tuna', 'great-white', 'whale-shark', 'sunfish', 'manta-ray', 'sardine', 'mahi-mahi']") + "return 1;"
SAMPLER = r"""
window.__st = window.__st || {}; const st = window.__st, aq = G.aq, cam = aq.camera, t0 = performance.now();
const v = new THREE_V();
function tick() {
  
  let outNow = 0, n = 0;
  for (const e of aq.ents.values()) {
    if (e.kind !== 'fish') continue; n++;
    const s = st[e.uid] || (st[e.uid] = { L: +e.L.toFixed(2), out: 0, back: 0, turns: 0, vis: true, sx: 0, maxOut: 0, trav: 0, lx: e.pos.x });
    s.trav += Math.abs(e.pos.x - s.lx); s.lx = e.pos.x;
    // 「完全出屏」：中心 |x| > 半宽(z) + 0.6L（按 1× 全景世界宽度）
    const hw = (8.8 - e.pos.z) * Math.tan(25 * Math.PI / 180) * cam.aspect, off = Math.abs(e.pos.x) > hw + e.L * 0.6;
    if (off && s.vis) s.out++; if (!off && !s.vis) s.back++; s.vis = !off; if (off) outNow++;
    const sx = Math.abs(e.vel.x) > 0.05 ? Math.sign(e.vel.x) : 0;
    if (sx && s.sx && sx !== s.sx) s.turns++; if (sx) s.sx = sx;
  }
  st.__n = n; st.__maxOut = Math.max(st.__maxOut || 0, outNow);
}
window.__step = (n) => { for (let i = 0; i < n; i++) { aq.update(0.05); tick(); } };
""".replace('new THREE_V();', '0;')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
        await ctx.add_init_script("localStorage.setItem('friends-fishing-v1', JSON.stringify({tutorial:99,total:6,catches:6,xp:140,level:2,bait:2}))")
        pg = await ctx.new_page(); errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.set_default_timeout(300000)
        await pg.goto('http://127.0.0.1:8960/index.html?dpr=0.6&q=low'); await pg.wait_for_function('window.G && G.player')
        await pg.evaluate(f"(async()=>{{{OPEN}}})()")
        await pg.evaluate(SAMPLER.replace('%SEC%', str(SEC)))
        best = None
        # 真实帧率在 swiftshader 下很低（dt 被 cap 到 0.05），这里直接以 dt=0.05 步进模拟 SEC 秒「游戏时间」
        for k in range(SEC):
            await pg.evaluate("__step(20)")
            # 找一条大鱼半身出屏的时刻截图
            if best is None:
                hit = await pg.evaluate("(()=>{const c=G.aq.camera;for(const e of G.aq.ents.values()){if(e.kind!=='fish'||e.L<1.2)continue;const hw=(8.8-e.pos.z)*Math.tan(25*Math.PI/180)*c.aspect,d=Math.abs(e.pos.x)-hw;if(Math.abs(d)<e.L*0.2)return e.L.toFixed(2);}return null})()")
                if hit: best = hit; await asyncio.sleep(0.4); await pg.screenshot(path=OUT + 'bigfish_half_out.png')
        await pg.screenshot(path=OUT + 'end.png')
        st = await pg.evaluate("window.__st")
        n, mo = st.pop('__n', 0), st.pop('__maxOut', 0)
        rows = sorted(st.values(), key=lambda s: -s['L'])
        for s in rows: print(f"L={s['L']:<5} out={s['out']} back={s['back']} turns={s['turns']} travelX={s['trav']:.1f}m")
        big = [s for s in rows if s['L'] >= 1.2]
        print(f"fish={n} maxSimultaneousOut={mo} totalOut={sum(s['out'] for s in rows)} bigTurns={sum(s['turns'] for s in big)} (big n={len(big)}) halfOutShot={best}")
        print('errors:', errs[:5])
        await b.close()

asyncio.run(main())
