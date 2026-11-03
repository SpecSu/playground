# v0.9.1 相机手势验证：python3 tools/v091/gestures.py shots/v091/cam
import asyncio, sys, os, json
from playwright.async_api import async_playwright

OUT = (sys.argv[1] if len(sys.argv) > 1 else 'shots/v091/cam').rstrip('/') + '/'
os.makedirs(OUT, exist_ok=True)
BASE = 'http://127.0.0.1:8960/index.html?dpr=0.6&q=low'
OPEN = open(os.path.join(os.path.dirname(__file__), '../v09b/open.js')).read().split("const f = G.meta.tankFish()[0];")[0] + "return 1;"


async def touch(cdp, typ, pts):
    await cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in pts]})


async def pinch(cdp, cx, cy, d0, d1, steps=12, dx=0):
    await touch(cdp, 'touchStart', [(0, (cx - d0 / 2, cy))]); await asyncio.sleep(0.03)
    await touch(cdp, 'touchStart', [(0, (cx - d0 / 2, cy)), (1, (cx + d0 / 2, cy))])
    for k in range(1, steps + 1):
        d = d0 + (d1 - d0) * k / steps; ox = dx * k / steps
        await touch(cdp, 'touchMove', [(0, (cx - d / 2 + ox, cy)), (1, (cx + d / 2 + ox, cy))]); await asyncio.sleep(0.03)
    await touch(cdp, 'touchEnd', [])


async def drag(cdp, x0, y0, x1, y1, steps=20):
    await touch(cdp, 'touchStart', [(0, (x0, y0))])
    for k in range(1, steps + 1):
        await touch(cdp, 'touchMove', [(0, (x0 + (x1 - x0) * k / steps, y0 + (y1 - y0) * k / steps))]); await asyncio.sleep(0.025)
    await touch(cdp, 'touchEnd', [])


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
        await ctx.add_init_script("localStorage.setItem('friends-fishing-v1', JSON.stringify({tutorial:99,total:6,catches:6,xp:140,level:2,bait:2}))")
        pg = await ctx.new_page(); errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.set_default_timeout(240000)
        await pg.goto(BASE); await pg.wait_for_function('window.G && G.player')
        cdp = await ctx.new_cdp_session(pg)
        await pg.evaluate("(async()=>{const s=(m)=>new Promise(r=>setTimeout(r,m));for(let i=0;i<80&&!document.querySelector('#start.ready');i++)await s(250);document.querySelector('#start')?.click();await s(1200);document.querySelector('#modal.show .btn-p')?.click();await s(1500)})()")
        cam = "JSON.stringify({dist:+G.cam.dist.toFixed(2),zoom:+G.cam.zoom.toFixed(2)})"
        print('① fish before', await pg.evaluate(cam))
        await pinch(cdp, 195, 330, 220, 90); await asyncio.sleep(2.5)
        print('① after pinch-out (zoom out)', await pg.evaluate(cam))
        await pg.screenshot(path=OUT + '1_fish_zoomout.png')
        await pinch(cdp, 195, 330, 80, 260); await asyncio.sleep(2.5)
        print('① after pinch-in (zoom in), 2.5s later', await pg.evaluate(cam))
        await pg.screenshot(path=OUT + '2_fish_zoomin.png')
        # ② 鱼缸
        await pg.evaluate(f"(async()=>{{{OPEN}}})()"); await asyncio.sleep(1)
        v = "JSON.stringify({view:G.aq.view,orb:G.aq.orb,sel:G.aq.selected,cam:G.aq.camera.position.toArray().map(x=>+x.toFixed(2))})"
        print('② tank before', await pg.evaluate(v))
        await pinch(cdp, 195, 380, 90, 260); await asyncio.sleep(0.6)
        await drag(cdp, 150, 420, 300, 330); await asyncio.sleep(1.5)
        print('② after pinch+pan', await pg.evaluate(v))
        await pg.screenshot(path=OUT + '3_tank_zoom_pan.png')
        # ③ 选中 + 环绕
        await pg.evaluate("(()=>{G.aq.view.zT=1;G.tankUI.debugTap(G.meta.tankFish()[0].uid)})()"); await asyncio.sleep(2.5)
        await drag(cdp, 60, 260, 360, 260, 30); await asyncio.sleep(2.5)
        o = json.loads(await pg.evaluate(v))
        print('③ orbit', json.dumps(o), 'yaw(deg)=', round(abs(o['orb']['yaw']) * 57.3))
        await pg.screenshot(path=OUT + '4_tank_orbit.png')
        print('errors:', errs[:5])
        await b.close()

asyncio.run(main())
