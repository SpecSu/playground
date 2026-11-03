# 静态页截图：python3 tools/v100/shot_page.py URL OUT.png [W H wait]
import asyncio, sys
from playwright.async_api import async_playwright
async def main():
    url, out = sys.argv[1], sys.argv[2]
    W, H, wait = int(sys.argv[3]) if len(sys.argv) > 3 else 1200, int(sys.argv[4]) if len(sys.argv) > 4 else 900, float(sys.argv[5]) if len(sys.argv) > 5 else 4
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': W, 'height': H})
        pg.on('pageerror', lambda e: print('[pageerror]', e)); pg.on('console', lambda m: print('[console]', m.text) if m.type == 'error' else None)
        await pg.goto(url); await pg.wait_for_function('window.G && G.player', timeout=180000); await asyncio.sleep(wait)
        await pg.screenshot(path=out, timeout=180000); await b.close()
asyncio.run(main())
