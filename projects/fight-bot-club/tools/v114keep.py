import asyncio, sys
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8811/?test&q=low'
N = int(sys.argv[2]) if len(sys.argv) > 2 else 4
WAIT = "() => window.__G && window.__G.G.E && window.__G.G.E[0] && window.__G.G.E[1]"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 405, 'height': 760})
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        for k in range(N):
            await pg.goto(URL)
            for _ in range(200):
                if await pg.evaluate(WAIT): break
                await pg.wait_for_timeout(500)
            r = await pg.evaluate("() => { const W = window.__G, L = W.league; return { fight: W.G.E.map(e => e.owner), queue: W.queue.map(e => e.owner), npc: Object.fromEntries(L.npcNames().map(n => [n, L.user(n).wins + '/' + L.user(n).matches])) }; }")
            print(k, r)
            if k == 0:
                await pg.evaluate("() => { const L = window.__G.league; for (const n of L.npcNames()) { L.user(n).wins = 7; L.user(n).matches = 9; } L.save(); }")
                print('  -> 全部 NPC 战绩写成 7/9，之后每次重开都应保留')
        print('errors', errs)
        await b.close()
asyncio.run(main())
