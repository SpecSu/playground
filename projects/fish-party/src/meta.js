// 进度 / 存档 / 社交模拟：本地图鉴、每日任务、连签、等级、幸运饵、保底、今日精选、好友积分榜
// 全部存在 localStorage，不联网；但用"日期种子"让好友分数、今日精选、每日任务在同一天内稳定一致，模拟真实房间感。
import { SPECIES, ODDITIES, SPECIES_BY_ID, RARITY, RARITY_ORDER, CREATORS, TRAITS, makeVariant } from './fishes.js';
import * as genes from './genes.js';   // A 的真基因引擎已就位（genes_stub.js 保留作接口参考/回退）
import { ITEM_BY_ID, ITEM_CATS, ITEM_RARITY_ORDER, STARTER_PACK, rollItemDrop } from './items.js';

const KEY = 'friends-fishing-v1';
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x6d2b79f5 >>> 0) / 4294967296); }

export const TASK_POOL = [
  { id: 'catch5', text: '钓到 5 条鱼', goal: 5, reward: { bait: 1, pts: 40, item: 'common' } },
  { id: 'catch10', text: '钓到 10 条鱼', goal: 10, reward: { bait: 2, pts: 80 } },
  { id: 'rare1', text: '钓到 1 条「稀有」及以上', goal: 1, reward: { bait: 2, item: 'rare' } },
  { id: 'perfect3', text: '完美扬竿 3 次', goal: 3, reward: { pts: 80, bait: 1 } },
  { id: 'pcast3', text: '完美抛竿 3 次', goal: 3, reward: { pts: 60 } },
  { id: 'new1', text: '图鉴解锁 1 个新物种', goal: 1, reward: { bait: 1, pts: 50 } },
  { id: 'cheer3', text: '给好友的鱼获点赞 3 次', goal: 3, reward: { pts: 30, bait: 1 } },
  { id: 'photo1', text: '抱着鱼合影 1 次', goal: 1, reward: { pts: 40, item: 'common' } },
  { id: 'trait2', text: '钓到 2 条带特质的 UGC 鱼', goal: 2, reward: { bait: 1, pts: 40 } },
  { id: 'walk1', text: '抱着鱼在甲板上溜达 10 米', goal: 10, reward: { pts: 30 } },
];
export const STREAK_REWARDS = [
  // v1.1：签到也送道具（item = 随机该稀有度的 1 个道具）
  { bait: 1, item: 'common' }, { bait: 1 }, { bait: 2, item: 'common' }, { bait: 1, pts: 50 }, { bait: 2, item: 'rare' }, { bait: 2, pts: 80 }, { bait: 3, pts: 150, item: 'epic' },
];

// 房间里的好友（3D 角色）+ 不在线的好友（只在排行榜里）
export const ROOM = [
  { id: 'me', name: '苏贝壳', file: 'subeike', color: '#ff8a65', you: true },
  { id: 'rummons', name: 'Rummons', file: 'rummons', color: '#5fb6ff', skill: 0.82, lines: ['稳住稳住', '今天手感爆棚', '这片海我熟', 'gogogo'] },
  { id: 'gugu', name: '咕咕', file: 'gugu', color: '#ffb84d', skill: 0.74, lines: ['咕咕咕~', '鱼鱼快来', '我要钓个大的！', '好困但是好开心'] },
  { id: 'chennayu', name: 'ChenNayu', file: 'chennayu', color: '#c39bff', skill: 0.88, lines: ['风好舒服', '谁带零食了', '下一杆必出传说', '海好蓝啊'] },
];
export const OFFLINE = [
  { id: 'o1', name: '海盐柠檬', color: '#6fdca8' }, { id: 'o2', name: '阿杰', color: '#ff6b9a' },
  { id: 'o3', name: '鲸鱼不睡觉', color: '#5fd3ff' }, { id: 'o4', name: '奶盖大王', color: '#f7c873' }, { id: 'o5', name: '摸鱼大师', color: '#9aa7ff' },
];

