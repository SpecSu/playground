// 基因引擎 genes.js（DESIGN §4.1 契约）：关键词 → gx 改造 / 融合 / 变异 / 放生积分 / 卡片标签 / 大海里别人的鱼
// 纯逻辑（除 imageHints 用 canvas），结果由 seed 决定 —— 提交改造时立即算好存进卵，孵化只是揭晓
import { SPECIES, SPECIES_BY_ID, CREATORS, RARITY_ORDER, makeVariant, rarityOf, ensureUgc } from './fishes.js';
import { rng, newSeed, PATTERNS, PAT, DECOS } from './ugc.js';
import { EXTRAS, MATS, EXTRA_IDS, MAT_IDS, defaultGx, normGx, extraOk, funnyName } from './parts.js';
import { ITEMS, ITEM_BY_ID, ITEM_CATS, ITEM_RARITY_ORDER, COMBOS, MAX_PICK, rollItemDrop } from './items.js';
export { EXTRAS, MATS, EXTRA_IDS, MAT_IDS };
// 道具系统（v1.1：基因改造 = 选 ≤3 个钓上来的装饰物）—— 配置表在 items.js，这里统一再导出
export { ITEMS, ITEM_BY_ID, ITEM_IDS, ITEM_CATS, ITEM_RARITY, ITEM_RARITY_ORDER, COMBOS, MAX_PICK, STARTER_PACK, ITEM_CATCH_P, ITEM_MOUTH_P, ITEM_POD, rollItemDrop, rollItemCatch, itemLabel } from './items.js';

const ME = '@我';   // 调用方可在 opts.creator 传入 '@' + 玩家名
// ---------------- 关键词贴纸（前 12 个 = 设计稿里的快捷贴纸） ----------------
export const GENE_TAGS = [
  { id: 'wings', label: '翅膀', emoji: '🪽', kw: ['翅膀', '翼', '会飞', '飞天', '天使', '蝙蝠', 'wing', 'fly', 'angel'] },
  { id: 'jelly', label: '果冻', emoji: '🫧', kw: ['果冻', '布丁', '啫喱', '透明', '幽灵', '鬼魂', 'ghost', 'jelly', 'pudding'] },
  { id: 'flame', label: '火焰', emoji: '🔥', kw: ['火焰', '火', '燃烧', '烈焰', 'fire', 'flame', 'burn'] },
  { id: 'mech', label: '机械', emoji: '🤖', kw: ['机械', '机器', '赛博', '铁皮', '齿轮', '蒸汽', '机甲', '钢铁侠', 'robot', 'mecha', 'mech', 'cyber', 'steampunk'] },
  { id: 'candy', label: '糖果', emoji: '🍬', kw: ['糖果', '棒棒糖', '甜甜', '糖', '甜', 'candy', 'sweet', 'lollipop'] },
  { id: 'galaxy', label: '宇宙', emoji: '🌌', kw: ['宇宙', '星空', '银河', '星云', '外星', 'galaxy', 'cosmic', 'nebula'] },
  { id: 'cat', label: '猫耳', emoji: '🐱', kw: ['猫耳', '猫', '喵', 'cat', 'kitty', 'neko', 'meow'] },
  { id: 'horn', label: '独角', emoji: '🦄', kw: ['独角', '独角兽', '犄角', '恶魔', '魔鬼', '牛角', 'unicorn', 'devil', 'demon', 'horn'] },
  { id: 'big', label: '巨大', emoji: '🐳', kw: ['巨大', '超大', '大只', '大块头', '巨', 'big', 'huge', 'giant'] },
  { id: 'glow', label: '发光', emoji: '💡', kw: ['发光', '夜光', '荧光', '霓虹', '闪亮', '闪电', '雷电', '电光', '带电', 'glow', 'lightning', 'electric', 'neon', 'shiny'] },
  { id: 'plush', label: '毛绒', emoji: '🧸', kw: ['毛绒', '毛茸茸', '绒毛', '玩偶', '软乎乎', 'plush', 'fluffy', 'fuzzy', 'teddy'] },
  { id: 'crystal', label: '水晶', emoji: '💎', kw: ['水晶', '钻石', '宝石', '冰晶', '冰', '玻璃', 'crystal', 'diamond', 'gem', 'ice'] },
  { id: 'rainbow', label: '彩虹', emoji: '🌈', kw: ['彩虹', '七彩', 'rainbow'] },
  { id: 'gold', label: '黄金', emoji: '🏆', kw: ['黄金', '金色', '金子', '土豪', '金', 'gold', 'golden'] },
  { id: 'lava', label: '岩浆', emoji: '🌋', kw: ['岩浆', '熔岩', '火山', 'lava', 'magma', 'volcano'] },
  { id: 'holo', label: '镭射', emoji: '🪩', kw: ['镭射', '全息', '幻彩', '迪斯科', 'holo', 'laser', 'disco'] },
  { id: 'eyes', label: '三眼', emoji: '👀', kw: ['三眼', '三只眼', '四眼', '五眼', '多眼', '独眼', 'three eyes', 'cyclops'] },
  { id: 'cute', label: '大萌眼', emoji: '🥺', kw: ['大眼', '萌', '可爱', 'cute', 'kawaii'] },
  { id: 'legs', label: '小短腿', emoji: '🦵', kw: ['腿', '脚', '走路', '跑步', 'leg', 'walk', 'run'] },
  { id: 'lantern', label: '灯笼', emoji: '🏮', kw: ['灯笼', '灯泡', '提灯', '鮟鱇', 'lantern', 'bulb', 'lamp'] },
  { id: 'flower', label: '开花', emoji: '🌸', kw: ['开花', '花朵', '樱花', '春天', '花', 'flower', 'bloom', 'blossom'] },
  { id: 'party', label: '生日', emoji: '🎂', kw: ['生日', '蜡烛', '蛋糕', '派对', 'birthday', 'candle', 'cake', 'party'] },
  { id: 'mustache', label: '胡子', emoji: '🥸', kw: ['胡子', '八字胡', '绅士', '大叔', 'mustache', 'gentleman'] },
  { id: 'star', label: '星星', emoji: '⭐', kw: ['星星', '许愿', '流星', '星', 'star', 'wish'] },
  { id: 'astro', label: '宇航员', emoji: '🧑‍🚀', kw: ['宇航', '太空', '航天', '头盔', 'astronaut', 'space', 'helmet'] },
  { id: 'tentacle', label: '触须', emoji: '🪼', kw: ['触须', '触手', '水母', 'tentacle', 'jellyfish'] },
  { id: 'spots', label: '波点', emoji: '🔴', kw: ['波点', '圆点', '疙瘩', '点点', 'polka', 'dots', 'spots'] },
  { id: 'antler', label: '鹿角', emoji: '🦌', kw: ['鹿角', '驯鹿', '圣诞', '鹿', 'antler', 'deer', 'christmas', 'reindeer'] },
  { id: 'punk', label: '朋克', emoji: '🤘', kw: ['朋克', '摇滚', '鸡冠', '莫西干', 'punk', 'rock', 'mohawk'] },
  { id: 'long', label: '细长', emoji: '🥢', kw: ['细长', '长条', '面条', '苗条', 'long', 'noodle', 'slim'] },
  { id: 'round', label: '圆滚滚', emoji: '🍡', kw: ['圆滚滚', '胖', '圆', '球', '肥', '胖嘟嘟', 'chubby', 'round', 'fat', 'ball'] },
  { id: 'tiny', label: '迷你', emoji: '🤏', kw: ['迷你', '袖珍', '小只', 'mini', 'tiny'] },
  { id: 'zebra', label: '斑马', emoji: '🦓', kw: ['斑马', '黑白', 'zebra'] },
];

