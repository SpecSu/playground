# v11 机库面板快速截图：预置 3 台本机机器人 → 打开我的机器人
import asyncio, sys, json
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8811/mockup/?test&q=low'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'output/v11h'
import datetime
SEED = {'v': 1, 'day': datetime.date.today().isoformat(), 'me': {'matches': 3, 'wins': 2, 'losses': 1, 'pop': 900, 'streak': 0, 'best': 2, 'resets': 0}, 'npc': {'苏贝壳': {'matches': 4, 'wins': 2, 'losses': 2, 'pop': 1200, 'streak': 0, 'best': 1, 'resets': 0}}, 'lastRobot': 'r2', 'lastStrat': 'defense', 'robots': [
  {'id': 'r1', 'prompt': '霓虹赛博刺客，双刀', 'seed': 11, 'form': 'dog', 'name': '霓刃', 'strat': 'attack', 'wins': 3, 'losses': 1},
  {'id': 'r2', 'prompt': '黄金重装坦克，巨型铁拳', 'seed': 22, 'form': 'humanoid', 'name': '金刚', 'strat': 'defense', 'wins': 1, 'losses': 2},
  {'id': 'r3', 'prompt': '深海鲨鱼浮游炮台，蜂群导弹', 'seed': 33, 'form': 'hover', 'name': '鲨炮', 'strat': 'balanced', 'wins': 0, 'losses': 0}]}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 405, 'height': 760})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(f"if (!localStorage.getItem('fbc.v11')) localStorage.setItem('fbc.v11', {json.dumps(json.dumps(SEED))})")
        await pg.goto(URL)
        for _ in range(200):
            if await pg.evaluate("() => window.__G && ['intro','fight'].includes(window.__G.G.phase)"): break
            await pg.wait_for_timeout(500)
        await pg.click('#btnCreate')
        for _ in range(40):
            await pg.wait_for_timeout(1000)
            if await pg.evaluate("() => document.querySelectorAll('#hgStrip img').length >= 3"): break
        await pg.wait_for_timeout(800)
        print('imgs', await pg.evaluate("() => document.querySelectorAll('#hgStrip img').length"), 'title', await pg.inner_text('#shTitle'), 'join', await pg.inner_text('#btnJoin'))
        await pg.screenshot(path=f'{OUT}_hangar.png', timeout=120000)
        await pg.click('#stratSeg .sg.attack'); await pg.click('#btnJoin'); await pg.wait_for_timeout(400)
        print('queue', await pg.evaluate("() => window.__G.queue.map(e => (e.mine?'★':'')+e.uid+':'+e.strat+':'+e.design.name)"))
        await pg.click('#btnCreate'); await pg.wait_for_timeout(1500)
        print('active join', await pg.inner_text('#btnJoin'))
        await pg.screenshot(path=f'{OUT}_active.png', timeout=120000)
        print('btn style', await pg.evaluate("() => { const b = document.querySelector('#btnJoin'), c = getComputedStyle(b); return [b.disabled, c.opacity, c.pointerEvents]; }"))
        await pg.click('#create [data-close]')
        # 让我的机器人上场 → 血槽名字后「我」
        for _ in range(40):
            ph = await pg.evaluate("() => window.__G.G.phase")
            if ph == 'intro': await pg.evaluate("() => window.__G.startFight()")
            if ph == 'fight': break
            await pg.wait_for_timeout(500)
        print('phase before KO', ph)
        await pg.evaluate("() => window.__G.demoKO(0)")
        for _ in range(240):
            await pg.wait_for_timeout(500)
            if await pg.evaluate("() => window.__G.G.E.some(e => e && e.mine) && window.__G.G.phase === 'intro'"): break
        await pg.evaluate("() => window.__G.startFight()"); await pg.wait_for_timeout(2500)
        print('hud names', await pg.evaluate("() => [...document.querySelectorAll('#hud .fc-name')].map(x => x.innerHTML)"))
        await pg.screenshot(path=f'{OUT}_hud.png', timeout=120000)
        print('npcs', await pg.evaluate("() => window.__G.league.npcNames()"), 'onstage', await pg.evaluate("() => window.__G.G.E.map(e => e.uid)"))
        await pg.click('#btnRoster'); await pg.wait_for_timeout(600)
        await pg.screenshot(path=f'{OUT}_rank.png', timeout=120000)
        await pg.click('#roster [data-close]')
        await pg.evaluate("() => { const W = window.__G; W.league.d.me.matches = 10; W.queue.splice(0, W.queue.length, ...W.queue.filter(e => !e.mine)); W.openCreate(); }"); await pg.wait_for_timeout(1200)
        print('full', await pg.inner_text('#btnJoin'))
        await pg.screenshot(path=f'{OUT}_full.png', timeout=120000)
        await pg.click('#create [data-close]')
        # 出场卡（策略标签）
        await pg.evaluate("() => { const W = window.__G; W.G.E[1].strat = 'defense'; W.introCard(1); }"); await pg.wait_for_timeout(1300)
        await pg.screenshot(path=f'{OUT}_intro.png', timeout=120000)
        print('errors', errs)
        await b.close()
asyncio.run(main())
