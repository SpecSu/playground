// UI 层（v0.5 极简分阶段聚焦）：顶栏 / 单条动态胶囊 / 头顶气泡 / 紧凑钓获卡 / 菜单抽屉 / 轻提示 / 弹窗
import { SPECIES, SPECIES_BY_ID, RARITY, TRAITS, DECOS, displayName, decoText, ensureUgc } from './fishes.js';
import { PATTERNS as PATTERN_NAMES, PALETTES } from './ugc.js';
const PALETTE_NAMES = PALETTES.map((p) => p[0]);
const DECO_LABEL = Object.fromEntries(Object.entries(DECOS).map(([k, d]) => [k, d.label.replace(/^小(?=..)/, '')]));
import { STREAK_REWARDS, levelTitle } from './meta.js';
import { sfx } from './sfx.js';
import { ITEMS, ITEM_CATS, ITEM_RARITY } from './items.js';
import { ic, CAT_IC, CAT_SHORT } from './icons.js';

export const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const ODD_EMOJI = { bottle: '🍾', duck: '🦆', chest: '🎁' };
let thumbMaker = null;
export function setThumbMaker(fn) { thumbMaker = fn; }
// 给 <img data-ugc=idx> 填上这条鱼独一无二的渲染图
export function fillThumbs(root, list) { root.querySelectorAll('img[data-ugc]').forEach((el) => { const v = list[+el.dataset.ugc]; if (v && thumbMaker) thumbMaker(v, el); }); }
export const thumb = (id) => (ODD_EMOJI[id] ? null : `assets/thumbs/${id}.webp`);
export const fmtLenTxt = (cm) => (cm >= 100 ? `${(cm / 100).toFixed(2)}m` : `${Math.round(cm)}cm`);
const ago = (ts) => { const s = (Date.now() - ts) / 1000; if (s < 60) return '刚刚'; if (s < 3600) return `${Math.floor(s / 60)} 分钟前`; if (s < 86400) return `${Math.floor(s / 3600)} 小时前`; return `${Math.floor(s / 86400)} 天前`; };
const fmtTime = (ts) => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// ---------------- 统一线性图标 ----------------
export const ICON = {
  hook: '<circle cx="16.5" cy="3.5" r="1.5"/><path d="M16.5 5v8.5a5 5 0 0 1-10 0v-3l2.5 2.5"/>',
  bobber: '<circle cx="12" cy="9" r="3.2"/><path d="M12 2.5v3.3M3 17c3-2 6-2 9 0s6 2 9 0"/>',
  bang: '<path d="M12 4v10"/><path d="M12 19.2v.1"/>',
  reel: '<path d="M3 4.5h18"/><path d="M10.5 4.5v3"/><circle cx="10.5" cy="14" r="6.3"/><circle cx="10.5" cy="14" r="1.6"/><g class="ck"><path d="M10.5 14l6.6-3.9"/><circle cx="18.6" cy="9.2" r="1.9"/></g>',
  wave: '<path d="M2 10c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0c1.7-1.7 3.4-2.2 5-1"/><path d="M2 16c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0c1.7-1.7 3.4-2.2 5-1"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  sndOn: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/>',
  sndOff: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  gift: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M3 10h18M12 10v10M12 10C10 6 6.5 5.5 7 8s5 2 5 2zm0 0c2-4 5.5-4.5 5-2s-5 2-5 2z"/>',
  up: '<path d="M12 19V6M6 11.5L12 5.5l6 6"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5.5a3 3 0 0 0 3 4M16 6h2.5a3 3 0 0 1-3 4M12 13v4M8.5 20h7"/>',
  list: '<path d="M10 6h10M10 12h10M10 18h10M4 6l1.2 1.2L7.5 5M4 12l1.2 1.2L7.5 11M4 18l1.2 1.2L7.5 17"/>',
  book: '<path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13"/>',
  sad: '<circle cx="12" cy="12" r="8.5"/><path d="M9 15.5c1.8-1.6 4.2-1.6 6 0M9.5 10h.01M14.5 10h.01"/>',
};
export const svg = (name, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24">${ICON[name] || ''}</svg>`;

export const avatars = {};   // id -> dataURL（运行时从 3D 角色渲染的头像）
export function avStyle(id, color) {
  const img = avatars[id];
  return `${img ? `background-image:url(${img})` : `background:${color}`}`;
}
function avHTML(id, color, name) {
  return `<span class="av" style="${avStyle(id, color)}">${avatars[id] ? '' : `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:12px">${esc((name || '?')[0])}</span>`}</span>`;
}
export function rarBadge(sp) { const R = RARITY[sp.rarity]; return `<span class="rb" style="background:${R.color}">${R.short}</span>`; }

// ---------------- 轻提示 / 飘字 ----------------
// r3：注意力调度 —— 提示(toast) / 好友动态 / 头顶气泡 同一时刻最多 1 个
//   优先级：弹窗 > 提示 > 动态 > 气泡；提示一出现就收起动态和气泡；放生后留一段安静期（attnQuiet）
let quietT = 0, attnBlocker = null;
const toastOn = () => $('toast').classList.contains('show');
export function setAttnBlocker(fn) { attnBlocker = fn; }   // 外部还有排队中的高优先级提示（奖励队列）时，动态 / 气泡先等
export function attnQuiet(s) { quietT = Math.max(quietT, s); if (feedCur && !feedCur._mine) { clearTimeout(feedTm); endFeed(); } hideTalk(); }
export const attnQuietLeft = () => quietT;
const attnBusy = () => quietT > 0 || modalOpen() || toastOn() || !!attnBlocker?.();
export function tickAttn(dt) { if (quietT > 0) quietT -= dt; if (!feedCur && feedQ.length) pumpFeed(); }
export function toast(msg, accent = false, ms = 1600) {
  const t = $('toast'); t.innerHTML = msg; t.classList.toggle('accent', accent); t.classList.add('show');
  if (feedCur) preemptFeed();
  hideTalk();
  clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('show'), ms);
}
// r1：进入新阶段（蓄力 / 扬竿）时立刻收起上一阶段的失败提示，避免"太早啦"压在"完美抛竿"上
export function clearToast() { clearTimeout(toast.tm); $('toast').classList.remove('show'); }
export function floatText(txt, x, y, color = '#ff6b57') {
  const d = document.createElement('div'); d.className = 'fp'; d.textContent = txt;
  d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.setProperty('--c', color);
  $('float').appendChild(d); setTimeout(() => d.remove(), 1400);
}
function animateNum(el, to, prefix = '', dur = 600) {
  const from = +(el.dataset.n || 0); el.dataset.n = to; const t0 = performance.now();
  cancelAnimationFrame(el._raf);
  const step = (now) => { const k = Math.min(1, (now - t0) / dur); el.textContent = prefix + Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) el._raf = requestAnimationFrame(step); };
  el._raf = requestAnimationFrame(step);
}

