# v11 端到端：新用户创造→保存→出战；败者退场 / NPC 兜底；回访机库；今日上限；用户排行
import asyncio, sys, json
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8811/mockup/?test&q=low'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'output/v11'

async def wait_phase(pg, want, tmo=200):
    for _ in range(tmo):
        ph = await pg.evaluate("() => window.__G && window.__G.G.phase")
        if ph in want: return ph
        await pg.wait_for_timeout(500)
    return None

async def play_round(pg, lose_side):
    ph = await wait_phase(pg, ('intro', 'fight'))
    if ph == 'intro': await pg.evaluate("() => window.__G.startFight()")
    await pg.wait_for_timeout(600)
    await pg.evaluate(f"() => window.__G.demoKO({lose_side})")
    r0 = await pg.evaluate("() => window.__G.G.round")
    for _ in range(80):
        await pg.wait_for_timeout(500)
        if await pg.evaluate("() => window.__G.G.round") > r0: break

STATE = """() => { const W = window.__G; const q = W.queue.map(e => (e.mine ? '★' : '') + e.uid + ':' + e.strat);
  return { round: W.G.round, E: W.G.E.map(e => e && ((e.mine ? '★' : '') + e.uid + ':' + e.strat)), queue: q, me: W.league.user('me'), left: W.league.left('me'),
    npcs: W.league.npcNames().length, robots: W.league.robots().length, mine: !!W.myActive() }; }"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 405, 'height': 760}, device_scale_factor=1)
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(URL)
        await wait_phase(pg, ('intro', 'fight'))
        print('boot', await pg.evaluate(STATE), flush=True)
        # 1) 新用户：按钮文案「创造机器人」，打开即创造态
        print('btn', await pg.inner_text('#btnCreateTxt'))
        await pg.click('#btnCreate'); await pg.wait_for_timeout(500)
        print('title', await pg.inner_text('#shTitle'), 'hangarHidden', await pg.evaluate("() => document.querySelector('#hangar').classList.contains('hidden')"))
        await pg.screenshot(path=f'{OUT}_1new.png', timeout=120000)
        await pg.click('#btnRand'); await pg.wait_for_timeout(2500)
        await pg.click('#stratSeg .sg.attack'); await pg.wait_for_timeout(300)
        print('join', await pg.inner_text('#btnJoin'))
        await pg.screenshot(path=f'{OUT}_2gen.png', timeout=120000)
        await pg.click('#btnJoin'); await pg.wait_for_timeout(400)
        s = await pg.evaluate(STATE); print('joined', s, flush=True)
        ls = await pg.evaluate("() => JSON.parse(localStorage.getItem('fbc.v11'))")
        print('stored robots', [(r['name'], r['strat']) for r in ls['robots']], 'lastStrat', ls['lastStrat'])
        # 2) 我登场（挑战者 1 号位）→ 让我输 → 退场；队列由 NPC 兜底不为空
        await play_round(pg, 0)  # 当前场：擂主输（让擂台流转）
        s = await pg.evaluate(STATE); print('r+1', s, flush=True)
        # 等到我上场
        for _ in range(4):
            s = await pg.evaluate(STATE)
            if any(e and e.startswith('★') for e in s['E']): break
            await play_round(pg, 0)
        s = await pg.evaluate(STATE); print('me on stage', s, flush=True)
        ph = await wait_phase(pg, ('intro',))
        await pg.wait_for_timeout(9500 if True else 0)
        await pg.screenshot(path=f'{OUT}_3intro.png', timeout=120000)
        side = 0 if (s['E'][0] or '').startswith('★') else 1
        # 我先赢一局（对手输）→ 守擂，再输一局 → 退场
        await play_round(pg, 1 - side)
        s = await pg.evaluate(STATE); print('me won', s, flush=True)
        side = 0 if (s['E'][0] or '').startswith('★') else 1
        await play_round(pg, side)
        s = await pg.evaluate(STATE); print('me lost', s, flush=True)
        assert not s['mine'], '败者应退场'
        assert len(s['queue']) >= 2, '候场至少 2 位'
        # 3) 回访机库：按钮文案改「我的机器人」，打开即机库态
        print('btn', await pg.inner_text('#btnCreateTxt'))
        await pg.click('#btnCreate'); await pg.wait_for_timeout(1500)
        print('title', await pg.inner_text('#shTitle'), 'join', await pg.inner_text('#btnJoin'), 'quota', await pg.inner_text('#quota'))
        await pg.screenshot(path=f'{OUT}_4hangar.png', timeout=120000)
        # 4) 今日打满 → 出战禁用
        await pg.evaluate("() => { const W = window.__G; W.league.d.me.matches = 10; W.openCreate(); }"); await pg.wait_for_timeout(600)
        print('full join', await pg.inner_text('#btnJoin'), await pg.evaluate("() => document.querySelector('#btnJoin').disabled"))
        await pg.screenshot(path=f'{OUT}_5full.png', timeout=120000)
        await pg.evaluate("() => { const W = window.__G; W.league.d.me.matches = 2; W.league.save(); }")
        await pg.click('#create [data-close]')
        # 5) 排行
        await pg.click('#btnRoster'); await pg.wait_for_timeout(500)
        await pg.screenshot(path=f'{OUT}_6rank.png', timeout=120000)
        await pg.click('#roster [data-close]')
        # 6) 刷新：本机存档仍在
        await pg.reload(); await wait_phase(pg, ('intro', 'fight'))
        print('reload', await pg.evaluate(STATE), 'btn', await pg.inner_text('#btnCreateTxt'))
        await pg.click('#btnCreate'); await pg.wait_for_timeout(1500)
        print('reload title', await pg.inner_text('#shTitle'), 'join', await pg.inner_text('#btnJoin'))
        await pg.click('#hgStrip [data-new]'); await pg.wait_for_timeout(500)
        print('new from hangar title', await pg.inner_text('#shTitle'), 'back visible', await pg.evaluate("() => !document.querySelector('#btnBack').classList.contains('hidden')"))
        await pg.screenshot(path=f'{OUT}_7newFromHangar.png', timeout=120000)
        print('errors', errs[:8])
        await b.close()

asyncio.run(main())