const PAL = {
  fire: ['#ffe2b8', '#ff4a1c', '#ffd23f'], candy: ['#ffe3f1', '#ff6fb5', '#7fe3ff'], rainbow: ['#fff6fb', '#ff6fb5', '#7fe3ff'],
  neon: ['#e8fff8', '#00e5c7', '#ff3df2'], sakura: ['#ffe8f1', '#ff8fbf', '#ffffff'], unicorn: ['#fdf0ff', '#c59bff', '#7fe3ff'],
  zebra: ['#f6f6f6', '#232631', '#ff6fb5'], lava: ['#3a1a1a', '#ff5a1f', '#ffd23f'], ice: ['#eafcff', '#7fd6ff', '#ffffff'],
};
const COLOR_WORDS = [
  [['粉', 'pink'], ['#ffe3f0', '#ff5fa2', '#ffffff']], [['蓝', 'blue'], ['#e2f2ff', '#3f8cff', '#ffffff']], [['绿', '抹茶', 'green'], ['#e6ffe6', '#36c46b', '#fff6c0']],
  [['紫', '葡萄', 'purple'], ['#f0e6ff', '#7b5cff', '#ffd23f']], [['黄', '柠檬', 'yellow'], ['#fff9d6', '#ffcc1a', '#ff7a5c']], [['红', '草莓', 'red'], ['#ffe3e3', '#ff3b5c', '#fff4d6']],
  [['黑', '暗黑', 'black'], ['#3a3550', '#14121c', '#ff3df2']], [['白', '雪', 'white'], ['#ffffff', '#dfe8f4', '#7fd6ff']], [['橙', '橘', 'orange'], ['#ffe8cc', '#ff8a1f', '#ffffff']],
];
// 部件槽位冲突：同组只留最新的那个
const EXCL = [['flame', 'crystalSpikes', 'candles', 'mohawk'], ['legs', 'jellyTentacles'], ['propeller', 'lightbulb', 'bubbleHelmet', 'antlers']];
// 每个标签的效果（mat 优先级：p=2 主效果，p=1 附带）
const FX = {
  wings: { nm: '翅膀', ch: '🪽 长出了会扇的翅膀', x: ['wings'] },
  jelly: { nm: '果冻', ch: '🫧 身体变成 Q 弹果冻', mat: ['jelly', 2] },
  flame: { nm: '火焰', ch: '🔥 背上燃起火焰 + 火焰纹', x: ['flame'], pat: PAT.flame, pal: PAL.fire },
  mech: { nm: '机械', ch: '🤖 机械改造：铬合金外壳', mat: ['chrome', 2], fn: (g, r) => { addX(g, r() < 0.55 ? 'propeller' : 'gear'); if (r() < 0.35) addX(g, 'gear'); } },
  candy: { nm: '糖果', ch: '🍬 糖果色亮晶晶外壳', mat: ['candy', 2], pal: PAL.candy, fn: (g, r) => { if (g.pattern == null) g.pattern = r() < 0.5 ? 0 : 2; } },
  galaxy: { nm: '星空', ch: '🌌 身体里装进一片星空', mat: ['galaxy', 2], glow: 0.15 },
  cat: { nm: '猫耳', ch: '🐱 长出猫耳和胡须', x: ['catEars', 'whiskers'] },
  horn: { nm: '独角', ch: '🦄 头上长出独角', x: ['horn'] },
  big: { nm: '大块头', ch: '🐳 体型变大了', fn: (g, r, n) => { g.scale = Math.min(1.5, (g.scale || 1) * 1.5); n.cm = r1(n.cm * 1.5); } },
  glow: { nm: '发光', ch: '💡 会在黑暗里发光', glow: 0.7, fn: (g) => { if (!g.palette) g.palette = PAL.neon; } },
  plush: { nm: '毛绒', ch: '🧸 变得毛茸茸', mat: ['plush', 2] },
  crystal: { nm: '水晶', ch: '💎 水晶身体 + 背上长出晶刺', mat: ['crystal', 2], x: ['crystalSpikes'] },
  rainbow: { nm: '彩虹', ch: '🌈 彩虹配色', mat: ['holo', 1], pat: PAT.rainbow, pal: PAL.rainbow },
  gold: { nm: '黄金', ch: '🏆 全身镀金', mat: ['gold', 2] },
  lava: { nm: '岩浆', ch: '🌋 岩浆身体，裂缝在发光', mat: ['lava', 2] },
  holo: { nm: '镭射', ch: '🪩 镭射幻彩外壳', mat: ['holo', 2] },
  eyes: { nm: '多眼', ch: '👀 眼睛变多了', fn: (g, r, n, p) => { g.eyes = /独眼|cyclops/.test(p) ? 1 : /五眼/.test(p) ? 5 : /四眼/.test(p) ? 4 : /三眼|三只眼/.test(p) ? 3 : 3 + Math.floor(r() * 3); } },
  cute: { nm: '大眼', ch: '🥺 眼睛变得超大超萌', fn: (g) => { g.eyeK = Math.min(2, Math.max(g.eyeK || 1, 1.5) + 0.3); } },
  legs: { nm: '长腿', ch: '🦵 长出两条小短腿', x: ['legs'] },
  lantern: { nm: '提灯', ch: '🏮 头顶挂上深海灯笼', x: ['lightbulb'], glow: 0.1 },
  flower: { nm: '开花', ch: '🌸 身上开满小花', x: ['flowers'], fn: (g) => { if (!g.palette) g.palette = PAL.sakura; } },
  party: { nm: '生日', ch: '🎂 背上插满生日蜡烛', x: ['candles'] },
  mustache: { nm: '绅士', ch: '🥸 长出八字胡', x: ['mustache'] },
  star: { nm: '星星', ch: '⭐ 尾巴变成星星', x: ['starTail'] },
  astro: { nm: '宇航员', ch: '🧑‍🚀 戴上泡泡头盔', x: ['bubbleHelmet'] },
  tentacle: { nm: '水母', ch: '🪼 肚子下飘起果冻触须', x: ['jellyTentacles'] },
  spots: { nm: '波点', ch: '🔴 冒出立体波点', x: ['spots3d'], fn: (g) => { if (g.pattern == null) g.pattern = 2; } },
  antler: { nm: '鹿角', ch: '🦌 长出圣诞鹿角', x: ['antlers'] },
  punk: { nm: '朋克', ch: '🤘 朋克鸡冠头', x: ['mohawk'] },
  long: { nm: '面条', ch: '🥢 身体拉长了', fn: (g) => { g.stretch = [cl(g.stretch[0] * 1.3, 0.6, 1.7), cl(g.stretch[1] * 0.85, 0.6, 1.7), cl(g.stretch[2] * 0.9, 0.6, 1.7)]; } },
  round: { nm: '圆滚滚', ch: '🍡 变得圆滚滚', fn: (g) => { g.stretch = [cl(g.stretch[0] * 0.85, 0.6, 1.7), cl(g.stretch[1] * 1.22, 0.6, 1.7), cl(g.stretch[2] * 1.22, 0.6, 1.7)]; } },
  tiny: { nm: '迷你', ch: '🤏 缩成迷你款', fn: (g, r, n) => { n.cm = r1(n.cm * 0.6); g.eyeK = Math.min(2, (g.eyeK || 1) + 0.25); } },
  zebra: { nm: '斑马', ch: '🦓 斑马条纹', pat: PAT.zebra, pal: PAL.zebra },
};
const FUN_POOL = ['wings', 'flame', 'cat', 'horn', 'eyes', 'party', 'jelly', 'glow', 'legs', 'lantern', 'mustache', 'star', 'candy', 'punk', 'antler', 'tentacle', 'plush', 'astro', 'spots', 'round'];