// ---------------- 社交动态：全局同时 1 条，3 秒，排队，可暂停 ----------------
const feedQ = []; let feedCur = null, feedPaused = false, feedTm = 0;
export function feedPush(item) {
  item.ts = performance.now();
  if (item.key) { const ex = feedQ.find((x) => x.key === item.key); if (ex) { Object.assign(ex, item); return; } }
  feedQ.push(item); if (feedQ.length > 4) { const j = feedQ.findIndex((x) => !x.sticky); feedQ.splice(j < 0 ? 0 : j, 1); }
  pumpFeed();
}
function pumpFeed() {
  if (feedCur || feedPaused === true || attnBusy()) return;
  for (let j = feedQ.length - 1; j >= 0; j--) if (!feedQ[j].sticky && performance.now() - feedQ[j].ts > 25000) feedQ.splice(j, 1);   // 太旧的不再推（sticky：和我相关的重要通知，不过期）
  // soft 暂停（玩家抱鱼展示中）：只放行和"我"相关的动态，例如好友给我点赞
  const i = feedPaused === 'soft' ? feedQ.findIndex((x) => x.mine) : 0;
  if (i < 0) return;
  const it = feedQ.splice(i, 1)[0]; if (!it) return;
  const d = document.createElement('div'); d.className = 'fd glass' + (it.cls ? ' ' + it.cls : '');
  const lead = it.whos?.length ? `<span class="avs">${it.whos.slice(0, 3).map((w) => avHTML(w.id, w.color, w.name)).join('')}</span>` : `<span class="ico">${svg(it.icon || 'wave')}</span>`;
  const fv = it.v && !SPECIES_BY_ID[it.v.sp]?.odd ? it.v : null;
  d.innerHTML = `${lead}<span class="tx">${it.html}</span>${fv ? '<img class="fth" alt="">' : ''}${it.like ? `<button class="like" aria-label="点赞">${svg('heart')}</button>` : ''}`;
  if (fv && thumbMaker) thumbMaker(fv, d.querySelector('.fth'));
  if (it.like) {
    const b = d.querySelector('.like');
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); if (b.classList.contains('done')) return;
      b.classList.add('done'); sfx.like(); it.like(d);
      clearTimeout(feedTm); feedTm = setTimeout(endFeed, 900);
    });
  }
  hideTalk();   // 动态优先于气泡
  d._mine = !!it.mine; d._it = it; d._t0 = performance.now(); $('feed').appendChild(d); feedCur = d;
  feedTm = setTimeout(endFeed, it.ttl || 3000);
}
// 被轻提示 / 弹窗 / 暂停打断：sticky 通知刚出现不到 2 秒就被挤掉 → 放回队首，稍后重播一次（不悄悄丢掉「你的鱼被钓到了」）
function preemptFeed() {
  const it = feedCur?._it;
  if (it?.sticky && !it._rq && performance.now() - feedCur._t0 < 2000) { it._rq = true; feedQ.unshift(it); }
  clearTimeout(feedTm); endFeed();
}
function endFeed() {
  if (!feedCur) return; const d = feedCur; feedCur = null;
  d.classList.add('out'); setTimeout(() => { d.remove(); setTimeout(pumpFeed, 200); }, 240);
}
export function setFeedPaused(p) {
  if (p === feedPaused) return; feedPaused = p;
  if (p === true) { if (feedCur) preemptFeed(); }
  else if (p === 'soft') { if (feedCur && !feedCur._mine) { clearTimeout(feedTm); endFeed(); } setTimeout(pumpFeed, 300); }
  else setTimeout(pumpFeed, 600);
}

