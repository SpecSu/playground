# 第 1 回合「新玩家视角」完整走查脚本（可复用：before / after）
# 用法：python3 fish_test/r1.py [OUT_DIR] [BASE_URL]
#   OUT_DIR 默认 fish_test/r1/before/ ；BASE 默认 http://127.0.0.1:8765/index.html ；环境变量 QS 覆盖 URL 参数
# 设计要点（软渲染 SwiftShader 只有 ~0.2x 实时）：
#   - 全新存档，从开屏点「开始钓鱼」进入（真实触摸 tap），覆盖签到弹窗 / 新手提示
#   - 剧本跑在页面里（rAF 驱动，按「游戏时间」模拟人的反应 0.35~0.5s），避免 Python 轮询拖慢渲染
#   - 主按钮 / 摇杆：向 #act / #joy 派发 pointerType=touch 的 PointerEvent（走真实的 pointerdown/up 处理）
#   - 菜单 / 点赞 / 合影 / 弹窗 / 放生：Python 用 CDP 真实触摸 tap
#   - setTimeout 改为按游戏时间计时（toast/动态/好友反应的节奏与真机一致）；截图时冻结游戏 rAF，拍到精确瞬间
#   - 全程记录 G.evLog 镜像 + 屏幕文字（toast/hint/feed/飘字/弹窗）+ 我的操作 → OUT/timeline.json
import asyncio, sys, time, os, json
from playwright.async_api import async_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else 'fish_test/r1/before/'
BASE = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8765/index.html'
QS = os.environ.get('QS', '?dtmax=0.1&dpr=0.6&q=low')
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

