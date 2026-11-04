# v0.8 收线 UI 布局验证：蓄力 / 搏鱼两个阶段截图 + 量 #hint #actTag #dist #act 的位置
# python3 tools/test-scripts/reel_ui.py OUT_DIR [BASE]
import asyncio, sys, json, os
from playwright.async_api import async_playwright
OUT = (sys.argv[1] if len(sys.argv) > 1 else 'shots/reel/').rstrip('/') + '/'
BASE = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8960/index.html'
os.makedirs(OUT, exist_ok=True)
SEED = "try { localStorage.setItem('friends-fishing-v1', JSON.stringify({ tutorial: 1, total: 6, catches: 6, xp: 10, level: 2 })); localStorage.setItem('ff-joy-hint-v1','1'); } catch (e) {}"
K = "(t) => window.dispatchEvent(new KeyboardEvent(t, { code: 'Space', bubbles: true }))"
BOX = """(() => { const r = (id) => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), op: getComputedStyle(e).opacity, t: e.textContent.trim().slice(0, 20) }; };
  return { st: G.player.state, hint: r('hint'), tag: r('actTag'), dist: r('dist'), btn: (() => { const b = document.querySelector('#act .btn').getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); })() }; })()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for W, H in ((390, 844), (360, 740)):
            ctx = await b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2, has_touch=True)
            await ctx.add_init_script(SEED)
            pg = await ctx.new_page(); pg.set_default_timeout(240000)
            await pg.goto(BASE + '?autostart&dtmax=0.1&dpr=0.6&q=low')
            await pg.wait_for_function('window.G && window.G.player && !document.getElementById("splash")')
            await pg.wait_for_timeout(2500)
            for _ in range(4):
                await pg.evaluate("(() => { const b = document.querySelector('#modal.show .btn-p'); if (b) b.click(); })()"); await pg.wait_for_timeout(600)
            await pg.evaluate("G.meta.S.tutorial = 1")
            await pg.evaluate(f"({K})('keydown')")
            await pg.wait_for_function('G.player.state === "charge" && G.player.power > 0.45')
            print(W, 'charge', json.dumps(await pg.evaluate(BOX)), flush=True)
            await pg.screenshot(path=f'{OUT}{W}_charge.png')
            await pg.evaluate(f"({K})('keyup')")
            await pg.evaluate("G.dbg.force = 'tuna'")
            await pg.wait_for_function('G.player.state === "float"')
            await pg.evaluate("const p = G.player; p.nibbles = []; p.biteAt = p.t + 0.2")
            await pg.wait_for_function('G.player.state === "bite"')
            await pg.evaluate(f"({K})('keydown')")
            await pg.wait_for_function('G.player.state === "fight"')
            await pg.wait_for_timeout(900)
            print(W, 'fight', json.dumps(await pg.evaluate(BOX)), flush=True)
            await pg.screenshot(path=f'{OUT}{W}_fight.png')
            await pg.evaluate(f"({K})('keyup')")
            await pg.wait_for_timeout(700)
            await pg.screenshot(path=f'{OUT}{W}_fight_up.png')
            await ctx.close()
        await b.close()
asyncio.run(main())
