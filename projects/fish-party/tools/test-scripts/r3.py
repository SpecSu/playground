# 第 3 回合「产品经理验收」走查脚本（before / after 复用）：开屏 → 3 条鱼（含合影）→ 菜单三 tab；放生后注意力探针
# 剧本：弱抛竿 1 次 + 连续钓 5~6 条（第 4 条模拟走神 0.55~0.75s 才松手，验证断线阈值）+ 点赞 + 图鉴/排行/任务
# 用法：python3 fish_test/r1.py [OUT_DIR] [BASE_URL]
#   OUT_DIR 默认 fish_test/r2/before/ ；BASE 默认 http://127.0.0.1:8765/index.html ；环境变量 QS 覆盖 URL 参数
# 设计要点（软渲染 SwiftShader 只有 ~0.2x 实时）：
#   - 全新存档，从开屏点「开始钓鱼」进入（真实触摸 tap），覆盖签到弹窗 / 新手提示
#   - 剧本跑在页面里（rAF 驱动，按「游戏时间」模拟人的反应 0.35~0.5s），避免 Python 轮询拖慢渲染
#   - 主按钮 / 摇杆：向 #act / #joy 派发 pointerType=touch 的 PointerEvent（走真实的 pointerdown/up 处理）
#   - 菜单 / 点赞 / 合影 / 弹窗 / 放生：Python 用 CDP 真实触摸 tap
#   - setTimeout 改为按游戏时间计时（toast/动态/好友反应的节奏与真机一致）；截图时冻结游戏 rAF，拍到精确瞬间
#   - 全程记录 G.evLog 镜像 + 屏幕文字（toast/hint/feed/飘字/弹窗）+ 我的操作 → OUT/timeline.json
import asyncio, sys, time, os, json
from playwright.async_api import async_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else 'fish_test/r3/before/'
BASE = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8765/index.html'
QS = os.environ.get('QS', '?dtmax=0.1&dpr=0.45&q=low')
NGOOD = int(os.environ.get('NGOOD', '3'))
if not OUT.endswith('/'): OUT += '/'
os.makedirs(OUT, exist_ok=True)

INIT = r"""(() => {
  // 截图冻结：把游戏的 rAF 回调暂存，解冻后再放行
  window.__rafReal = window.requestAnimationFrame.bind(window);
  let pend = [];
  window.requestAnimationFrame = (cb) => { if (window.__freeze) { pend.push(cb); return 0; } return window.__rafReal(cb); };
  window.__unfreeze = () => { window.__freeze = false; const p = pend; pend = []; p.forEach((cb) => window.__rafReal(cb)); };
  // 合成 PointerEvent 没有真实指针，setPointerCapture 会抛 InvalidPointerId —— 测试环境吞掉
  const spc = Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture = function (id) { try { spc.call(this, id); } catch (e) { /* synthetic */ } };
  // setTimeout 按游戏时间（G.time）计：软渲染下 toast / 动态 / 反应延迟与真机节奏一致
  const rs = window.setTimeout.bind(window), rc = window.clearTimeout.bind(window);
  let tid = 1e7; const q = new Map();
  window.setTimeout = (fn, ms = 0, ...args) => {
    if (!window.G || typeof fn !== 'function') return rs(fn, ms, ...args);
    const k = ++tid; q.set(k, { at: G.time + (ms || 0) / 1000, fn, args }); return k;
  };
  window.clearTimeout = (k) => { if (q.has(k)) q.delete(k); else rc(k); };
  const tick = () => {
    if (window.G && !window.__freeze) { const t = G.time; for (const [k, o] of [...q]) if (t >= o.at) { q.delete(k); try { o.fn(...o.args); } catch (e) { rs(() => { throw e; }, 0); } } }
    window.__rafReal(tick);
  };
  window.__rafReal(tick);
})();"""

SEED = r"""(() => {
  // 回流玩家：已过新手教程、玩过几把（只预置教程完成 + 少量历史；图鉴由本次走查自己刷）
  try { if (!localStorage.getItem('friends-fishing-v1')) localStorage.setItem('friends-fishing-v1', JSON.stringify({ tutorial: 99, total: 6, catches: 6, xp: 140, level: 2, bait: 2 })); } catch (e) {}
})();"""

