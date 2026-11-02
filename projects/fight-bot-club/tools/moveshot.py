# v10 新招式浏览器截图：进入对战后逐个强制发招，按时间点截图（swiftshader 软渲染）
import asyncio, sys, json
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8811/mockup/?test&q=medium'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/mv'
MOVES = (sys.argv[3] if len(sys.argv) > 3 else 'sp:blink:0.5,0.75;sp:hook:0.7,1.1;sp:disc:0.7,1.1;sp:mortar:0.9,1.4;ult:blackhole:1.4,2.85;ult:orbital:1.3,2.1;ult:tornado:1.3,2.2;ult:phantom:1.1,2.25;ult:glacier:0.9,1.9').split(';')

JS_FORCE = """([kind, mv]) => { const W = window.__G, G = W.G; const [A, B] = G.F; const s = G.sim;
  for (const f of [A, B]) { f.hp = f.maxHp; f.act = null; f.stun = 0; f.lockYaw = null; f.vx = f.vz = f.kx = f.kz = 0; f.y = 0; f.vy = 0; f.grounded = true; }
  A.x = -3.2; A.z = 0; B.x = 3.2; B.z = 0; A.yaw = Math.PI / 2; B.yaw = -Math.PI / 2; s.proj.length = 0;
  B.frozenAI = true;
  if (kind === 'sp') { A.d.special = mv; s.startSpecial(A, B); } else { A.d.ult = mv; s.startUlt(A, B); W.AS.t = 99; }
  return G.phase; }"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 405, 'height': 720}, device_scale_factor=1)
        logs = []
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        await pg.goto(URL)
        for _ in range(150):
            await pg.wait_for_timeout(1000)
            ph = await pg.evaluate("() => window.__G && window.__G.G.phase")
            if ph == 'fight': break
        print('phase', ph, flush=True)
        pg.on('crash', lambda: print('PAGE CRASH', flush=True))
        await pg.evaluate("() => { const W = window.__G; W.G.F.forEach(f => f.d && (f.d._keep = 1)); }")
        for m in MOVES:
            kind, mv, ts = m.split(':')
            ts = [float(x) for x in ts.split(',')]
            # 等对方动作清空
            await pg.wait_for_timeout(600)
            r = await pg.evaluate(JS_FORCE, [kind, mv])
            t0 = await pg.evaluate("() => window.__G.G.sim.time")
            for i, tt in enumerate(ts):
                for _ in range(600):
                    st = await pg.evaluate("() => window.__G.G.sim.time")
                    if st - t0 >= tt: break
                    await pg.wait_for_timeout(30)
                await pg.screenshot(path=f'{OUT}_{mv}_{i}.png', timeout=90000)
            await pg.wait_for_timeout(2500)
            print(mv, r, 'ok', await pg.evaluate("() => [window.__G.G.sim.time.toFixed(1), (window.__G.G.F[0].act||{}).type]"), flush=True)
        print('\n'.join(logs[:40]))
        await b.close()

asyncio.run(main())
