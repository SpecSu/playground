# 开屏截图：python3 tools/test-scripts/splash_shots.py OUT_DIR [W H]
# goto 后 0.5 / 2 / 5s 各截一张，等 #start.ready 后再截"开始按钮"状态，最后点开始截退场中间帧
import asyncio, sys, os, time
from playwright.async_api import async_playwright

OUT = sys.argv[1].rstrip('/') + '/'
W = int(sys.argv[2]) if len(sys.argv) > 2 else 390
H = int(sys.argv[3]) if len(sys.argv) > 3 else 844
TAG = f'{W}x{H}'
BASE = os.environ.get('BASE', 'http://127.0.0.1:8960/index.html')
QS = os.environ.get('QS', '?dpr=0.6&q=low')
os.makedirs(OUT, exist_ok=True)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        mob = W < H
        ctx = await b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2 if mob else 1, has_touch=mob, is_mobile=mob)
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        pg.on('response', lambda r: logs.append(f'[{r.status}] {r.url}') if r.status >= 400 else None)
        t0 = time.time()
        await pg.goto(BASE + QS, wait_until='commit')
        for t in (0.5, 2, 5):
            await asyncio.sleep(max(0, t - (time.time() - t0)))
            await pg.screenshot(path=f"{OUT}splash_{TAG}_{t}s.png", timeout=120000)
            print('shot', t, round(time.time() - t0, 1), flush=True)
        await pg.wait_for_selector('#start.ready', timeout=240000)
        print('ready', round(time.time() - t0, 1), flush=True)
        await asyncio.sleep(2.2)
        await pg.screenshot(path=f'{OUT}splash_{TAG}_ready.png')
        await pg.click('#start')
        await asyncio.sleep(0.3)
        await pg.screenshot(path=f'{OUT}splash_{TAG}_out.png')
        await asyncio.sleep(1.2)
        await pg.screenshot(path=f'{OUT}splash_{TAG}_game.png')
        print('splash gone:', await pg.evaluate('!document.getElementById("splash")'))
        for l in logs[:30]: print(l)
        await b.close()

asyncio.run(main())