const r1 = (x) => Math.round(x * 10) / 10;
const cl = (x, a, b) => +Math.min(b, Math.max(a, x)).toFixed(2);
const clone = (o) => JSON.parse(JSON.stringify(o));
const newId = () => newSeed().toString(36) + Date.now().toString(36).slice(-4);
function addX(g, id) {
  if (!EXTRAS[id]) return;
  const grp = EXCL.find((e) => e.includes(id));
  if (grp) g.extras = g.extras.filter((k) => k === id || !grp.includes(k));
  if (!g.extras.includes(id)) g.extras.push(id);
  while (g.extras.length > 4) g.extras.shift();
}

// ---------------- 变异 ----------------
// r: rng 函数或 [0,1) 数值；luckBoost: 0~1 概率放大
export function rollMutation(r = Math.random, luckBoost = 0) {
  const x = typeof r === 'function' ? r() : typeof r === 'number' ? r : Math.random();
  const k = 1 + Math.max(0, luckBoost);
  if (x < 0.005 * k) return 'giant+rare';
  if (x < (0.005 + 0.06) * k) return 'rare';
  if (x < (0.005 + 0.06 + 0.08) * k) return 'giant';
  return null;
}
const RARE_MATS = ['holo', 'galaxy', 'gold', 'crystal'];
function applyMutation(n, mut, r, changes) {
  n.mut = mut || null;
  if (!mut) return;
  if (mut.includes('giant')) {
    const k = 1.8 + r() * 0.7;
    n.cm = r1(n.cm * k); n.gx.scale = +Math.min(2.5, Math.max(1.8, k)).toFixed(2);
    changes.push(`⚠️ 突变！巨大化 ×${k.toFixed(1)}`);
  }
  if (mut.includes('rare')) {
    const m = RARE_MATS[Math.floor(r() * RARE_MATS.length) % RARE_MATS.length];
    n.gx.mat = m; n.gx.glow = Math.max(n.gx.glow || 0, 0.35);
    const cur = RARITY_ORDER.indexOf(rarityOf(n));
    const tgt = r() < 0.3 ? 4 : 3;
    n.rarity = RARITY_ORDER[Math.max(cur, tgt)];
    changes.push(`⚠️ 突变！珍稀${MATS[m].label}材质 · ${n.rarity === 'legendary' ? '传说' : '史诗'}`);
  }
}
function kgOf(n) { const sp = SPECIES_BY_ID[n.sp]; const k = n.cm / sp.cm; const raw = sp.kgm * (n.cm / 100) ** 2 * (sp.cm / 100) * k; return raw >= 1 ? r1(raw) : Math.max(0.02, Math.round(Math.max(raw, (n.cm / 100) ** 3 * 20) * 100) / 100); }

