import asyncio, sys
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8811/mockup/?test&q=low'
N = int(sys.argv[2]) if len(sys.argv) > 2 else 4
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for k in range(N):
            pg = await b.new_page(viewport={'width': 405, 'height': 760})
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(URL)
            for _ in range(200):
                if await pg.evaluate("() => window.__G && window.__G.G.E && window.__G.G.E[0] && window.__G.G.E[1]"): break
                await pg.wait_for_timeout(500)
            r = await pg.evaluate("() => ({fight: window.__G.G.E.map(e => e && e.owner + '/' + e.design.form + '/' + e.design.scale.toFixed(2)), queue: window.__G.queue.map(e => e.owner), npcs: window.__G.league.npcNames()})")
            print(k, r, 'errors', errs)
            if k == 0: await pg.screenshot(path='output/v114_open.png', timeout=120000)
            await pg.close()
        await b.close()
asyncio.run(main())
