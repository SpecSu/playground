# v10.1 UI 截图：对战中常态（名牌/队列） + 大招助力阶段（条幅头像/助力对象）
import asyncio, sys
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8811/mockup/?test&q=medium'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/ui'
ULT = sys.argv[3] if len(sys.argv) > 3 else 'glacier'

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 405, 'height': 720}, device_scale_factor=1)
        logs = []
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        await pg.goto(URL)
        ph = None
        for _ in range(150):
            await pg.wait_for_timeout(1000)
            ph = await pg.evaluate("() => window.__G && window.__G.G.phase")
            if ph == 'intro': await pg.evaluate("() => window.__G.startFight && window.__G.startFight()")
            if ph == 'fight': break
        print('phase', ph, flush=True)
        await pg.wait_for_timeout(9000)
        await pg.screenshot(path=f'{OUT}_fight.png', timeout=90000)
        await pg.add_style_tag(content='#ultcut.show{animation-play-state:paused!important;animation-delay:-0.6s!important}')
        await pg.evaluate("""(mv) => { const W = window.__G, G = W.G; const [A, B] = G.F; const s = G.sim;
          for (const f of [A, B]) { f.hp = f.maxHp; f.act = null; f.stun = 0; f.lockYaw = null; f.vx = f.vz = 0; f.y = 0; f.vy = 0; }
          A.x = -3.2; A.z = 0; B.x = 3.2; B.z = 0; A.yaw = Math.PI / 2; B.yaw = -Math.PI / 2; s.proj.length = 0; B.frozenAI = true;
          A.d.ult = mv; s.startUlt(A, B); }""", ULT)
        await pg.wait_for_timeout(150)
        await pg.screenshot(path=f'{OUT}_ult.png', timeout=90000)
        await pg.add_style_tag(content='#ultcut.show{animation:none!important;opacity:0!important}')
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=f'{OUT}_assist.png', timeout=90000)
        if ULT == 'glacier':
            await pg.evaluate("() => { window.__G.AS.t = 99; }")
            t0 = await pg.evaluate("() => window.__G.G.sim.time")
            for i, tt in enumerate([0.6, 1.25, 1.9]):
                for _ in range(600):
                    st = await pg.evaluate("() => window.__G.G.sim.time")
                    if st - t0 >= tt: break
                    await pg.wait_for_timeout(30)
                await pg.screenshot(path=f'{OUT}_glc{i}.png', timeout=90000)
        print('\n'.join(logs[:30]))
        await b.close()

asyncio.run(main())