SCENARIO = r"""(async () => {
  const NGOOD = %NGOOD%;
  const $ = (s) => document.querySelector(s);
  const P = () => G.player;
  const T = () => +G.time.toFixed(2);
  const R = window.__rafReal;
  const frame = () => new Promise((r) => R(r));
  const waitG = async (s) => { const t0 = G.time; while (G.time - t0 < s) await frame(); };
  const until = async (pred, capG = 60) => { const t0 = G.time; while (true) { const v = pred(); if (v) return v; if (G.time - t0 > capG) return null; await frame(); } };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const log = (s) => { window.__acts.push([T(), s]); };
  // ---- 向 Python 请求：截图（冻结）/ 真实触摸 tap ----
  const req = async (o) => { await window.__py(o); };
  const shot = async (name, note = '') => { window.__freeze = true; await req({ type: 'shot', name, note, t: T(), s: P().state, lb: $('#actLb').textContent, hint: $('#hint').classList.contains('off') ? '' : $('#hint').textContent, toast: $('#toast').classList.contains('show') ? $('#toast').innerText : '' }); window.__unfreeze(); };
  const tap = async (sel, what) => { log('tap ' + (what || sel)); await req({ type: 'tap', sel }); };
  // ---- 主按钮 / 摇杆：touch PointerEvent ----
  const act = $('#act'); const ar = act.getBoundingClientRect(); const AX = ar.left + ar.width / 2, AY = ar.top + ar.height / 2;
  let pid = 100, held = false;
  const pe = (el, type, x, y, id) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y, pressure: type === 'pointerup' ? 0 : 0.5 }));
  const press = () => { if (held) return; pid++; pe(act, 'pointerdown', AX, AY, pid); held = true; };
  const release = () => { if (!held) return; pe(act, 'pointerup', AX, AY, pid); held = false; };
  const tapAct = async () => { press(); await frame(); release(); };
  const evMe = (from) => window.__ev.slice(from).filter((e) => e.split(' ')[1] === 'me');
  const ui = () => ({ s: P().state, ten: P().tension, surge: document.body.classList.contains('surge'), danger: act.classList.contains('danger') });
  const closeModal = async (name) => { for (let i = 0; i < 4 && $('#modal.show'); i++) { if (name) { await shot(name, 'modal: ' + $('#modal').innerText.replace(/\n/g, ' / ')); name = null; } await tap('#modal.show .btn-p', '弹窗按钮'); await waitG(0.4); } };
  let liked = 0;
  const maybeLike = async (tag) => {
    if (liked >= 2 || !$('#feed .fd:not(.out) .like:not(.done)')) return false;
    liked++; await shot(`31_feed_like_${liked}.png`, '好友动态（可点赞） ' + tag);
    await tap('#feed .fd:not(.out) .like', '点赞好友动态'); await waitG(0.3);
    await shot(`32_feed_liked_${liked}.png`, '点赞后'); return true;
  };
  const attempts = window.__attempts = [];

  // ================= 进入 =================
  await waitG(0.3); await shot('02_enter.png', '刚进入');
  await waitG(0.8); await closeModal('03_streak_modal.png');
  await waitG(0.5); await shot('04_first_screen.png', '首屏（新手提示）');
  await waitG(2.5); await shot('05_look_around.png', '观望 3 秒');

  const doCast = async (kind, shotsOn) => {
    log(`按住主按钮蓄力（${kind}）`); press();
    await until(() => P().state === 'charge', 3);
    let prev = -1, peak = false, shotDone = false;
    while (P().state === 'charge') {
      const pw = P().power, rising = pw > prev; prev = pw;
      if (shotsOn && !shotDone && pw > 0.45 && rising) { shotDone = true; await shot(shotsOn, '蓄力中'); }
      if (kind === 'weak' && pw > 0.12 && pw < 0.38 && rising) break;
      if (kind === 'perfect' && pw >= 0.765 && pw <= 0.875) break;
      if (kind === 'normal' && pw > 0.5 && pw < 0.68 && rising) break;
      await frame();
    }
    const pw = +P().power.toFixed(3); release(); log(`松手 power=${pw}`); return pw;
  };

  const attempt = async (name, o) => {
    const rec = { name, ...o, t0: T() }; attempts.push(rec);
    const e0 = window.__ev.length;
    rec.power = await doCast(o.cast, o.shots === 'weak' ? '10_charge_first.png' : o.shots === 'perfect' ? '11_charge.png' : null);
    if (o.shots === 'weak') { await waitG(0.5); await shot('06_weak_cast.png', '弱抛竿：落点'); }
    if (o.shots === 'perfect') { await waitG(0.3); await shot('12_perfect_cast.png', '完美抛竿反馈'); }
    await until(() => P().state === 'float', 8);
    if (o.shots === 'weak') { await waitG(0.8); await shot('07_wait_float.png', '等待浮漂（第一次）'); }
    // ---------- 等待 / 咬钩 ----------
    let missed = false, bites = 0, out = null, nibShot = false, waitShot = false;
    const tf = T();
    while (true) {
      const s = P().state;
      if (s === 'float') {
        await maybeLike('（等待中）');
        if (o.shots === 'weak' && !waitShot && T() - tf > 2.6 && !evMe(e0).some((e) => e.includes('nibble'))) { waitShot = true; await shot('07b_wait_long.png', '等待中…'); }
        if (o.bite === 'early' && evMe(e0).some((e) => e.includes('nibble'))) {
          await waitG(0.12);
          if (!nibShot) { nibShot = true; await shot('08_nibble.png', '浮漂轻点（试探）'); }
          log('浮漂一动就扬竿（过早）'); await tapAct();
          await waitG(0.35); await shot('09_early.png', '过早扬竿反馈');
          out = 'early'; break;
        }
      } else if (s === 'bite') {
        bites++; const tb = T();
        if (bites === 1 && o.shots === 'perfect') { await waitG(0.1); await shot('13_bite.png', '咬钩！'); }
        if (bites === 1 && o.shots === 'good1') { await waitG(0.1); await shot('41_bite.png', '咬钩！'); }
        if (o.bite === 'miss_then_hook' && !missed) {
          log('咬钩了但没反应过来（不按）');
          await until(() => P().state !== 'bite', 3); missed = true;
          await waitG(0.15); await shot('14_missed.png', '错过咬钩反馈'); continue;
        }
        const react = rnd(0.35, 0.5);
        while (T() - tb < react && P().state === 'bite') await frame();
        if (P().state !== 'bite') continue;
        log(`扬竿（反应 ${react.toFixed(2)}s）`);
        if (o.fight === 'hold') press(); else await tapAct();
        out = 'hooked'; break;
      } else if (s === 'idle') { out = 'idle'; break; }
      await frame();
    }
    rec.wait = out; rec.waitDur = +(T() - tf).toFixed(2);
    if (out !== 'hooked') { await until(() => P().state === 'idle', 6); release(); rec.result = out; rec.ev = evMe(e0); rec.dur = +(T() - rec.t0).toFixed(2); return rec; }
    // ---------- 搏鱼 ----------
    await until(() => ['fight', 'fail', 'land'].includes(P().state), 3);
    const tF = T(); let n = 0, reactAt = null, s1 = false, s2 = false, s3 = false, s4 = false, holdT = 0, relT = 0;
    while (['fight', 'hookset'].includes(P().state)) {
      n++; const u = ui();
      if (o.fight === 'hold') press();
      else if (o.fight === 'none') release();
      else {
        const danger = u.surge || u.ten > 0.84 || u.danger;
        if (danger && held) { if (reactAt === null) reactAt = T() + rnd(0.2, 0.3); if (T() >= reactAt) { release(); reactAt = null; } }
        else if (!danger && !held && u.ten < 0.6) press();
      }
      if (held) holdT += 1; else relT += 1;
      const pre = o.shots === 'hold' || o.shots === 'perfect' ? '15' : o.shots === 'good1' ? '42' : null;
      if (pre && !s1 && T() - tF > 0.6) { s1 = true; await shot(`${pre}_fight_start.png`, '搏鱼开始'); }
      if (pre && !s2 && (u.danger || u.surge)) { s2 = true; await shot(`${pre === '15' ? '16' : '43'}_fight_danger.png`, `危险：张力 ${u.ten.toFixed(2)} surge=${u.surge}`); }
      if (pre === '42' && !s3 && P().jump) { s3 = true; await shot('44_fight_jump.png', '鱼跃出水面'); }
      if (o.shots === 'none' && !s1 && T() - tF > 1.2) { s1 = true; await shot('19_fight_noreel.png', '不收线'); }
      if (o.shots === 'none' && !s4 && P().dist > P().startDist + 5) { s4 = true; await shot('20_fish_running.png', '鱼越游越远'); }
      await frame();
    }
    release();
    rec.fightDur = +(T() - tF).toFixed(2); rec.holdRatio = +(holdT / Math.max(1, holdT + relT)).toFixed(2);
    rec.result = P().state; rec.sp = P().v?.sp || null;
    if (P().state === 'fail') {
      const kind = evMe(e0).some((e) => e.includes('snap')) ? 'snap' : 'escape'; rec.result = kind;
      await waitG(0.3); await shot(kind === 'snap' ? '17_snap.png' : '21_escape.png', kind === 'snap' ? '断线反馈' : '跑鱼反馈');
      await until(() => P().state === 'idle', 5); await waitG(1.2);
      await shot(kind === 'snap' ? '18_after_snap.png' : '22_after_escape.png', '失败后 1.2s');
    } else {
      const good = attempts.filter((a) => a.result === 'land' || a.result === 'hold').length;
      const pre = 'good' + good;
      rec.result = 'land';
      if (P().state === 'land') { await waitG(0.25); await shot(`50_${pre}_landing.png`, '出水慢动作'); }
      await until(() => P().state === 'hold', 5); rec.sp = P().v.sp; rec.title = P().v.title;
      await waitG(0.15); await shot(`51_${pre}_caught.png`, '上鱼瞬间');
      await waitG(1.2); await shot(`52_${pre}_caught_1s.png`, '上鱼 +1.2s');
      const tl = T(); rec.likeAt = null;
      const lk = await until(() => $('#feed').classList.contains('atcard') && $('#feed .fd:not(.out)'), 5);
      if (lk) { rec.likeAt = +(T() - tl + 1.35).toFixed(2); await shot(`53_${pre}_likes.png`, '好友点赞'); }
      if (good === 1) {
        await tap('#cMore', '详情'); await waitG(0.6); await shot('54_good1_detail.png', '详情展开');
        await tap('#cMore', '收起详情'); await waitG(0.4);
        log('摇杆：左下按住拖动走路');
        const joy = $('#joy'); const jx = 100, jy = 700; pid++; const jp = pid;
        pe(joy, 'pointerdown', jx, jy, jp);
        for (let k = 1; k <= 6; k++) { pe(joy, 'pointermove', jx + k * 3, jy - k * 8, jp); await frame(); }
        await waitG(1.0); await shot('55_good1_walk.png', '抱鱼走动');
        for (let k = 1; k <= 6; k++) { pe(joy, 'pointermove', jx + 18 + k * 5, jy - 48 + k * 4, jp); await frame(); }
        await waitG(1.0); pe(joy, 'pointerup', jx, jy, jp);
        await waitG(1.4); await shot('56_good1_after_walk.png', '停下');
        await tap('#photoBtn', '合影'); await until(() => $('#polaroid.show'), 4); await waitG(0.3);
        await shot('57_good1_photo.png', '合影拍立得');
        await tap('#polaroid', '关闭照片'); await waitG(0.5);
      } else await waitG(1.2);
      await shot(`58_${pre}_before_release.png`, '放生前');
      await tap('#act', '放生（真实触摸）'); await waitG(0.4); await shot(`59_${pre}_release.png`, '放生中');
      await until(() => P().state === 'idle', 5);
      const tr = T(); let k = 0, lastToast = '';
      while (T() - tr < 5) {
        if ($('#modal.show')) { await waitG(0.25); await closeModal(`60_${pre}_modal.png`); continue; }
        const tt = $('#toast').classList.contains('show') ? $('#toast').innerText : '';
        if (tt && tt !== lastToast && k < 3) { lastToast = tt; k++; await shot(`60_${pre}_reward_${k}.png`, '奖励提示：' + tt.replace(/\n/g, ' ')); }
        await frame();
      }
      rec.idleAfterRelease = +(T() - tr).toFixed(2);
      await shot(`61_${pre}_next.png`, '准备下一轮');
    }
    rec.ev = evMe(e0); rec.dur = +(T() - rec.t0).toFixed(2);
    return rec;
  };

  await attempt('A1 弱抛竿 + 浮漂一动就扬竿', { cast: 'weak', bite: 'early', fight: 'smart', shots: 'weak' });
  await closeModal();
  let r = await attempt('A2 完美抛竿 + 错过咬钩 + 扬竿后一直按住', { cast: 'perfect', bite: 'miss_then_hook', fight: 'hold', shots: 'perfect' });
  await closeModal();
  if (r.result === 'land') { r = await attempt('A2b 再试一直按住', { cast: 'normal', bite: 'hook', fight: 'hold', shots: 'hold' }); await closeModal(); }
  await attempt('A3 扬竿后不收线（跑鱼）', { cast: 'normal', bite: 'hook', fight: 'none', shots: 'none' });
  await closeModal();
  let k = 0;
  const goodN = () => attempts.filter((a) => a.result === 'land').length;
  while (goodN() < NGOOD && k < NGOOD + 4) { k++; await attempt(`G${k} 正常钓`, { cast: k % 2 ? 'perfect' : 'normal', bite: 'hook', fight: 'smart', shots: goodN() === 0 ? 'good1' : null }); await closeModal(); }
  // ---------- 社交：等一条好友动态并点赞 ----------
  const ts = T();
  while (T() - ts < 30 && liked < 1) { if (await maybeLike('（空闲）')) break; await frame(); }
  await shot('70_idle_social.png', '空闲时的画面');
  // ---------- 菜单 ----------
  await closeModal('79_modal_before_menu.png');
  await tap('#menuBtn', '菜单'); await waitG(0.6); await shot('80_menu_default.png', '菜单默认页');
  await tap('#shTabs [data-tab="codex"]', '图鉴'); await until(() => [...document.querySelectorAll('.cx img')].every((i) => i.classList.contains('ok')), 20); await waitG(0.5);
  await shot('81_codex.png', '图鉴');
  if ($('.cx')) { await tap('.cx', '图鉴第一张'); await until(() => $('.cx-detail img.ok') || !$('.cx-detail img'), 20); await waitG(0.4); await shot('82_codex_detail.png', '图鉴详情'); }
  await tap('#shTabs [data-tab="rank"]', '好友排行'); await waitG(0.5); await shot('83_rank.png', '排行');
  await tap('#shTabs [data-tab="tasks"]', '任务'); await waitG(0.5); await shot('84_tasks.png', '任务');
  for (let i = 0; i < 3 && $('#shBody button.go'); i++) { await tap('#shBody button.go', '领取任务'); await waitG(0.6); }
  await shot('85_tasks_claimed.png', '领取后');
  await tap('#shX', '关闭菜单'); await waitG(0.6);
  await closeModal('86_modal_end.png');
  await shot('87_end.png', '结束');
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
        await pg.evaluate('(() => { ' + SCENARIO.replace('%NGOOD%', str(NGOOD)) + ' return 0; })()')
        await done_evt.wait()
        data = await pg.evaluate('({ev: window.__ev, ui: window.__ui, acts: window.__acts, attempts: window.__attempts, game: G.time, meta: {catches: G.meta.S.catches, level: G.meta.S.level, score: G.meta.S.today.score, bait: G.meta.S.bait}})')
        data['shots'] = shots; data['logs'] = logs; data['wall'] = round(time.time() - t0, 1)
        json.dump(data, open(OUT + 'timeline.json', 'w'), ensure_ascii=False, indent=1)
        print('ELAPSED', data['wall'], 'GAME', round(data['game'], 1))
        for a in data['attempts'] or []:
            print('  %-28s → %-7s power=%s wait=%s(%ss) fight=%ss hold=%s sp=%s dur=%s' % (a['name'], a.get('result'), a.get('power'), a.get('wait'), a.get('waitDur'), a.get('fightDur'), a.get('holdRatio'), a.get('sp'), a.get('dur')))
        print('---- logs ----')
        for l in logs: print(l)
        print('LOGS', len(logs))
        await b.close()

asyncio.run(main())
