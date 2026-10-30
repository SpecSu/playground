import asyncio, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':1600,'height':1190})
        pg.on('console', lambda m: print('[console]', m.text))
        pg.on('pageerror', lambda e: print('[err]', e))
        await pg.goto(sys.argv[1]); await pg.wait_for_function('window.__ready===true', timeout=120000)
        await pg.wait_for_timeout(500)
        await (await pg.query_selector('#wrap')).screenshot(path=sys.argv[2])
        await b.close()
asyncio.run(main())