// ---------------- 弹窗：一个标题 · 一个奖励 · 一个按钮 ----------------
export function modal({ icon = 'gift', title = '', reward = '', cta = '好的', onCta = null }) {
  const m = $('modal'), box = $('mBox');
  box.innerHTML = `<div class="badge">${svg(icon)}</div><h2>${esc(title)}</h2>${reward ? `<div class="rw">${svg('spark')}${esc(reward)}</div>` : ''}<button class="btn-p">${esc(cta)}</button>`;
  if (feedCur) preemptFeed(); hideTalk();   // 弹窗最高优先级：连自己的点赞动态一起收起
  m.classList.add('show'); sfx.open();
  box.querySelector('.btn-p').onclick = () => { m.classList.remove('show'); sfx.tap(); onCta?.(); };
}
export const modalOpen = () => $('modal').classList.contains('show');

// ---------------- 顶栏 ----------------
export function updateTop(meta) {
  const S = meta.S;
  $('meLv').textContent = S.level;
  $('meXp').style.strokeDashoffset = 100 - Math.min(100, (S.xp / meta.levelXP()) * 100);
  const sn = $('scoreN'); const v = S.today.score;
  if (+sn.dataset.n !== v) { animateNum(sn, v); const me = $('me'); me.classList.remove('bump'); void me.offsetWidth; me.classList.add('bump'); }
  $('baitN').textContent = S.bait;
}
export function updateBadges(meta, newSpecies) {
  const nTask = meta.S.today.tasks.filter((t) => t.done && !t.claimed).length + (meta.streakGift ? 1 : 0);
  badges.tasks = nTask > 0; badges.codex = newSpecies > 0;
  $('menuDot').classList.toggle('hidden', !(badges.tasks || badges.codex));
}
const badges = { codex: false, tasks: false };

// ---------------- 好友头顶：事件时显示名字+气泡，同时最多 1 个 ----------------
let talk = null, talkSup = false; const talkQ = [];
export function makeTag(a) {
  const tag = document.createElement('div'); tag.className = 'tag';
  tag.innerHTML = `<span class="say"></span><span class="nm">${esc(a.name)}</span>`;
  $('tags').appendChild(tag);
  a.tag = tag; a.sayEl = tag.querySelector('.say');
}
const talkBlocked = () => attnBusy() || !!feedCur;
export function say(a, text, dur = 2.5) {
  if (!a?.tag || talkSup) return;
  if ((talk && talk.a !== a) || talkBlocked()) { if (talkQ.length < 2 && !talkQ.some((q) => q.a === a)) talkQ.push({ a, text, dur, age: 0 }); return; }
  showTalk(a, text, dur);
}
function showTalk(a, text, dur) { a.sayEl.textContent = text; a.tag.classList.add('show'); talk = { a, t: dur }; }
function hideTalk() { if (talk) { talk.a.tag.classList.remove('show'); talk = null; } }
export function tickTalk(dt, suppressed, place) {
  if (suppressed !== talkSup) {
    talkSup = suppressed;
    if (suppressed) { talkQ.length = 0; hideTalk(); }
  }
  for (const q of talkQ) q.age += dt;
  while (talkQ.length && talkQ[0].age > 3) talkQ.shift();   // 过时的气泡不再补播（"耶！！！"晚 3 秒就没意义了）
  if (!talk) { if (suppressed) { talkQ.length = 0; return; } if (talkBlocked()) return; const q = talkQ.shift(); if (!q) return; showTalk(q.a, q.text, q.dur); }
  talk.t -= dt; place(talk.a, talk.a.tag);
  if (talk.t <= 0) { talk.a.tag.classList.remove('show'); talk = null; }
}
export function friendStatus(a) {
  switch (a.state) {
    case 'idle': return '准备抛竿';
    case 'charge': case 'cast': return '抛竿中';
    case 'float': case 'reelEmpty': return '等鱼上钩';
    case 'bite': return '咬钩了';
    case 'hookset': case 'fight': return '搏鱼中';
    case 'land': case 'hold': return a.v ? `钓到 ${displayName(a.v)}` : '钓到啦';
    case 'release': return '放生中';
    case 'fail': return '跑鱼了';
    default: return '';
  }
}

