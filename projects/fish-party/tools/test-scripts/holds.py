# r3：高身鱼"抱鱼挡脸"逐种截图  python3 fish_test/holds.py OUT_DIR [BASE] [species,...]
import asyncio, sys, json, os
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else 'fish_test/r3/holds/'
BASE = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8765/index.html'
SPS = (sys.argv[3] if len(sys.argv) > 3 else 'sunfish,manta-ray,king-crab,blue-tang,sailfish,pufferfish').split(',')
os.makedirs(OUT, exist_ok=True)
SEED = "try { localStorage.setItem('friends-fishing-v1', JSON.stringify({ tutorial: 99, total: 6, catches: 6, xp: 10, level: 2, bait: 0 })); localStorage.setItem('ff-joy-hint-v1','1'); } catch (e) {}"
BOT = """(sp) => new Promise((res) => {
  G.dbg.force = sp;
  const K = (t) => window.dispatchEvent(new KeyboardEvent(t, { code: 'Space', bubbles: true }));
  let held = false, phase = 'go';
  const dn = () => { if (!held) { K('keydown'); held = true; } }, up = () => { if (held) { K('keyup'); held = false; } };
  const tick = () => {
    const p = G.player, s = p.state;
    if (document.querySelector('#modal.show .btn-p')) document.querySelector('#modal.show .btn-p').click();
    if (phase === 'go') { if (s === 'idle') dn(); else if (s === 'charge' && p.power > 0.6) { up(); phase = 'wait'; } }
    else if (phase === 'wait') { if (s === 'float') { p.nibbles = []; if (p.biteAt > p.t + 0.3) p.biteAt = p.t + 0.3; } if (s === 'bite') { dn(); phase = 'fight'; } }
    else if (phase === 'fight') { if (s === 'fight') { if (p.dist > 1.3) p.dist = 1.3; p.jumped = true; } if (s === 'hold') { up(); phase = 'done'; G.dbg.force = null; return res(p.v.sp); } if (s === 'idle' || s === 'fail') phase = 'go'; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})"""
GEO = """(() => { const p = G.player, c = p.char, cam = G.camera; const V = cam.position.constructor;
  const W = innerWidth, H = innerHeight; const pr = (v) => { const q = v.clone().project(cam); return [(q.x * .5 + .5) * W, (-q.y * .5 + .5) * H]; };
  const head = pr(c.headW); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const v = new V();
  p.fish.root.updateMatrixWorld(true);
  p.fish.root.traverse((o) => { if (!o.isMesh) return; const pos = o.geometry.attributes.position; for (let i = 0; i < pos.count; i += 5) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); const s = pr(v); x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1]); } });
  return { sp: p.v.sp, cm: p.v.cm, head: head.map(Math.round), fishBox: [x0, y0, x1, y1].map(Math.round), faceCovered: head[1] > y0 - 6 && head[0] > x0 && head[0] < x1 };
})()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, has_touch=True)
        await ctx.add_init_script(SEED)
        pg = await ctx.new_page(); pg.set_default_timeout(240000); logs = []
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        pg.on('response', lambda r: logs.append(f'[{r.status}] {r.url}') if r.status >= 400 else None)
        await pg.goto(BASE + '?autostart&dtmax=0.1&dpr=0.6&q=low')
        await pg.wait_for_function('window.G && window.G.player && !document.getElementById("splash")')
        await pg.wait_for_timeout(1500)
        res = []
        for sp in SPS:
            got = await pg.evaluate(BOT, sp)
            await pg.wait_for_function('G.player.state === "hold" && G.player.holdT > 2.2')
            await pg.evaluate("document.getElementById('catch').style.visibility='hidden'; document.getElementById('feed').style.visibility='hidden'")
            await pg.wait_for_timeout(300)
            g = await pg.evaluate(GEO); res.append(g); print('HOLD', json.dumps(g), flush=True)
            await pg.screenshot(path=OUT + f'hold_{sp}.png')
            await pg.evaluate("document.getElementById('catch').style.visibility=''; document.getElementById('feed').style.visibility=''")
            await pg.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }))")
            await pg.wait_for_function('G.player.state === "idle"')
            await pg.wait_for_timeout(1500)
        json.dump(res, open(OUT + 'holds.json', 'w'), indent=1)
        print('LOGS', logs)
        await b.close()
asyncio.run(main())
