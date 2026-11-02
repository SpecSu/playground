# v0.6-r0 完整流程验收：钓 3 条以上 + 幸运饵 / 张力环 / 等待中开菜单 / 抱鱼详情 / 点赞位置 / 图鉴（UGC 收藏）
# 用法：python3 fish_test/r0.py [BASE_URL] [OUT_DIR]
import asyncio, sys, time, os, json
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/index.html'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'fish_test/r0/'
NFISH = int(os.environ.get('NFISH', '3'))
os.makedirs(OUT, exist_ok=True)

BOT = """(() => {
  const K = (t) => window.dispatchEvent(new KeyboardEvent(t, { code: 'Space', bubbles: true }));
  const bot = window.__bot = { held: false, phase: 'idle', hold: false };
  const dn = () => { if (!bot.held) { K('keydown'); bot.held = true; } };
  const up = () => { if (bot.held) { K('keyup'); bot.held = false; } };
  const tick = () => {
    const p = G.player, s = p.state;
    if (bot.phase === 'go') {
      if (s === 'idle') dn();
      else if (s === 'charge') { if (!bot.hold && p.power > 0.77 && p.power < 0.87) { up(); bot.phase = 'wait'; } }
    } else if (bot.phase === 'wait') {
      if (s === 'bite') { if (!bot.biteSeen) bot.biteSeen = performance.now(); if (performance.now() - bot.biteSeen > 420) { dn(); bot.phase = 'fight'; } }
      else if (s === 'idle') { up(); bot.phase = 'go'; bot.biteSeen = 0; }
    } else if (bot.phase === 'fight') {
      if (s === 'fight' || s === 'hookset') {
        const danger = document.body.classList.contains('surge') || p.tension > 0.84;
        if (danger) up(); else dn();
      } else { up(); if (s === 'idle' || s === 'fail') { bot.phase = 'go'; bot.biteSeen = 0; } if (s === 'land' || s === 'hold') { bot.phase = 'done'; bot.biteSeen = 0; } }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, has_touch=True)
        pg = await ctx.new_page()
        logs = []
        def con(m):
            if m.type == 'error' or (m.type == 'warning' and 'AudioContext' not in m.text and 'GL Driver' not in m.text and 'GPU stall' not in m.text):
                logs.append(f'[{m.type}] {m.text}')
        pg.on('console', con)
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        pg.on('response', lambda r: logs.append(f'[{r.status}] {r.url}') if r.status >= 400 else None)
        pg.on('requestfailed', lambda r: logs.append(f'[reqfail] {r.url} {r.failure}') if 'fonts.g' not in r.url else None)
        t0 = time.time()
        pg.set_default_timeout(120000)
        await pg.goto(BASE + '?autostart&dtmax=0.1')
        await pg.wait_for_function('window.G && window.G.player && !document.getElementById("splash")', timeout=150000)
        print('started', round(time.time() - t0, 1))
        async def close_modal():
            for _ in range(4):
                if await pg.locator('#modal.show .btn-p').count():
                    await pg.locator('#modal.show .btn-p').click(); await pg.wait_for_timeout(500)
                else: break
        async def shot(name):
            await pg.screenshot(path=OUT + name); print('shot', name)
        async def state(): return await pg.evaluate('G.player.state')
        await pg.wait_for_timeout(1500); await close_modal(); await pg.wait_for_timeout(2000)
        await shot('01_idle_bait_badge.png')
        # 幸运饵：点徽章开启 → 主按钮金色描边
        await pg.locator('#bait').click(); await pg.wait_for_timeout(600)
        lucky = await pg.evaluate('({act: document.getElementById("act").className, bait: document.getElementById("bait").className, n: G.meta.S.bait})')
        print('bait on', lucky)
        await shot('02_bait_on.png')
        await pg.evaluate(BOT)
        caught = []
        for k in range(NFISH):
            first = k == 0
            await pg.evaluate('window.__bot.phase = "go"; window.__bot.hold = %s' % ('true' if first else 'false'))
            if first:
                # 蓄力截图（带幸运饵金环）后再松手
                for _ in range(200):
                    if await pg.evaluate('G.player.state === "charge" && G.player.power > 0.55'): break
                    await pg.wait_for_timeout(40)
                await shot('03_charge.png')
                await pg.evaluate('window.__bot.hold = false')
            got_wait = got_bite = False; fightN = 0; res = None
            for i in range(1800):
                info = await pg.evaluate('({s:G.player.state, ph: window.__bot.phase, ten: G.player.tension})')
                s = info['s']
                if first and s == 'float' and not got_wait:
                    await pg.wait_for_timeout(800)
                    if await state() == 'float':
                        got_wait = True
                        top = await pg.evaluate('!document.getElementById("top").classList.contains("off")')
                        print('wait: top visible =', top)
                        await shot('04_wait.png')
                        # 等待阶段打开菜单
                        await pg.locator('#menuBtn').click(); await pg.wait_for_timeout(700)
                        print('wait: sheet open =', await pg.evaluate('document.getElementById("sheet").classList.contains("show")'))
                        await shot('05_wait_menu.png')
                        await pg.locator('#shX').click(); await pg.wait_for_timeout(500)
                elif first and s == 'bite' and not got_bite:
                    got_bite = True; await shot('06_bite.png')
                elif s == 'fight':
                    fightN += 1
                    if fightN == 4: await shot(f'07_fight_ring_{k+1}.png')
                    if fightN == 4:
                        ring = await pg.evaluate('({cls: document.getElementById("act").className, dist: document.getElementById("distN").textContent, distOp: getComputedStyle(document.getElementById("dist")).opacity})')
                        print('fight', ring)
                if info['ph'] == 'done' and s == 'hold': res = 'hold'; break
                await pg.wait_for_timeout(110)
            print(f'fish {k+1}:', res)
            if res != 'hold': continue
            # 抱鱼展示：先等点赞动态（应贴在钓获卡上沿，不压角色头顶）
            liked = False
            for _ in range(45):
                fd = await pg.evaluate('(() => { const f = document.querySelector("#feed .fd:not(.out)"); if (!f) return null; const r = f.getBoundingClientRect(); return {t: f.innerText, top: Math.round(r.top), at: document.getElementById("feed").classList.contains("atcard"), cardTop: Math.round(document.getElementById("catch").getBoundingClientRect().top)}; })()')
                if fd and fd['at'] and not liked:
                    liked = True; print('  like feed', fd); await shot(f'10_like_{k+1}.png'); break
                await pg.wait_for_timeout(150)
            await pg.wait_for_timeout(800); await close_modal()
            v = await pg.evaluate('(() => { const v = G.player.v; return {sp: v.sp, title: v.title, decos: v.ugc && v.ugc.decos, cm: v.cm}; })()')
            caught.append(v); print('  caught', v)
            await shot(f'08_hold_{k+1}.png')
            if first:
                await pg.locator('#cMore').click(); await pg.wait_for_timeout(1600)
                await shot('09_hold_detail.png')
                geo = await pg.evaluate('''(() => { const c = document.getElementById("catch").getBoundingClientRect(); return {cardTop: Math.round(c.top)}; })()''')
                print('  detail geo', geo)
                await pg.locator('#cMore').click(); await pg.wait_for_timeout(400)
            await pg.keyboard.down('Space'); await pg.wait_for_timeout(80); await pg.keyboard.up('Space')
            for _ in range(200):
                if await state() == 'idle': break
                await pg.wait_for_timeout(50)
            await pg.wait_for_timeout(1500); await close_modal(); await pg.wait_for_timeout(400); await close_modal()
        print('CAUGHT', len(caught))
        # 社交动态采样（频控：同屏最多 1 条）
        feeds = []; multi = 0
        for _ in range(14):
            await pg.wait_for_timeout(1000)
            t = await pg.evaluate('document.getElementById("feed").innerText')
            n = await pg.evaluate('document.querySelectorAll("#feed .fd:not(.out)").length')
            if n > 1: multi += 1
            if t and t not in feeds: feeds.append(t.replace('\n', ' '))
        print('feeds', feeds, 'multi', multi)
        await close_modal()
        await shot('11_idle_after.png')
        # 图鉴：只有钓到的鱼，每条独特缩略图
        await pg.locator('#menuBtn').click(); await pg.wait_for_timeout(700)
        await pg.locator('#shTabs [data-tab="codex"]').click()
        for _ in range(120):
            ok = await pg.evaluate('[document.querySelectorAll(".cx img.ok").length, document.querySelectorAll(".cx img").length]')
            if ok[0] >= ok[1]: break
            await pg.wait_for_timeout(300)
        await pg.wait_for_timeout(2500)
        cx = await pg.evaluate('({cards: document.querySelectorAll(".cx").length, locked: document.querySelectorAll(".cell.lock").length, txt: document.querySelector(".cx-sum")?.innerText})')
        print('codex', cx)
        await shot('12_codex.png')
        await pg.locator('.cx').first.click()
        for _ in range(60):
            if await pg.evaluate('!!document.querySelector(".cx-detail img.ok") || !document.querySelector(".cx-detail img")'): break
            await pg.wait_for_timeout(300)
        await pg.wait_for_timeout(2500)
        await shot('13_codex_detail.png')
        await pg.locator('#shTabs [data-tab="rank"]').click(); await pg.wait_for_timeout(1500); await shot('14_rank.png')
        await pg.locator('#shTabs [data-tab="tasks"]').click(); await pg.wait_for_timeout(1500); await shot('15_tasks.png')
        await pg.locator('#shX').click(); await pg.wait_for_timeout(500)
        print('ELAPSED', round(time.time() - t0, 1))
        print('---- logs ----')
        for l in logs: print(l)
        print('LOGS', len(logs))
        await b.close()

asyncio.run(main())