// ---------------- 钓获卡（紧凑，详情可展开） ----------------
export function showCatch(v, info, n) {
  const sp = SPECIES_BY_ID[v.sp], R = RARITY[sp.rarity];
  const el = $('catch');
  const rb = $('cRar'); rb.textContent = R.short; rb.style.background = R.color;
  const nm = displayName(v); $('cName').textContent = nm;
  $('cName').className = nm.length > 8 ? 'xl' : nm.length > 6 ? 'l' : '';   // 长名字缩字号，不截断
  
  // r2：连续钓同一种鱼时卡片几乎一样 → 加上"作者"（UGC 新鲜感）和"图鉴进度 / 第几条"（收集进度）
  const cn = $('cNew');
  cn.textContent = info.isNew ? 'NEW' : `第${info.n}条`;   // r3：图鉴进度挪到下方亮点行，徽标只留 NEW，鱼名不再被挤成省略号
  cn.classList.toggle('hidden', !info.isNew && !(info.n > 1 && !sp.odd));
  cn.classList.toggle('dup', !info.isNew);
  $('cMeta').textContent = `${fmtLenTxt(v.cm)} · ${v.kg}kg`;
  // v1.0：钓到别人放生/创作的鱼 → 注明来自谁的水族箱（循环闭环被看见，DESIGN §2.4）
  $('cBy').textContent = v.fromOcean ? `🌊 来自 ${v.fromOcean.by} 的水族箱` : v.creator && !sp.odd ? `@${String(v.creator).replace(/^@/, '')} 创作` : '';
  $('cCombo').textContent = info.combo >= 2 ? `连击 ×${info.combo}` : '';
  // r1：以前先显示 "+0" 再滚动，慢机上首帧就是 +0（像没分）→ 从 60% 起滚
  const n0 = Math.round(info.score * 0.6);
  const pts = $('cPts'); pts.dataset.n = n0; pts.textContent = '+' + n0;
  pts.classList.remove('rise'); void pts.offsetWidth; pts.classList.add('rise');
  animateNum(pts, info.score, '+', 700);
  // r3：一行"这条哪里不一样"——从候选亮点里挑最有意思的一条（加成明细仍在详情里）
  const hi = catchHighlight(v, sp, info);
  $('cChips').innerHTML = `<span class="hi" style="--rc:${R.color}">${svg('spark')}<em>${esc(hi)}</em></span>`;
  const tr = v.traits.map((t) => `${TRAITS[t].icon}${TRAITS[t].label} ×${TRAITS[t].mult}`);
  const lines = [
    sp.odd ? '<b>来自大海的礼物</b>' : `<b>${esc(sp.name)}</b> · ${R.label} · 全海唯一的一条`,
    v.ugc ? `作品 <b>《${esc(v.ugc.title)}》</b> · ${esc(PATTERN_NAMES[v.ugc.pat])}花纹 · ${esc(PALETTE_NAMES[v.ugc.pal])}配色${v.ugc.decos.length ? ` · 装饰 <b>${esc(decoText(v.ugc))}</b>` : ''}` : '',
    tr.length ? `特质：${tr.join('　')}` : '',
    `创作者 <b>${esc(v.creator)}</b>${sp.odd ? '' : ` · 已收进你的图鉴`}`,
    v.fromOcean ? `🌊 这条鱼来自 <b>${esc(v.fromOcean.by)}</b> 的水族箱，被放生后游到了你的鱼钩上` : '',
    info.bonus.length ? `加成：${info.bonus.map(esc).join(' · ')}` : '',
  ].filter(Boolean);
  let note = '';
  if (v.note) note = `<div class="note">${esc(v.note)}</div>`;
  $('cDetail').innerHTML = lines.join('<br>') + note;
  el.classList.toggle('open', !!v.note);
  el.classList.remove('mini', 'item'); el.style.removeProperty('--ic'); el.style.removeProperty('--rc');
  el.classList.add('show');
}
const pctUp = (a, b) => Math.round((a / b - 1) * 100);
export function catchHighlight(v, sp, info) {
  const C = [];   // [分数, 文案]
  const u = v.ugc, pat = u ? PATTERN_NAMES[u.pat] : '', pal = u ? PALETTE_NAMES[u.pal] : '';
  const D = (k) => DECO_LABEL[k] || '';
  if (sp.odd) return sp.id === 'chest' ? '打开有幸运饵 ×2' : '来自大海的礼物';
  if (v.fromOcean) C.push([96, `${v.fromOcean.by} 改造过的第 ${v.gen || 1} 代鱼`]);
  if (info.isBest && info.prevBest > 0 && pctUp(v.cm, info.prevBest) >= 1) C.push([90, `个人最大纪录 · 比之前大 ${pctUp(v.cm, info.prevBest)}%`]);
  for (const t of v.traits) C.push([t === 'giant' ? 72 : 52, t === 'giant' ? `巨型个体 · 比普通${sp.name}大一圈` : `${TRAITS[t].icon} ${TRAITS[t].label}个体 · 积分 ×${TRAITS[t].mult}`]);
  if (u && u.decos.length >= 2) C.push([62, `罕见双装饰 · ${D(u.decos[0])} + ${D(u.decos[1])}`]);
  else if (u && u.decos.some((k) => k === 'crown' || k === 'halo')) C.push([56, `罕见 ${pat}花纹 + ${D(u.decos.find((k) => k === 'crown' || k === 'halo'))}`]);
  const pv = info.prevSame;
  if (pv && !info.isBest && v.cm > pv.cm * 1.15) C.push([45 + Math.min(20, pctUp(v.cm, pv.cm) / 4), `比你上条${sp.name}大 ${pctUp(v.cm, pv.cm)}%`]);
  if (info.featured) C.push([40, '今日精选 · 积分 ×1.3']);
  if (pv?.ugc && u && (pv.ugc.pat !== u.pat || pv.ugc.pal !== u.pal)) C.push([34, `${pal}${pat}，和上条${PALETTE_NAMES[pv.ugc.pal]}${PATTERN_NAMES[pv.ugc.pat]}不一样`]);
  if (info.isNew) C.push([30, u ? `${pal}${pat}${u.decos[0] ? ' + ' + D(u.decos[0]) : ''} · 图鉴 ${info.spGot}/${SPECIES.length}` : `新物种 · 图鉴 ${info.spGot}/${SPECIES.length}`]);   // 新物种：先说外观，再说进度
  if (u?.decos.length === 1) C.push([18, `${pat}花纹 · 戴着${D(u.decos[0])}`]);
  if (u) C.push([8, `《${u.title}》· 全海唯一`]);
  C.sort((a, b) => b[0] - a[0]);
  return C[0]?.[1] || '全海唯一的一条';
}
export function hideCatch() { $('catch').classList.remove('show', 'open', 'mini'); }
export function catchMini(on) { $('catch').classList.toggle('mini', on); }