function child(v, seed, creator) {
  const n = clone(v);
  n.id = newId(); n.uid = n.id; n.seed = seed >>> 0;
  n.gx = normGx(v.gx);
  n.gen = (v.gen || 0) + 1; n.creator = creator || ME; n.parents = [v.uid || v.id]; n.mut = null; n.fromOcean = null;
  n.history = (v.history || []).slice(-6);
  n.traits = (v.traits || []).slice();
  return n;
}
function matchTags(prompt) {
  const p = String(prompt || '').toLowerCase().replace(/花纹/g, '纹').replace(/圆点/g, '波点');
  const hits = [];
  for (const t of GENE_TAGS) {
    let best = -1;
    for (const k of t.kw) { const i = p.indexOf(k.toLowerCase()); if (i >= 0 && (best < 0 || i < best)) best = i; }
    if (best >= 0) hits.push([best, t.id]);
  }
  // 互相包含的词去重：「独角兽」不算「角」…；「水母」同时触发果冻触须（tentacle）——jelly 关键词不含水母
  hits.sort((a, b) => a[0] - b[0]);
  let ids = hits.map((h) => h[1]);
  if (ids.includes('lava')) ids = ids.filter((x) => x !== 'flame' || /火焰|flame|fire/.test(p));
  if (ids.includes('astro') && ids.includes('galaxy') && !/宇宙|星空|银河|星云|galaxy|cosmic|nebula/.test(p)) ids = ids.filter((x) => x !== 'galaxy');
  if (ids.includes('galaxy') || ids.includes('astro')) ids = ids.filter((x) => x !== 'star' || /星星|许愿|流星|star|wish/.test(p));
  if (ids.includes('cat') && ids.includes('mustache') && !/胡子|八字胡|mustache/.test(p)) ids = ids.filter((x) => x !== 'mustache');
  if (ids.includes('big') && ids.includes('cute') && /大眼/.test(p) && !/巨大|超大|大只|big|huge/.test(p)) ids = ids.filter((x) => x !== 'big');
  return { ids, p };
}
function applyTags(n, ids, p, r, changes, sp) {
  const names = [];
  let matP = 0;
  for (const id of ids) {
    const e = FX[id]; if (!e) continue;
    const g = n.gx;
    let ok = true;
    if (e.x) { const xs = e.x.filter((k) => extraOk(k, sp.id)); if (!xs.length && !e.mat && !e.pat && !e.fn) ok = false; xs.forEach((k) => addX(g, k)); }
    if (!ok) continue;
    if (e.mat && e.mat[1] >= matP) { g.mat = e.mat[0]; matP = e.mat[1]; }
    if (e.pat != null) g.pattern = e.pat;
    if (e.pal) g.palette = e.pal.slice();
    if (e.glow) g.glow = Math.max(g.glow || 0, e.glow);
    e.fn?.(g, r, n, p);
    if (id === 'horn' && !g.palette && /独角兽|unicorn/.test(p)) g.palette = PAL.unicorn.slice();
    if (id === 'tentacle' && /水母|jellyfish/.test(p) && !g.mat) { g.mat = 'jelly'; matP = 1; }
    if (id === 'crystal' && /冰/.test(p) && !g.palette) g.palette = PAL.ice.slice();
    changes.push(e.ch); names.push(e.nm);
  }
  return names;
}
function colorWords(p) { for (const [ws, pal] of COLOR_WORDS) if (ws.some((w) => p.includes(w))) return pal.slice(); return null; }

// ---------------- 描述改造 ----------------
export function designFromPrompt(v, { prompt = '', palette = null, creator = null } = {}, seed = newSeed()) {
  const r = rng((seed ^ 0x9e3779b9) >>> 0);
  const sp = SPECIES_BY_ID[v.sp];
  const n = child(v, seed, creator);
  const changes = [];
  const { ids, p } = matchTags(prompt);
  let names = applyTags(n, ids, p, r, changes, sp);
  const cw = colorWords(p);
  if (cw && !palette && !ids.some((id) => FX[id].pal)) { n.gx.palette = cw; changes.push('🎨 换上了你说的颜色'); }
  if (!names.length && !(palette && palette.length)) {
    // 没命中任何关键词：随机抽 2 个有趣改造，「基因自己有了想法」
    const pool = FUN_POOL.filter((id) => !FX[id].x || FX[id].x.some((k) => extraOk(k, sp.id)));
    const a = pool[Math.floor(r() * pool.length) % pool.length];
    let b = pool[Math.floor(r() * pool.length) % pool.length]; if (b === a) b = pool[(pool.indexOf(a) + 5) % pool.length];
    changes.push('🧬 基因自己有了想法！');
    names = applyTags(n, [a, b], '', r, changes, sp);
  }
  if (palette && palette.length) { n.gx.palette = [palette[0], palette[1] || palette[0], palette[2] || palette[1] || palette[0]]; changes.push('🎨 颜色来自你的图片'); }
  // 数值：cm ×(0.9~1.3)，30% 稀有度升一级
  n.cm = r1(n.cm * (0.9 + r() * 0.4));
  if (r() < 0.3) { const i = RARITY_ORDER.indexOf(rarityOf(n)); if (i < 4) { n.rarity = RARITY_ORDER[i + 1]; changes.push('⬆️ 稀有度提升'); } }
  const mut = rollMutation(r);
  applyMutation(n, mut, r, changes);
  n.sizeK = +(n.cm / sp.cm).toFixed(3); n.kg = kgOf(n);
  n.nick = makeNick(sp, n, names, r);
  n.history.push({ t: Date.now(), type: 'prompt', prompt: String(prompt).slice(0, 60), image: palette ? palette.slice(0, 3) : undefined, from: v.uid || v.id });
  return { v: n, changes, mut };
}
function makeNick(sp, n, names, r) {
  let nm = names.length ? names.slice(0, 2).join('') + sp.name : funnyName(sp.name, n.gx, n.ugc?.decos, r, null);
  if (n.mut && n.mut.includes('giant') && !nm.startsWith('巨型')) nm = '巨型' + nm;
  return nm;
}