export const TANK_MAX = 12;
export const EGG_DUR = { prompt: 60, items: 60, fuse: 90 };
export const ME_TAG = () => '@' + ROOM[0].name;
const uidOf = (x) => x.uid || x.id;
// 保证鱼对象有 v1.0 可选字段（uid / gen / history ...）
export function normFish(v, ts) {
  if (!v.uid) v.uid = v.id || (Math.random() * 4294967296 >>> 0).toString(36) + Date.now().toString(36).slice(-4);
  if (!v.id) v.id = v.uid;
  if (v.gen == null) v.gen = 0;
  if (!Array.isArray(v.parents)) v.parents = [];
  if (v.mut === undefined) v.mut = null;
  if (!Array.isArray(v.history) || !v.history.length) v.history = [{ t: ts || Date.now(), type: 'catch' }];
  if (!v.traits) v.traits = [];
  return v;
}

const LEVEL_XP = (lv) => Math.round(120 * Math.pow(1.35, lv - 1));
export const levelTitle = (lv) => ['见习钓手', '甲板新星', '浪花猎人', '深蓝行者', '潮汐大师', '海洋传说'][Math.min(5, Math.floor((lv - 1) / 3))];

function fresh() {
  return {
    v: 1, codex: {}, log: [], total: 0, catches: 0, xp: 0, level: 1, bait: 2, pity: 0, combo: 0, bestCombo: 0,
    streak: { last: null, days: 0, claimedDay: null }, day: null, today: null, tutorial: 0, muted: false, music: true,
    photos: 0, reactionsGiven: 0,
    // v1.0 水族箱 / 大海 / 创作分 / 我的动态（DESIGN §3）
    tank: null, ocean: [], creatorScore: 0, inbox: [], oceanNext: 0,
    bag: null, starterAt: 0,   // v1.1 道具背包 { [itemId]: count }
  };
}

