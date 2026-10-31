# v10.1 投票大招截图：倒计时条 → 投票面板 → 点击支持 → 结果 → 大招
import asyncio, sys
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5190/?test&q=low'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/u0/v'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 405, 'height': 720})
        logs = []
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
        await pg.goto(URL)
        for _ in range(150):
            await pg.wait_for_timeout(1000)
            ph = await pg.evaluate("() => window.__G && window.__G.G.phase")
            if ph == 'intro': await pg.evaluate("() => window.__G.startFight()")
            if ph == 'fight': break
        await pg.wait_for_timeout(3000)
        await pg.screenshot(path=f'{OUT}0.png', timeout=90000)
        await pg.evaluate("() => { window.__G.G.sim.ultClock = 0.05; }")
        await pg.wait_for_timeout(1200)
        await pg.screenshot(path=f'{OUT}1.png', timeout=90000)
        box = await pg.locator('.vt-orb.s0').bounding_box()
        for _ in range(14):
            await pg.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); await pg.wait_for_timeout(60)
        await pg.screenshot(path=f'{OUT}2.png', timeout=90000)
        for _ in range(200):
            if await pg.evaluate("() => window.__G.AS.done || !window.__G.AS.on"): break
            await pg.wait_for_timeout(50)
        await pg.screenshot(path=f'{OUT}3.png', timeout=90000)
        for _ in range(100):
            if await pg.evaluate("() => !window.__G.AS.on && window.__G.G.F.some(f => f.act && f.act.type.startsWith('ult_'))"): break
            await pg.wait_for_timeout(100)
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=f'{OUT}4.png', timeout=90000)
        print(await pg.evaluate("() => [window.__G.AS.n, window.__G.AS.win, window.__G.AS.boost, window.__G.G.sim.ultClock.toFixed(1)]"))
        print('\n'.join(logs[:20]))
        await b.close()
asyncio.run(main())