// ================= 道具改造（v1.1）：选 ≤3 个装饰物 → 确定性改造 gx =================
const NOT_FISHY = new Set(['octopus', 'king-crab', 'snow-crab', 'manta-ray', 'lobster', 'squid', 'cuttlefish', 'starfish', 'jellyfish', 'mantis-shrimp', 'flounder']);   // 同 ugc.js：没有正常"脸/脖子"的体型
const decoOk = (k, spId) => !!DECOS[k] && !(DECOS[k].fishy && NOT_FISHY.has(spId));
function setDeco(u, k) {
  if (!u || !DECOS[k]) return;
  u.decos = (u.decos || []).filter((d) => d !== k && DECOS[d]?.slot !== DECOS[k].slot);
  u.decos.push(k);
  while (u.decos.length > 3) u.decos.shift();
}
const RAR_UP_P = { common: 0, rare: 0.04, epic: 0.08, legendary: 0.15 };
// 选中的道具 → 去重 / 去无效 / 最多 3 个（保持点选顺序）
export function resolveItems(itemIds) {
  const out = [];
  for (const id of itemIds || []) if (ITEM_BY_ID[id] && !out.includes(id)) out.push(id);
  return out.slice(0, MAX_PICK);
}
export function combosOf(itemIds) {
  const ids = resolveItems(itemIds);
  const cnt = {}; for (const id of ids) cnt[ITEM_BY_ID[id].cat] = (cnt[ITEM_BY_ID[id].cat] || 0) + 1;
  return COMBOS.filter((c) => (!c.all || c.all.every((x) => ids.includes(x))) && (!c.cats || Object.entries(c.cats).every(([k, m]) => (cnt[k] || 0) >= m)));
}
// 变异概率：基础 巨大 8% / 珍稀 6% / 双重 0.5%；luck 整体放大，rareBoost 只放大珍稀；总和封顶 60%
export function itemMutRates(itemIds) {
  const ids = resolveItems(itemIds);
  let luck = 0, rb = 0;
  for (const id of ids) { const f = ITEM_BY_ID[id].fx; luck += f.luck || 0; rb += f.rareBoost || 0; }
  for (const c of combosOf(ids)) luck += c.fx.luck || 0;
  const k = 1 + luck, kr = k * (1 + rb);
  let both = 0.005 * kr, rare = 0.06 * kr, giant = 0.08 * k;
  const tot = both + rare + giant;
  if (tot > 0.6) { const s = 0.6 / tot; both *= s; rare *= s; giant *= s; }
  return { giant, rare, both, total: both + rare + giant, luck, rareBoost: rb };
}
function rollItemMut(r, R) {
  const x = typeof r === 'function' ? r() : r;
  if (x < R.both) return 'giant+rare';
  if (x < R.both + R.rare) return 'rare';
  if (x < R.both + R.rare + R.giant) return 'giant';
  return null;
}
// 把道具按类别分组（保留点选顺序）
function groupItems(ids) {
  const g = { deco: [], dye: [], essence: [], wonder: [] };
  for (const id of ids) g[ITEM_BY_ID[id].cat].push(ITEM_BY_ID[id]);
  return g;
}
// 精华优先级：matP 高 > 稀有度高 > 先选
const essOrder = (arr) => arr.map((it, i) => ({ it, i })).sort((a, b) => (b.it.fx.matP || 0) - (a.it.fx.matP || 0) || ITEM_RARITY_ORDER.indexOf(b.it.rarity) - ITEM_RARITY_ORDER.indexOf(a.it.rarity) || a.i - b.i).map((x) => x.it);
// 配色合成：1 种 = 原色；2 种 = 渐变双色（底色取第一种、图案色取第二种）；3 种 = 三色条纹
function mixDyes(dyes) {
  if (!dyes.length) return null;
  if (dyes.length === 1) return { pal: dyes[0].fx.pal.slice(), pat: dyes[0].fx.pat ?? null, kind: 'one' };
  const [a, b, c] = dyes;
  if (dyes.length === 2) return { pal: [a.fx.pal[0], b.fx.pal[1], a.fx.pal[1]], pat: (a.fx.pat === 14 || b.fx.pat === 14) ? 14 : 3, kind: 'two' };
  return { pal: [a.fx.pal[0], b.fx.pal[1], c.fx.pal[1]], pat: 0, kind: 'three' };
}

/**
 * 道具改造：v + ≤3 个道具 id → 新鱼（确定性：同 v / 同道具 / 同 seed → 同结果）
 * @returns {{ v, changes: string[], mut, combos: string[], items: string[] }}
 */