export function createMeta() {
  let S;
  try { S = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { S = fresh(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 隐私模式 */ } };
  const today = dayKey();
  const seed = hash(today);
  let streakGift = null;

  // ---------- 每日重置 ----------
  if (S.day !== today) {
    const r = rng(seed ^ 0x9e37);
    const pool = TASK_POOL.slice();
    const tasks = [];
    while (tasks.length < 3) { const i = Math.floor(r() * pool.length); const t = pool.splice(i, 1)[0]; if (t.id === 'catch10' && tasks.some((x) => x.id === 'catch5')) continue; if (t.id === 'catch5' && tasks.some((x) => x.id === 'catch10')) continue; tasks.push({ id: t.id, n: 0, done: false, claimed: false }); }
    S.today = { score: 0, catches: 0, tasks, friendBoost: {} };
    S.day = today;
    // 连签
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (S.streak.last === dayKey(y)) S.streak.days += 1; else if (S.streak.last !== today) S.streak.days = 1;
    S.streak.last = today;
    save();
  }
  if (S.streak.claimedDay !== today) {
    const idx = (S.streak.days - 1) % 7;
    streakGift = { day: S.streak.days, idx, reward: STREAK_REWARDS[idx] };
  }

  // ---------- v1.0 水族箱：旧存档迁移 ----------
  if (!Array.isArray(S.ocean)) S.ocean = [];
  if (!Array.isArray(S.inbox)) S.inbox = [];
  S.creatorScore = S.creatorScore || 0;
  if (!Array.isArray(S.tank)) {
    const seen = new Set(), init = [];
    for (const L of S.log || []) {
      const v = L?.v; if (!v || SPECIES_BY_ID[v.sp]?.odd || !SPECIES_BY_ID[v.sp]) continue;
      const k = v.id || `${v.sp}-${v.cm}`; if (seen.has(k)) continue; seen.add(k);
      init.push(normFish(JSON.parse(JSON.stringify(v)), L.ts)); if (init.length >= 3) break;
    }
    if (!init.length) for (const id of ['clownfish', 'pufferfish']) { const v = normFish(makeVariant(SPECIES_BY_ID[id])); v.creator = '@新手礼包'; init.push(v); }
    S.tank = init;
    save();
  }
  for (const x of S.tank) if (!x.egg) normFish(x);
  // ---------- v1.1 道具背包：新档 / 旧存档迁移都补发「新手装扮包」 ----------
  let starterNew = false;
  if (!S.bag || typeof S.bag !== 'object' || Array.isArray(S.bag)) S.bag = {};
  for (const k of Object.keys(S.bag)) if (!ITEM_BY_ID[k] || !(S.bag[k] > 0)) delete S.bag[k];
  if (!S.starterAt) {
    for (const [id, n] of Object.entries(STARTER_PACK)) S.bag[id] = (S.bag[id] || 0) + n;
    S.starterAt = Date.now(); starterNew = true;
    S.inbox.unshift({ t: Date.now(), text: '🎁 新手装扮包已放进背包：猫耳、胡子、珊瑚粉、海藻绿、果冻凝露、巨藻营养剂', kind: 'info' });
    save();
  }
  const grantRolled = (tier) => { if (!tier) return null; const id = rollItemDrop(Math.random, { rarity: tier }); S.bag[id] = (S.bag[id] || 0) + 1; return id; };
  // ---------- v4 修复：宝箱 / 漂流瓶 / 小黄鸭 / 道具漂流物曾被误收进水族箱 → 清出并折算奖励（幂等：没有脏数据就什么都不做） ----------
  const isOddV = (v) => !v || !SPECIES_BY_ID[v.sp] || !!SPECIES_BY_ID[v.sp].odd || !!v.item;
  let oddFix = null;
  {
    const bad = S.tank.filter((x) => isOddV(x && x.egg ? x.result : x));
    if (bad.length) {
      S.tank = S.tank.filter((x) => !bad.includes(x));
      const got = { bait: 0, items: [] };
      for (const x of bad) {
        const v = x && x.egg ? x.result : x, id = v?.sp;
        if (v?.item && ITEM_BY_ID[v.item.id]) { S.bag[v.item.id] = (S.bag[v.item.id] || 0) + (v.item.n || 1); got.items.push(v.item.id); }
        else if (id === 'chest' || id === 'pod_chest') { got.bait += 2; const it = grantRolled('rare'); if (it) got.items.push(it); }
        else got.bait += 1;
      }
      S.bait += got.bait;
      const itTxt = got.items.map((k) => `${ITEM_BY_ID[k].emoji}${ITEM_BY_ID[k].name}`).join('、');
      oddFix = { n: bad.length, bait: got.bait, items: got.items, text: `🧹 水族箱整理：${bad.length} 件宝箱/漂流物不是鱼，已从水族箱取出并折算奖励：${got.bait ? `幸运饵 +${got.bait}` : ''}${got.bait && itTxt ? '，' : ''}${itTxt}` };
      S.inbox.unshift({ t: Date.now(), text: oddFix.text, kind: 'info' });
      save();
    }
  }

  // ---------- 今日精选（UGC 编辑推荐）：每天一种鱼，权重 ×3 ----------
  const fr = rng(seed ^ 0x51ed);
  const featPool = SPECIES.filter((s) => s.rarity !== 'legendary');
  const featured = featPool[Math.floor(fr() * featPool.length)];
  const featuredCreator = CREATORS[Math.floor(fr() * CREATORS.length)];
  const featuredTrait = ['rainbow', 'gold', 'jelly', 'glow', 'neon'][Math.floor(fr() * 5)];

  // ---------- 好友分数：按"今天已经过去多久"推算，同一天里刷新也连续 ----------
  const now = new Date();
  const minutesToday = now.getHours() * 60 + now.getMinutes();
  const friendBase = {};
  for (const f of [...ROOM.slice(1), ...OFFLINE]) {
    const r = rng(seed ^ hash(f.id));
    const active = 0.3 + r() * 0.9;
    friendBase[f.id] = Math.round((minutesToday / 60) * (25 + r() * 45) * active * (f.id.startsWith('o') ? 0.9 : 0.55));
  }

  const taskDef = (id) => TASK_POOL.find((t) => t.id === id);
  function bumpTask(id, n = 1) {
    const out = [];
    for (const t of S.today.tasks) {
      if (t.id !== id || t.done) continue;
      const def = taskDef(id);
      t.n = Math.min(def.goal, t.n + n);
      if (t.n >= def.goal) { t.done = true; out.push(def); }
    }
    save();
    return out;
  }

  function addXP(pts) {
    S.xp += pts; let ups = 0;
    while (S.xp >= LEVEL_XP(S.level)) { S.xp -= LEVEL_XP(S.level); S.level++; ups++; S.bait += 1; }
    return ups;
  }

  return {
    S, save, today, featured, featuredCreator, featuredTrait, get streakGift() { return streakGift; }, starterNew,
    // ================= v1.1 道具背包 =================
    addItem(id, n = 1) { if (!ITEM_BY_ID[id] || !(n > 0)) return 0; S.bag[id] = (S.bag[id] || 0) + n; save(); return S.bag[id]; },
    itemCount: (id) => S.bag[id] || 0,
    bagTotal: () => Object.values(S.bag).reduce((a, b) => a + b, 0),
    // 一次消耗多个（每个 id 各 1 个）；任一不足 → 不扣、返回 false
    useItems(ids) {
      const need = {}; for (const id of ids || []) need[id] = (need[id] || 0) + 1;
      for (const [id, k] of Object.entries(need)) if (!ITEM_BY_ID[id] || (S.bag[id] || 0) < k) return false;
      for (const [id, k] of Object.entries(need)) { S.bag[id] -= k; if (S.bag[id] <= 0) delete S.bag[id]; }
      save(); return true;
    },
    // 背包列表：稀有度高 → 低，同稀有度按类别（配件/着色剂/精华/奇迹），再按表内顺序
    bagList(sort = 'rarity') {
      const rows = Object.entries(S.bag).filter(([id, n]) => ITEM_BY_ID[id] && n > 0).map(([id, n]) => ({ ...ITEM_BY_ID[id], n }));
      const ri = (x) => ITEM_RARITY_ORDER.indexOf(x.rarity), ci = (x) => ITEM_CATS[x.cat].order, ti = (x) => genes.ITEM_IDS.indexOf(x.id);
      rows.sort(sort === 'cat' ? (a, b) => ci(a) - ci(b) || ri(b) - ri(a) || ti(a) - ti(b) : (a, b) => ri(b) - ri(a) || ci(a) - ci(b) || ti(a) - ti(b));
      return rows;
    },
    taskDef, levelXP: () => LEVEL_XP(S.level),
    claimStreak() {
      if (!streakGift) return null;
      const r = streakGift.reward; S.bait += r.bait || 0; if (r.pts) { S.today.score += r.pts; S.total += r.pts; }
      const itemGot = grantRolled(r.item);
      S.streak.claimedDay = today; const g = { ...streakGift, reward: { ...r, itemGot } }; streakGift = null; save(); return g;
    },
    claimTask(id) {
      const t = S.today.tasks.find((x) => x.id === id);
      if (!t || !t.done || t.claimed) return null;
      t.claimed = true; const r = taskDef(id).reward;
      S.bait += r.bait || 0; if (r.pts) { S.today.score += r.pts; S.total += r.pts; addXP(r.pts); }
      const itemGot = grantRolled(r.item);
      save(); return { ...r, itemGot };
    },
    bumpTask,
    useBait() { if (S.bait <= 0) return false; S.bait--; save(); return true; },
    // 抛竿前决定"这一杆"的运气
    castLuck({ bait, perfectCast, tide }) {
      let luck = 0, min = null;
      if (bait) { luck += 0.55; min = 'uncommon'; }
      if (perfectCast) luck += 0.15;
      if (tide) luck += 0.2;
      if (S.pity >= 9) min = 'rare';
      return { luck, min };
    },
    // 记录一条鱼获，返回奖励明细
    recordCatch(v, { perfect, perfectCast, tide, score }) {
      const sp = SPECIES_BY_ID[v.sp];
      let e = S.codex[v.sp];
      const isNew = !e;
      if (!e) e = S.codex[v.sp] = { n: 0, best: 0, first: Date.now(), last: 0, traits: [], creators: [] };
      const isBest = v.cm > e.best;
      e.n++; e.last = Date.now(); if (isBest) e.best = v.cm;
      const newTraits = v.traits.filter((t) => !e.traits.includes(t));
      e.traits.push(...newTraits);
      if (!e.creators.includes(v.creator)) e.creators.push(v.creator);
      S.log.unshift({ v, ts: Date.now(), score });
      if (S.log.length > 120) S.log.length = 120;
      S.catches++; S.today.catches++;
      S.total += score; S.today.score += score;
      const ri = RARITY_ORDER.indexOf(sp.rarity);
      S.pity = ri >= 2 ? 0 : S.pity + 1;
      S.combo++; S.bestCombo = Math.max(S.bestCombo, S.combo);
      const lvUp = addXP(score);
      const done = [];
      done.push(...bumpTask('catch5'), ...bumpTask('catch10'));
      if (ri >= 2) done.push(...bumpTask('rare1'));
      if (perfect) done.push(...bumpTask('perfect3'));
      if (isNew) done.push(...bumpTask('new1'));
      if (v.traits.length) done.push(...bumpTask('trait2'));
      save();
      return { isNew, isBest: isBest && !isNew, newTraits, lvUp, done };
    },
    breakCombo() { S.combo = 0; save(); },
    codexProgress() { const all = SPECIES.length + ODDITIES.length; return { got: Object.keys(S.codex).length, all }; },
    // 排行榜：在线好友 = 基础分 + 本局实时累计
    board(live) {
      const rows = [{ id: 'me', name: ROOM[0].name, color: ROOM[0].color, score: S.today.score, you: true, online: true }];
      for (const f of ROOM.slice(1)) rows.push({ id: f.id, name: f.name, color: f.color, score: friendBase[f.id] + (live[f.id] || 0), online: true });
      for (const f of OFFLINE) rows.push({ id: f.id, name: f.name, color: f.color, score: friendBase[f.id], online: false });
      rows.sort((a, b) => b.score - a.score);
      rows.forEach((r, i) => (r.rank = i + 1));
      return rows;
    },
    friendBase,

    // ================= v1.0 水族箱 / 养成 / 大海 =================
    genes,
    tankCount: () => S.tank.length,
    tankFull: () => S.tank.length >= TANK_MAX,
    tankFish: () => S.tank.filter((x) => !x.egg && !isOddV(x)),
    findTank: (uid) => S.tank.find((x) => uidOf(x) === uid) || null,
    releaseValue: (v) => genes.releaseValue(v),
    oddFix,
    // 收进水族箱（满了返回 false）；v4：宝箱 / 漂流瓶 / 小黄鸭 / 道具漂流物一律拒收
    addToTank(v) {
      if (isOddV(v)) return false;
      if (S.tank.length >= TANK_MAX) return false;
      normFish(v); if (!S.tank.some((x) => uidOf(x) === v.uid)) S.tank.push(v);
      save(); return true;
    },
    // 放生：tank 里的 uid，或直接传一条（钓获卡上的新鱼）→ 积分；进入 S.ocean 等待被别人钓到
    releaseFish(vOrUid) {
      let v = typeof vOrUid === 'string' ? S.tank.find((x) => uidOf(x) === vOrUid) : vOrUid;
      if (!v || v.egg) return 0;
      normFish(v);
      S.tank = S.tank.filter((x) => uidOf(x) !== v.uid);
      const pts = genes.releaseValue(v);
      S.total += pts; S.today.score += pts;
      S.ocean.unshift({ v, releasedAt: Date.now(), caughtBy: null });
      if (S.ocean.length > 30) S.ocean.length = 30;
      if (!S.oceanNext || S.oceanNext - Date.now() > 120000) S.oceanNext = Date.now() + (40 + Math.random() * 80) * 1000;
      save(); return pts;
    },
    // 改造 / 融合：src（1~2 条 tank 里的鱼，或刚钓到的新鱼）→ 一颗卵，占第一条鱼的位置
    startEgg(kind, src, result, extra = null) {
      const me = ME_TAG();
      result.creator = me; normFish(result);
      const egg = { egg: true, uid: 'egg-' + result.uid, start: Date.now(), dur: EGG_DUR[kind] || 60, kind, src: src.map((x) => JSON.parse(JSON.stringify(x))), result, ...(extra || {}) };
      const ids = src.map(uidOf);
      let at = S.tank.findIndex((x) => ids.includes(uidOf(x)));
      S.tank = S.tank.filter((x) => !ids.includes(uidOf(x)));
      if (at < 0 || at > S.tank.length) at = S.tank.length;
      S.tank.splice(at, 0, egg);
      save(); return egg;
    },
    // v1.1 道具改造一条龙：扣道具 → designFromItems → 变卵（history 记录用了哪些道具）；道具不足返回 null
    startItemEgg(v, itemIds, seed = (Math.random() * 4294967296) >>> 0) {
      const ids = genes.resolveItems(itemIds);
      if (!v || v.egg || !ids.length || !this.useItems(ids)) return null;
      const res = genes.designFromItems(v, ids, seed, { creator: ME_TAG() });
      const egg = this.startEgg('items', [v], res.v, { items: ids, changes: res.changes, combos: res.combos });
      return { egg, res };
    },
    eggLeft(egg, now = Date.now()) { return Math.max(0, egg.start + egg.dur * 1000 - now) / 1000; },
    readyEggs(now = Date.now()) { return S.tank.filter((x) => x.egg && x.start + x.dur * 1000 <= now); },
    boostEgg(uid) { const e = S.tank.find((x) => x.egg && x.uid === uid); if (e) { e.start = Date.now() - e.dur * 1000; save(); } return e; },
    hatchEgg(uid) {
      const i = S.tank.findIndex((x) => x.egg && x.uid === uid); if (i < 0) return null;
      const egg = S.tank[i]; const v = normFish(egg.result);
      S.tank.splice(i, 1, v); save(); return { v, egg };
    },
    pushInbox(text, kind = 'info') { S.inbox.unshift({ t: Date.now(), text, kind }); if (S.inbox.length > 30) S.inbox.length = 30; save(); },
    // "放生的鱼被别人钓到"模拟：每 40~120 秒一次机会（时间戳，离线也算）；force=true 立即触发（测试用）
    oceanTick(now = Date.now(), force = false) {
      if (!S.ocean.length) return null;
      if (!force && (!S.oceanNext || now < S.oceanNext)) return null;
      S.oceanNext = now + (40 + Math.random() * 80) * 1000;
      const pool = S.ocean.filter((o) => !o.caughtBy);
      if (!pool.length || (!force && Math.random() < 0.25)) { save(); return null; }
      const o = pool[(Math.random() * pool.length) | 0];
      const who = [...ROOM.slice(1), ...OFFLINE][(Math.random() * (ROOM.length - 1 + OFFLINE.length)) | 0];
      o.caughtBy = '@' + who.name; o.caughtAt = now;
      const mine = o.v.creator === ME_TAG();
      const name = o.v.nick || SPECIES_BY_ID[o.v.sp]?.name || '鱼';
      if (mine) S.creatorScore += 15;
      const text = mine ? `🎨 你的作品『${name}』被 @${who.name} 钓到了！+15 创作分` : `@${who.name} 钓到了你放生的『${name}』！`;
      this.pushInbox(text, mine ? 'creator' : 'caught');
      return { v: o.v, who, mine, text };
    },
    // 玩家钓鱼 18% 钓到别人创作/放生的鱼
    rollOceanCatch(p = 0.18) {
      if (Math.random() >= p) return null;
      const v = normFish(genes.oceanCatch((Math.random() * 4294967296) >>> 0));
      v.fromOcean = v.fromOcean || { by: v.creator };
      return v;
    },
  };
}

export { RARITY, TRAITS };