SCENARIO = r"""(async () => {
  const NGOOD = %NGOOD%, MAXR = %MAXR%;
  const $ = (s) => document.querySelector(s);
  const P = () => G.player;
  const T = () => +G.time.toFixed(2);
  const R = window.__rafReal;
  const frame = () => new Promise((r) => R(r));
  const waitG = async (s) => { const t0 = G.time; while (G.time - t0 < s) await frame(); };
  const until = async (pred, capG = 60) => { const t0 = G.time; while (true) { const v = pred(); if (v) return v; if (G.time - t0 > capG) return null; await frame(); } };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const log = (s) => { window.__acts.push([T(), s]); };
  const req = async (o) => { await window.__py(o); };
  const shot = async (name, note = '') => { window.__freeze = true; await req({ type: 'shot', name, note, t: T(), s: P().state, lb: $('#actLb').textContent, hint: $('#hint').classList.contains('off') ? '' : $('#hint').textContent, toast: $('#toast').classList.contains('show') ? $('#toast').innerText : '' }); window.__unfreeze(); };
  const tap = async (sel, what) => { log('tap ' + (what || sel)); await req({ type: 'tap', sel }); };
  const act = $('#act'); const ar = act.getBoundingClientRect(); const AX = ar.left + ar.width / 2, AY = ar.top + ar.height / 2;
  let pid = 100, held = false;
  const pe = (el, type, x, y, id) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y, pressure: type === 'pointerup' ? 0 : 0.5 }));
  const press = () => { if (held) return; pid++; pe(act, 'pointerdown', AX, AY, pid); held = true; };
  const release = () => { if (!held) return; pe(act, 'pointerup', AX, AY, pid); held = false; };
  const tapAct = async () => { press(); await frame(); release(); };
  const evMe = (from) => window.__ev.slice(from).filter((e) => e.split(' ')[1] === 'me');
  const closeModal = async (name) => { for (let i = 0; i < 4 && $('#modal.show'); i++) { if (name) { await shot(name, 'modal: ' + $('#modal').innerText.replace(/\n/g, ' / ')); name = null; } await tap('#modal.show .btn-p', '弹窗按钮'); await waitG(0.4); } };
  // 每帧采样：活跃彩纸数、被隐藏好友、可见但"悬空"的好友鱼线
  const probe = () => {
    const hid = G.anglers.filter((a) => !a.isPlayer && (a.nearHidden || a.char.root.visible === false || (a.fade ?? 1) < 0.5));
    const lineFloat = hid.filter((a) => a.line.line.visible && a.line.line.material.opacity > 0.05 && a.char.root.visible === false).length;
    return { hid: hid.map((a) => a.id), lineFloat };
  };
  let liked = 0;
  const maybeLike = async (tag) => {
    if (liked >= 3 || !$('#feed .fd:not(.out) .like:not(.done)')) return false;
    liked++; if (liked <= 2) await shot(`3${liked}_feed_like.png`, '好友动态（可点赞） ' + tag);
    await tap('#feed .fd:not(.out) .like', '点赞好友动态'); await waitG(0.3);
    if (liked === 1) await shot(`33_feed_liked.png`, '点赞后'); return true;
  };
  const attempts = window.__attempts = [];
  const hud = () => ({ score: $('#scoreN')?.textContent, bait: G.meta.S.bait, lv: G.meta.S.level, codex: Object.keys(G.meta.S.codex).length, combo: G.meta.S.combo });

  await waitG(0.3); await closeModal('02_streak_modal.png');
  await waitG(0.6); await shot('03_first_screen.png', '回流首屏');

  const doCast = async (kind) => {
    log(`蓄力（${kind}）`); press();
    await until(() => P().state === 'charge', 3);
    let prev = -1;
    while (P().state === 'charge') {
      const pw = P().power, rising = pw > prev; prev = pw;
      if (kind === 'weak' && pw > 0.15 && pw < 0.36 && rising) break;
      if (kind === 'perfect' && pw >= 0.765 && pw <= 0.875) break;
      if (kind === 'normal' && pw > 0.55 && pw < 0.7 && rising) break;
      await frame();
    }
    const pw = +P().power.toFixed(3); release(); log(`松手 power=${pw}`); return pw;
  };

  // react：危险时松手的反应时间（真人 0.2~0.35 熟练，0.5~0.7 走神）
  const attempt = async (k, o) => {
    const name = `R${k}`; const rec = { name, ...o, t0: T(), hud0: hud() }; attempts.push(rec);
    const e0 = window.__ev.length;
    rec.power = await doCast(o.cast);
    await until(() => P().state === 'float', 8); const tf = T();
    if (o.cast === 'weak') { await waitG(1.0); await shot(`${k}0_weak_wait.png`, '弱抛竿后 1s（等待中）'); }
    else if (k === 2) { await waitG(1.0); await shot(`${k}0_wait.png`, '等待中'); }
    let out = null, waitShot = false;
    while (true) {
      const s = P().state;
      if (s === 'float') {
        await maybeLike('（等待中）');
        const pb = probe(); if (pb.lineFloat) rec.lineFloat = (rec.lineFloat || 0) + 1;
        if (!waitShot && k === 3 && T() - tf > 2.5) { waitShot = true; await shot(`${k}0_wait_long.png`, '等待 2.5s 时'); }
      } else if (s === 'bite') {
        const tb = T(); const react = rnd(0.32, 0.45);
        while (T() - tb < react && P().state === 'bite') await frame();
        if (P().state !== 'bite') continue;
        log(`扬竿（反应 ${react.toFixed(2)}s）`); await tapAct(); out = 'hooked'; break;
      } else if (s === 'idle') { out = 'idle'; break; }
      await frame();
    }
    rec.waitDur = +(T() - tf).toFixed(2);
    if (out !== 'hooked') { rec.result = out; rec.ev = evMe(e0); rec.dur = +(T() - rec.t0).toFixed(2); return rec; }
    await until(() => ['fight', 'fail', 'land'].includes(P().state), 3);
    const tF = T(); let reactAt = null, holdT = 0, relT = 0, maxStrain = 0, strain = 0, lastT = T(), s1 = false;
    while (['fight', 'hookset'].includes(P().state)) {
      const ten = P().tension, surge = document.body.classList.contains('surge'), danger = o.late ? ten > 0.84 : (surge || ten > 0.84 || act.classList.contains('danger'));
      const dt = T() - lastT; lastT = T();
      if (ten > 0.98) { strain += dt; maxStrain = Math.max(maxStrain, strain); } else strain = 0;
      if (danger && held) { if (reactAt === null) reactAt = T() + rnd(o.react[0], o.react[1]); if (T() >= reactAt) { release(); reactAt = null; } }
      else if (!danger && !held && ten < 0.6) press();
      if (held) holdT++; else relT++;
      if (!s1 && T() - tF > 1) { s1 = true; await shot(`${k}1_fight.png`, '搏鱼中'); }
      await frame();
    }
    release();
    rec.slips = evMe(e0).filter((e) => e.endsWith(' slip')).length; rec.fightDur = +(T() - tF).toFixed(2); rec.holdRatio = +(holdT / Math.max(1, holdT + relT)).toFixed(2); rec.maxStrain = +maxStrain.toFixed(2);
    if (P().state === 'fail') {
      rec.result = evMe(e0).some((e) => e.includes('snap')) ? 'snap' : 'escape';
      await waitG(0.3); await shot(`${k}2_${rec.result}.png`, rec.result === 'snap' ? '断线' : '跑鱼');
      await until(() => P().state === 'idle', 6); rec.ev = evMe(e0); rec.dur = +(T() - rec.t0).toFixed(2); return rec;
    }
    rec.result = 'land';
    if (P().state === 'land') { await waitG(0.25); await shot(`${k}3_landing.png`, '出水'); }
    await until(() => P().state === 'hold', 5); rec.sp = P().v.sp; rec.title = P().v.title; rec.traits = P().v.traits; rec.creator = P().v.creator || P().v.by;
    const th = T();
    await waitG(1.3); await shot(`${k}4_card.png`, '钓获卡 +1.3s');
    const lk = await until(() => $('#feed').classList.contains('atcard') && $('#feed .fd:not(.out)'), 4);
    if (lk) await shot(`${k}5_likes.png`, '好友点赞');
    if (k === 2) {
      await tap('#photoBtn', '合影'); await until(() => $('#polaroid').classList.contains('show'), 8); await waitG(0.5);
      await shot(`${k}5b_photo.png`, '合影'); await tap('#polaroid', '关闭合影'); await waitG(0.5); await shot(`${k}5c_after_photo.png`, '合影关闭后');
    }
    rec.holdShown = +(T() - th).toFixed(2);
    await tap('#act', '放生'); await until(() => P().state === 'idle', 5);
    const tr = T(); let lastToast = '', n = 0; rec.rewards = []; rec.attnMax = 0; rec.attnMulti = 0; rec.attnFirst = null; let s03 = false, s20 = false;
    const attn = () => { const L = []; if ($('#toast').classList.contains('show')) L.push('toast'); if (document.querySelector('#tags .tag.show')) L.push('bubble'); if ($('#feed .fd:not(.out)')) L.push('feed'); if ($('#modal.show')) L.push('modal'); return L; };
    while (T() - tr < 4) {
      const A = attn(); rec.attnMax = Math.max(rec.attnMax, A.length); if (A.length > 1) rec.attnMulti++; if (A.length && rec.attnFirst === null) rec.attnFirst = +(T() - tr).toFixed(2);
      if (!s03 && T() - tr > 0.35) { s03 = true; await shot(`${k}6a_release_0.35s.png`, '放生后 0.35s 注意力=' + A.join('+')); }
      if (!s20 && T() - tr > 2.0) { s20 = true; await shot(`${k}7b_release_2s.png`, '放生后 2s 注意力=' + A.join('+')); }
      if ($('#modal.show')) { await waitG(0.25); await closeModal(`${k}6_modal.png`); continue; }
      const tt = $('#toast').classList.contains('show') ? $('#toast').innerText.replace(/\n/g, ' ') : '';
      if (tt && tt !== lastToast) { lastToast = tt; rec.rewards.push([+(T() - tr).toFixed(2), tt]); if (n++ < 1) await shot(`${k}6_reward.png`, '奖励：' + tt); }
      if (T() - tr > 1.2 && !rec.readyShot) { rec.readyShot = 1; await shot(`${k}7_next_ready.png`, '放生后 1.2s 注意力=' + attn().join('+')); }
      await frame();
    }
    rec.hud1 = hud(); rec.ev = evMe(e0); rec.dur = +(T() - rec.t0).toFixed(2);
    return rec;
  };

  const plans = [
    { cast: 'perfect', react: [0.22, 0.32] },
    { cast: 'normal', react: [0.25, 0.35] },
    { cast: 'perfect', react: [0.28, 0.38] },
    { cast: 'normal', react: [0.25, 0.35] },
    { cast: 'perfect', react: [0.25, 0.35] },
  ];
  const pick = '%PLANS%'; if (pick) { const ix = pick.split(',').map(Number); const sel = ix.map((i) => plans[i]); plans.length = 0; plans.push(...sel); }
  let k = 0;
  const good = () => attempts.filter((a) => a.result === 'land').length;
  while (k < Math.min(MAXR, plans.length) && good() < NGOOD) { await attempt(k + 1, plans[k]); k++; await closeModal(); }
  const ts = T();
  while (T() - ts < 8 && liked < 1) { if (await maybeLike('（空闲）')) break; await frame(); }
  await closeModal();
  await tap('#menuBtn', '菜单'); await waitG(0.6); await shot('80_menu.png', '菜单默认页');
  await tap('#shTabs [data-tab="codex"]', '图鉴'); await until(() => [...document.querySelectorAll('.cx img')].every((i) => i.classList.contains('ok')), 20); await waitG(0.5);
  await shot('81_codex.png', '图鉴');
  if ($('.cx')) { await tap('.cx', '图鉴第一张'); await until(() => $('.cx-detail img.ok') || !$('.cx-detail img'), 20); await waitG(0.4); await shot('82_codex_detail.png', '图鉴详情'); }
  await tap('#shTabs [data-tab="rank"]', '好友排行'); await waitG(0.5); await shot('83_rank.png', '排行');
  await tap('#shTabs [data-tab="tasks"]', '任务'); await waitG(0.5); await shot('84_tasks.png', '任务');
  await tap('#shX', '关闭菜单'); await waitG(0.6); await closeModal();
  await shot('90_end.png', '结束');
  window.__py({ type: 'done' });
})().catch((e) => { window.__py({ type: 'error', msg: String(e && e.stack || e) }); });"""