// ---------------- 菜单抽屉：图鉴 / 好友排行 / 任务 ----------------
// v1.3 菜单：首页 = 2×2 大卡（图鉴 / 背包 / 排行 / 任务，带状态摘要与红点）→ 子页（统一「‹ 返回 + 标题」）
//   tab = 'home' | 'codex' | 'bag' | 'rank' | 'tasks'；opts.focusMe：排行页自动滚到「我」并高亮
let sheetState = { open: false, tab: 'home', sub: 'new', focusMe: false };
export function openSheet(tab, ctx, opts = {}) {
  const wasOpen = sheetState.open;
  sheetState.open = true; sheetState.tab = tab || 'home'; sheetState.focusMe = !!opts.focusMe;
  $('sheet').classList.add('show'); if (!wasOpen) sfx.open();
  renderSheet(ctx);
  $('shBody').scrollTop = 0;
  if (sheetState.focusMe) focusMeRow();
}
// 排行页：把「我」这一行滚到可视区中部 + 高亮闪两下。
// 用即时滚动（不用 smooth）：排行页每秒会按好友实时状态重绘，smooth 滚动进行中被重绘打断会停在半路；
// body 与行同处抽屉内，抽屉滑入的 transform 不影响二者相对位置 → 打开当帧即可测量
function focusMeRow() {
  sheetState.focusMe = false;
  const go = (hl) => {
    if (sheetState.tab !== 'rank' || !sheetState.open) return;
    const body = $('shBody'), row = body.querySelector('.li.you'); if (!row) return;
    const br = body.getBoundingClientRect(), rr = row.getBoundingClientRect();
    body.scrollTop = Math.max(0, body.scrollTop + rr.top - br.top - (br.height - rr.height) / 2);
    if (hl) { sheetState.hlUntil = performance.now() + 2600; row.classList.remove('hl'); void row.offsetWidth; row.classList.add('hl'); }
  };
  go(true); requestAnimationFrame(() => go(false));
}
export function closeSheet() { $('sheet').classList.remove('show'); sheetState.open = false; sfx.close(); }
export function sheetOpen() { return sheetState.open ? sheetState.tab : null; }

