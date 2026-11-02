// 水族箱页面 DOM 与流程（DESIGN §2.1–2.4）：顶栏 / 鱼卡 / 卵卡 / 基因改造面板 / 孵化揭晓卡 / 腾位置面板
// 每一步只有一个最明显的大按钮 + 动词文案；样式见 index.html「水族箱 v2」段（深色玻璃社交主页风）
// v2：顶部 = 当前水族箱主人信息卡（owner 可替换：{ id, name, avatar, color, level, title, stats, readonly }）；可去好友水族箱串门（只读）
import { SPECIES_BY_ID, RARITY, displayName, makeVariant, SPECIES } from './fishes.js';
import { TANK_MAX, EGG_DUR, ROOM, OFFLINE, levelTitle, ME_TAG, normFish } from './meta.js';
import { fillThumbs, fmtLenTxt, avatars, bagView, bindBag } from './ui.js';
import { sfx } from './sfx.js';
import { ic, CAT_IC, CAT_SHORT } from './icons.js';
import { THEMES, THEME_IDS, DEFAULT_THEME, themeOf, themeLabel, themeForFriend } from './aqua_themes.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rarOf = (v) => v.rarity || SPECIES_BY_ID[v.sp]?.rarity || 'common';
const rb = (v) => { const R = RARITY[rarOf(v)]; return `<span class="rb" style="background:${R.color}">${R.short}</span>`; };
const fmtSec = (s) => { s = Math.ceil(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const ORIGIN = (v) => { const h = v.history?.[v.history.length - 1]; if (v.fromOcean) return `来自 ${v.fromOcean.by} 的水族箱`; if (!h || h.type === 'catch') return v.gen ? '改造' : '钓到的'; return h.type === 'fuse' ? '融合孵化' : '基因改造'; };
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

export function createTankUI({ meta, aq, genes, app, onExit, onChanged, size }) {
  const S = meta.S;
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
    </div>
    <div class="tk-sheet" id="tkFriends"></div>
    <div class="tk-toast" id="tkToast"></div>
    <div class="tk-sheet" id="tkCard"></div>
    <div class="tk-sheet tall" id="tkLab"></div>
    <div class="tk-sheet" id="tkInbox"></div>
    <div class="tk-sheet" id="tkBagSh"></div>
    <div class="tk-sheet" id="tkThemeSh"></div>
    <div class="tk-reveal" id="tkReveal"></div>
    <div class="tk-confirm" id="tkConfirm"><div class="box"></div></div>
  </div>`);
  app.appendChild(root);
  const room = h(`<div id="room" class="hidden"><div class="rm-card"></div></div>`);
  app.appendChild(room);
  const $ = (id) => root.querySelector('#' + id);
  const themeSh = $('tkThemeSh');
  const card = $('tkCard'), lab = $('tkLab'), reveal = $('tkReveal'), conf = $('tkConfirm'), labels = $('tkLabels'), inbox = $('tkInbox'), friends = $('tkFriends'), bagSh = $('tkBagSh');
  let open = false, cur = null, busy = false, labState = null;
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
  // 好友水族箱（只读）：按好友 id 生成一缸随机鱼（本次会话内固定）
  const friendCache = {};
  const FRIENDS = [...ROOM.slice(1), ...OFFLINE.slice(0, 2)];
  function friendOwner(f) {
    if (friendCache[f.id]) return friendCache[f.id];
    const hs = hashStr(f.id), n = 7 + (hs % 5);
    const pool = SPECIES.filter((x) => !x.odd);
    const tank = [];
    for (let i = 0; i < n; i++) {
      let v = makeVariant(pool[((hs >>> (i % 16)) + i * 13) % pool.length], 0.35);
      if (i < 3 && genes.designFromPrompt && genes.GENE_TAGS) {
        try { const tg = genes.GENE_TAGS[(hs + i * 11) % genes.GENE_TAGS.length]; const r = genes.designFromPrompt(v, { prompt: tg.label, creator: '@' + f.name }, (hs + i * 2654435761) >>> 0); if (r?.v) { v = r.v; v.creator = '@' + f.name; } } catch (e) { /* */ }
      }
      v.uid = v.id = `fr-${f.id}-${i}-${v.id || i}`; normFish(v);
      tank.push(v);
    }
    const works = tank.filter((x) => x.creator === '@' + f.name).length + (hs % 4);
    const caught = 3 + (hs % 37), level = 3 + (hs % 13);
    const o = {
      id: f.id, name: f.name, avatar: avatars[f.id] || null, color: f.color, level, title: levelTitle(level), readonly: true, theme: f.theme && THEMES[f.theme] ? f.theme : themeForFriend(FRIENDS.indexOf(f), DEFAULT_THEME),
      stats: [{ k: '鱼', v: `${tank.length}/${TANK_MAX}` }, { k: '创作作品', v: works }, { k: '被钓到', v: caught }, { k: '创作分', v: caught * 15 }], tank,
    };
    friendCache[f.id] = o; return o;
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
      if (id !== myTheme()) { S.aquaTheme = id; meta.save(); aq.setTheme(id); refreshTop(); notify(`水族馆换成了 <b>${esc(themeLabel(id))}</b>`, false, 1800); }
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
    visit = { owner: o, tank: o.tank };
    labels.innerHTML = '';
    const { W, H } = size(); aq.open(o.tank, W, H, { reset: true, theme: o.theme }); aq.onTap = onTap;
    hideAll(); refreshTop(); setHint();
    notify(`来到 <b>${esc(o.name)}</b> 的水族箱<small>只能看看 · 点鱼可以点赞</small>`, false, 2200);
  }
  function backHome() {
    visit = null; labels.innerHTML = '';
    const { W, H } = size(); aq.open(S.tank, W, H, { reset: true, theme: myTheme() }); aq.onTap = onTap;
    hideAll(); refreshTop(); setHint();
  }

  // ---------------- 我的动态（S.inbox）：铃铛 + 红点 → 底部列表 ----------------
  const IB_IC = { creator: ic('palette'), caught: ic('rod'), release: ic('wave'), hatch: EGG_ORB, info: ic('sparkle') };   // v1.1：通知图标统一 SVG
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
      <div class="dr-hd"><span class="bd" style="background:var(--sky-l,#e6f4ff);color:var(--sky-t,#2f7fc4)">${BELL_SVG}</span><div class="t"><b>我的动态</b><span>放生的鱼、你的作品被谁钓到，都在这里</span></div></div>
      ${S.inbox.length ? `<div class="ib-list">${S.inbox.map((x) => `<div class="ib-it ${esc(x.kind)} ${x.t > seen ? 'new' : ''}"><div class="ic">${IB_IC[x.kind] || IB_IC.info}</div><div class="m">${ibHi(x.text)}<small>${ago(x.t)}</small></div></div>`).join('')}</div>`
        : `<div class="ib-empty"><b>${ic('wave')}</b>还没有动态～<br>把鱼放生回大海，它被别人钓到时会通知你</div>`}`;
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
        <div class="dr-hd" style="margin-bottom:10px"><span class="bd" style="background:var(--lemon-l);color:var(--lemon-t)">${ic('bag')}</span><div class="t"><b>我的背包 · ${meta.bagTotal()} 个道具</b><span>点一条鱼 → 基因改造，就能用上它们</span></div></div>
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
    root.querySelector('#tkVisit').classList.toggle('next', !!visit);
    const va = $('tkVisitAvs'); if (va.dataset.k !== String(Object.keys(avatars).length)) { va.dataset.k = String(Object.keys(avatars).length); va.innerHTML = avs; }
  }
  function setHint() {
    // v1.3：底部提示条（tkHint）取消；任何底部面板/揭晓/确认/引导弹出时，底部主人卡淡出，关闭后淡回
    const anyOpen = card.classList.contains('show') || lab.classList.contains('show') || reveal.classList.contains('show') || inbox.classList.contains('show') || friends.classList.contains('show') || bagSh.classList.contains('show') || themeSh.classList.contains('show') || conf.classList.contains('show') || !!root.querySelector('.tk-tip');
    const oc = $('tkOwnCard'), off = anyOpen || busy;
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
    const { W, H } = size(); aq.open(S.tank, W, H, { reset: true, theme: myTheme() });
    aq.onTap = onTap;
    hideAll(); refreshTop(); refreshBell(true); setHint(); tick(0);
    // 新手引导（只一次）：首次进入水族箱 → "点一条鱼，试试基因改造"
    if (!tut.get('tankTip') && meta.tankFish().length) {
      tut.set('tankTip');
      const tip = h(`<div class="tk-tip">点一条鱼，试试基因改造<small>用钓到的道具装扮它，它会变成一颗神奇的卵</small><button>好嘞</button></div>`);
      root.appendChild(tip); setHint();
      const done = () => { tip.remove(); setHint(); };
      tip.querySelector('button').onclick = () => { sfx.tap(); done(); };
      setTimeout(() => tip.isConnected && done(), 6000);
    }
  }
  function close() {
    open = false; visit = null; root.classList.add('hidden'); hideAll(); aq.close(); labels.innerHTML = '';
  }
  function hideAll() { themeSh.classList.remove('show'); bagSh.classList.remove('show'); friends.classList.remove('show'); inbox.classList.remove('show'); card.classList.remove('show'); lab.classList.remove('show'); reveal.classList.remove('show'); conf.classList.remove('show'); cur = null; aq.select(null); }

  function onTap(uid) {
    const tip = root.querySelector('.tk-tip'); if (tip) { tip.remove(); setHint(); }
    if (inbox.classList.contains('show') || friends.classList.contains('show') || bagSh.classList.contains('show') || themeSh.classList.contains('show')) { inbox.classList.remove('show'); friends.classList.remove('show'); bagSh.classList.remove('show'); themeSh.classList.remove('show'); setHint(); return; }
    if (busy || reveal.classList.contains('show') || conf.classList.contains('show')) return;
    if (lab.classList.contains('show')) return;
    if (!uid) { if (card.classList.contains('show')) { hideAll(); setHint(); } return; }
    sfx.tap();
    const x = findCur(uid); if (!x) return;
    cur = uid; aq.select(uid);
    if (visit) { showVisitCard(x); setHint(); return; }
    x.egg ? showEggCard(x) : showFishCard(x);
    setHint();
  }

  // ---------------- 鱼卡 ----------------
  // 介绍牌（动森博物馆式）：名字 / 大小 / 来历 / 一两句有趣的描述 / 作品名与创作者
  function plaqueDesc(v) {
    const sp = SPECIES_BY_ID[v.sp]; const out = [];
    if (sp?.desc) out.push(sp.desc);
    const tags = genes.geneSummary(v);
    if (v.mut) out.push('身上带着罕见的突变光泽，在水里会微微发亮。');
    else if (tags.length) out.push(`据说它「${tags.slice(0, 2).join('」「')}」的样子，是改造时留下的小秘密。`);
    else if (v.note) out.push(v.note);
    return out.slice(0, 2).join(' ');
  }
  function plaqueHTML(v, kicker) {
    const sp = SPECIES_BY_ID[v.sp], R = RARITY[rarOf(v)], tags = genes.geneSummary(v);
    return `<button class="tk-x" aria-label="关闭">${ic('close')}</button>
      <div class="pl-k"><i></i>${esc(kicker)}</div>
      <div class="pl-hd"><img class="fc-th" data-ugc="0" alt=""><div class="fc-m">
        <div class="pl-nm">${esc(displayName(v))} ${rb(v)}</div>
        <div class="pl-meta"><span>${esc(sp.name)}</span><span>${R.label}</span><span><b>${fmtLenTxt(v.cm)}</b></span>${v.gen ? `<span>第 ${v.gen} 代</span>` : ''}${v.mut ? '<span class="mut">突变</span>' : ''}</div>
      </div></div>
      <div class="pl-desc">${esc(plaqueDesc(v))}</div>
      <div class="pl-by">${v.title ? `作品《${esc(v.title)}》 · ` : ''}创作者 <b>${esc(v.creator || '@大海')}</b> · ${esc(ORIGIN(v))}</div>
      ${tags.length ? `<div class="chips">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}`;
  }
  function showFishCard(v) {
    const pts = meta.releaseValue(v);
    card.innerHTML = `${plaqueHTML(v, '水族箱藏品')}
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
    card.innerHTML = `${plaqueHTML(v, `${o.name} 的藏品${v.creator === '@' + o.name ? ' · TA 的作品' : ''}`)}
      <div class="pl-acts"><button class="tk-btn main" id="fcLike" ${on ? 'disabled' : ''}>${on ? `${ic('check')}已点赞` : `${ic('heart')}赞一下`}</button></div>`;
    fillThumbs(card, [v]);
    card.querySelector('.tk-x').onclick = () => { sfx.close(); hideAll(); setHint(); };
    card.querySelector('#fcLike').onclick = () => { if (liked.has(v.uid)) return; liked.add(v.uid); sfx.coin(); vib(20); floatPts('👍'); showVisitCard(v); };
    card.classList.add('show');
  }

  function confirmRelease(v, pts) {
    sfx.tap();
    showConfirm(`<div class="cf-ic">${ic('wave')}</div><h3>放生「${esc(displayName(v))}」？</h3><p>它会游向大海，也许会被别人钓到～</p>`,
      `放生 +${pts} 分`, async () => {
        hideAll(); busy = true; setHint();
        sfx.releaseSplash();
        await aq.playRelease(v.uid);
        const got = meta.releaseFish(v.uid);
        meta.pushInbox(`你把「${displayName(v)}」放生了，它正游向大海～`, 'release');
        busy = false; sfx.coin(); floatPts(`+${got} 分`);
        const w = h(`<div class="rel-wave"><b>游向大海了</b><br><span>也许会被别人钓到，到时候通知你</span></div>`); root.appendChild(w); setTimeout(() => w.remove(), 2400);
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
        <div class="fc-nm">${egg.kind === 'fuse' ? '融合卵' : '改造卵'}</div>
        <div class="fc-sub" id="egSub"></div></div></div>
      <div class="eg-bar"><i id="egBar"></i></div>
      <button class="tk-btn main gold" id="egGo"></button>
      <div class="eg-note" id="egNote"></div>`;
    card.querySelector('.tk-x').onclick = () => { sfx.close(); hideAll(); setHint(); };
    card.querySelector('#egGo').onclick = () => hatch(egg.uid);
    card.classList.add('show');
    updateEggCard();
  }
  function updateEggCard() {
    if (!cur || !card.classList.contains('show')) return;
    const egg = meta.findTank(cur); if (!egg || !egg.egg) return;
    const left = meta.eggLeft(egg), ready = left <= 0;
    const sub = card.querySelector('#egSub'); if (!sub) return;
    sub.textContent = ready ? '孵好了！快看看是什么' : `还要 ${fmtSec(left)} · 里面隐约有条鱼在动`;
    card.querySelector('#egBar').style.width = `${(1 - left / egg.dur) * 100}%`;
    const go = card.querySelector('#egGo'); const txt = ready ? '孵化！' : '派对加速 · 立即孵化';
    if (go.dataset.t !== txt) { go.dataset.t = txt; go.innerHTML = `${ready ? EGG_ORB : ic('bolt')}${txt}`; }
    go.classList.toggle('ready', ready);
    card.querySelector('#egNote').textContent = ready ? '' : '派对加速：试玩期间免费、无限次';
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
    meta.pushInbox(`${res.egg.kind === 'fuse' ? '融合卵' : '改造卵'}孵出了「${displayName(res.v)}」${res.v.mut ? '（突变！）' : ''}`, 'hatch');
    busy = false;
    showReveal(res.v, res.egg);
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
    const R = RARITY[rarOf(v)];
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

  // ---------------- 基因改造面板 ----------------
  function openLab(v) {
    // v1.1：改造 = 选背包里钓上来的奇妙装饰物（≤3 个）；tab 'items' / 'fuse'
    labState = { v, tab: 'items', pick: [], cat: 'all', mate: null };
    card.classList.remove('show');
    renderLab(); lab.classList.add('show'); setHint();
  }
  function closeLab() { lab.classList.remove('show'); labState = null; const v = cur && meta.findTank(cur); if (v && !v.egg) showFishCard(v); setHint(); }
  // ---------------- 装扮间（道具改造）：大预览 + 3 槽 + 分类 chip + 背包网格 + 预览文案 + 主按钮 ----------------
  // 预览：同一组道具用固定 seed 生成一条「预览鱼」，复用缩略图渲染（只看样子，真正结果孵化时再掷骰子）
  const pvCache = new Map();
  function previewFish(v, ids) {
    if (!ids.length) return v;
    const key = `${v.uid}|${ids.join(',')}`;
    if (pvCache.has(key)) return pvCache.get(key);
    let pv = v;
    try { pv = genes.designFromItems(v, ids, hashStr(key)).v; pv.id = 'pv-' + hashStr(key); } catch (e) { console.warn(e); }
    pvCache.set(key, pv); return pv;
  }
  function stageHTML(L, v) {
    const it = (i) => genes.ITEM_BY_ID[L.pick[i]];
    const slots = [0, 1, 2].map((i) => { const x = it(i); return x
      ? `<button class="dr-slot f" data-unpick="${x.id}" aria-label="取下${esc(x.name)}" style="--ic:${x.color}66;--rc:${genes.ITEM_RARITY[x.rarity].color}">${x.emoji}<i class="x">${ic('close')}</i></button>`
      : `<div class="dr-slot">${ic('plus')}</div>`; }).join('');
    return `<div class="dr-stage" id="drStage"><span class="pvt ${L.pick.length ? 'on' : ''}">${L.pick.length ? '改造预览' : '现在的样子'}</span><i class="spin"></i>
      <img class="pv" data-ugc="0" alt=""><div class="dr-slots">${slots}</div></div>`;
  }
  function itemsBody(L, v) {
    const bag = meta.bagList();
    if (!bag.length) return `${stageHTML(L, v)}<div class="dr-empty" id="lbItEmpty"><div class="art"><i style="--c:#ffd3d9;width:18px;height:18px;left:4px;top:18px"></i><i style="--c:#c9f2ea;width:12px;height:12px;right:8px;top:8px"></i><i style="--c:#e3ddff;width:14px;height:14px;right:0;bottom:22px"></i>${ic('bag')}</div>
      <b>背包空空的</b><span>去钓鱼获得道具吧！</span><small>约 20% 会钓上漂流瓶 / 贝壳包，鱼嘴里也可能叼着道具</small></div>
      <div class="dr-foot"><button class="tk-btn main" id="lbFish">${ic('rod')}去钓鱼</button></div>`;
    L.pick = L.pick.filter((id) => meta.itemCount(id) > 0);
    const C = genes.ITEM_CATS, RR = genes.ITEM_RARITY;
    const cats = ['all', ...Object.keys(C).filter((k) => bag.some((x) => x.cat === k))];
    if (!cats.includes(L.cat)) L.cat = 'all';
    const list = bag.filter((x) => L.cat === 'all' || x.cat === L.cat);
    const full = L.pick.length >= genes.MAX_PICK;
    const P = genes.previewItems(v, L.pick);
    const prev = L.pick.length
      ? `将会：${P.tags.map((t) => `<b style="${t.warn ? 'color:var(--ink3)' : ''}">${t.emoji}${esc(t.text)}</b>`).join('、')} · <span class="mu">变异率 ${P.mutPct}%</span>${P.mut.rare > 0.07 ? `（珍稀 ${Math.round(P.mut.rare * 100)}%）` : ''}`
      : `点下面的道具装扮它，最多 ${genes.MAX_PICK} 个 · 基础变异率 ${genes.previewItems(v, ['d_shades']).mutPct}%`;
    const egg = P.combos.length ? `<div class="dr-egg">${ic('sparkle')}触发彩蛋「${esc(P.combos[0].title)}」${P.combos.length > 1 ? ` 等 ${P.combos.length} 个` : ''}</div>` : '';
    return `${stageHTML(L, v)}
      <div class="dr-cats">${cats.map((k) => `<button class="chip ${L.cat === k ? 'on' : ''}" data-icat="${k}">${k === 'all' ? `${ic('bag')}全部<small class="num">${meta.bagTotal()}</small>` : CAT_SHORT[k]}</button>`).join('')}</div>
      <div class="dr-scroll" id="lbItGrid"><div class="it-grid">${list.map((x) => { const on = L.pick.indexOf(x.id); return `<button class="it lb-it ${on >= 0 ? 'on' : full ? 'dim' : ''}" data-item="${x.id}" style="--ic:${x.color}55;--rc:${RR[x.rarity].color}" title="${esc(x.desc)}"><span class="ct num">×${x.n}</span>${on >= 0 ? `<span class="ck">${on + 1}</span>` : ''}<span class="ico">${x.emoji}</span><span class="nm">${esc(x.name)}</span></button>`; }).join('')}</div></div>
      <div class="dr-foot"><div id="lbItPrev"><div class="dr-pv">${prev}</div>${egg}</div>
        <button class="tk-btn main" id="lbGo" ${L.pick.length ? '' : 'disabled'}>${L.pick.length ? `${ic('dna')}开始改造 · 孵化 ${EGG_DUR.items || 60} 秒` : '先选 1 个道具'}</button></div>`;
  }
  function fuseBody(L, v, others) {
    if (!others.length) return `<div class="dr-stage"><div class="dr-duo"><div class="o"><img data-ugc="0" alt=""><span>${esc(displayName(v))}</span></div><em>${ic('plus')}</em><div class="o"><div class="ph">${ic('fish')}</div><span>&nbsp;</span></div></div></div>
      <div class="dr-empty"><b>水族箱里只有它一条鱼</b><span>再钓一条回来就能融合啦</span></div>`;
    const m = L.mate ? others.find((x) => x.uid === L.mate) : null;
    return `<div class="dr-stage"><div class="dr-duo"><div class="o"><img data-ugc="0" alt=""><span>${esc(displayName(v))}</span></div><em>${ic('plus')}</em>
        <div class="o">${m ? `<img data-ugc="1" alt=""><span>${esc(displayName(m))}</span>` : `<div class="ph">${ic('fish')}</div><span>选第二条</span>`}</div></div>
        ${m ? `<div class="dr-inh">${inherit(v).map((t) => `<span>${esc(t)}</span>`).join('')}${inherit(m).map((t) => `<span class="b">${esc(t)}</span>`).join('')}</div>` : ''}</div>
      <div class="lb-cap">选第二条鱼，和「${esc(displayName(v))}」融合</div>
      <div class="dr-scroll"><div class="lb-grid">${others.map((x, i) => `<button class="lb-cell ${L.mate === x.uid ? 'on' : ''}" data-mate="${x.uid}"><img data-ugc="${i}" alt=""><span>${esc(displayName(x))}</span></button>`).join('')}</div></div>
      <div class="dr-foot"><div class="dr-pv">${m ? '可能继承两边的特征 · <b>融合会消耗这两条</b>' : '两条鱼会变成一颗融合卵（只占 1 格）'}</div>
        <button class="tk-btn main" id="lbGo" ${m ? '' : 'disabled'}>${m ? `${ic('fuse')}融合 · 孵化 ${EGG_DUR.fuse} 秒` : '先选一条鱼'}</button></div>`;
  }
  function renderLab() {
    const L = labState, v = L.v;
    const others = meta.tankFish().filter((x) => x.uid !== v.uid);
    const body = L.tab === 'items' ? itemsBody(L, v) : fuseBody(L, v, others);
    lab.innerHTML = `<button class="tk-x" aria-label="关闭">${ic('close')}</button>
      <div class="dr-hd"><span class="bd">${ic(L.tab === 'items' ? 'dna' : 'fuse')}</span><div class="t"><b>${L.tab === 'items' ? '装扮间 · 基因改造' : '基因融合'}</b><span>${esc(displayName(v))}</span></div></div>
      <div class="lb-tabs"><button data-tab="items" class="${L.tab === 'items' ? 'on' : ''}">${ic('bow')}道具装扮</button><button data-tab="fuse" class="${L.tab === 'fuse' ? 'on' : ''}">${ic('fuse')}融合</button></div>
      ${body}`;
    if (L.tab === 'items') {
      const st = lab.querySelector('#drStage'), pv = previewFish(v, L.pick);
      if (st) { if (pv !== v && !pvCache.get('ok' + pv.id)) { st.classList.add('busy'); const im = st.querySelector('.pv'); const done = () => { st.classList.remove('busy'); pvCache.set('ok' + pv.id, 1); }; im.addEventListener('load', done, { once: true }); setTimeout(done, 2500); } fillThumbs(st, [pv]); }
    } else {
      const m = L.mate ? others.find((x) => x.uid === L.mate) : null;
      const duo = lab.querySelector('.dr-duo'); if (duo) fillThumbs(duo, [v, m]);
      const g = lab.querySelector('.lb-grid'); if (g) fillThumbs(g, others);
    }
    lab.querySelector('.tk-x').onclick = () => { sfx.close(); closeLab(); };
    lab.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { if (L.tab === b.dataset.tab) return; sfx.tap(); L.tab = b.dataset.tab; renderLab(); });
    lab.querySelectorAll('[data-icat]').forEach((b) => b.onclick = () => { sfx.tap(); L.cat = b.dataset.icat; renderLab(); });
    lab.querySelectorAll('[data-item]').forEach((b) => b.onclick = () => {
      const id = b.dataset.item, i = L.pick.indexOf(id);
      if (i >= 0) L.pick.splice(i, 1);
      else if (L.pick.length >= genes.MAX_PICK) { notify(`最多同时用 ${genes.MAX_PICK} 个道具～先点掉一个`); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); return; }
      else L.pick.push(id);
      sfx.tap(); vib(8);
      const sc = lab.querySelector('#lbItGrid')?.scrollTop || 0; renderLab();
      const g2 = lab.querySelector('#lbItGrid'); if (g2) g2.scrollTop = sc;
      const nb = lab.querySelector(`[data-item="${id}"]`); if (nb && i < 0) nb.classList.add('pop');
    });
    lab.querySelectorAll('[data-unpick]').forEach((b) => b.onclick = () => { sfx.tap(); L.pick = L.pick.filter((x) => x !== b.dataset.unpick); const sc = lab.querySelector('#lbItGrid')?.scrollTop || 0; renderLab(); const g2 = lab.querySelector('#lbItGrid'); if (g2) g2.scrollTop = sc; });
    const fb = lab.querySelector('#lbFish'); if (fb) fb.onclick = () => { sfx.tap(); lab.classList.remove('show'); labState = null; hideAll(); close(); onExit?.(); };
    lab.querySelectorAll('[data-mate]').forEach((b) => b.onclick = () => { sfx.tap(); L.mate = b.dataset.mate; const sc = lab.querySelector('.dr-scroll')?.scrollTop || 0; renderLab(); const g2 = lab.querySelector('.dr-scroll'); if (g2) g2.scrollTop = sc; });
    const go = lab.querySelector('#lbGo');
    if (go) go.onclick = () => { if (go.disabled) return; L.tab === 'items' ? submitItems() : submitFuse(); };
  }
  function inherit(v) { const g = genes.geneSummary(v); const sp = SPECIES_BY_ID[v.sp]; return [`${sp.name}体型`, ...g].slice(0, 2); }

  async function submitItems() {
    const L = labState, v = L.v;
    const r = meta.startItemEgg(v, L.pick);
    if (!r) { notify('道具数量不够了，再去钓一些吧'); renderLab(); return; }
    await toEgg([v.uid], r.egg, `变成改造卵啦！<small>用了 ${r.egg.items.map((id) => genes.ITEM_BY_ID[id].emoji).join('')} · ${EGG_DUR.items || 60} 秒后孵化 · 点卵可以派对加速</small>`);
  }
  async function submitFuse() {
    const L = labState, a = L.v, b = meta.findTank(L.mate); if (!b) return;
    const res = genes.fuseFish(a, b, (Math.random() * 4294967296) >>> 0);
    const egg = meta.startEgg('fuse', [a, b], res.v);
    egg.changes = [...(res.fromA || []).map((x) => `🧬 来自「${displayName(a)}」：${x}`), ...(res.fromB || []).map((x) => `🧬 来自「${displayName(b)}」：${x}`), ...(res.changes || [])];
    meta.save();
    await toEgg([a.uid, b.uid], egg, `融合成一颗卵！<small>${EGG_DUR.fuse} 秒后孵化 · 点卵可以派对加速</small>`);
  }
  async function toEgg(uids, egg, msg) {
    lab.classList.remove('show'); labState = null; hideAll(); busy = true; setHint(); sfx.eggify();
    await aq.playEggify(uids, egg);
    busy = false; sfx.sparkle(); refreshTop(); onChanged?.();
    notify(msg, false, 2600);
    cur = egg.uid; aq.select(egg.uid); showEggCard(egg); setHint();
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
        if (pickV.length) btn = `${ic('wave')}${esc(`放生「${displayName(pickV[0])}」 +${meta.releaseValue(pickV[0])} 分`)}`; else { btn = '先点一条要放生的鱼'; dis = true; }
      } else if (pickV.length === 2) btn = `${ic('fuse')}融合成一颗卵！`; else { btn = `选两条鱼融合（${pickV.length}/2）`; dis = true; }
      card2.innerHTML = `<button class="tk-x" aria-label="关闭">${ic('close')}</button>
        <div class="rm-hd"><b>水族箱满了！</b><span>腾个位置给新朋友</span></div>
        <div class="lb-tabs"><button data-m="release" class="${st.mode === 'release' ? 'on' : ''}">${ic('wave')}放生一条</button><button data-m="fuse" class="${st.mode === 'fuse' ? 'on' : ''}">${ic('fuse')}融合两条</button></div>
        <div class="rm-cap">${st.mode === 'release' ? '点选任意一条（也可以是新鱼）放生换积分' : '选两条融合成 1 颗卵（占 1 格），新鱼就能进箱'}</div>
        <div class="rm-grid">${L.map((x, i) => {
          const u = x.uid || x.id, on = st.pick.includes(u), isNew = i === 0;
          if (x.egg) return `<div class="rm-cell egg"><div class="em">${EGG_ORB}</div><span>孵化中</span></div>`;
          return `<button class="rm-cell ${on ? 'on' : ''} ${isNew ? 'new' : ''}" data-u="${u}">${isNew ? '<i class="nb">NEW</i>' : ''}<img data-ugc="${i}" alt=""><span>${esc(displayName(x))}</span>${st.mode === 'release' ? `<em>+${meta.releaseValue(x)}</em>` : ''}</button>`;
        }).join('')}</div>
        <button class="tk-btn main" id="rmGo" ${dis ? 'disabled' : ''}>${btn}</button>`;
      fillThumbs(card2.querySelector('.rm-grid'), L);
      card2.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { if (st.mode === b.dataset.m) return; sfx.tap(); st.mode = b.dataset.m; st.pick = []; render(); });
      card2.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => {
        sfx.tap(); const u = b.dataset.u;
        if (st.mode === 'release') st.pick = [u];
        else if (st.pick.includes(u)) st.pick = st.pick.filter((x) => x !== u);
        else { st.pick.push(u); if (st.pick.length > 2) st.pick.shift(); }
        render();
      });
      card2.querySelector('.tk-x').onclick = () => {
        sfx.tap(); const pts = meta.releaseValue(newV);
        roomConfirm(`<div class="cf-ic">${ic('wave')}</div><h3>不腾位置的话…</h3><p>这条新鱼「${esc(displayName(newV))}」会被放生回大海</p>`, `放生新鱼 +${pts} 分`, () => finish({ type: 'releaseNew', pts: meta.releaseFish(newV) }), '继续选');
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
        const [a, b] = st.pick.map((u) => (u === nu ? newV : meta.findTank(u)));
        const res = genes.fuseFish(a, b, (Math.random() * 4294967296) >>> 0);
        const hasNew = st.pick.includes(nu);
        // 新鱼还不在箱里：只从箱里移除另一条；卵占它的位置
        const egg = meta.startEgg('fuse', [a, b].filter((x) => x !== newV), res.v);
        egg.src = [a, b].map((x) => JSON.parse(JSON.stringify(x)));
        egg.changes = [...(res.fromA || []).map((x) => `🧬 来自「${displayName(a)}」：${x}`), ...(res.fromB || []).map((x) => `🧬 来自「${displayName(b)}」：${x}`), ...(res.changes || [])];
        if (!hasNew) meta.addToTank(newV);
        meta.save();
        finish({ type: hasNew ? 'fusedNew' : 'keep', egg });
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
    open: openTank, close, tick, visitFriend: (id) => { const f = FRIENDS.find((x) => x.id === id); if (open && f && !busy) visitFriend(f); }, backHome: () => { if (open && visit && !busy) backHome(); }, get visiting() { return !!visit; }, notify: (html, gold, ms) => { notify(html, gold, ms); refreshBell(true); }, openRoom, openInbox, unread, debugHatch: (uid) => hatch(uid), openThemes, get theme() { return visit ? visit.owner.theme : myTheme(); },
    setTheme: (id) => { if (!THEMES[id]) return; S.aquaTheme = id; meta.save(); if (open && !visit) { aq.setTheme(id); ownerKey = ''; refreshTop(); } },
    get isOpen() { return open; },
    get busy() { return busy; },
    roomOpen: () => !room.classList.contains('hidden'),
    refresh: () => { if (open && !visit) { aq.sync(S.tank); refreshTop(); setHint(); } },
  };
}