HOOK = r"""(() => {
  window.__ev = []; window.__ui = []; window.__acts = [];
  const L = G.evLog, push0 = L.push.bind(L);
  L.push = (...a) => { for (const x of a) window.__ev.push(x); return push0(...a); };
  const T = () => +G.time.toFixed(2);
  const watch = (id, kind) => {
    const el = document.getElementById(id); let last = '';
    new MutationObserver(() => {
      let t = '';
      if (kind === 'toast' || kind === 'modal') t = el.classList.contains('show') ? el.innerText.replace(/\n/g, ' / ') : '';
      else if (kind === 'hint') t = el.classList.contains('off') ? '' : el.textContent;
      else if (kind === 'feed') { const f = el.querySelector('.fd:not(.out)'); t = f ? f.innerText.replace(/\n/g, ' ') : ''; }
      else if (kind === 'float') { const f = el.lastElementChild; t = f ? f.textContent : ''; }
      if (t && t !== last) window.__ui.push([T(), kind, t]);
      last = t;
    }).observe(el, { subtree: true, childList: true, attributes: true, characterData: true });
  };
  ['toast', 'hint', 'feed', 'float', 'modal'].forEach((k) => watch(k, k));
})()"""


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, has_touch=True, is_mobile=True)
        await ctx.add_init_script(INIT)
        await ctx.add_init_script(SEED)
        pg = await ctx.new_page()
        cdp = await ctx.new_cdp_session(pg)
        logs = []
        def con(m):
            if m.type == 'error' or (m.type == 'warning' and all(k not in m.text for k in ('AudioContext', 'GL Driver', 'GPU stall', 'WebGL', 'Automatic fallback'))):
                logs.append(f'[{m.type}] {m.text}')
        pg.on('console', con)
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        pg.on('response', lambda r: logs.append(f'[{r.status}] {r.url}') if r.status >= 400 else None)
        pg.on('requestfailed', lambda r: logs.append(f'[reqfail] {r.url} {r.failure}') if 'fonts.g' not in r.url else None)
        pg.set_default_timeout(120000)
        t0 = time.time(); shots = []
        done_evt = asyncio.Event()
        async def py(source, rq):
            if rq['type'] == 'shot':
                await pg.screenshot(path=OUT + rq['name'])
                shots.append({'file': rq['name'], 't': rq.get('t'), 's': rq.get('s'), 'note': rq.get('note'), 'lb': rq.get('lb'), 'hint': rq.get('hint'), 'toast': rq.get('toast')})
                print(f"  [shot] {rq['name']} t={rq.get('t')} s={rq.get('s')} {rq.get('note')} | hint={rq.get('hint')} toast={(rq.get('toast') or '').replace(chr(10), ' ')}", flush=True)
            elif rq['type'] == 'tap':
                await real_tap(rq['sel'])
            elif rq['type'] == 'error':
                print('SCENARIO ERROR', rq['msg'], flush=True); done_evt.set()
            else:
                done_evt.set()
            return 1
        await ctx.expose_binding('__py', py)

        async def real_tap(sel):
            r = await pg.evaluate('(s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }', sel)
            if not r: print('  !! tap target missing', sel, flush=True); return
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': r[0], 'y': r[1], 'id': 7}]})
            await pg.wait_for_timeout(60)
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})

        await pg.goto(BASE + QS)
        await pg.wait_for_selector('#splash', timeout=60000)
        await pg.wait_for_timeout(1200)
        await pg.screenshot(path=OUT + '00_splash_loading.png'); shots.append({'file': '00_splash_loading.png', 'note': '开屏加载中'})
        await pg.wait_for_selector('#start.ready', timeout=240000)
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=OUT + '01_splash_ready.png'); shots.append({'file': '01_splash_ready.png', 'note': '开屏就绪'})
        print('splash ready', round(time.time() - t0, 1), flush=True)
        await real_tap('#start')
        await pg.wait_for_function('window.G && window.G.player && !document.getElementById("splash")', timeout=60000, polling=300)
        await pg.evaluate(HOOK)
        await pg.evaluate("window.__acts.push([+G.time.toFixed(2), 'tap 开始钓鱼'])")
        await pg.evaluate('(() => { ' + SCENARIO.replace('%NGOOD%', str(NGOOD)).replace('%MAXR%', os.environ.get('MAXR', '6')).replace('%PLANS%', os.environ.get('PLANS', '')) + ' return 0; })()')
        await done_evt.wait()
        data = await pg.evaluate('({ev: window.__ev, ui: window.__ui, acts: window.__acts, attempts: window.__attempts, game: G.time, meta: {catches: G.meta.S.catches, level: G.meta.S.level, score: G.meta.S.today.score, bait: G.meta.S.bait}})')
        data['shots'] = shots; data['logs'] = logs; data['wall'] = round(time.time() - t0, 1)
        json.dump(data, open(OUT + 'timeline.json', 'w'), ensure_ascii=False, indent=1)
        print('ELAPSED', data['wall'], 'GAME', round(data['game'], 1))
        for a in data['attempts'] or []:
            print('  %-4s %-6s power=%s wait=%ss fight=%ss hold=%s strain=%s slips=%s sp=%s dur=%s attnMax=%s multi=%s first=%s rewards=%s' % (a['name'], a.get('result'), a.get('power'), a.get('waitDur'), a.get('fightDur'), a.get('holdRatio'), a.get('maxStrain'), a.get('slips'), a.get('sp'), a.get('dur'), a.get('attnMax'), a.get('attnMulti'), a.get('attnFirst'), a.get('rewards')))
        print('---- logs ----')
        for l in logs: print(l)
        print('LOGS', len(logs))
        await b.close()

asyncio.run(main())
