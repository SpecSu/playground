# v11.3：VS 报幕策略黄字 + 血槽上方「策略·克制｜大招：xx」截图
import asyncio, sys
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8811/mockup/?test&q=low'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'output/v113'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 405, 'height': 760})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL)
        for _ in range(200):
            if await pg.evaluate("() => window.__G && window.__G.G.phase === 'intro'"): break
            await pg.wait_for_timeout(500)
        # 设定策略：左进攻 右防守（防守克进攻）→ 重建 HUD
        await pg.evaluate("() => { const W = window.__G, G = W.G; G.E[0].strat = 'attack'; G.E[1].strat = 'defense'; G.F[0].strat = 'attack'; G.F[1].strat = 'defense'; W.setupHud(); }")
        await pg.evaluate("() => { const G = window.__G.G; G.ann.c0 = G.ann.c1 = 1; G.ann.quick = false; G.t = 6.25; }")
        for _ in range(40):
            if await pg.evaluate("() => !!document.querySelector('#banner .vss')"): break
            await pg.wait_for_timeout(100)
        await pg.add_style_tag(content='#banner.show, #banner.show *{animation-play-state:paused!important}')
        await pg.wait_for_timeout(300)
        print('vs', await pg.evaluate("() => [...document.querySelectorAll('#banner .vss')].map(x => x.textContent)"))
        await pg.screenshot(path=f'{OUT}_vs.png', timeout=120000)
        for _ in range(60):
            if await pg.evaluate("() => window.__G.G.phase === 'fight'"): break
            await pg.wait_for_timeout(250)
        await pg.wait_for_timeout(1500)
        print('sub', await pg.evaluate("() => [...document.querySelectorAll('#hud .fc-sub')].map(x => x.textContent)"))
        await pg.screenshot(path=f'{OUT}_hud.png', timeout=120000)
        print('errors', errs)
        await b.close()
asyncio.run(main())
