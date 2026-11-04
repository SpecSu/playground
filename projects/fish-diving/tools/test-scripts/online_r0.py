# 线上冒烟：加载、检查 v0.6 特性、无报错
import asyncio, sys
from playwright.async_api import async_playwright
URL = (sys.argv[1] if len(sys.argv) > 1 else 'https://f4d147f36ef5.aime-site.bytedance.net/') + '?autostart&dtmax=0.1'

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True)
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: m.type == 'error' and logs.append('console: ' + m.text))
        pg.on('pageerror', lambda e: logs.append('pageerror: ' + str(e)))
        pg.on('response', lambda r: r.status >= 400 and logs.append(f'{r.status} {r.url}'))
        await pg.goto(URL, wait_until='domcontentloaded', timeout=120000)
        await pg.wait_for_function('window.G && G.player && G.player.state === "idle"', timeout=240000)
        await pg.wait_for_timeout(4000)
        info = await pg.evaluate('''async () => {
          const r = await fetch('src/ugc.js'); const t = await r.text();
          return { ugc: r.status, ugcHasPatterns: t.includes('PATTERNS'),
                   railMod: (await (await fetch('src/boat.js')).text()).includes('AFT_RAIL = 0.13'),
                   baitBadge: !!document.querySelector('#act') , lucky: getComputedStyle(document.querySelector('#act')).position };
        }''')
        print('INFO', info)
        await pg.screenshot(path='fish_test/r0/17_online.png')
        print('LOGS', len(logs)); [print(' ', l) for l in logs]
        await b.close()
asyncio.run(main())
