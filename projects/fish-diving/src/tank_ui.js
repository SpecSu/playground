// 水族箱页面 DOM 与流程（DESIGN §2.1–2.4）：顶栏 / 鱼卡 / 卵卡 / 基因改造面板 / 孵化揭晓卡 / 腾位置面板
// 每一步只有一个最明显的大按钮 + 动词文案；样式见 index.html「水族箱 v2」段（深色玻璃社交主页风）
// v2：顶部 = 当前水族箱主人信息卡（owner 可替换：{ id, name, avatar, color, level, title, stats, readonly }）；可去好友水族箱串门（只读）
import { SPECIES_BY_ID, RARITY, displayName } from './fishes.js';
import { TANK_MAX, EGG_DUR, ROOM, levelTitle, ME_TAG, FRIENDS } from './meta.js';
import { fillThumbs, fmtLenTxt, avatars, bagView, bindBag } from './ui.js';
import { sfx } from './sfx.js';
import { ic } from './icons.js';
import { THEMES, THEME_IDS, DEFAULT_THEME, themeLabel, themeForFriend } from './aqua_themes.js';
import { ITEM_BY_ID, ITEM_RARITY } from './items.js';
import { GENE_LAB_CSS } from './tank_lab_css.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const RAR_X = { mythic: { label: '神话', short: 'MR', color: '#c79a5b' } };   // v0.9 合成鱼可能出现 mythic（RARITY 表未定义时兜底）
const rarOf = (v) => (v.rarity && (RARITY[v.rarity] || RAR_X[v.rarity]) ? v.rarity : SPECIES_BY_ID[v.sp]?.rarity || 'common');
const rarInfo = (v) => RARITY[rarOf(v)] || RAR_X[rarOf(v)] || RARITY.common;
const rb = (v) => { const R = rarInfo(v); return `<span class="rb" style="background:${R.color}">${R.short}</span>`; };
const isSyn = (v) => !!v && (v.sp === 'synth' || !!v.syn);
const fmtSec = (s) => { s = Math.ceil(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const ORIGIN = (v) => {
  if (v.stolenFrom) return `从 @${v.stolenFrom.name} 家带回`;
  if (v.giftFrom && v.giftFrom.id !== 'me') return `@${v.giftFrom.name} 送的`;
  if (v.fromOcean) return `来自 ${v.fromOcean.by} 的水族箱`;
  const h = v.history?.[v.history.length - 1];
  if (!h || h.type === 'catch') return v.gen ? '基因改造' : '钓到的';
  return '基因改造';
};
const vib = (p) => { try { navigator.vibrate?.(p); } catch (e) { /* */ } };
// 新手引导一次性标记（localStorage）
const TUT_KEY = 'ff-tut-v1';
export const tut = {
  _d: (() => { try { return JSON.parse(localStorage.getItem(TUT_KEY) || '{}'); } catch (e) { return {}; } })(),
  get(k) { return !!this._d[k]; },
  set(k) { this._d[k] = 1; try { localStorage.setItem(TUT_KEY, JSON.stringify(this._d)); } catch (e) { /* */ } },
};
const h = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; };
function hashStr(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
// 卵图标：黄色呼吸光球（与 3D 卵一致）
export const EGG_ORB = '<i class="egg-orb" aria-hidden="true"></i>';
const BELL_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg>';
// 主人信息卡 HTML（owner 对象可替换 → 自己 / 好友）
export function ownerCardHTML(o) {
  const av = o.avatar ? `background-image:url(${o.avatar})` : `background:${o.color || '#7aa'}`;
  return `<div class="ow-av" style="${av}">${o.avatar ? '' : esc((o.name || '?')[0])}</div>
    <div class="ow-m"><div class="ow-nm"><b>${esc(o.name)}</b><span class="ow-lv">Lv.${o.level}</span></div>
      <div class="ow-tt">${o.theme ? `<button class="ow-th${o.readonly ? ' ro' : ''}" id="tkTheme" aria-label="水族馆主题">${esc(themeLabel(o.theme))}${o.readonly ? '' : '<i>▾</i>'}</button>` : ''}${esc(o.title)}${o.pts != null ? ` · <span class="num">${o.pts}</span> 分` : ''}</div></div>
    <div class="ow-st">${(o.stats || []).slice(0, 4).map((x) => `<div><b class="num">${esc(x.v)}${x.egg ? '<i class="egg-orb ow-egg" title="有卵孵好了"></i>' : ''}</b><span>${esc(x.k)}</span></div>`).join('')}</div>`;
}

// ---------------- 进水族箱过场（v6）：与开屏同一视觉语言 —— 珍珠白留白 · 细线圆形鱼缸 · 水位随进度上涨 · 一条条纹小鱼来回游 ----------------
// DOM / CSS 动态注入（不改 index.html）；动画只用 transform / opacity（合成线程），主线程建场景 / 编译 shader 时依旧顺滑；无 blur
const TL_CSS = `
#tankLoading{--tl-bg:#fbf8f3;--tl-pink:#ec8fa3;--tl-pink2:#f4a7b6;--tl-ink:#8f847b;--tl-ink2:#b3a89e;--tl-line:#e9e0d5;--tl-ease:cubic-bezier(.22,.7,.2,1);
  position:absolute;inset:0;z-index:46;overflow:hidden;pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:var(--tl-bg);color:var(--tl-ink);font-family:var(--font,system-ui);opacity:0;transition:opacity .2s var(--tl-ease);will-change:opacity}
#tankLoading::before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(130% 85% at 50% 44%,rgba(255,255,255,.75) 0%,rgba(255,255,255,0) 60%,rgba(236,224,210,.22) 100%)}
#tankLoading.on{opacity:1}
#tankLoading.out{opacity:0;transition:opacity .5s var(--tl-ease);pointer-events:none}
#tankLoading.out .tl-mid{transform:translateY(-10px) scale(1.04);transition:transform .55s var(--tl-ease)}
#tankLoading.lite{background:rgba(251,248,243,.94);transition-duration:.16s}
#tankLoading.lite>*,#tankLoading.lite::before{display:none!important}
#tankLoading.hidden{display:none}
#tankLoading .tl-mid{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;margin-top:-5vh;transition:transform .3s var(--tl-ease)}
#tankLoading .tl-bowl{position:relative;width:112px;height:112px;animation:tlIn .7s var(--tl-ease) both}
@keyframes tlIn{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:none}}
#tankLoading .tl-ring{position:absolute;inset:0;border-radius:50%;border:1px solid var(--tl-pink);opacity:0;animation:tlRing 3.2s var(--tl-ease) .4s infinite}
#tankLoading .tl-ring.b{animation-delay:2s}
@keyframes tlRing{0%{opacity:.45;transform:scale(1)}80%,100%{opacity:0;transform:scale(1.55)}}
#tankLoading .tl-glass{position:absolute;inset:0;border-radius:50%;overflow:hidden;background:#fffdfa;box-shadow:inset 0 0 0 1px var(--tl-line);-webkit-mask-image:-webkit-radial-gradient(white,black)}
#tankLoading .tl-water{position:absolute;left:0;right:0;top:0;height:100%;transform:translateY(52%);transition:transform .9s var(--tl-ease);will-change:transform}
#tankLoading .tl-wave{position:absolute;left:0;top:-5.5px;width:200%;height:6px;display:block;animation:tlWave 3.6s linear infinite}
#tankLoading .tl-wave.b{top:-7.5px;height:8px;animation-duration:5.4s;animation-direction:reverse}
@keyframes tlWave{to{transform:translateX(-50%)}}
#tankLoading .tl-fill{position:absolute;inset:0;background:linear-gradient(180deg,#f8dfe4 0%,#efe3ea 45%,#e4e6ef 100%)}
#tankLoading .tl-swim{position:absolute;left:50%;top:63%;width:34px;margin-left:-17px;animation:tlFish 7s ease-in-out infinite}
#tankLoading .tl-swim svg{display:block;width:100%;height:auto;overflow:visible;animation:tlBob 2.2s ease-in-out infinite alternate}
#tankLoading .tl-swim .tail{transform-box:view-box;transform-origin:38px 16px;animation:tlTail .8s ease-in-out infinite alternate}
@keyframes tlFish{0%{transform:translateX(-24px) scaleX(-1)}45%{transform:translateX(24px) scaleX(-1)}50%{transform:translateX(24px) scaleX(1)}95%{transform:translateX(-24px) scaleX(1)}100%{transform:translateX(-24px) scaleX(-1)}}
@keyframes tlBob{from{transform:translateY(-2.5px) rotate(-3deg)}to{transform:translateY(2.5px) rotate(3deg)}}
@keyframes tlTail{from{transform:rotate(-12deg)}to{transform:rotate(12deg)}}
#tankLoading .tl-bub{position:absolute;bottom:14%;width:4px;height:4px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(255,255,255,.95);opacity:0;animation:tlBub 3.4s ease-in infinite}
@keyframes tlBub{0%{opacity:0;transform:translateY(0)}20%{opacity:1}100%{opacity:0;transform:translateY(-46px)}}
#tankLoading .tl-t{margin-top:30px;font-size:15px;line-height:1;font-weight:400;letter-spacing:.3em;padding-left:.3em;color:var(--tl-ink);white-space:nowrap;animation:tlUp .8s var(--tl-ease) .12s both}
#tankLoading .tl-s{margin-top:12px;height:14px;font-size:11px;line-height:14px;font-weight:400;letter-spacing:.18em;padding-left:.18em;color:var(--tl-ink2);white-space:nowrap;animation:tlUp .8s var(--tl-ease) .22s both}
@keyframes tlUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
#tankLoading .tl-tip{position:absolute;z-index:2;left:28px;right:28px;bottom:calc(9% + var(--sb,0px));text-align:center;font-size:11px;line-height:1.6;font-weight:400;letter-spacing:.12em;color:#c2b7ac;transition:opacity .4s var(--tl-ease)}
#tankLoading .tl-brand{position:absolute;z-index:2;left:0;right:0;top:calc(9% + var(--st,0px));text-align:center;font:400 28px/1.2 'FP Script','Snell Roundhand','Brush Script MT',cursive;color:var(--tl-pink);opacity:.75}
@media (max-height:540px){#tankLoading .tl-brand{display:none}#tankLoading .tl-tip{bottom:calc(6% + var(--sb,0px))}}
@media (prefers-reduced-motion:reduce){#tankLoading *{animation-duration:0s!important}}
`;
// 与开屏同款的极简条纹小鱼（viewBox 48×32，鱼头朝左）
const tlFishSVG = (c1 = '#efb4c0', c2 = '#fbe6ea') => `<svg viewBox="0 0 48 32" aria-hidden="true"><defs><clipPath id="tlFishC"><path d="M3 16C8 6.5 25 4 36 13.2L39 16L36 18.8C25 28 8 25.5 3 16Z"/></clipPath></defs><g class="tail"><path d="M37.5 16L46.5 8.2Q43.6 16 46.5 23.8Z" fill="${c1}"/></g><path d="M15.5 7.8Q21 2.6 27.5 7.2Z" fill="${c1}" opacity=".75"/><path d="M3 16C8 6.5 25 4 36 13.2L39 16L36 18.8C25 28 8 25.5 3 16Z" fill="${c1}"/><g clip-path="url(#tlFishC)" fill="${c2}"><rect x="12" y="0" width="3.4" height="32"/><rect x="19.5" y="0" width="3.4" height="32"/><rect x="27" y="0" width="3.4" height="32"/></g><circle cx="9.6" cy="14.6" r="1.25" fill="#6f625a" opacity=".55"/></svg>`;
const TL_WAVE = (c) => `<svg class="tl-wave" viewBox="0 0 240 8" preserveAspectRatio="none" aria-hidden="true"><path d="M0 4Q15 0 30 4T60 4T90 4T120 4T150 4T180 4T210 4T240 4V8H0Z" fill="${c}"/></svg>`;
const TL_TIPS = ['点一条鱼，就能给它做基因改造', '左右拖动，换个角度看鱼', '右上角「串门」，去好友的水族馆看看', '卵孵好后会轻轻发光，点一下就能孵化'];
const tlLevel = (k) => 0.48 + 0.34 * Math.min(1, Math.max(0, k));   // 水位（占鱼缸高度比例）：起步就没过小鱼，满载时仍留出水面
function createTankLoader(app) {
  if (!document.getElementById('tankLoadingCss')) { const st = document.createElement('style'); st.id = 'tankLoadingCss'; st.textContent = TL_CSS; document.head.appendChild(st); }
  const el = h(`<div id="tankLoading" class="hidden" role="status" aria-live="polite">
    <div class="tl-brand" aria-hidden="true">Fish Party</div>
    <div class="tl-mid">
      <div class="tl-bowl"><i class="tl-ring"></i><i class="tl-ring b"></i>
        <div class="tl-glass">
          <div class="tl-water" id="tlBar">${TL_WAVE('#fbecef').replace('tl-wave', 'tl-wave b')}${TL_WAVE('#f8dfe4')}<div class="tl-fill"></div></div>
          <i class="tl-bub" style="left:38%"></i><i class="tl-bub" style="left:60%;animation-delay:-1.7s;width:3px;height:3px"></i>
          <div class="tl-swim">${tlFishSVG()}</div>
        </div></div>
      <div class="tl-t" id="tlTxt">正在放鱼入箱</div>
      <div class="tl-s" id="tlSub">布置水族馆</div></div>
    <div class="tl-tip" id="tlTip"></div>
  </div>`);
  app.appendChild(el);
  const bar = el.querySelector('#tlBar'), sub = el.querySelector('#tlSub'), txt = el.querySelector('#tlTxt'), tip = el.querySelector('#tlTip');
  let shownAt = 0, hideT = 0, tipT = 0, tipI = (Math.random() * TL_TIPS.length) | 0, kMax = 0;
  const api = {
    // lite = 已经准备好（再次进入）：只做轻微淡入淡出
    show({ lite = false, text = '正在放鱼入箱' } = {}) {
      clearTimeout(hideT); clearInterval(tipT);
      el.classList.remove('hidden', 'out', 'on'); el.classList.toggle('lite', lite);
      txt.textContent = text; sub.textContent = '布置水族馆'; kMax = 0; bar.style.transition = 'none'; bar.style.transform = `translateY(${(1 - tlLevel(0)) * 100}%)`;
      tip.textContent = TL_TIPS[tipI++ % TL_TIPS.length];
      if (!lite) tipT = setInterval(() => { tip.style.opacity = 0; setTimeout(() => { tip.textContent = TL_TIPS[tipI++ % TL_TIPS.length]; tip.style.opacity = 1; }, 300); }, 2600);
      void el.offsetWidth; bar.style.transition = ''; el.classList.add('on'); shownAt = performance.now();
    },
    prog(k, info = {}) {
      kMax = Math.max(kMax, Math.min(1, k)); bar.style.transform = `translateY(${((1 - tlLevel(kMax)) * 100).toFixed(1)}%)`;
      const s = k >= 1 ? '准备好啦' : k >= 0.78 ? '打开水族灯' : info.n && info.i ? `放鱼入箱 ${info.i}/${info.n}` : k >= 0.3 ? '放鱼入箱' : '布置水族馆';
      if (sub.textContent !== s) sub.textContent = s;
    },
    // 至少显示 minMs 再淡出（冷启动别一闪而过；热启动很快）
    hide(minMs = 0) {
      const wait = Math.max(0, minMs - (performance.now() - shownAt));
      clearTimeout(hideT);
      hideT = setTimeout(() => {
        clearInterval(tipT); el.classList.add('out'); el.classList.remove('on');
        hideT = setTimeout(() => el.classList.add('hidden'), el.classList.contains('lite') ? 200 : 540);
      }, wait);
    },
    get shown() { return !el.classList.contains('hidden') && !el.classList.contains('out'); },
    el,
  };
  return api;
}

export function createTankUI({ meta, aq, genes, app, onExit, onChanged, size }) {
  const S = meta.S;
  if (!document.getElementById('geneLabCss')) { const st = document.createElement('style'); st.id = 'geneLabCss'; st.textContent = GENE_LAB_CSS; document.head.appendChild(st); }
  const root = h(`<div id="tank" class="hidden">
    <div class="tk-vig"></div>
    <div class="tk-labels" id="tkLabels"></div>
    <div class="tk-top">
      <button class="tk-back" id="tkBack" aria-label="返回">${ic('back')}<span id="tkBackT">钓鱼</span></button>
      <div class="tk-tr">
        <button class="tk-visit" id="tkVisit" aria-label="去好友水族箱串门"><span class="avs" id="tkVisitAvs"></span><span id="tkVisitT">串门</span></button>
        <button class="tk-bell" id="tkBell" aria-label="我的动态">${BELL_SVG}<i class="dot hidden" id="tkBellDot"></i></button>
      </div>
    </div>
    <div class="tk-own" id="tkOwnCard">
      <div class="ow-row"><div class="tk-owner" id="tkOwner"></div><button class="tk-bagb" id="tkBag" aria-label="背包">${ic('bag')}<span>背包</span><b class="n num" id="tkBagN">0</b></button></div>
      <div class="ow-stats" id="tkStats"></div>
      <div class="ow-acts" id="tkVisitActs"></div>
    </div>
    <div class="tk-sheet" id="tkFriends"></div>
    <div class="tk-toast" id="tkToast"></div>
    <div class="tk-sheet" id="tkCard"></div>
    <div class="tk-sheet tall" id="tkLab"></div>
    <div class="tk-sheet" id="tkInbox"></div>
    <div class="tk-sheet" id="tkBagSh"></div>
    <div class="tk-sheet" id="tkThemeSh"></div>
    <div class="tk-sheet gv-sheet" id="tkGive"></div>
    <div class="tk-reveal" id="tkReveal"></div>
    <div class="tk-confirm" id="tkConfirm"><div class="box"></div></div>
  </div>`);
  app.appendChild(root);
  const room = h(`<div id="room" class="hidden"><div class="rm-card"></div></div>`);
  app.appendChild(room);
  const $ = (id) => root.querySelector('#' + id);
  const themeSh = $('tkThemeSh');
  const card = $('tkCard'), lab = $('tkLab'), reveal = $('tkReveal'), conf = $('tkConfirm'), labels = $('tkLabels'), inbox = $('tkInbox'), friends = $('tkFriends'), bagSh = $('tkBagSh'), give = $('tkGive');
  let open = false, cur = null, busy = false, labState = null, loading = false;
  let visit = null;            // 串门中：{ owner, tank }；null = 我的水族箱
  const findCur = (uid) => (visit ? visit.tank.find((x) => x.uid === uid) || null : meta.findTank(uid));

  $('tkBack').onclick = () => {
    if (busy) return; sfx.tap();
    if (visit) { backHome(); return; }
    close(); onExit?.();
  };

  // ---------------- 主人信息（owner 可替换） ----------------
  const isMine = (v) => v && v.creator === ME_TAG();
  function ownerMe() {
    const works = S.tank.filter((x) => !x.egg && isMine(x)).length + S.ocean.filter((o) => isMine(o.v)).length;
    const caught = S.ocean.filter((o) => o.caughtBy).length;
    return {
      id: 'me', name: ROOM[0].name, avatar: avatars.me || null, color: ROOM[0].color, level: S.level, title: levelTitle(S.level), pts: S.total, readonly: false, theme: myTheme(),
      stats: [{ k: '鱼', v: `${S.tank.length}/${TANK_MAX}`, egg: meta.readyEggs().length > 0 }, { k: '创作作品', v: works }, { k: '被钓到', v: caught }, { k: '创作分', v: S.creatorScore || 0 }],
    };
  }
  // 水族馆主题：玩家本人存 S.aquaTheme（可切换）；好友主题由 owner 决定（按好友错开，各不相同）
  const myTheme = () => (THEMES[S.aquaTheme] ? S.aquaTheme : DEFAULT_THEME);
  // 好友水族箱：meta.friendTank 持久化（送去的鱼 / 被偷后剩下的都会留下来）；含 1~2 条 TA 自己造的合成鱼
  function friendOwner(f) {
    const hs = hashStr(f.id);
    const tank = meta.friendTank(f.id);
    const works = tank.filter((x) => x.creator === '@' + f.name).length + (hs % 4);
    const caught = 3 + (hs % 37), level = 3 + (hs % 13);
    return {
      id: f.id, name: f.name, avatar: avatars[f.id] || null, color: f.color, level, title: levelTitle(level), readonly: true, theme: f.theme && THEMES[f.theme] ? f.theme : themeForFriend(FRIENDS.indexOf(f), DEFAULT_THEME),
      stats: [{ k: '鱼', v: `${tank.length}` }, { k: '创作作品', v: works }, { k: '被钓到', v: caught }, { k: '创作分', v: caught * 15 }], tank,
    };
  }
  let ownerKey = '';
  function renderOwner(o) {
    const top = `${o.id}|${o.name}|${o.level}|${o.title}|${o.pts}|${!!o.avatar}|${o.theme}`, st = JSON.stringify(o.stats);
    if (ownerKey === top + st) return; ownerKey = top + st;
    const tmp = h(`<div>${ownerCardHTML(o)}</div>`);
    const stats = tmp.querySelector('.ow-st'); stats.remove();
    $('tkOwner').innerHTML = tmp.innerHTML;
    $('tkStats').innerHTML = stats.innerHTML;
    root.classList.toggle('visiting', !!o.readonly);
    $('tkBackT').textContent = o.readonly ? '我的' : '钓鱼';
    const tb = $('tkTheme'); if (tb) tb.onclick = (ev) => { ev.stopPropagation(); if (o.readonly) { notify(`${esc(o.name)} 的水族馆主题：<b>${esc(themeLabel(o.theme))}</b>`, false, 1800); return; } openThemes(); };
  }
  // 主题切换（只能换自己的）
  function openThemes() {
    if (busy || visit) return;
    sfx.open(); hideAll();
    const cur0 = myTheme();
    themeSh.innerHTML = `<button class="tk-x" aria-label="关闭">${ic('close')}</button>
      <div class="dr-hd"><span class="bd" style="background:var(--mint-l,#e6f6ef);color:var(--mint-t,#2f8a68)">${ic('sparkle')}</span><div class="t"><b>水族馆主题</b><span>换一换你的水族馆布景，好友来串门也能看到</span></div></div>
      <div class="th-list">${THEME_IDS.map((id) => { const t = THEMES[id]; return `<button class="th-it ${id === cur0 ? 'on' : ''}" data-th="${id}"><span class="sw" style="background:linear-gradient(160deg,${t.sw[0]} 0%,${t.sw[0]} 45%,${t.sw[1]} 46%,${t.sw[1]} 70%,${t.sw[2]} 71%)"><em>${t.emoji}</em></span><b>${esc(t.name)}</b>${id === cur0 ? `<i>${ic('check')}</i>` : ''}</button>`; }).join('')}</div>`;
    themeSh.querySelector('.tk-x').onclick = () => { sfx.close(); themeSh.classList.remove('show'); setHint(); };
    themeSh.querySelectorAll('[data-th]').forEach((b) => b.onclick = () => {
      const id = b.dataset.th; sfx.tap();
      themeSh.classList.remove('show');
      if (id !== myTheme()) { S.aquaTheme = id; meta.save(); refreshTop(); setHint(); enterScene(S.tank, id, `正在布置${themeLabel(id)}`, false, () => notify(`水族馆换成了 <b>${esc(themeLabel(id))}</b>`, false, 1800)); }
      setHint();
    });
    themeSh.classList.add('show'); setHint();
  }
  function openFriends() {
    if (busy) return;
    sfx.open(); hideAll();
    const me = ownerMe();
    friends.innerHTML = `<button class="tk-x" aria-label="关闭">${ic('close')}</button>
      <div class="dr-hd"><span class="bd" style="background:var(--grape-l);color:var(--grape-t)">${ic('users')}</span><div class="t"><b>去好友水族箱串门</b><span>看看大家养了什么奇怪的鱼</span></div></div>
      <div class="fr-list">${visit ? `<button class="fr-it me" data-fr="me"><span class="av" style="${me.avatar ? `background-image:url(${me.avatar})` : `background:${me.color}`}"></span><div class="m"><b>回我的水族箱</b><small>${esc(me.stats[0].v)} 条鱼</small></div>${ic('chev')}</button>` : ''}
        ${FRIENDS.filter((f) => !visit || visit.owner.id !== f.id).map((f) => { const o = friendOwner(f); return `<button class="fr-it" data-fr="${f.id}"><span class="av" style="${o.avatar ? `background-image:url(${o.avatar})` : `background:${f.color}`}">${o.avatar ? '' : esc(f.name[0])}</span><div class="m"><b>${esc(f.name)}<i>Lv.${o.level}</i></b><small>${esc(o.title)} · ${o.tank.length} 条鱼 · 作品 ${o.stats[1].v}</small></div>${ic('chev')}</button>`; }).join('')}</div>`;
    friends.querySelector('.tk-x').onclick = () => { sfx.close(); friends.classList.remove('show'); setHint(); };
    friends.querySelectorAll('[data-fr]').forEach((b) => b.onclick = () => { sfx.tap(); friends.classList.remove('show'); b.dataset.fr === 'me' ? backHome() : visitFriend(FRIENDS.find((f) => f.id === b.dataset.fr)); });
    friends.classList.add('show'); setHint();
  }
  // v1.3 串门胶囊在右上：自己家 = 打开好友列表；串门中 = 「下一家 ›」直接去下一位好友（返回自己家用左上「‹ 我的」）
  $('tkVisit').onclick = () => {
    if (busy) return;
    if (!visit) { openFriends(); return; }
    sfx.tap();
    const i = FRIENDS.findIndex((f) => f.id === visit.owner.id);
    visitFriend(FRIENDS[(i + 1) % FRIENDS.length]);
  };
  function visitFriend(f) {
    if (!f) return;
    const o = friendOwner(f);
    visit = { owner: o, tank: o.tank, f };
    labels.innerHTML = '';
    hideAll(); refreshTop(); setHint();
    enterScene(o.tank, o.theme, `正在去 ${o.name} 家串门`, false, () => notify(`来到 <b>${esc(o.name)}</b> 的水族箱<small>送 TA 一条鱼 · 每天可以偷偷带走一条</small>`, false, 2400));
  }
  function backHome() {
    visit = null; labels.innerHTML = '';
    hideAll(); refreshTop(); setHint();
    enterScene(S.tank, myTheme(), '正在回到我的水族馆', false);
  }
  // ---------------- 串门社交：送鱼 / 偷鱼 ----------------
  const refreshVisitOwner = () => { if (!visit) return; const o = friendOwner(visit.f); visit.owner = o; visit.tank = o.tank; ownerKey = ''; refreshTop(); };
  let actsKey = '';
  function renderVisitActs() {
    const el = $('tkVisitActs');
    if (!visit) { if (actsKey) { actsKey = ''; el.innerHTML = ''; } return; }
    const left = meta.stealLeft(), k = `${visit.owner.id}|${left}`;
    if (actsKey === k) return; actsKey = k;
    el.innerHTML = `<button class="va-b" id="vaGive">${ic('gift')}<span>送鱼</span></button>
      <button class="va-b ${left ? '' : 'off'}" id="vaSteal">${ic('hand')}<span>${left ? '偷鱼' : '今日已偷'}</span><em class="num">${left ? `今日 ${left}/1` : '明日再来'}</em></button>`;
    el.querySelector('#vaGive').onclick = () => openGive();
    el.querySelector('#vaSteal').onclick = () => doSteal();
  }
  function openGive() {
    if (busy || !visit) return;
    sfx.open(); hideAll();
    const o = visit.owner, mine = S.tank.filter((x) => !x.egg);
    let pick = null;
    const draw = () => {
      const p = pick && mine.find((x) => x.uid === pick);
      give.innerHTML = `<button class="tk-x" aria-label="关闭">${ic('close')}</button>
        <div class="gl-hd"><div class="gl-k">串门 · 送鱼</div><b>送一条鱼给 ${esc(o.name)}</b><span>它会住进 TA 的水族箱 · 不限次数</span></div>
        ${mine.length ? `<div class="gl-grid gv-grid">${mine.map((x, i) => `<button class="gl-cell ${pick === x.uid ? 'on' : ''}" data-gv="${x.uid}"><img data-ugc="${i}" alt=""><span>${esc(displayName(x))}</span>${isSyn(x) ? '<i class="gl-syn">新物种</i>' : ''}</button>`).join('')}</div>`
          : `<div class="gl-empty"><b>水族箱里还没有鱼</b><span>先去钓一条吧</span></div>`}
        <div class="gl-foot"><button class="tk-btn main" id="gvGo" ${p ? '' : 'disabled'}>${p ? `${ic('gift')}送给 ${esc(o.name)}` : '选一条要送出的鱼'}</button></div>`;
      fillThumbs(give, mine);
      give.querySelector('.tk-x').onclick = () => { sfx.close(); give.classList.remove('show'); setHint(); };
      give.querySelectorAll('[data-gv]').forEach((b) => b.onclick = () => { sfx.tap(); pick = b.dataset.gv; const sc = give.querySelector('.gv-grid')?.scrollTop || 0; draw(); const g2 = give.querySelector('.gv-grid'); if (g2) g2.scrollTop = sc; });
      const go = give.querySelector('#gvGo'); go.onclick = () => { if (!go.disabled) sendFish(pick); };
    };
    draw(); give.classList.add('show'); setHint();
  }
  function sendFish(uid) {
    if (!visit) return;
    const r = meta.giveFish(visit.owner.id, uid); if (!r) { notify('这条鱼暂时送不出去'); return; }
    give.classList.remove('show'); sfx.sparkle(); vib(18);
    refreshVisitOwner(); aq.sync(visit.tank); aq.select(r.v.uid); cur = null;
    setTimeout(() => aq.select(null), 2600);
    notify(`已送达 · ${esc(r.f.name)} 会收到通知<small>『${esc(displayName(r.v))}』住进了 TA 的水族箱</small>`, false, 2800);
    refreshBell(); setHint(); onChanged?.();
  }
  async function doSteal() {
    if (busy || !visit) return;
    const left = meta.stealLeft();
    if (!left) { notify('今天已经偷过一次了<small>明天再来</small>', false, 2000); return; }
    if (S.tank.length >= TANK_MAX) { notify('你的水族箱满了<small>先腾出一个位置再来</small>', false, 2200); return; }
    const o = visit.owner;
    const r = meta.stealFish(o.id);
    if (r.err) { notify(r.err === 'empty' ? `${esc(o.name)} 的水族箱里没有可以带走的鱼` : '这次没能得手', false, 2000); return; }
    hideAll(); busy = true; setHint(); sfx.tap();
    // 紧张：四周压暗 + 心跳 → 目标鱼游到前景 → 游走（得手）
    const ov = h(`<div class="st-ov"><div class="st-ring"><i></i><i></i></div><div class="st-t">屏住呼吸</div></div>`);
    root.appendChild(ov); requestAnimationFrame(() => ov.classList.add('on'));
    vib([12, 160, 12]);
    aq.select(r.v.uid);
    await new Promise((res) => setTimeout(res, 1350));
    ov.querySelector('.st-t').textContent = '得手';
    ov.classList.add('got'); sfx.releaseSplash?.(); vib(30);
    await aq.playRelease(r.v.uid);
    ov.classList.remove('on'); setTimeout(() => ov.remove(), 400);
    refreshVisitOwner(); aq.sync(visit.tank);
    busy = false; sfx.coin();
    const got = h(`<div class="st-got"><img data-ugc="0" alt=""><div><b>『${esc(displayName(r.v))}』</b><span>已带回你的水族箱</span></div></div>`);
    root.appendChild(got); fillThumbs(got, [r.v]); setTimeout(() => got.classList.add('out'), 2300); setTimeout(() => got.remove(), 2800);
    notify(`得手了 · ${esc(o.name)} 很快会发现<small>今日偷鱼次数已用完</small>`, false, 2600);
    refreshBell(); refreshTop(); setHint(); onChanged?.();
  }
  // v5 进场：先出过场（至少渲染一帧过场）→ aq.prepare 拆帧建场景 / 鱼 + compileAsync 预编译 + 首帧 → 过场淡出
  // 已经热（布景缓存 + 鱼都建好）时只做轻微淡入淡出
  const loader = createTankLoader(app);
  let enterTok = 0;
  function enterScene(tank, theme, text, reset, done) {
    const tok = ++enterTok, warm = aq.isWarm(tank, theme) && !reset;
    loader.show({ lite: warm, text });
    loading = true; setHint();
    const { W, H } = size();
    const t0 = performance.now();
    // 双 rAF：确保过场已经真正画到屏幕上，再开始重活
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (tok !== enterTok || !open) return;
      aq.prepare(tank, W, H, { reset, theme }, (k, info) => loader.prog(k, info)).then((r) => {
        if (tok !== enterTok || !open || !r?.ok) return;
        aq.lastPrep = r;
        aq.onTap = onTap; loading = false;
        refreshTop(); setHint(); tick(0);
        const ms = performance.now() - t0;
        loader.hide(warm ? 120 : ms < 400 ? 260 : 800);
        done?.();
      }).catch((err) => { console.error('aquarium prepare failed', err); if (tok !== enterTok || !open) return; try { aq.open(tank, W, H, { reset: true, theme }); } catch (e2) { console.error(e2); } aq.onTap = onTap; loading = false; setHint(); loader.hide(0); });
    }));
  }

  // ---------------- 我的动态（S.inbox）：铃铛 + 红点 → 底部列表 ----------------
  const IB_IC = { creator: ic('palette'), caught: ic('rod'), release: ic('wave'), hatch: EGG_ORB, info: ic('sparkle'), gift: ic('gift'), thanks: ic('heart'), steal: ic('hand'), npc: ic('users'), synth: ic('dna') };   // v1.1：通知图标统一 SVG
  const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? '刚刚' : s < 3600 ? `${Math.floor(s / 60)} 分钟前` : s < 86400 ? `${Math.floor(s / 3600)} 小时前` : `${Math.floor(s / 86400)} 天前`; };
  const unread = () => S.inbox.filter((x) => x.t > (S.inboxSeen || 0)).length;
  function refreshBell(ring = false) {
    const n = unread(); $('tkBellDot').classList.toggle('hidden', !n);
    if (ring && n) { const b = $('tkBell'); b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); }
  }
  // 动态可读性：@谁 / 『鱼名』 高亮
  const ibHi = (t) => esc(t).replace(/(@[^\s！!，,：:『「]+)/g, '<b class="u">$1</b>').replace(/([『「][^』」]+[』」])/g, '<b class="f">$1</b>');
  function openInbox() {
    if (busy) return;
    sfx.open(); hideAll();
    const seen = S.inboxSeen || 0;
    inbox.innerHTML = `<button class="tk-x" aria-label="关闭">${ic('close')}</button>
      <div class="dr-hd"><span class="bd" style="background:var(--sky-l,#e6f4ff);color:var(--sky-t,#2f7fc4)">${BELL_SVG}</span><div class="t"><b>我的动态</b><span>放生 · 串门 · 好友来信，都在这里</span></div></div>
      ${S.inbox.length ? `<div class="ib-list">${S.inbox.map((x) => `<div class="ib-it ${esc(x.kind)} ${x.t > seen ? 'new' : ''}"><div class="ic">${IB_IC[x.kind] || IB_IC.info}</div><div class="m">${ibHi(x.text)}<small>${ago(x.t)}</small></div></div>`).join('')}</div>`
        : `<div class="ib-empty"><b>${ic('wave')}</b>还没有动态<br>放生、串门、送鱼之后，消息会出现在这里</div>`}`;
    inbox.querySelector('.tk-x').onclick = () => { sfx.close(); inbox.classList.remove('show'); setHint(); };
    inbox.classList.add('show');
    S.inboxSeen = Date.now(); meta.save(); refreshBell(); setHint(); onChanged?.();
  }
  $('tkBell').onclick = openInbox;

  // ---------------- 背包（水族箱内）：查看道具 · 提示去点鱼使用 ----------------
  const bagSt = { cat: 'all', sel: null };
  function openBag() {
    if (busy) return;
    sfx.open(); hideAll();
    const draw = () => {
      const sc = bagSh.scrollTop;
      bagSh.innerHTML = `<button class="tk-x" aria-label="关闭">${ic('close')}</button>
        <div class="dr-hd" style="margin-bottom:10px"><span class="bd" style="background:var(--lemon-l);color:var(--lemon-t)">${ic('bag')}</span><div class="t"><b>我的背包 · ${meta.bagTotal()} 个道具</b><span>道具只有一个用途：在基因改造中影响新生命</span></div></div>
        ${bagView(meta, bagSt)}`;
      bagSh.querySelector('.tk-x').onclick = () => { sfx.close(); bagSh.classList.remove('show'); setHint(); };
      bindBag(bagSh, bagSt, draw); bagSh.scrollTop = sc;
    };
    draw(); bagSh.classList.add('show'); setHint();
  }
  $('tkBag').onclick = openBag;

  function refreshTop() {
    const bn = String(meta.bagTotal()); if ($('tkBagN').textContent !== bn) $('tkBagN').textContent = bn;
    $('tkBag').classList.toggle('hidden', !!visit);
    if (!visit) { const o = ownerMe(); if (!o.avatar && avatars.me) o.avatar = avatars.me; renderOwner(o); }
    else { if (!visit.owner.avatar && avatars[visit.owner.id]) visit.owner.avatar = avatars[visit.owner.id]; renderOwner(visit.owner); }
    const avs = FRIENDS.slice(0, 3).map((f) => `<i style="${avatars[f.id] ? `background-image:url(${avatars[f.id]})` : `background:${f.color}`}"></i>`).join('');
    const vt = visit ? '下一家 ›' : '串门'; if ($('tkVisitT').textContent !== vt) $('tkVisitT').textContent = vt;
    renderVisitActs();
    root.querySelector('#tkVisit').classList.toggle('next', !!visit);
    const va = $('tkVisitAvs'); if (va.dataset.k !== String(Object.keys(avatars).length)) { va.dataset.k = String(Object.keys(avatars).length); va.innerHTML = avs; }
  }
  function setHint() {
    // v1.3：底部提示条（tkHint）取消；任何底部面板/揭晓/确认/引导弹出时，底部主人卡淡出，关闭后淡回
    const anyOpen = card.classList.contains('show') || lab.classList.contains('show') || reveal.classList.contains('show') || inbox.classList.contains('show') || friends.classList.contains('show') || bagSh.classList.contains('show') || themeSh.classList.contains('show') || give.classList.contains('show') || conf.classList.contains('show') || !!root.querySelector('.tk-tip');
    const oc = $('tkOwnCard'), off = anyOpen || busy || loading;
    if (oc.classList.contains('off') !== off) oc.classList.toggle('off', off);
    // 全高的改造面板 / 揭晓卡 / 确认框：顶部按钮也让位（面板自带关闭，避免与「‹ 钓鱼 / 串门 / 铃铛」重叠）
    const mt = lab.classList.contains('show') || reveal.classList.contains('show') || conf.classList.contains('show');
    if (root.classList.contains('modal-top') !== mt) root.classList.toggle('modal-top', mt);
  }
  let toastT = 0;
  function notify(html, gold = false, ms = 3200) {
    const t = $('tkToast'); t.innerHTML = html; t.classList.toggle('gold', gold); t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
  function floatPts(txt) {
    const d = document.createElement('div'); d.className = 'tk-float'; d.textContent = txt; root.appendChild(d); setTimeout(() => d.remove(), 1600);
  }

  // ---------------- 打开 / 关闭 ----------------
  function openTank() {
    open = true; root.classList.remove('hidden'); visit = null;
    hideAll(); refreshTop(); refreshBell(true); setHint();
    enterScene(S.tank, myTheme(), '正在放鱼入箱', false, () => {
      // 新手引导（只一次）：首次进入水族箱 → "点一条鱼，试试基因改造"
      if (!tut.get('tankTip') && meta.tankFish().length) {
        tut.set('tankTip');
        const tip = h(`<div class="tk-tip">点一条鱼，试试基因改造<small>两条鱼加一件道具，融合成全新的生命</small><button>知道了</button></div>`);
        root.appendChild(tip); setHint();
        const done = () => { tip.remove(); setHint(); };
        tip.querySelector('button').onclick = () => { sfx.tap(); done(); };
        setTimeout(() => tip.isConnected && done(), 6000);
      }
    });
  }
  function close() {
    open = false; visit = null; enterTok++; loading = false; if (loader.shown) loader.hide(0);
    root.classList.add('hidden'); hideAll(); aq.close(); labels.innerHTML = '';
  }
  function hideAll() { give.classList.remove('show'); themeSh.classList.remove('show'); bagSh.classList.remove('show'); friends.classList.remove('show'); inbox.classList.remove('show'); card.classList.remove('show'); lab.classList.remove('show'); reveal.classList.remove('show'); conf.classList.remove('show'); cur = null; aq.select(null); }

  function onTap(uid) {
    const tip = root.querySelector('.tk-tip'); if (tip) { tip.remove(); setHint(); }
    if (inbox.classList.contains('show') || friends.classList.contains('show') || bagSh.classList.contains('show') || themeSh.classList.contains('show') || give.classList.contains('show')) { inbox.classList.remove('show'); friends.classList.remove('show'); bagSh.classList.remove('show'); themeSh.classList.remove('show'); give.classList.remove('show'); setHint(); return; }
    if (busy || reveal.classList.contains('show') || conf.classList.contains('show')) return;
    if (lab.classList.contains('show')) return;
    if (!uid) { if (card.classList.contains('show')) { hideAll(); setHint(); } return; }
    sfx.tap();
    const x = findCur(uid); if (!x) return;
    cur = uid; aq.select(uid);
    if (visit) { showVisitCard(x); setHint(); return; }
    x.egg ? showEggCard(x) : showFishCard(x);
    setHint();
    if (!x.egg) setTimeout(orbitTip, 450);
  }
  // v0.9.1：首次选中鱼 → 鱼卡上方一次性手势提示（3s 淡出）
  function orbitTip() {
    if (tut.get('orbit')) return; tut.set('orbit');
    const el = document.createElement('div');
    el.textContent = '拖动可 360° 查看 · 双指缩放';
    const r = card.getBoundingClientRect(), bottom = r.height > 0 ? (innerHeight - r.top + 10) : 220;
    el.style.cssText = `position:fixed;left:50%;bottom:${bottom}px;transform:translateX(-50%);z-index:60;pointer-events:none;padding:6px 14px;border-radius:999px;background:rgba(10,24,40,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);color:#eaf6ff;font-size:12px;letter-spacing:.5px;white-space:nowrap;opacity:0;transition:opacity .45s ease`;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => { el.style.opacity = '0'; }, 3000); setTimeout(() => el.remove(), 3600);
  }

  // ---------------- 鱼卡 ----------------
  // 介绍牌（动森博物馆式）：名字 / 大小 / 来历 / 一两句描述 / 创作者；合成鱼 = 新物种 · 指纹 · 亲本来历 · 性状标签
  const SYN = meta.synth || {};
  const cleanTag = (t) => String(t).replace(/^[^\p{L}\p{N}]+/u, '');
  const synTags = (v) => { try { return (SYN.synthTags?.(v) || []).slice(0, 4); } catch (e) { return []; } };
  const oldTags = (v) => { try { return (genes.geneSummary?.(v) || []).map(cleanTag).filter((t) => !/^第\d+代$/.test(t)); } catch (e) { return []; } };
  const itemOf = (id) => (id && ITEM_BY_ID[id]) || null;
  function plaqueDesc(v) {
    if (isSyn(v)) {
      const ps = (v.parents || []).filter(Boolean), it = itemOf(v.synItem);
      let s = ps.length >= 2 ? `由『${ps[0].name}』与『${ps[1].name}』融合而成` : '一个不属于任何已知物种的海洋生物';
      if (it) s += `，带着「${it.name}」的印记`;
      s += '。';
      if (v.prompt) s += ` 改造方向：「${v.prompt}」。`;
      return s;
    }
    const sp = SPECIES_BY_ID[v.sp]; const out = [];
    if (sp?.desc) out.push(sp.desc);
    if (v.mut) out.push('身上带着罕见的突变光泽，在水里会微微发亮。');
    else if (v.note) out.push(v.note);
    return out.slice(0, 2).join(' ');
  }
  function plaqueHTML(v, kicker) {
    const sp = SPECIES_BY_ID[v.sp], R = rarInfo(v), syn = isSyn(v), tags = syn ? synTags(v) : oldTags(v);
    return `<button class="tk-x" aria-label="关闭">${ic('close')}</button>
      <div class="pl-k"><i></i>${esc(kicker)}</div>
      <div class="pl-hd"><img class="fc-th" data-ugc="0" alt=""><div class="fc-m">
        <div class="pl-nm">${esc(displayName(v))} ${rb(v)}</div>
        <div class="pl-meta"><span>${syn ? '新物种' : esc(sp?.name || '')}</span><span>${R.label}</span><span><b>${fmtLenTxt(v.cm)}</b></span>${v.gen ? `<span>第 ${v.gen} 代</span>` : ''}${v.mut ? '<span class="mut">突变</span>' : ''}</div>
      </div></div>
      <div class="pl-desc">${esc(plaqueDesc(v))}</div>
      <div class="pl-by">创作者 <b>${esc(v.creator || '@大海')}</b> · ${esc(ORIGIN(v))}${syn && v.fp ? ` · <span class="pl-fp num">№ ${esc(v.fp)}</span>` : ''}</div>
      ${tags.length ? `<div class="chips gl-chips">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}`;
  }
  function showFishCard(v) {
    if (v.unnamed && isSyn(v)) { showNaming(v, null); return; }   // 命名前离开过：先补上命名这一步
    const pts = meta.releaseValue(v);
    card.innerHTML = `${plaqueHTML(v, isSyn(v) ? '新物种 · 全宇宙唯一' : '水族箱藏品')}
      <div class="pl-acts"><button class="tk-btn main" id="fcGene">${ic('dna')}基因改造</button>
      <button class="tk-btn sub" id="fcRel">${ic('wave')}放生 <b>+${pts}</b></button></div>`;
    fillThumbs(card, [v]);
    card.querySelector('.tk-x').onclick = () => { sfx.close(); hideAll(); setHint(); };
    card.querySelector('#fcGene').onclick = () => { sfx.open(); openLab(v); };
    card.querySelector('#fcRel').onclick = () => confirmRelease(v, pts);
    card.classList.add('show');
  }

  // 串门：只读鱼卡（点赞）
  const liked = new Set();
  function showVisitCard(v) {
    const o = visit.owner, on = liked.has(v.uid);
    const k = v.via === 'gift' ? `${o.name} 的藏品 · 你送的` : v.via === 'took' ? `${o.name} 的藏品 · 从你家带走的` : isSyn(v) && v.creator === '@' + o.name ? `${o.name} 造的新物种` : `${o.name} 的藏品`;
    card.innerHTML = `${plaqueHTML(v, k)}
      <div class="pl-acts"><button class="tk-btn main" id="fcLike" ${on ? 'disabled' : ''}>${on ? `${ic('check')}已点赞` : `${ic('heart')}赞一下`}</button></div>`;
    fillThumbs(card, [v]);
    card.querySelector('.tk-x').onclick = () => { sfx.close(); hideAll(); setHint(); };
    card.querySelector('#fcLike').onclick = () => { if (liked.has(v.uid)) return; liked.add(v.uid); sfx.coin(); vib(20); showVisitCard(v); };
    card.classList.add('show');
  }

  function confirmRelease(v, pts) {
    sfx.tap();
    showConfirm(`<div class="cf-ic">${ic('wave')}</div><h3>放生『${esc(displayName(v))}』？</h3><p>它会游回大海，可能被别的玩家钓到</p>`,
      `放生 +${pts} 分`, async () => {
        hideAll(); busy = true; setHint();
        sfx.releaseSplash();
        await aq.playRelease(v.uid);
        const got = meta.releaseFish(v.uid);
        meta.pushInbox(`你把『${displayName(v)}』放生了，它正游向大海`, 'release');
        busy = false; sfx.coin(); floatPts(`+${got} 分`);
        const w = h(`<div class="rel-wave"><b>游向大海了</b><br><span>可能被别的玩家钓到，到时会通知你</span></div>`); root.appendChild(w); setTimeout(() => w.remove(), 2400);
        refreshBell(true);
        refreshTop(); setHint(); onChanged?.();
      }, '再想想');
  }
  function showConfirm(html, okTxt, onOk, cancelTxt = '取消', onCancel = null) {
    const box = conf.querySelector('.box');
    box.innerHTML = `${html}<button class="tk-btn main" id="cfOk">${esc(okTxt)}</button><button class="tk-btn ghost" id="cfNo">${esc(cancelTxt)}</button>`;
    conf.classList.add('show');
    box.querySelector('#cfOk').onclick = () => { conf.classList.remove('show'); onOk?.(); };
    box.querySelector('#cfNo').onclick = () => { conf.classList.remove('show'); sfx.close(); onCancel?.(); };
  }

  // ---------------- 卵卡 ----------------
  function showEggCard(egg) {
    card.innerHTML = `<button class="tk-x" aria-label="关闭">${ic('close')}</button>
      <div class="eg-hd"><div class="eg-ic ${egg.kind}">${EGG_ORB}</div><div class="fc-m">
        <div class="fc-nm">${eggName(egg)}</div>
        <div class="fc-sub" id="egSub"></div></div></div>
      ${egg.kind === 'synth' ? eggSrcHTML(egg) : ''}
      <div class="eg-bar"><i id="egBar"></i></div>
      <button class="tk-btn main gold" id="egGo"></button>
      <div class="eg-note" id="egNote"></div>`;
    card.querySelector('.tk-x').onclick = () => { sfx.close(); hideAll(); setHint(); };
    card.querySelector('#egGo').onclick = () => hatch(egg.uid);
    card.classList.add('show');
    updateEggCard();
  }
  const eggName = (egg) => (egg.kind === 'synth' ? '基因卵' : egg.kind === 'fuse' ? '融合卵' : '改造卵');
  function eggSrcHTML(egg) {
    const ps = (egg.src || []).filter(Boolean).slice(0, 2), it = itemOf(egg.synItem);
    return `<div class="eg-src">${ps.map((x) => `<span>『${esc(displayName(x))}』</span>`).join('<i>×</i>')}${it ? `<i>·</i><span>${esc(it.name)}</span>` : ''}</div>`;
  }
  function updateEggCard() {
    if (!cur || !card.classList.contains('show')) return;
    const egg = meta.findTank(cur); if (!egg || !egg.egg) return;
    const left = meta.eggLeft(egg), ready = left <= 0;
    const sub = card.querySelector('#egSub'); if (!sub) return;
    sub.textContent = ready ? '孵好了 · 去见见它' : `还要 ${fmtSec(left)} · ${egg.kind === 'synth' ? '一个新生命正在成形' : '里面隐约有条鱼在动'}`;
    card.querySelector('#egBar').style.width = `${(1 - left / egg.dur) * 100}%`;
    const go = card.querySelector('#egGo'); const txt = ready ? '孵化' : '加速 · 立即孵化';
    if (go.dataset.t !== txt) { go.dataset.t = txt; go.innerHTML = `${ready ? EGG_ORB : ic('bolt')}${txt}`; }
    go.classList.toggle('ready', ready);
    card.querySelector('#egNote').textContent = ready ? '' : '试玩期间加速免费';
  }

  async function hatch(uid) {
    if (busy) return;
    const egg = meta.findTank(uid); if (!egg) return;
    if (meta.eggLeft(egg) > 0) meta.boostEgg(uid);
    sfx.open(); hideAll(); busy = true; setHint();
    const res = meta.hatchEgg(uid); if (!res) { busy = false; return; }
    sfx.eggShake();
    const pHatch = aq.playHatch(uid, res.v);
    setTimeout(() => { if (res.v.mut) { try { mutBurst(res.v.mut); } catch (e) { console.warn(e); } } try { sfx.hatch(); if (res.v.mut) sfx.mutate(); } catch (e) {} }, 1300);
    await pHatch;
    if (res.v.mut) await new Promise((r) => setTimeout(r, 900)); else sfx.catch(rarOf(res.v));
    busy = false;
    if (res.egg.kind === 'synth') showSynthReveal(res.v, res.egg);   // v0.9：揭晓 → 必经命名（命名后再写动态）
    else { meta.pushInbox(`${eggName(res.egg)}孵出了『${displayName(res.v)}』${res.v.mut ? '（突变）' : ''}`, 'hatch'); showReveal(res.v, res.egg); }
    refreshTop(); onChanged?.();
  }

  // 突变专属：全屏闪光 + "突变！"大字（配合 3D 光柱与 sfx.mutate）
  function mutBurst(mut) {
    const m = String(mut);
    const sub = m.includes('giant') && m.includes('rare') ? '巨型 + 珍稀 双重突变！' : m.includes('giant') ? '巨型变异 · 体型暴涨！' : '珍稀变异 · 专属材质！';
    const fl = h('<div class="mut-flash"></div>'), tx = h(`<div class="mut-burst">突变！<small>${sub}</small></div>`);
    const dim = h('<div class="mut-dim"></div>'), rays = h('<div class="mut-rays"></div>');
    root.appendChild(dim); root.appendChild(rays); root.appendChild(fl); root.appendChild(tx); vib([40, 60, 80]);
    const sparks = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3, d = 120 + Math.random() * 110;
      const s = h(`<i class="mut-spark ${i % 3 === 0 ? 'p' : ''}"></i>`);
      s.style.setProperty('--x', `${Math.cos(a) * d}px`); s.style.setProperty('--y', `${Math.sin(a) * d}px`); s.style.setProperty('--r', `${(a * 180) / Math.PI + 90}deg`);
      s.style.animationDelay = `${(i % 4) * 0.05}s`;
      root.appendChild(s); sparks.push(s);
    }
    const app = document.getElementById('app');
    if (app) { app.classList.remove('mut-shake'); void app.offsetWidth; app.classList.add('mut-shake'); setTimeout(() => app.classList.remove('mut-shake'), 700); }
    setTimeout(() => { fl.remove(); sparks.forEach((s) => s.remove()); }, 1300); setTimeout(() => { tx.remove(); dim.remove(); rays.remove(); }, 2300);
  }

  // ---------------- 揭晓卡 ----------------
  function showReveal(v, egg) {
    const ch = egg.changes || [];
    const mut = v.mut;
    const R = rarInfo(v);
    const src = (egg.src || []).filter((x) => x && x.sp && !x.egg).slice(0, 2);
    reveal.innerHTML = `<div class="rv-card ${mut ? 'mut' : ''}">
      <div class="rv-big">${mut ? '突变！' : '孵化成功'}</div>
      ${src.length ? `<div class="rv-ba ${src.length > 1 ? 'two' : ''}">${src.map((x, i) => `<div class="o"><img data-ugc="${i}" alt=""><span>${esc(displayName(x))}</span></div>`).join('<em class="pl">+</em>')}<em class="ar">➜</em><div class="n"><img data-ugc="${src.length}" alt=""><span>NEW</span></div></div>` : ''}
      <div class="rv-nm">${esc(displayName(v))} ${rb(v)}</div>
      <div class="rv-sub">${R.label} · ${fmtLenTxt(v.cm)} · 第 ${v.gen} 代 · 创作者 ${esc(v.creator)}</div>
      <div class="rv-list">${ch.map((c) => { const t = c.replace(/^🧬\s*/, ''); return `<div class="${/突变/.test(c) ? 'w' : ''}">${t !== c ? ic('dna') : ''}${esc(t)}</div>`; }).join('') || '<div>基因悄悄重组了</div>'}</div>
      <button class="tk-btn main" id="rvOk">${ic('check')}收下它！</button></div>`;
    if (src.length) fillThumbs(reveal.querySelector('.rv-ba'), [...src, v]);
    reveal.classList.add('show'); setHint(); aq.select(v.uid);   // 新鱼游到前景亮相，卡片在下方
    reveal.querySelector('#rvOk').onclick = () => { sfx.tap(); reveal.classList.remove('show'); aq.select(null); setHint(); };
  }

  // ---------------- 基因改造实验室（v0.9 唯一入口）----------------
  // 主鱼 + 鱼槽（必选，另一条自己的鱼）+ 道具槽（可选，背包任意一件）+ 一句话（可选，≤30 字）+ 基因预感 → 基因卵（两条亲本被消耗，道具消耗 1）
  const INSP = ['想让它在夜里发光', '像一只穿西装的绅士', '尾巴长成一把钥匙', '带一点深海的冷色调', '圆滚滚，像颗汤圆', '鳍像丝绸一样飘', '有一身古董瓷器的花纹', '长出第三只眼睛', '像刚从火山口游出来', '安静、优雅、修长', '身上有星空', '像一块会游泳的琥珀'];
  const PROMPT_MAX = 30;
  const DICE = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.1" fill="currentColor" stroke="none"/></svg>';
  const labOthers = (v) => meta.tankFish().filter((x) => x.uid !== v.uid);
  function openLab(v) {
    const others = labOthers(v);
    labState = { v, mate: null, item: null, prompt: '', mode: 'fish', insp: (Math.random() * INSP.length) | 0, nOthers: others.length };
    card.classList.remove('show');
    renderLab(); lab.classList.add('show'); setHint();
  }
  function closeLab() { lab.classList.remove('show'); labState = null; const v = cur && meta.findTank(cur); if (v && !v.egg) showFishCard(v); setHint(); }
  function nodeFish(v, i, label, extra = '') {
    return `<div class="gl-th">${v ? `<img data-ugc="${i}" alt="">` : ic('plus')}</div><b>${label}</b><span>${v ? esc(displayName(v)) : extra}</span>`;
  }
  function fxHTML(L, m, it) {
    return `<div class="gl-fx">
      <div class="gl-node main">${nodeFish(L.v, 0, '主鱼')}</div>
      <i class="gl-op">×</i>
      <button class="gl-node ${L.mode === 'fish' ? 'act' : ''} ${m ? 'f' : 'need'}" data-slot="fish">${nodeFish(m, 1, '鱼槽 · 必选', '选一条鱼')}</button>
      <i class="gl-op">+</i>
      <button class="gl-node ${L.mode === 'item' ? 'act' : ''} ${it ? 'f' : ''}" data-slot="item"><div class="gl-th">${it ? `<em class="gl-ico lg" style="--ic:${it.color}">${it.emoji}</em>` : ic('plus')}</div><b>道具 · 可选</b><span>${it ? esc(it.name) : '可以不放'}</span></button>
    </div>`;
  }
  function pickerHTML(L, others) {
    const bag = meta.bagList();
    const seg = `<div class="gl-seg"><button data-mode="fish" class="${L.mode === 'fish' ? 'on' : ''}">选鱼<small class="num">${others.length}</small></button><button data-mode="item" class="${L.mode === 'item' ? 'on' : ''}">选道具<small class="num">${meta.bagTotal()}</small></button></div>`;
    let body;
    if (L.mode === 'fish') {
      body = others.length
        ? `<div class="gl-grid">${others.map((x, i) => `<button class="gl-cell ${L.mate === x.uid ? 'on' : ''}" data-mate="${x.uid}"><img data-ugc="${i}" alt=""><span>${esc(displayName(x))}</span>${isSyn(x) ? '<i class="gl-syn">新物种</i>' : ''}</button>`).join('')}</div>`
        : `<div class="gl-empty"><b>水族箱里只有它一条鱼</b><span>再钓一条回来，就能开始基因改造</span><button class="tk-btn ghost sm" id="glFish">${ic('rod')}去钓鱼</button></div>`;
    } else {
      body = `<div class="gl-grid it"><button class="gl-cell it none ${!L.item ? 'on' : ''}" data-item=""><span class="gl-ico">${ic('close')}</span><span>不放道具</span></button>${bag.map((x) => `<button class="gl-cell it ${L.item === x.id ? 'on' : ''}" data-item="${x.id}" title="${esc(x.desc || '')}"><span class="gl-ico" style="--ic:${x.color}">${x.emoji}</span><span>${esc(x.name)}</span><em class="num">×${x.n}</em><i class="gl-rd" style="background:${(ITEM_RARITY[x.rarity] || {}).color || '#ccc'}"></i></button>`).join('')}</div>
        ${bag.length ? '' : '<div class="gl-note">背包里还没有道具 · 钓鱼时偶尔会钓上来</div>'}`;
    }
    return `${seg}<div class="gl-scroll" id="glScroll">${body}</div>`;
  }
  function preHTML(L, m) {
    if (!m) return `<div class="gl-row"><span class="gl-lbl">基因预感</span></div><div class="gl-pre-e">先在鱼槽里放一条鱼，才能感知它们的基因</div>`;
    let P = { tags: [], risk: 0.5 };
    try { P = SYN.previewHints?.({ a: L.v, b: m, item: L.item, prompt: L.prompt }) || P; } catch (e) { console.warn('previewHints', e); }
    const risk = Math.round(Math.max(0, Math.min(1, +P.risk || 0)) * 100);
    const lv = risk >= 75 ? '极难预料' : risk >= 50 ? '难以预料' : risk >= 25 ? '略有悬念' : '大致可期';
    return `<div class="gl-row"><span class="gl-lbl">基因预感</span><span class="gl-risk">${lv} · 不可预测度 <b class="num">${risk}%</b><i class="gl-meter"><i style="width:${risk}%"></i></i></span></div>
      <ul class="gl-hints">${(P.tags || []).slice(0, 4).map((t) => `<li>${esc(cleanTag(t))}</li>`).join('')}</ul>`;
  }
  function renderLab() {
    const L = labState, v = L.v, others = labOthers(v);
    if (L.mate && !others.some((x) => x.uid === L.mate)) L.mate = null;
    if (L.item && meta.itemCount(L.item) <= 0) L.item = null;
    const m = L.mate ? others.find((x) => x.uid === L.mate) : null, it = itemOf(L.item);
    const sc = lab.querySelector('#glScroll')?.scrollTop || 0;
    lab.innerHTML = `<button class="tk-x" aria-label="关闭">${ic('close')}</button>
      <div class="gl-hd"><div class="gl-k">基因实验室</div><b>基因改造</b><span>两条鱼融合成一个全新的生命</span></div>
      ${fxHTML(L, m, it)}
      <div class="gl-pick">${pickerHTML(L, others)}</div>
      <div class="gl-say">
        <div class="gl-row"><span class="gl-lbl">一句话方向 · 可选</span><button class="gl-insp" id="glInsp">${ic('sparkle')}换个灵感</button></div>
        <div class="gl-in"><input id="glIn" type="text" maxlength="${PROMPT_MAX}" enterkeyhint="done" autocomplete="off" placeholder="例如：${esc(INSP[L.insp % INSP.length])}" value="${esc(L.prompt)}"><em class="num" id="glCnt">${L.prompt.length}/${PROMPT_MAX}</em></div>
      </div>
      <div class="gl-pre" id="glPre">${preHTML(L, m)}</div>
      <div class="gl-foot">
        <p class="gl-warn">${m ? `『${esc(displayName(v))}』与『${esc(displayName(m))}』将融合为一个新生命，不再回到水族箱${it ? ` · 消耗 ${esc(it.name)} ×1` : ''}` : '两条鱼都会被消耗，融合为一个新生命'}</p>
        <button class="tk-btn main" id="glGo" ${m ? '' : 'disabled'}>${m ? `${ic('dna')}开始孵化 · ${fmtSec(EGG_DUR.synth || 90)}` : '先选一条鱼放进鱼槽'}</button>
      </div>`;
    fillThumbs(lab.querySelector('.gl-fx'), [v, m]);
    if (L.mode === 'fish') { const g = lab.querySelector('.gl-grid'); if (g) fillThumbs(g, others); }
    const s2 = lab.querySelector('#glScroll'); if (s2) s2.scrollTop = sc;
    lab.querySelector('.tk-x').onclick = () => { sfx.close(); closeLab(); };
    lab.querySelectorAll('[data-slot]').forEach((b) => b.onclick = () => { sfx.tap(); L.mode = b.dataset.slot; renderLab(); });
    lab.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { if (L.mode === b.dataset.mode) return; sfx.tap(); L.mode = b.dataset.mode; renderLab(); });
    lab.querySelectorAll('[data-mate]').forEach((b) => b.onclick = () => { sfx.tap(); vib(8); L.mate = L.mate === b.dataset.mate ? null : b.dataset.mate; renderLab(); });
    lab.querySelectorAll('[data-item]').forEach((b) => b.onclick = () => { sfx.tap(); vib(8); const id = b.dataset.item || null; L.item = L.item === id ? null : id; renderLab(); });
    const fb = lab.querySelector('#glFish'); if (fb) fb.onclick = () => { sfx.tap(); lab.classList.remove('show'); labState = null; hideAll(); close(); onExit?.(); };
    const inp = lab.querySelector('#glIn'), cnt = lab.querySelector('#glCnt');
    let preT = 0;
    const refreshPre = () => { const box = lab.querySelector('#glPre'); if (!box || !labState) return; box.innerHTML = preHTML(L, L.mate ? labOthers(v).find((x) => x.uid === L.mate) : null); box.classList.remove('upd'); void box.offsetWidth; box.classList.add('upd'); };
    inp.addEventListener('input', () => { if (inp.value.length > PROMPT_MAX) inp.value = inp.value.slice(0, PROMPT_MAX); L.prompt = inp.value; cnt.textContent = `${L.prompt.length}/${PROMPT_MAX}`; clearTimeout(preT); preT = setTimeout(refreshPre, 220); });
    ['keydown', 'keyup', 'keypress'].forEach((t) => inp.addEventListener(t, (e) => { e.stopPropagation(); if (t === 'keydown' && e.key === 'Enter') inp.blur(); }));
    lab.querySelector('#glInsp').onclick = () => { sfx.tap(); L.insp = (L.insp + 1 + ((Math.random() * (INSP.length - 2)) | 0)) % INSP.length; const t = INSP[L.insp]; inp.value = t; L.prompt = t; cnt.textContent = `${t.length}/${PROMPT_MAX}`; inp.placeholder = `例如：${t}`; refreshPre(); };
    const go = lab.querySelector('#glGo');
    go.onclick = () => { if (!go.disabled) submitSynth(); };
    const pre = lab.querySelector('#glPre'); pre.classList.add('upd');
  }
  async function submitSynth() {
    const L = labState; if (!L) return;
    const a = L.v, b = meta.findTank(L.mate); if (!b) return;
    const it = itemOf(L.item);
    const egg = meta.startSynthEgg({ a, b, item: L.item, prompt: L.prompt });
    if (!egg) { notify('改造没能开始<small>请检查鱼和道具是否还在</small>'); renderLab(); return; }
    await toEgg([a.uid, b.uid], egg, `它们正在融合为一个新生命<small>${fmtSec(egg.dur)} 后孵化${it ? ` · 已消耗 ${esc(it.name)}` : ''}</small>`);
  }
  async function toEgg(uids, egg, msg) {
    lab.classList.remove('show'); labState = null; hideAll(); busy = true; setHint(); sfx.eggify();
    await aq.playEggify(uids, egg);
    busy = false; sfx.sparkle(); refreshTop(); onChanged?.();
    notify(msg, false, 2600);
    cur = egg.uid; aq.select(egg.uid); showEggCard(egg); setHint();
  }

  // ---------------- 合成鱼揭晓卡 → 命名（必经）----------------
  function showSynthReveal(v, egg) {
    const ps = (egg.src || []).filter((x) => x && !x.egg).slice(0, 2), it = itemOf(egg.synItem ?? v.synItem);
    const R = rarInfo(v), tags = synTags(v);
    const ln = (x, i) => `<div class="ln"><img data-ugc="${i}" alt=""><span>${esc(displayName(x))}</span></div>`;
    reveal.innerHTML = `<div class="rv-card gl-rv">
      <div class="gl-k">新物种 · 第 ${v.gen || 1} 代 · ${R.label}</div>
      <div class="gl-rv-nm">${esc(displayName(v))}</div>
      <div class="gl-fp"><span class="num">№ ${esc(v.fp || '—')}</span><i></i><span>全宇宙唯一</span></div>
      <div class="gl-lin ${it ? 'has-it' : ''}">
        <div class="gl-lin-row">${ps[0] ? ln(ps[0], 0) : '<div class="ln"></div>'}${it ? `<div class="ln it"><em class="gl-ico" style="--ic:${it.color}">${it.emoji}</em><span>${esc(it.name)}</span></div>` : ''}${ps[1] ? ln(ps[1], 1) : '<div class="ln"></div>'}</div>
        <svg class="gl-lin-svg" viewBox="0 0 300 34" preserveAspectRatio="none" aria-hidden="true"><path d="M50 0C50 20 150 14 150 34"/><path d="M250 0C250 20 150 14 150 34"/>${it ? '<path d="M150 0V34" class="it"/>' : ''}</svg>
        <div class="gl-lin-new"><i></i><span>${fmtLenTxt(v.cm)} · ${esc(v.creator || ME_TAG())}</span></div>
      </div>
      ${tags.length ? `<div class="chips gl-chips c">${tags.map((t) => `<span>${esc(cleanTag(t))}</span>`).join('')}</div>` : ''}
      <button class="tk-btn main" id="rvName">为它命名</button></div>`;
    fillThumbs(reveal.querySelector('.gl-lin-row'), ps);
    reveal.classList.add('show'); setHint(); aq.select(v.uid);
    reveal.querySelector('#rvName').onclick = () => { sfx.tap(); showNaming(v, egg); };
  }
  const NM_A = ['雾', '霜', '琥珀', '月白', '鎏金', '墨', '珐琅', '丝绒', '薄荷', '玻璃'], NM_B = ['钥齿', '羽鳍', '灯笼', '长须', '折扇', '星点', '环纹', '透骨'], NM_C = ['鳗', '鲀', '鲷', '魟', '鲳', '鳐'];
  function rollName(v, prev) {
    for (let i = 0; i < 6; i++) {
      try { const n = SYN.synthName?.({ ...v, seed: (Math.random() * 4294967296) >>> 0 }); if (n && n !== prev) return n; } catch (e) { break; }
    }
    const p = (a) => a[(Math.random() * a.length) | 0];
    return `${p(NM_A)}${p(NM_B)}·${p(NM_C)}`;
  }
  function showNaming(v, egg) {
    const NAME_MAX = 14;
    const def = displayName(v);
    reveal.innerHTML = `<div class="rv-card gl-rv gl-name">
      <div class="gl-k">最后一步</div>
      <div class="gl-nm-t">给它起个名字</div>
      <div class="gl-nm-s">名字会一直跟着它 · 被别人钓到时也一样</div>
      <div class="gl-nm-in"><input id="nmIn" type="text" maxlength="${NAME_MAX}" enterkeyhint="done" autocomplete="off" value="${esc(def)}" placeholder="${esc(def)}"><button id="nmDice" aria-label="换一个名字">${DICE}<span>换一个</span></button></div>
      <div class="gl-nm-meta"><span class="num">№ ${esc(v.fp || '—')}</span><em class="num" id="nmCnt">${def.length}/${NAME_MAX}</em></div>
      <button class="tk-btn main" id="nmOk">${ic('check')}就叫这个</button></div>`;
    reveal.classList.add('show'); setHint(); aq.select(v.uid); card.classList.remove('show');
    const inp = reveal.querySelector('#nmIn'), cnt = reveal.querySelector('#nmCnt');
    const upd = () => { cnt.textContent = `${inp.value.length}/${NAME_MAX}`; };
    inp.addEventListener('input', () => { if (inp.value.length > NAME_MAX) inp.value = inp.value.slice(0, NAME_MAX); upd(); });
    ['keydown', 'keyup', 'keypress'].forEach((t) => inp.addEventListener(t, (e) => { e.stopPropagation(); if (t === 'keydown' && e.key === 'Enter') reveal.querySelector('#nmOk').click(); }));
    reveal.querySelector('#nmDice').onclick = () => { sfx.tap(); vib(8); inp.value = rollName(v, inp.value).slice(0, NAME_MAX); upd(); inp.classList.remove('roll'); void inp.offsetWidth; inp.classList.add('roll'); };
    reveal.querySelector('#nmOk').onclick = () => {
      const nm = inp.value.trim() || def;
      const nv = meta.nameFish(v.uid, nm); if (!nv) { reveal.classList.remove('show'); setHint(); return; }
      sfx.coin(); vib(20);
      reveal.classList.remove('show'); aq.select(null); setHint();
      meta.pushInbox(`你创造了新物种『${nv.name}』 · № ${nv.fp || '—'}`, 'synth');
      notify(`『${esc(nv.name)}』加入了你的水族箱<small>新物种 · № ${esc(nv.fp || '—')}</small>`, false, 2800);
      refreshBell(true); refreshTop(); onChanged?.();
    };
  }

  // ---------------- 每帧 ----------------
  const _o = {};
  let labelT = 0;
  function tick(dt) {
    if (!open) return;
    const now = Date.now();
    const { W, H } = size();
    labelT -= dt;
    if (labelT <= 0) { labelT = 0.25; if (!visit) updateEggCard(); refreshTop(); setHint(); }
    if (visit) return;
    for (const x of S.tank) if (x.egg) aq.setEggProgress(x.uid, 1 - meta.eggLeft(x, now) / x.dur);
    // 卵上方倒计时文字
    const eggs = S.tank.filter((x) => x.egg);
    const sheetUp = card.classList.contains('show') || lab.classList.contains('show') || reveal.classList.contains('show');
    // v1.3 主人卡在底部：卵标签落进卡片区域时隐藏（避免压字）
    const oc = $('tkOwnCard'), rr = root.getBoundingClientRect();
    const ownTop = oc.classList.contains('off') ? 1e9 : oc.getBoundingClientRect().top - rr.top - 4;
    for (const x of eggs) {
      let el = labels.querySelector(`[data-u="${x.uid}"]`);
      if (!el) { el = document.createElement('div'); el.className = 'tk-lb'; el.dataset.u = x.uid; labels.appendChild(el); }
      const left = meta.eggLeft(x, now);
      const txt = left <= 0 ? '孵好了！' : fmtSec(left);
      if (el.textContent !== txt) el.textContent = txt;
      el.classList.toggle('ready', left <= 0);
      aq.screenPos(x.uid, W, H, _o);
      // v1.3：孵好后不再挂「孵好了！」文字，靠卵本身呼吸光 + 主人卡「鱼」统计旁的小卵角标提示
      const hide = !_o.vis || busy || left <= 0 || (sheetUp && _o.y > H * 0.52) || _o.y > ownTop;
      el.style.opacity = hide ? 0 : 1;
      el.style.transform = `translate(${_o.x}px,${_o.y}px) translate(-50%,-100%)`;
    }
    for (const el of [...labels.children]) if (!eggs.some((x) => x.uid === el.dataset.u)) el.remove();
  }

  // ---------------- 腾位置面板（钓鱼画面抱鱼时：水族箱满了）----------------
  // onResult({ type: 'keep' })：已腾出位置并把新鱼收进水族箱；({ type: 'releaseNew', pts })：新鱼被放生
  function openRoom(newV, onResult) {
    const st = { mode: 'release', pick: [] };
    const card2 = room.querySelector('.rm-card');
    const list = () => [newV, ...S.tank];
    const render = () => {
      const L = list();
      const pickV = st.pick.map((u) => L.find((x) => (x.uid || x.id) === u)).filter(Boolean);
      let btn = '', dis = false;
      if (st.mode === 'release') {
        if (pickV.length) btn = `${ic('wave')}${esc(`放生『${displayName(pickV[0])}』 +${meta.releaseValue(pickV[0])} 分`)}`; else { btn = '先点一条要放生的鱼'; dis = true; }
      }
      card2.innerHTML = `<button class="tk-x" aria-label="关闭">${ic('close')}</button>
        <div class="rm-hd"><b>水族箱满了</b><span>放生一条，给新朋友腾个位置</span></div>
        <div class="rm-cap">点选任意一条放生（也可以是新鱼）· 它可能被别的玩家钓到</div>
        <div class="rm-grid">${L.map((x, i) => {
          const u = x.uid || x.id, on = st.pick.includes(u), isNew = i === 0;
          if (x.egg) return `<div class="rm-cell egg"><div class="em">${EGG_ORB}</div><span>孵化中</span></div>`;
          return `<button class="rm-cell ${on ? 'on' : ''} ${isNew ? 'new' : ''}" data-u="${u}">${isNew ? '<i class="nb">NEW</i>' : ''}<img data-ugc="${i}" alt=""><span>${esc(displayName(x))}</span>${st.mode === 'release' ? `<em>+${meta.releaseValue(x)}</em>` : ''}</button>`;
        }).join('')}</div>
        <button class="tk-btn main" id="rmGo" ${dis ? 'disabled' : ''}>${btn}</button>`;
      fillThumbs(card2.querySelector('.rm-grid'), L);
      card2.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => {
        sfx.tap(); const u = b.dataset.u;
        if (st.mode === 'release') st.pick = [u];
        else if (st.pick.includes(u)) st.pick = st.pick.filter((x) => x !== u);
        else { st.pick.push(u); if (st.pick.length > 2) st.pick.shift(); }
        render();
      });
      card2.querySelector('.tk-x').onclick = () => {
        sfx.tap(); const pts = meta.releaseValue(newV);
        roomConfirm(`<div class="cf-ic">${ic('wave')}</div><h3>不腾位置的话…</h3><p>这条新鱼『${esc(displayName(newV))}』会被放生回大海</p>`, `放生新鱼 +${pts} 分`, () => finish({ type: 'releaseNew', pts: meta.releaseFish(newV) }), '继续选');
      };
      card2.querySelector('#rmGo').onclick = () => {
        if (dis) return;
        const nu = newV.uid || newV.id;
        if (st.mode === 'release') {
          const u = st.pick[0];
          if (u === nu) return finish({ type: 'releaseNew', pts: meta.releaseFish(newV) });
          const old = meta.findTank(u); const pts = meta.releaseFish(u); meta.addToTank(newV);
          return finish({ type: 'keep', pts, released: old });
        }
      };
    };
    const finish = (r) => { room.classList.add('hidden'); room.classList.remove('show'); onChanged?.(); onResult?.(r); };
    room.classList.remove('hidden'); requestAnimationFrame(() => room.classList.add('show'));
    sfx.open(); render();
  }
  function roomConfirm(html, okTxt, onOk, cancelTxt) {
    let c = room.querySelector('.tk-confirm');
    if (!c) { c = h('<div class="tk-confirm"><div class="box"></div></div>'); room.appendChild(c); }
    const box = c.querySelector('.box');
    box.innerHTML = `${html}<button class="tk-btn main" id="cfOk">${esc(okTxt)}</button><button class="tk-btn ghost" id="cfNo">${esc(cancelTxt)}</button>`;
    c.classList.add('show');
    box.querySelector('#cfOk').onclick = () => { c.classList.remove('show'); onOk(); };
    box.querySelector('#cfNo').onclick = () => { c.classList.remove('show'); };
  }

  return {
    // v0.9 串门社交：main.js 每秒 meta.socialTick → 这里展示（toast + 铃铛 + 水族箱同步）
    onSocial(evs) {
      if (!evs || !evs.length) return;
      const e = evs[evs.length - 1];
      notify(esc(e.text).replace(/ · /, '<small>') + (/ · /.test(e.text) ? '</small>' : ''), false, 3600);
      try { sfx.oceanBell?.(false); } catch (err) { /* */ }
      refreshBell(true);
      if (open && !visit && !busy) { aq.sync(S.tank); refreshTop(); }
      else if (open && visit) refreshVisitOwner();
      onChanged?.();
    },
    get busyish() { return busy || loading || lab.classList.contains('show') || reveal.classList.contains('show') || conf.classList.contains('show') || give.classList.contains('show') || card.classList.contains('show'); },
    open: openTank, close, tick, visitFriend: (id) => { const f = FRIENDS.find((x) => x.id === id); if (open && f && !busy) visitFriend(f); }, backHome: () => { if (open && visit && !busy) backHome(); }, get visiting() { return !!visit; }, notify: (html, gold, ms) => { notify(html, gold, ms); refreshBell(true); }, openRoom, openInbox, unread, debugHatch: (uid) => hatch(uid), debugTap: (uid) => onTap(uid), openThemes, get theme() { return visit ? visit.owner.theme : myTheme(); },
    setTheme: (id) => { if (!THEMES[id]) return; S.aquaTheme = id; meta.save(); if (open && !visit) { ownerKey = ''; refreshTop(); enterScene(S.tank, id, `正在布置${themeLabel(id)}`, false); } },
    get isOpen() { return open; },
    get busy() { return busy; },
    get loading() { return loading; },
    roomOpen: () => !room.classList.contains('hidden'),
    refresh: () => { if (open && !visit) { aq.sync(S.tank); refreshTop(); setHint(); } },
  };
}
