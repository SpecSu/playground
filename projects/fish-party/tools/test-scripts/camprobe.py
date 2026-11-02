# 镜头探针：强制进入搏鱼，记录镜头在船体局部坐标中的位置 + 截图
# python3 fish_test/camprobe.py OUT_PREFIX [px] [pz]
import asyncio, sys, json
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/cam'
PX = float(sys.argv[2]) if len(sys.argv) > 2 else None
PZ = float(sys.argv[3]) if len(sys.argv) > 3 else None
URL = 'http://127.0.0.1:8765/index.html?autostart&dtmax=0.1&dpr=0.6&q=low'
JS_WAIT = '''window.__w = (pred, maxT=40) => new Promise(res => { const t0 = G.time; const f = () => { if (pred() || G.time - t0 > maxT) res(G.time - t0); else requestAnimationFrame(f); }; f(); });
window.__camL = () => { const p = G.camera.position.clone(); G.player.char.root.parent.worldToLocal(p); return [p.x, p.y, p.z].map(v => +v.toFixed(2)); };'''

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, has_touch=True, is_mobile=True)
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        pg.on('response', lambda r: logs.append(f'[{r.status}] {r.url}') if r.status >= 400 else None)
        pg.set_default_timeout(300000)
        await pg.goto(URL)
        await pg.wait_for_function('window.G && window.G.player && !document.getElementById("splash")', timeout=300000)
        for _ in range(3):
            if await pg.locator('#modal.show .btn-p').count():
                await pg.locator('#modal.show .btn-p').click(); await pg.wait_for_timeout(300)
        await pg.evaluate(JS_WAIT)
        if PX is not None:
            await pg.evaluate(f'G.playerState.pos.x={PX}; G.playerState.pos.z={PZ};')
            await pg.evaluate('__w(() => false, 1.5)')
        await pg.evaluate("(async()=>{const P=G.player; P.press(); await __w(()=>P.power>0.78,5); P.releasePress(); await __w(()=>P.state==='float',10); P.biteAt=P.t+0.3; await __w(()=>P.state==='bite',5); P.press(); await __w(()=>P.state==='fight',3); P.releasePress(); await __w(()=>false,2.5);})()")
        r = await pg.evaluate('({st:G.player.state, cam:__camL(), me:[G.playerState.pos.x,G.playerState.pos.z]})')
        print('fight', json.dumps(r))
        await pg.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); await pg.screenshot(path=OUT + '_fight.png')
        await pg.evaluate("(async()=>{const P=G.player; P.dist=1.2; P.jumped=true; P.press(); await __w(()=>P.state==='land',8); await __w(()=>false,0.25);})()")
        r = await pg.evaluate('({st:G.player.state, cam:__camL()})')
        print('land', json.dumps(r))
        await pg.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); await pg.screenshot(path=OUT + '_land.png')
        await pg.evaluate("(async()=>{const P=G.player; P.releasePress(); await __w(()=>P.state==='hold',5); await __w(()=>false,1.6);})()")
        await pg.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); await pg.screenshot(path=OUT + '_hold.png')
        print('logs', logs)
        await b.close()

asyncio.run(main())