export function designFromItems(v, itemIds, seed = newSeed(), { creator = null } = {}) {
  let ids = resolveItems(itemIds);
  const r = rng((seed ^ 0x27d4eb2f) >>> 0);
  const sp = SPECIES_BY_ID[v.sp];
  const n = child(v, seed, creator);
  const changes = [];
  if (!n.ugc) { const tmp = clone(v); ensureUgc(tmp); if (tmp.ugc) { n.ugc = tmp.ugc; n.title = n.title || tmp.title; } }
  if (n.ugc) n.ugc = { ...n.ugc, decos: (n.ugc.decos || []).slice() };
  if (!ids.length) {   // 兜底：没放道具 → 基因自己挑 2 个普通道具
    const pool = ITEMS.filter((it) => it.rarity === 'common');
    const a = pool[Math.floor(r() * pool.length) % pool.length]; let b = pool[Math.floor(r() * pool.length) % pool.length]; if (b === a) b = pool[(pool.indexOf(a) + 3) % pool.length];
    ids = [a.id, b.id]; changes.push('🧬 什么都没放，基因自己有了想法！');
  }
  const G = groupItems(ids), g = n.gx;
  let matP = 0, rarUp = 0, applied = [];
  const glow = (x) => { if (x) g.glow = +Math.min(1, Math.max(g.glow || 0, x)).toFixed(2); };
  const setMat = (m, p) => { if (m && MATS[m] && p >= matP) { g.mat = m; matP = p; } };
  // ① 装饰配件：长出部件 / 戴上头饰；体型不合适的 → 变成闪亮贴纸（道具不浪费）
  for (const it of G.deco) {
    const f = it.fx; let ok = false;
    if (f.extras) { const xs = f.extras.filter((k) => extraOk(k, sp.id)); xs.forEach((k) => addX(g, k)); ok = ok || xs.length > 0; }
    if (f.deco && n.ugc && decoOk(f.deco, sp.id)) { setDeco(n.ugc, f.deco); ok = true; }
    setMat(f.mat, f.matP || 1); glow(f.glow);
    if (ok) { changes.push(it.ch); applied.push(it); }
    else { if (n.ugc) setDeco(n.ugc, 'sticker'); glow(0.2); changes.push(`${it.emoji} ${sp.name}戴不上${it.name}，把它变成了闪亮贴纸`); }
  }
  // ② 天然着色剂：配色 / 花纹（两种 = 渐变双色，三种 = 三色条纹）
  const mix = mixDyes(G.dye);
  if (mix) {
    g.palette = mix.pal; if (mix.pat != null) g.pattern = mix.pat;
    if (mix.kind === 'one') changes.push(G.dye[0].ch);
    else if (mix.kind === 'two') changes.push(`🎨 ${G.dye[0].name} × ${G.dye[1].name}：渐变双色${mix.pat === 14 ? '彩虹纹' : ''}`);
    else changes.push(`🎨 ${G.dye.map((d) => d.name).join(' × ')}：三色条纹`);
    for (const d of G.dye) { glow(d.fx.glow); setMat(d.fx.mat, d.fx.matP || 1); }
  }
  // ③ 材质精华：一种材质为主；多种 = 打一架，赢家定材质，输家变成微光
  const ess = essOrder(G.essence);
  if (ess.length) {
    const win = ess[0];
    setMat(win.fx.mat, win.fx.matP || 2); glow(win.fx.glow); changes.push(win.ch);
    for (const lo of ess.slice(1)) { g.glow = +Math.min(1, (g.glow || 0) + 0.15).toFixed(2); glow(lo.fx.glow); changes.push(`🌀 ${lo.name}和${win.name}打了一架，${win.name}赢了（多了一点微光）`); }
    for (const e of ess) rarUp += e.fx.rarityUp || 0;
    if (mix) changes.push(`🎨+🧪 ${mix.kind === 'one' ? G.dye[0].adj : mix.kind === 'two' ? '渐变' : '三色'}色的${MATS[g.mat]?.label || ''}质感叠加`);
  }
  // ④ 奇迹道具：发光 / 体型 / 眼睛 / 运气
  for (const it of G.wonder) {
    const f = it.fx;
    glow(f.glow);
    if (f.scale) { const k = Math.min(1.5 / (g.scale || 1), f.scale); g.scale = +Math.min(1.5, (g.scale || 1) * f.scale).toFixed(2); n.cm = r1(n.cm * Math.max(1.15, k)); }
    if (f.eyes) g.eyes = Math.min(5, (g.eyes === 1 ? 2 : g.eyes || 2) + f.eyes);
    rarUp += f.rarityUp || 0;
    changes.push(it.ch);
  }
  // ⑤ 组合彩蛋
  const combos = combosOf(ids);
  for (const c of combos) {
    const f = c.fx;
    glow(f.glow);
    if (f.pal) g.palette = f.pal.slice();
    if (f.palIfNone && !mix) g.palette = f.palIfNone.slice();
    if (f.pat != null) g.pattern = f.pat;
    if (f.mat) setMat(f.mat, 3);
    rarUp += f.rarityUp || 0;
    changes.push(c.ch);
  }
  if (combos.length) n.epithet = combos[0].title;
  // ⑥ 数值：体长 ×(0.92~1.22)；稀有度：道具/彩蛋必升 + 概率升（基础 15% + 稀有道具加成）
  n.cm = r1(n.cm * (0.92 + r() * 0.3));
  let up = rarUp;
  const upP = 0.15 + ids.reduce((s, id) => s + RAR_UP_P[ITEM_BY_ID[id].rarity], 0);
  if (r() < upP) up = Math.max(up, 1);
  if (up > 0) { const i = RARITY_ORDER.indexOf(rarityOf(n)); const j = Math.min(4, i + up); if (j > i) { n.rarity = RARITY_ORDER[j]; changes.push(`⬆️ 稀有度提升${j - i > 1 ? ` ×${j - i}` : ''}`); } }
  // ⑦ 变异（幸运海星 / 彩虹珍珠提高概率）
  const R = itemMutRates(ids);
  const mut = rollItemMut(r, R);
  applyMutation(n, mut, r, changes);
  n.sizeK = +(n.cm / sp.cm).toFixed(3); n.kg = kgOf(n);
  n.nick = makeItemNick(sp, n, G, mix, ess[0], combos, applied);
  n.history.push({ t: Date.now(), type: 'items', items: ids.slice(), from: v.uid || v.id });
  return { v: n, changes, mut, combos: combos.map((c) => c.title), items: ids };
}
// 新名字：「[彩蛋称号·][配件][配色][材质]物种」——例：戴皇冠的极光果冻小丑鱼 / 飞马·长翅膀的珊瑚粉小丑鱼
function makeItemNick(sp, n, G, mix, essWin, combos, applied) {
  const deco = applied[0]?.adj || '';
  const color = !mix ? '' : mix.kind === 'one' ? G.dye[0].adj : mix.kind === 'two' ? '渐变' : '三色';
  const mat = n.mut && n.mut.includes('rare') ? ({ jelly: '果冻', candy: '糖果', chrome: '铁皮', plush: '毛绒', crystal: '水晶', galaxy: '星空', gold: '黄金', holo: '镭射', lava: '岩浆' }[n.gx.mat] || '') : (essWin?.adj || '');
  const won = G.wonder[0]?.adj || '';
  const parts = [deco, won && (!deco || !color || !mat) ? won : '', color, mat].filter(Boolean);
  const title = combos[0]?.title ? combos[0].title + '·' : '';
  const build = () => `${title}${parts.join('')}${sp.name}`;
  let nm = build();
  // 太长就依次去掉：奇迹定语 → 配色 → 配件
  for (const drop of [won, color, deco]) { if (nm.length <= 13) break; const i = parts.indexOf(drop); if (drop && i >= 0) { parts.splice(i, 1); nm = build(); } }
  if (nm === sp.name) nm = funnyName(sp.name, n.gx, n.ugc?.decos, Math.random, null);
  if (n.mut && n.mut.includes('giant') && !nm.startsWith('巨型')) nm = '巨型' + nm;
  return nm;
}
/**
 * 预览（不掷骰子）：面板上「将会：+翅膀、+极光配色、+果冻质感、变异率 12%」
 * @returns {{ ids, tags: {emoji,text,color,cat,warn?}[], combos: {title,emoji,ch}[], mut, mutPct, text, over }}
 */
export function previewItems(v, itemIds) {
  const raw = (itemIds || []).filter((id) => ITEM_BY_ID[id]);
  const ids = resolveItems(raw);
  const sp = v ? SPECIES_BY_ID[v.sp] : null;
  const tags = [];
  const G = groupItems(ids);
  for (const it of ids.map((id) => ITEM_BY_ID[id])) {
    let warn = false;
    if (it.cat === 'deco' && sp) {
      const f = it.fx;
      const ok = (f.extras || []).some((k) => extraOk(k, sp.id)) || (f.deco && decoOk(f.deco, sp.id));
      if (!ok) warn = true;
    }
    tags.push({ emoji: it.emoji, text: warn ? `${it.name}戴不上→闪亮贴纸` : it.pv, color: it.color, cat: it.cat, warn });
  }
  if (G.dye.length === 2) tags.push({ emoji: '🎨', text: '渐变双色', color: '#ff9f80', cat: 'dye' });
  if (G.essence.length >= 2) tags.push({ emoji: '🌀', text: `${essOrder(G.essence)[0].name}为主`, color: '#c39bff', cat: 'essence' });
  if (G.dye.length && G.essence.length) tags.push({ emoji: '🎨', text: '颜色+质感叠加', color: '#7b5cff', cat: 'essence' });
  const combos = combosOf(ids).map((c) => ({ title: c.title, emoji: c.emoji, ch: c.ch }));
  const mut = itemMutRates(ids);
  const mutPct = Math.round(mut.total * 100);
  const parts = tags.map((t) => t.text).concat(combos.map((c) => `彩蛋「${c.title}」`));
  const text = ids.length ? `将会：${parts.join('、')}、变异率 ${mutPct}%` : '选 1~3 个道具来装扮它';
  return { ids, tags, combos, mut, mutPct, text, over: raw.length > MAX_PICK };
}