function bindGoTank(ctx) { const b = $('shGoTank'); if (b) b.onclick = () => { sfx.tap(); closeSheet(); ctx.onOpenTank?.(); }; }
const TABS = [['codex', 'book', '图鉴'], ['bag', null, '背包'], ['rank', 'trophy', '排行'], ['tasks', 'list', '任务']];
const TAB_T = Object.fromEntries(TABS.map(([k, , l]) => [k, l]));
// 图鉴/背包里的「去水族箱」：弱化为列表底部的轻量吸底胶囊（不再是顶部大横幅）
const goTankPill = (txt) => `<div class="sh-go-w"><button class="sh-go" id="shGoTank">${ic('fish')}<span>${txt}</span><i>›</i></button></div>`;
const tabIc = (k, icn) => (icn ? svg(icn) : ic('bag'));
function homeHTML(ctx) {
  const { meta } = ctx; const S = meta.S;
  const spGot = new Set(S.log.map((L) => L.v.sp).filter((id) => !SPECIES_BY_ID[id]?.odd)).size;
  const me = meta.board(ctx.live).find((r) => r.you);
  const nTask = S.today.tasks.filter((t) => t.done && !t.claimed).length + (meta.streakGift ? 1 : 0);
  const nDone = S.today.tasks.filter((t) => t.done).length;
  const info = {
    codex: [`${S.log.length} 条收藏`, `${spGot}/${SPECIES.length} 种`, badges.codex ? '新鱼' : ''],
    bag: [`${meta.bagTotal()} 个道具`, '给鱼基因改造', ''],
    rank: [me ? `今日第 ${me.rank} 名` : '今日积分榜', `${S.today.score} 分`, ''],
    tasks: [nTask ? `${nTask} 个奖励可领` : `${nDone}/${S.today.tasks.length} 完成`, `连续出海 ${S.streak.days} 天`, nTask ? String(nTask) : ''],
  };
  return `<div class="mh-grid">${TABS.map(([k, icn, l]) => { const [a, b, bd] = info[k]; return `<button class="mh-card mh-${k}" data-tab="${k}"><span class="mh-ic">${tabIc(k, icn)}</span><b>${l}</b><span class="mh-a">${esc(a)}</span><span class="mh-b">${esc(b)}</span>${bd ? `<em class="mh-bd">${esc(bd)}</em>` : ''}<i class="mh-go">›</i></button>`; }).join('')}</div>
    <div class="mh-tip">点顶部「今日积分」也能直接看排名</div>`;
}
// ---------------- 背包（菜单抽屉 / 水族箱共用）：顶部选中道具详情 + 分类 chip + 4 列大格子；未获得的显示为灰色剪影（收集感） ----------------
export function bagView(meta, st, { lockAll = true } = {}) {
  const bag = meta.bagList(), have = new Set(bag.map((x) => x.id));
  const cats = ['all', ...Object.keys(ITEM_CATS)];
  const cat = st.cat || 'all';
  if (!bag.length) {
    return `<div class="blk dr-empty" id="bagEmpty" style="padding:22px 12px"><div class="art"><i style="--c:#ffd3d9;width:18px;height:18px;left:4px;top:18px"></i><i style="--c:#c9f2ea;width:12px;height:12px;right:8px;top:8px"></i><i style="--c:#e3ddff;width:14px;height:14px;right:0;bottom:22px"></i>${ic('bag')}</div>
      <b>背包空空的</b><span>钓鱼时偶尔会钓上漂流瓶、贝壳包<br>鱼嘴里也可能叼着道具</span><small>道具可以在水族箱里给鱼「基因改造」</small></div>`;
  }
  const sel = (st.sel && have.has(st.sel) ? bag.find((x) => x.id === st.sel) : null) || bag[0];
  st.sel = sel.id;
  const R = ITEM_RARITY[sel.rarity], C = ITEM_CATS[sel.cat];
  const list = (cat === 'all' ? ITEMS : ITEMS.filter((x) => x.cat === cat));
  const owned = list.filter((x) => have.has(x.id)).map((x) => bag.find((b) => b.id === x.id));
  const locked = lockAll ? list.filter((x) => !have.has(x.id)) : [];
  const cnt = (k) => (k === 'all' ? bag.length : bag.filter((x) => x.cat === k).length);
  const tot = (k) => (k === 'all' ? ITEMS.length : ITEMS.filter((x) => x.cat === k).length);
  const cell = (x, lock) => `<button class="it ${lock ? 'lock' : ''} ${!lock && x.id === sel.id ? 'sel' : ''}" ${lock ? 'disabled' : `data-bag="${x.id}"`} style="--ic:${x.color}55;--rc:${ITEM_RARITY[x.rarity].color}">${lock ? '' : `<span class="ct num">×${x.n}</span>`}<span class="ico">${lock ? ic('lock') : x.emoji}</span><span class="nm">${lock ? '？？？' : esc(x.name)}</span></button>`;
  return `<div class="blk bag-hd" style="--ic:${sel.color}55;--rc:${R.color}"><div class="ico">${sel.emoji}</div><div class="m"><b>${esc(sel.name)} <span class="rb" style="background:${R.color}">${R.short}</span><span class="num" style="font-size:var(--f1);color:var(--ink2)">×${sel.n}</span></b><p>${esc(sel.desc)}</p><span class="fx">${C.emoji} ${esc(C.label)} · ${esc(sel.pv || C.hint)}</span></div></div>
    <div class="bag-cats">${cats.map((k) => `<button class="chip ${cat === k ? 'on' : ''}" data-bcat="${k}">${k === 'all' ? `${ic('bag')}全部<small class="num">${cnt(k)}/${tot(k)}</small>` : CAT_SHORT[k]}</button>`).join('')}</div>
    <div class="it-grid">${owned.map((x) => cell(x, false)).join('')}${locked.length ? `<div class="it-sect">还没钓到 · ${locked.length} 种</div>${locked.map((x) => cell(x, true)).join('')}` : ''}</div>`;
}
export function bindBag(root, st, rerender) {
  root.querySelectorAll('[data-bcat]').forEach((b) => b.onclick = () => { if (st.cat === b.dataset.bcat) return; sfx.tap(); st.cat = b.dataset.bcat; rerender(); });
  root.querySelectorAll('[data-bag]').forEach((b) => b.onclick = () => { sfx.tap(); st.sel = b.dataset.bag; rerender(); });
}
export function renderSheet(ctx) {
  if (!sheetState.open) return;
  const { meta } = ctx; const S = meta.S;
  const tab = sheetState.tab;
  if (tab === 'codex') ctx.onSeenCodex?.();
  const body = $('shBody');
  // 统一头部：首页 = 「菜单」标题；子页 = 「‹」返回首页 + 子页标题
  const home = tab === 'home', cardEl = $('sheet').querySelector('.card');
  cardEl.classList.toggle('home', home);
  $('shTitle').innerHTML = home ? '<b>菜单</b>' : `${tabIc(tab, TABS.find((t) => t[0] === tab)?.[1])}<b>${TAB_T[tab]}</b>`;
  $('shBack').classList.toggle('hidden', home);
  $('shBack').onclick = () => { sfx.tap(); sheetState.tab = 'home'; renderSheet(ctx); body.scrollTop = 0; };
  $('sndBtn').innerHTML = svg(S.muted ? 'sndOff' : 'sndOn');

  if (home) {
    body.innerHTML = homeHTML(ctx);
    body.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { sfx.tap(); sheetState.tab = b.dataset.tab; renderSheet(ctx); body.scrollTop = 0; });
  } else if (tab === 'codex') {
    // v0.6：图鉴 = 我的鱼获收藏。只展示真正钓到的那一条条（每条外观独一无二），没有未解锁占位
    const f = meta.featured;
    const pity = Math.min(S.pity, 9);
    const list = S.log.map((L) => { ensureUgc(L.v); return L; });
    const spGot = new Set(list.map((L) => L.v.sp).filter((id) => !SPECIES_BY_ID[id]?.odd)).size;
    const sortBy = sheetState.sub === 'rare' ? 'rare' : 'new';
    const RI = (L) => ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(SPECIES_BY_ID[L.v.sp].rarity);
    const shown = sortBy === 'rare' ? list.slice().sort((a, b) => RI(b) - RI(a) || b.v.cm - a.v.cm) : list;
    // v1.0：图鉴 = 历史记录（钓到过的每一条）；正在养的鱼在水族箱（主页主角）
    let html = `<div class="cx-top">
        <div class="cx-sum"><b class="num">${list.length}</b><span>条收藏</span><i></i><b class="num">${spGot}</b><span>/${SPECIES.length} 种</span></div>
        <div class="luck"><div class="row"><span>${svg('spark')}好运值</span><b class="num">${pity >= 9 ? '已满 · 下一条必出稀有' : `${pity}/9`}</b></div><div class="lbar"><i style="width:${(pity / 9) * 100}%"></i>${[1, 2, 3, 4, 5, 6, 7, 8].map((k) => `<s style="left:${(k / 9) * 100}%"></s>`).join('')}</div></div>
      </div>
      <div class="blk feat"><img src="${thumb(f.id)}" alt=""><div class="m"><span class="tagc">今日精选</span><div class="h" style="margin-top:4px">${esc(f.name)}</div><div class="cap">出现率 ×3 · 推荐作者 ${esc(meta.featuredCreator)}</div></div></div>`;
    if (!list.length) {
      html += `<div class="empty cx-empty">${svg('hook')}<b>还没有鱼获</b>每一条鱼都是玩家创作投放的<br>钓上来，它就是你独一无二的收藏</div>`;
      body.innerHTML = html + goTankPill('去水族箱看正在养的鱼'); bindGoTank(ctx);
    } else {
      html += `<div class="cx-bar"><span class="sect" style="margin:0">我的鱼获</span><div class="subseg"><button data-sub="new" class="${sortBy === 'new' ? 'on' : ''}">最新</button><button data-sub="rare" class="${sortBy === 'rare' ? 'on' : ''}">稀有</button></div></div>
        <div id="cdDetail"></div><div class="cx-grid">`;
      shown.forEach((L, i) => {
        const v = L.v, sp = SPECIES_BY_ID[v.sp], R = RARITY[sp.rarity];
        const im = sp.odd ? `<div class="em">${ODD_EMOJI[sp.id]}</div>` : `<img data-ugc="${i}" alt="">`;
        const nd = v.ugc?.decos?.length || 0;
        html += `<div class="cx" data-i="${i}" style="--rc:${R.color}"><div class="ph">${im}<span class="rb" style="background:${R.color}">${R.short}</span>${nd ? `<span class="dk">${svg('spark')}${nd}</span>` : ''}</div>
          <div class="t"><b>${esc(displayName(v))}</b><span class="w">${v.ugc ? `《${esc(v.ugc.title)}》` : esc(sp.desc)}</span><span>${fmtLenTxt(v.cm)} · ${ago(L.ts)}</span><span class="by">${esc(v.creator)}</span></div></div>`;
      });
      body.innerHTML = html + '</div>' + goTankPill('去水族箱看正在养的鱼'); bindGoTank(ctx);
      fillThumbs(body, shown.map((L) => L.v));
      body.querySelectorAll('.cx').forEach((c) => c.onclick = () => {
        sfx.tap();
        const L = shown[+c.dataset.i], v = L.v, sp = SPECIES_BY_ID[v.sp], R = RARITY[sp.rarity];
        const im = sp.odd ? `<div class="em big">${ODD_EMOJI[sp.id]}</div>` : `<img data-ugc="0" alt="">`;
        const u = v.ugc;
        const rows = [
          ['物种', `${esc(sp.name)} · ${R.label}`],
          u ? ['作品', `《${esc(u.title)}》`] : null,
          u ? ['外观', `${esc(PATTERN_NAMES[u.pat])}花纹 · ${esc(PALETTE_NAMES[u.pal])}配色${u.decos.length ? ' · ' + esc(decoText(u)) : ''}`] : null,
          ['体型', `${fmtLenTxt(v.cm)} · ${v.kg}kg${v.traits.length ? ' · ' + v.traits.map((t) => TRAITS[t].icon + TRAITS[t].label).join(' ') : ''}`],
          ['钓获', `${fmtTime(L.ts)} · +${L.score} 分`],
          ['创作者', esc(v.creator)],
        ].filter(Boolean);
        const dd = $('cdDetail');
        dd.innerHTML = `<div class="blk cx-detail" style="--rc:${R.color}"><button class="x" aria-label="关闭">×</button><div class="ph">${im}</div><div class="h">${esc(displayName(v))} <span class="rb" style="background:${R.color}">${R.short}</span></div>
          <dl>${rows.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join('')}</dl>${v.note ? `<div class="note">${esc(v.note)}</div>` : ''}</div>`;
        fillThumbs(dd, [v]);
        dd.querySelector('.x').onclick = () => { dd.innerHTML = ''; };
        dd.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
    body.querySelectorAll('[data-sub]').forEach((b) => b.onclick = () => { sheetState.sub = b.dataset.sub; sfx.tap(); renderSheet(ctx); });
  } else if (tab === 'bag') {
    const st = sheetState.bag || (sheetState.bag = { cat: 'all', sel: null });
    const draw = () => {
      const sc = body.scrollTop;
      body.innerHTML = `${bagView(meta, st)}${goTankPill('去水族箱给鱼改造')}`;
      bindGoTank(ctx); bindBag(body, st, draw); body.scrollTop = sc;
    };
    draw();
  } else if (tab === 'rank') {
    const rows = meta.board(ctx.live);
    const mates = ctx.anglers.filter((a) => !a.isPlayer);
    let html = `<div class="blk"><div class="room"><span class="h">果冻湾 · 房间 #8848</span><span class="live"><i></i>${mates.length + 1} 人在线</span></div><div class="mates">`;
    html += mates.map((a) => `<div class="mate" data-watch="${a.id}">${avHTML(a.id, a.color, a.name)}<b>${esc(a.name)}</b><span data-fst="${a.id}">${esc(friendStatus(a))}</span></div>`).join('');
    html += `</div></div><div class="sect">今日积分榜 · 每天 0 点重置</div>`;
    html += rows.map((r) => {
      // r2：在线好友状态与上方房间卡一致；我这一行直接告诉"离上一名还差多少"（冲榜目标）
      const above = rows[r.rank - 2], mate = r.online && !r.you ? mates.find((a) => a.id === r.id) : null;
      const st = r.you ? (above ? `距第 ${above.rank} 名还差 ${above.score - r.score} 分` : `今日第一 · Lv.${S.level}`) : mate ? friendStatus(mate) : r.online ? '在船上' : '今天来过';
      return `<div class="li ${r.you ? 'you' : ''}${r.you && performance.now() < (sheetState.hlUntil || 0) ? ' hl' : ''}"><span class="no ${r.rank <= 3 ? 'g' + r.rank : ''}">${r.rank}</span>${avHTML(r.id, r.color, r.name)}<div class="m"><b>${r.online ? '<span class="on-dot"></span>' : ''}${esc(r.name)}${r.you ? '（我）' : ''}</b><span>${esc(st)}</span></div><b class="sc num">${r.score}</b></div>`;
    }).join('');
    const sc = body.scrollTop; body.innerHTML = html; body.scrollTop = sc;   // 好友实时刷新榜单时保持滚动位置
    body.querySelectorAll('[data-watch]').forEach((m) => m.onclick = () => { sfx.tap(); const a = ctx.anglers.find((x) => x.id === m.dataset.watch); closeSheet(); ctx.onWatch?.(a); });
  } else {
    const idx = (S.streak.days - 1) % 7;
    const claimed = S.streak.claimedDay === meta.today;
    let html = `<div class="blk"><div class="room"><span class="h">连续出海 ${S.streak.days} 天</span><span class="cap">第 7 天有大礼</span></div><div class="week">`;
    STREAK_REWARDS.forEach((r, i) => {
      const got = i < idx || (i === idx && claimed);
      html += `<div class="${got ? 'got' : ''} ${i === idx ? 'today' : ''}">${got ? svg('check') : svg(r.pts ? 'gift' : 'spark')}<span>${i + 1}天</span></div>`;
    });
    html += '</div>';
    if (meta.streakGift) html += `<button class="btn-p" id="claimStreak" style="margin-top:12px">领取今日出海奖励</button>`;
    html += `</div><div class="sect">今日任务 · 每天刷新</div>`;
    for (const t of S.today.tasks) {
      const d = meta.taskDef(t.id);
      const rw = [d.reward.bait ? `幸运饵 ×${d.reward.bait}` : '', d.reward.pts ? `+${d.reward.pts} 分` : '', d.reward.item ? `🎁${{ common: '普通', rare: '稀有', epic: '史诗', legendary: '传说' }[d.reward.item] || ''}道具` : ''].filter(Boolean).join(' · ');
      html += `<div class="li task"><div class="m"><b>${esc(d.text)}</b><span>${t.n}/${d.goal} · ${rw}</span><div class="bar"><i style="width:${(t.n / d.goal) * 100}%"></i></div></div><button data-claim="${t.id}" class="${t.claimed ? 'ok' : t.done ? 'go' : ''}">${t.claimed ? '已领取' : t.done ? '领取' : '进行中'}</button></div>`;
    }
    html += `<div class="cap" style="margin:12px 4px">幸运饵：挂上后下一条必定「特别」以上，且更容易出稀有</div>`;
    body.innerHTML = html;
    body.querySelector('#claimStreak')?.addEventListener('click', () => { ctx.onClaimStreak(); renderSheet(ctx); });
    body.querySelectorAll('[data-claim]').forEach((b) => b.onclick = () => { if (b.classList.contains('go')) { ctx.onClaimTask(b.dataset.claim); renderSheet(ctx); } });
  }
}
// 排行页开着时，只低频刷新好友实时状态文本（不重绘整页）
export function refreshMates(anglers) {
  if (!sheetState.open || sheetState.tab !== 'rank') return;
  for (const a of anglers) {
    const el = document.querySelector(`[data-fst="${a.id}"]`); if (!el) continue;
    const t = friendStatus(a); if (el.textContent !== t) el.textContent = t;
    el.parentElement.classList.toggle('hot', ['bite', 'hookset', 'fight', 'hold', 'land'].includes(a.state));
  }
}

// ---------------- 启动页 ----------------
export function splashProgress(k, text) { $('loadBar').style.width = `${Math.round(k * 100)}%`; if (text) $('loadT').textContent = text; }
