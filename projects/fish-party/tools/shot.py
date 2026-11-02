# 快速取景脚本：python3 tools/shot.py OUT_DIR [JS_STEPS...]
# 每个 STEP 形如 "name.png::<js 表达式（可 await）或 @file.js>::秒数"，先执行 js、等待 N 秒（真实时间）后截图
import asyncio, sys, os, time
from playwright.async_api import async_playwright

OUT = sys.argv[1].rstrip('/') + '/'
STEPS = sys.argv[2:]
BASE = os.environ.get('BASE', 'http://127.0.0.1:8960/index.html')
QS = os.environ.get('QS', '?dpr=0.6&q=low')
W, H = int(os.environ.get('W', 390)), int(os.environ.get('H', 844))
os.makedirs(OUT, exist_ok=True)

SEED = r"""(() => { try { if (!localStorage.getItem('friends-fishing-v1')) localStorage.setItem('friends-fishing-v1', JSON.stringify(%SEED%)); } catch (e) {} })();"""


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2, has_touch=True, is_mobile=True)
        await ctx.add_init_script(SEED.replace('%SEED%', os.environ.get('SEED', '{"tutorial":99,"total":6,"catches":6,"xp":140,"level":2,"bait":2}')))
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        pg.on('response', lambda r: logs.append(f'[{r.status}] {r.url}') if r.status >= 400 else None)
        pg.set_default_timeout(180000)
        t0 = time.time()
        await pg.goto(BASE + QS)
        await pg.wait_for_function('window.G && G.player', timeout=180000)
        print('loaded', round(time.time() - t0, 1), 's', flush=True)
        for st in STEPS:
            name, js, wait = (st.split('::') + ['', '1'])[:3]
            if js.startswith('@'): js = open(js[1:]).read()
            if js.strip():
                try:
                    r = await pg.evaluate(f'(async () => {{ {js} }})()')
                    if r is not None: print('  ->', str(r)[:1500], flush=True)
                except Exception as e:
                    print('  JS ERR', name, e, flush=True)
            await asyncio.sleep(float(wait or 1))
            if name.endswith('.png'):
                await pg.screenshot(path=OUT + name)
                print('  shot', name, flush=True)
        for l in logs[:30]: print(l)
        await b.close()

asyncio.run(main())