// ---------------- 融合 ----------------
export function fuseFish(a, b, seed = newSeed(), { creator = null } = {}) {
  const r = rng((seed ^ 0x85ebca6b) >>> 0);
  const ra = RARITY_ORDER.indexOf(rarityOf(a)), rb = RARITY_ORDER.indexOf(rarityOf(b));
  const base = ra > rb ? a : rb > ra ? b : (r() < 0.5 ? a : b), other = base === a ? b : a;
  const spB = SPECIES_BY_ID[base.sp], spO = SPECIES_BY_ID[other.sp];
  const n = child(base, seed, creator); n.parents = [a.uid || a.id, b.uid || b.id];
  const ga = normGx(base.gx), go = normGx(other.gx);
  const fromBase = [], fromOther = [];
  fromBase.push(`${spB.name}的身体`);
  // 尾巴：不同物种 → 嫁接对方的尾巴
  if (other.sp !== base.sp && !spO.odd) { n.gx.parts = { tail: other.sp, fins: null, head: null }; fromOther.push(`${spO.name}的尾巴`); }
  // 部件：双方各贡献最多 2 个
  const pickN = (arr, k) => { const c = arr.slice(); const out = []; while (c.length && out.length < k) out.push(c.splice(Math.floor(r() * c.length) % c.length, 1)[0]); return out; };
  n.gx.extras = [];
  for (const k of pickN(ga.extras, 2)) { addX(n.gx, k); fromBase.push(EXTRAS[k].emoji + EXTRAS[k].label); }
  for (const k of pickN(go.extras.filter((k) => extraOk(k, base.sp)), 2)) { addX(n.gx, k); fromOther.push(EXTRAS[k].emoji + EXTRAS[k].label); }
  // v1.1 装饰物（皇冠/墨镜/光环…，道具改造戴上的 ugc 头饰）：60% 随机继承对方 1 件（同槽位替换）
  const od = (other.ugc?.decos || []).filter((k) => decoOk(k, base.sp) && !(n.ugc?.decos || []).includes(k));
  if (n.ugc && od.length && r() < 0.6) { const k = od[Math.floor(r() * od.length) % od.length]; n.ugc = { ...n.ugc, decos: (n.ugc.decos || []).slice() }; setDeco(n.ugc, k); fromOther.push('🎀' + DECOS[k].label); }
  if (!n.epithet && other.epithet && r() < 0.5) { n.epithet = other.epithet; fromOther.push(`🏅「${other.epithet}」称号`); }
  // 材质：有就继承（双方都有则随机）
  const mats = [ga.mat && [ga.mat, fromBase], go.mat && [go.mat, fromOther]].filter(Boolean);
  if (mats.length) { const [m, who] = mats[Math.floor(r() * mats.length) % mats.length]; n.gx.mat = m; who.push(MATS[m].emoji + MATS[m].label + '材质'); } else n.gx.mat = null;
  // 配色 / 花纹：底色来自身体方，图案色来自另一方
  const ca = ga.palette || base.ugc?.c, co = go.palette || other.ugc?.c;
  if (ca && co) { n.gx.palette = [ca[0], co[1], co[2] || ca[2]]; fromOther.push('🎨图案配色'); }
  const po = go.pattern != null ? go.pattern : other.ugc?.pat;
  if (po != null && r() < 0.6) { n.gx.pattern = po; fromOther.push(`${PATTERNS[po] || '花纹'}纹`); }
  n.gx.eyes = r() < 0.5 ? ga.eyes : go.eyes; if (n.gx.eyes !== ga.eyes) fromOther.push('👀眼睛数量');
  n.gx.eyeK = cl((ga.eyeK + go.eyeK) / 2 + 0.1, 0.8, 2);
  n.gx.stretch = ga.stretch.map((s, i) => cl((s + go.stretch[i]) / 2 * (0.95 + r() * 0.1), 0.7, 1.6));
  n.gx.glow = Math.max(ga.glow, go.glow);
  n.gx.scale = 1;
  if (!fromOther.length) fromOther.push(`${spO.name}的灵魂`);
  // 数值：体长取两者均值 ×(0.95~1.25)（换算到身体方物种），稀有度取高 + 30% 升级
  const rel = (x) => x.cm / SPECIES_BY_ID[x.sp].cm;
  n.cm = r1(spB.cm * ((rel(a) + rel(b)) / 2) * (0.95 + r() * 0.3));
  n.rarity = RARITY_ORDER[Math.max(ra, rb)];
  const changes = [];
  if (r() < 0.3 && Math.max(ra, rb) < 4) { n.rarity = RARITY_ORDER[Math.max(ra, rb) + 1]; changes.push('⬆️ 稀有度提升'); }
  n.traits = [...new Set([...(base.traits || []), ...(other.traits || [])])].filter((t) => t !== 'giant' && t !== 'mini').slice(0, 2);
  const mut = rollMutation(r, 0.25);
  applyMutation(n, mut, r, changes);
  n.sizeK = +(n.cm / spB.cm).toFixed(3); n.kg = kgOf(n);
  const half = (s) => s.name.length > 2 ? s.name.slice(-2) : s.name;
  n.nick = `${spO.name.slice(0, 2)}${half(spB)}`;
  if (n.nick === spB.name || other.sp === base.sp) n.nick = funnyName(spB.name, n.gx, n.ugc?.decos, r, null);
  if (mut && mut.includes('giant')) n.nick = '巨型' + n.nick;
  n.history.push({ t: Date.now(), type: 'fuse', from: [a.uid || a.id, b.uid || b.id] });
  const fromA = base === a ? fromBase : fromOther, fromB = base === a ? fromOther : fromBase;
  return { v: n, fromA, fromB, mut, changes };
}

// ---------------- 放生积分 ----------------
const REL_BASE = { common: 20, uncommon: 40, rare: 80, epic: 160, legendary: 320 };
export function releaseValue(v) {
  if (!v) return 0;
  const sp = SPECIES_BY_ID[v.sp];
  const base = REL_BASE[rarityOf(v)] || 20;
  const s = sp ? v.cm / sp.cm : 1;
  const size = Math.min(1.8, Math.max(0.7, 0.6 + 0.4 * s));
  const gen = 1 + 0.3 * (v.gen || 0);
  const mut = v.mut ? 2 : 1;
  return Math.max(5, Math.round(base * size * gen * mut / 5) * 5);
}

// ---------------- 卡片标签 ----------------
const PAT_TAG = { 13: '🔥火焰纹', 14: '🌈彩虹纹', 15: '🦓斑马纹' };
export function geneSummary(v) {
  if (!v) return [];
  const out = [];
  const g = v.gx ? normGx(v.gx) : null;
  if (v.epithet) out.push('🏅' + v.epithet);
  if (v.mut) { if (v.mut.includes('giant')) out.push('🐳巨型变异'); if (v.mut.includes('rare')) out.push('✨珍稀变异'); }
  if (g) {
    for (const k of g.extras) out.push(EXTRAS[k].emoji + EXTRAS[k].label);
    if (g.mat) out.push(MATS[g.mat].emoji + MATS[g.mat].label);
    if (g.eyes !== 2) out.push(g.eyes === 1 ? '👁️独眼' : `👀${['', '', '', '三', '四', '五'][g.eyes]}眼`);
    if (g.eyeK >= 1.7) out.push('🥺大萌眼');
    if (PAT_TAG[g.pattern]) out.push(PAT_TAG[g.pattern]);
    if (g.parts?.tail && SPECIES_BY_ID[g.parts.tail]) out.push(`🐟${SPECIES_BY_ID[g.parts.tail].name}尾`);
    if (g.palette) out.push('🎨定制配色');
    if (g.glow >= 0.5) out.push('💡发光');
    if (g.scale >= 1.4 && !(v.mut || '').includes('giant')) out.push('⬆️大块头');
    const st = g.stretch;
    if (st[0] >= 1.25) out.push('🥢细长'); else if (st[1] >= 1.2 && st[0] <= 0.92) out.push('🍡圆滚滚');
  }
  if (v.gen > 0) out.push(`🧬第${v.gen}代`);
  return out;
}

// ---------------- 图片取色 ----------------
export async function imageHints(file) {
  const url = typeof file === 'string' ? file : URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const N = 56, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, N, N);
    const d = g.getImageData(0, 0, N, N).data;
    const bins = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      const b = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 }; b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2]; bins.set(k, b);
    }
    const cs = [...bins.values()].map((b) => { const c = [b.r / b.n, b.g / b.n, b.b / b.n]; const mx = Math.max(...c), mn = Math.min(...c); return { c, n: b.n, sat: mx ? (mx - mn) / mx : 0, lum: (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 }; });
    // 得分：数量 × (饱和度加成) —— 糖果风更想要鲜艳的颜色
    cs.sort((x, y) => y.n * (0.35 + y.sat) - x.n * (0.35 + x.sat));
    const out = [];
    const dist = (x, y) => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    for (const c of cs) { if (!out.some((o) => dist(o.c, c.c) < 70)) out.push(c); if (out.length === 3) break; }
    while (out.length < 3) out.push(out[0] || { c: [255, 95, 162], lum: 0.6, sat: 0.6 });
    // c1 = 最亮（底色），c2 = 最鲜艳（图案），c3 = 剩下的点缀
    const byL = out.slice().sort((x, y) => y.lum - x.lum);
    const c1 = byL[0]; const rest = out.filter((o) => o !== c1).sort((x, y) => y.sat - x.sat);
    const hex = (o) => '#' + o.c.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('');
    return { palette: [hex(c1), hex(rest[0] || c1), hex(rest[1] || rest[0] || c1)] };
  } finally { if (typeof file !== 'string') URL.revokeObjectURL(url); }
}

// ---------------- 大海里别人创作 / 放生的鱼 ----------------
const OCEAN_PROMPTS = ['会飞的火焰鱼', '机械猫耳', '彩虹果冻', '戴头盔的宇航员', '毛绒小短腿', '水晶独角兽', '岩浆朋克', '星空灯笼', '糖果生日蜡烛', '三眼绅士', '黄金鹿角', '镭射翅膀', '水母触须', '开花的圆滚滚', '斑马细长', '巨大发光', ''];
export function oceanCatch(seed = newSeed(), { maxRarity = null } = {}) {
  const r = rng((seed ^ 0xc2b2ae35) >>> 0);
  const maxI = maxRarity ? RARITY_ORDER.indexOf(maxRarity) : 4;
  const pool = SPECIES.filter((s) => RARITY_ORDER.indexOf(s.rarity) <= maxI);
  let tot = 0; for (const s of pool) tot += Math.sqrt(s.w); let x = r() * tot, sp = pool[0];
  for (const s of pool) { x -= Math.sqrt(s.w); if (x <= 0) { sp = s; break; } }
  const base = makeVariant(sp);
  base.gx = defaultGx(); base.gx.eyeK = +(1.2 + r() * 0.4).toFixed(2);
  const who = CREATORS[Math.floor(r() * CREATORS.length) % CREATORS.length];
  // v1.1：别人也是用钓到的道具改造的 —— 随机 1~3 个道具（偏普通）
  const items = []; const nIt = 1 + Math.floor(r() * 3);
  for (let i = 0; i < 6 && items.length < nIt; i++) { const id = rollItemDrop(r, {}); if (!items.includes(id)) items.push(id); }
  const res = designFromItems(base, items, (seed * 2654435761) >>> 0, { creator: who });
  const v = res.v;
  // 1~3 个特征：超出的部件裁掉
  if (v.gx.extras.length > 3) v.gx.extras = v.gx.extras.slice(0, 3);
  v.gen = 1 + Math.floor(r() * 3);
  v.creator = who; v.fromOcean = { by: who };
  v.history = [{ t: Date.now() - Math.floor(r() * 86400000), type: 'items', items, from: null }];
  v.parents = [];
  return v;
}
