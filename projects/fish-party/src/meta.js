// 进度 / 存档 / 社交模拟：本地图鉴、每日任务、连签、等级、好运值（v1.4 幸运饵并入）、保底、今日精选、好友积分榜
// 全部存在 localStorage，不联网；但用"日期种子"让好友分数、今日精选、每日任务在同一天内稳定一致，模拟真实房间感。
import { SPECIES, ODDITIES, SPECIES_BY_ID, RARITY, RARITY_ORDER, CREATORS, TRAITS, makeVariant } from './fishes.js';
import * as genes from './genes.js';   // A 的真基因引擎已就位（genes_stub.js 保留作接口参考/回退）
import { ITEM_BY_ID, ITEM_CATS, ITEM_RARITY_ORDER, STARTER_PACK, rollItemDrop } from './items.js';
import * as synth from './synth_bridge.js';   // v0.9 B：合成引擎接入点（stub ↔ A 的 synth.js 在 synth_bridge.js 一行切换）

const KEY = 'friends-fishing-v1';
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x6d2b79f5 >>> 0) / 4294967296); }

export const TASK_POOL = [
  { id: 'catch5', text: '钓到 5 条鱼', goal: 5, reward: { bait: 1, pts: 40, gems: 1 } },   // v2.0：每个每日任务都送能量宝石
  { id: 'catch10', text: '钓到 10 条鱼', goal: 10, reward: { bait: 2, pts: 80, gems: 1 } },
  { id: 'rare1', text: '钓到 1 条「稀有」及以上', goal: 1, reward: { bait: 2, gems: 2 } },
  { id: 'perfect3', text: '完美扬竿 3 次', goal: 3, reward: { pts: 80, bait: 1, gems: 1 } },
  { id: 'pcast3', text: '完美抛竿 3 次', goal: 3, reward: { pts: 60, gems: 1 } },
  { id: 'new1', text: '图鉴解锁 1 个新物种', goal: 1, reward: { bait: 1, pts: 50, gems: 1 } },
  { id: 'cheer3', text: '给好友的鱼获点赞 3 次', goal: 3, reward: { pts: 30, bait: 1, gems: 1 } },
  { id: 'photo1', text: '抱着鱼合影 1 次', goal: 1, reward: { pts: 60, gems: 1 } },
  { id: 'trait2', text: '钓到 2 条带特质的 UGC 鱼', goal: 2, reward: { bait: 1, pts: 40, gems: 1 } },
  { id: 'walk1', text: '抱着鱼在甲板上溜达 10 米', goal: 10, reward: { pts: 30, gems: 1 } },
];
export const STREAK_REWARDS = [
  // v2.0：连签第 1 / 4 / 7 天送能量宝石（道具系统已下线）
  { bait: 1, gems: 1 }, { bait: 1 }, { bait: 2, pts: 40 }, { bait: 1, pts: 50, gems: 1 }, { bait: 2, pts: 60 }, { bait: 2, pts: 80 }, { bait: 3, pts: 150, gems: 3 },
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
export const EGG_DUR = { prompt: 60, items: 60, fuse: 90, synth: 90, genemod: 45 };   // v2.0 genemod = 一条鱼 + 一句话 + 1 颗能量宝石   // v0.9 synth = 基因改造卵（沿用融合卵时长）
export const ME_TAG = () => '@' + ROOM[0].name;
// v0.9 C 海洋回流概率：基础 3.5%，满好运 +1.5% → 最高 5%
export const OCEAN_P = 0.035, OCEAN_LUCK_P = 0.015;
let lastOcean = null;
// v0.9 B：可串门的 NPC 好友（水族箱 / 送鱼 / 偷鱼 / NPC 来信共用）
export const FRIENDS = [...ROOM.slice(1), ...OFFLINE.slice(0, 2)];
export const STEAL_PER_DAY = 1;
const fishName = (v) => (v && (v.name || v.nick)) || SPECIES_BY_ID[v?.sp]?.name || '鱼';
const isSynthV = (v) => !!v && (v.sp === 'synth' || !!v.syn);
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
    v: 1, codex: {}, log: [], total: 0, catches: 0, xp: 0, level: 1, bait: 0, pity: 2, combo: 0, bestCombo: 0,
    streak: { last: null, days: 0, claimedDay: null }, day: null, today: null, tutorial: 0, muted: false, music: true,
    photos: 0, reactionsGiven: 0,
    // v1.0 水族箱 / 大海 / 创作分 / 我的动态（DESIGN §3）
    tank: null, ocean: [], creatorScore: 0, inbox: [], oceanNext: 0,
    gems: 0, gemDay: null, geneV2: 0,   // v2.0 能量宝石（基因改造唯一消耗）
    bag: null, starterAt: 0,   // v1.1 宝石背包 { [itemId]: count }
    // v0.9 B 串门社交（见 docs/V09_CONTRACT.md §3）
    friendTanks: {}, stealDay: null, npcQueue: [], npcNext: 0, npcDay: null,
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

  // ---------- v1.4 极简化：幸运饵按钮下线，库存折算进「好运值」（满 9 → 下一条必出稀有）；奖励里的 bait 字段统一 = 好运 +N ----------
  if (S.bait > 0) { S.pity = Math.min(9, (S.pity || 0) + S.bait); S.bait = 0; save(); }

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
  // ---------- v0.9 B 串门社交：旧存档补字段 ----------
  if (!S.friendTanks || typeof S.friendTanks !== 'object' || Array.isArray(S.friendTanks)) S.friendTanks = {};
  if (!Array.isArray(S.npcQueue)) S.npcQueue = [];
  if (!S.npcDay || S.npcDay.d !== today) S.npcDay = { d: today, gift: 0, steal: 0 };
  if (!S.npcNext) S.npcNext = Date.now() + (12 + Math.random() * 18) * 60000;   // 首次 NPC 互动：12~30 分钟后
  // ---------- v1.1 宝石背包：新档 / 旧存档迁移都补发「新手装扮包」 ----------
  let starterNew = false;
  // ---------- v2.0 基因改造大改版：道具 / 背包下线 → 清空旧背包，一次性补发 3 颗体验宝石 ----------
  if (!S.bag || typeof S.bag !== 'object' || Array.isArray(S.bag)) S.bag = {};
  S.gems = Math.max(0, Math.floor(+S.gems || 0));
  let gemGift = null;   // 开局弹窗：{ daily, starter }
  if (!S.geneV2) {
    const had = Object.values(S.bag).reduce((a, b) => a + (b || 0), 0);
    S.bag = {}; S.geneV2 = 1; S.starterAt = S.starterAt || Date.now();
    S.gems += 3; gemGift = { starter: 3, daily: 0 };
    S.inbox.unshift({ t: Date.now(), text: `💎 基因改造升级啦：一条鱼 + 一句话 + 1 颗能量宝石就能改造。送你 3 颗体验宝石${had ? `（旧道具 ${had} 件已回收）` : ''}`, kind: 'info' });
  }
  // 每天第一次登录 +1 颗能量宝石
  if (S.gemDay !== today) { S.gemDay = today; S.gems += 1; gemGift = gemGift || { starter: 0, daily: 0 }; gemGift.daily = 1; }
  save();
  const grantRolled = () => null;   // v2.0：道具系统下线，任何奖励都不再发道具
  // ---------- v4 修复：宝箱 / 漂流瓶 / 小黄鸭 / 宝石漂流物曾被误收进水族箱 → 清出并折算奖励（幂等：没有脏数据就什么都不做） ----------
  const isOddV = (v) => !v || !!v.item || (!isSynthV(v) && (!SPECIES_BY_ID[v.sp] || !!SPECIES_BY_ID[v.sp].odd));   // v0.9 C：合成鱼（sp 可能是 'synth'）不算杂物
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
      addLuck(got.bait);
      const itTxt = got.items.map((k) => `${ITEM_BY_ID[k].emoji}${ITEM_BY_ID[k].name}`).join('、');
      oddFix = { n: bad.length, bait: got.bait, items: got.items, text: `🧹 水族箱整理：${bad.length} 件宝箱/漂流物不是鱼，已从水族箱取出并折算奖励：${got.bait ? `好运 +${got.bait}` : ''}${got.bait && itTxt ? '，' : ''}${itTxt}` };
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

  function addLuck(n) { if (n > 0) S.pity = Math.min(9, (S.pity || 0) + n); }
  function addXP(pts) {
    S.xp += pts; let ups = 0;
    while (S.xp >= LEVEL_XP(S.level)) { S.xp -= LEVEL_XP(S.level); S.level++; ups++; addLuck(1); }
    return ups;
  }

  // ---------- v0.9 B 串门社交：好友水族箱生成 / NPC 留言队列 / NPC 主动互动 ----------
  const NAT = () => SPECIES.filter((s) => !s.odd);
  const rarIdx = (v) => RARITY_ORDER.indexOf(v.rarity || SPECIES_BY_ID[v.sp]?.rarity || 'common');
  const pickOf = (a) => a[(Math.random() * a.length) | 0];
  const natFish = (sp, uid) => { const v = makeVariant(sp, 0); v.traits = []; if (uid) v.uid = v.id = uid; return normFish(v); };
  function genFriendFish(f) {
    const hs = hash(f.id + '|v09'), r = rng(hs), pool = NAT(), out = [], tag = Date.now().toString(36).slice(-4);
    const n = 6 + (hs % 4);
    for (let i = 0; i < n; i++) { const v = natFish(pool[Math.floor(r() * pool.length)], `fr-${f.id}-${i}-${tag}`); out.push(v); }
    // 好友自己造的合成鱼（1~2 条）：串门惊喜
    const ns = 1 + (hs % 2);
    for (let i = 0; i < ns; i++) {
      try {
        const w = synth.wildSynth((hs ^ Math.imul(i + 1, 2654435761)) >>> 0, '@' + f.name);
        if (!w) continue;
        w.creator = '@' + f.name; w.uid = w.id = `fs-${f.id}-${i}-${tag}`; normFish(w);
        out.splice(1 + i * 3, 0, w);
      } catch (e) { console.warn('wildSynth', e); }
    }
    return out;
  }
  const NPC_LINES = {
    thanks: ['收到了，它在我这儿游得很自在，谢谢你', '好漂亮，我会好好养它', '一来就成了我缸里的焦点', '谢谢你，下次换我送你一条'],
    stolen: ['谁偷了我的『{f}』！脚印还没干', '我的『{f}』呢？别装了，我看到你了', '水族箱少了『{f}』，下次我要装监控', '『{f}』不见了……算了，替我好好养它'],
    npcGift: ['路过你家，顺手放了一条', '多养了一条，分你', '觉得它和你很配'],
    npcSteal: ['借去玩两天，不还的那种', '昨晚来过，拿走一条，扯平', '它说想换个环境，想要就来我家拿'],
  };
  function queueNpc(f, kind, fname, sec) {
    const line = pickOf(NPC_LINES[kind]).replace('{f}', fname);
    const text = kind === 'thanks' ? `@${f.name} 收到了你送的『${fname}』 · ${line}` : `@${f.name} 留言：${line}`;
    S.npcQueue.push({ due: Date.now() + sec * 1000, fid: f.id, kind: kind === 'thanks' ? 'thanks' : 'npc', text });
    if (S.npcQueue.length > 12) S.npcQueue.splice(0, S.npcQueue.length - 12);
  }
  // NPC 主动：偶尔什么也不发生；每天最多送 2 次、拿走 1 次；只拿走「普通天然鱼」（不碰合成鱼 / 自己造的 / 稀有及以上 / 刚偷来或收到的），水族箱少于 4 条时不拿
  function npcAct(force) {
    if (!force && Math.random() < 0.35) return null;
    const f = pickOf(FRIENDS);
    let kind = force || (Math.random() < 0.6 ? 'gift' : 'steal');
    if (kind === 'steal') {
      const fishN = S.tank.filter((x) => !x.egg).length;
      const cand = S.tank.filter((x) => !x.egg && !isSynthV(x) && !x.gen && rarIdx(x) <= 1 && x.creator !== ME_TAG() && !x.stolenFrom && !x.giftFrom && SPECIES_BY_ID[x.sp] && !SPECIES_BY_ID[x.sp].odd);
      if (!cand.length || (!force && (S.npcDay.steal >= 1 || fishN < 4))) kind = 'gift';
      else {
        const v = pickOf(cand), fname = fishName(v);
        S.tank = S.tank.filter((x) => x !== v);
        const ft = this.friendTank(f.id); const t = JSON.parse(JSON.stringify(v)); t.via = 'took'; ft.push(t);
        S.npcDay.steal++;
        const text = `@${f.name} 从你的水族箱带走了『${fname}』 · ${pickOf(NPC_LINES.npcSteal)}`;
        this.pushInbox(text, 'steal');
        return { kind: 'npcSteal', text, v, f };
      }
    }
    if ((!force && S.npcDay.gift >= 2) || S.tank.length >= TANK_MAX) return null;
    let v = null;
    if (Math.random() < 0.3) { try { v = synth.wildSynth((Math.random() * 4294967296) >>> 0, '@' + f.name); if (v) { v.creator = '@' + f.name; normFish(v); } } catch (e) { v = null; } }
    if (!v) v = natFish(pickOf(NAT()));
    v.giftFrom = { id: f.id, name: f.name, t: Date.now() };
    S.tank.push(v); S.npcDay.gift++;
    const text = `@${f.name} 送了你一条『${fishName(v)}』 · ${pickOf(NPC_LINES.npcGift)}`;
    this.pushInbox(text, 'gift');
    return { kind: 'npcGift', text, v, f };
  }

  return {
    S, save, today, featured, featuredCreator, featuredTrait, get streakGift() { return streakGift; }, starterNew,
    // ================= v1.1 宝石背包 =================
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
    // v2.0 能量宝石
    get gems() { return S.gems || 0; },
    addGems(n) { S.gems = Math.max(0, (S.gems || 0) + (n | 0)); save(); return S.gems; },
    get gemGift() { return gemGift; }, clearGemGift() { gemGift = null; },
    claimStreak() {
      if (!streakGift) return null;
      const r = streakGift.reward; addLuck(r.bait || 0); if (r.pts) { S.today.score += r.pts; S.total += r.pts; }
      const itemGot = null; if (r.gems) S.gems = (S.gems || 0) + r.gems;   // v2.0 能量宝石
      S.streak.claimedDay = today; const g = { ...streakGift, reward: { ...r, itemGot } }; streakGift = null; save(); return g;
    },
    claimTask(id) {
      const t = S.today.tasks.find((x) => x.id === id);
      if (!t || !t.done || t.claimed) return null;
      t.claimed = true; const r = taskDef(id).reward;
      addLuck(r.bait || 0); if (r.pts) { S.today.score += r.pts; S.total += r.pts; addXP(r.pts); }
      const itemGot = null; if (r.gems) S.gems = (S.gems || 0) + r.gems;   // v2.0 能量宝石
      save(); return { ...r, itemGot };
    },
    bumpTask,
    addLuck(n) { addLuck(n); save(); },
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
      // v0.9 C：合成鱼不进物种图鉴（单独记 synthSeen 计数）
      const syn = isSynthV(v);
      let e = syn ? null : S.codex[v.sp];
      const isNew = !syn && !e;
      if (!syn && !e) e = S.codex[v.sp] = { n: 0, best: 0, first: Date.now(), last: 0, traits: [], creators: [] };
      if (syn) e = { n: 0, best: Infinity, traits: [], creators: [] }, S.synthSeen = (S.synthSeen || 0) + 1;
      const isBest = v.cm > e.best;
      e.n++; e.last = Date.now(); if (isBest) e.best = v.cm;
      const newTraits = (v.traits || []).filter((t) => !e.traits.includes(t));
      e.traits.push(...newTraits);
      if (!e.creators.includes(v.creator)) e.creators.push(v.creator);
      S.log.unshift({ v, ts: Date.now(), score });
      if (S.log.length > 120) S.log.length = 120;
      S.catches++; S.today.catches++;
      S.total += score; S.today.score += score;
      const ri = syn ? Math.max(2, RARITY_ORDER.indexOf(v.rarity)) : RARITY_ORDER.indexOf(sp?.rarity || 'common');
      S.pity = ri >= 2 ? 0 : S.pity + 1;
      S.combo++; S.bestCombo = Math.max(S.bestCombo, S.combo);
      const lvUp = addXP(score);
      const done = [];
      done.push(...bumpTask('catch5'), ...bumpTask('catch10'));
      if (ri >= 2) done.push(...bumpTask('rare1'));
      if (perfect) done.push(...bumpTask('perfect3'));
      if (isNew) done.push(...bumpTask('new1'));
      if ((v.traits || []).length) done.push(...bumpTask('trait2'));
      save();
      return { isNew, isBest: isBest && !isNew, newTraits, lvUp, done };
    },
    breakCombo() { S.combo = 0; save(); },
    // v0.9 C：只算天然物种（旧存档里的宝箱 / 漂流瓶 / 合成鱼条目不计入），合成鱼单列 synth
    codexProgress() { return { got: SPECIES.filter((s) => S.codex[s.id]).length, all: SPECIES.length, synth: S.synthSeen || 0 }; },
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
    // 收进水族箱（满了返回 false）；v4：宝箱 / 漂流瓶 / 小黄鸭 / 宝石漂流物一律拒收
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
    // v1.1 宝石改造一条龙：扣宝石 → designFromItems → 变卵（history 记录用了哪些宝石）；宝石不足返回 null
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
      if (egg.kind === 'synth' && !v.named) v.unnamed = true;   // v0.9：基因卵孵出后必经命名（命名前刷新页面，下次点它仍会先进命名）
      S.tank.splice(i, 1, v); save(); return { v, egg };
    },
    pushInbox(text, kind = 'info') { S.inbox.unshift({ t: Date.now(), text, kind }); if (S.inbox.length > 30) S.inbox.length = 30; save(); },
    // ================= v0.9 B 基因改造（合成）=================
    synth,
    // 主鱼 a + 鱼槽 b（都必须在自己水族箱）+ 宝石（可选，消耗 1）+ 一句话 → synthesize 立即算出结果存进卵；两条亲本都被消耗
    startGeneMod({ a, prompt = '', tier = null }) {
      const A = a && this.findTank(uidOf(a));
      if (!A || A.egg || isOddV(A)) return null;
      if ((S.gems || 0) < 1) return null;
      prompt = String(prompt || '').replace(/\s+/g, ' ').trim().slice(0, 30);
      let res = null;
      try { res = genes.geneMod(A, prompt, { creator: ME_TAG(), tier }); } catch (e) { console.error('geneMod failed', e); }
      if (!res || !res.v) return null;
      S.gems -= 1;
      return this.startEgg('genemod', [A], res.v, { changes: res.changes, tier: res.tier, prompt });
    },
    // 命名（揭晓后的必经一步）：写入 v.name（同步 nick，兼容旧显示逻辑）
    nameFish(uid, name) {
      const v = this.findTank(uid); if (!v || v.egg) return null;
      const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 14);
      if (n) { v.name = n; v.nick = n; }
      v.named = true; delete v.unnamed; save(); return v;
    },
    // ================= v0.9 B 串门：好友水族箱（持久化）/ 送鱼 / 偷鱼 / NPC 来信 =================
    friendTank(fid) {
      const f = FRIENDS.find((x) => x.id === fid); if (!f) return [];
      let ft = S.friendTanks[fid];
      const stub = !!synth.STUB;
      if (!ft || !Array.isArray(ft.fish) || ft.stub !== stub) {   // 首次串门生成；合成引擎 stub ↔ 真引擎切换后重新生成（保留送去 / 被拿走的鱼）
        const keep = ft && Array.isArray(ft.fish) ? ft.fish.filter((v) => v.via) : [];
        ft = S.friendTanks[fid] = { fish: [...genFriendFish(f), ...keep], stub, t: Date.now() };
        save();
      }
      return ft.fish;
    },
    stealLeft: () => (S.stealDay === dayKey() ? 0 : STEAL_PER_DAY),
    // 送鱼（无上限）：从我的水族箱移到好友水族箱 → 稍后收到 TA 的感谢回执
    giveFish(fid, uid) {
      const f = FRIENDS.find((x) => x.id === fid), v = this.findTank(uid);
      if (!f || !v || v.egg) return null;
      const fish = this.friendTank(fid);
      S.tank = S.tank.filter((x) => uidOf(x) !== uid);
      const g = JSON.parse(JSON.stringify(v)); g.via = 'gift'; g.giftFrom = { id: 'me', name: ROOM[0].name, t: Date.now() };
      fish.push(g);
      this.pushInbox(`你把『${fishName(v)}』送给了 @${f.name}`, 'gift');
      queueNpc(f, 'thanks', fishName(v), 25 + Math.random() * 35);
      save(); return { v: g, f };
    },
    // 偷鱼（每天全局 1 次）：随机带走对方一条（不含我送的）
    stealFish(fid) {
      const f = FRIENDS.find((x) => x.id === fid); if (!f) return { err: 'none' };
      if (this.stealLeft() <= 0) return { err: 'limit' };
      if (S.tank.length >= TANK_MAX) return { err: 'full' };
      const fish = this.friendTank(fid);
      const pool = fish.filter((x) => !x.egg && x.via !== 'gift');
      if (!pool.length) return { err: 'empty' };
      const v = pool[(Math.random() * pool.length) | 0];
      fish.splice(fish.indexOf(v), 1);
      delete v.via; v.stolenFrom = { id: f.id, name: f.name, t: Date.now() };
      normFish(v); S.tank.push(v); S.stealDay = dayKey();
      this.pushInbox(`你从 @${f.name} 的水族箱带走了『${fishName(v)}』`, 'steal');
      queueNpc(f, 'stolen', fishName(v), 20 + Math.random() * 30);
      save(); return { v, f };
    },
    // 每秒调用：到期的 NPC 回执 / 留言 + 低频 NPC 主动互动（送你鱼 / 拿走一条普通天然鱼）；force = 'gift' | 'steal'（调试）
    socialTick(now = Date.now(), force = null, allowAct = true) {
      const out = [];
      if (S.npcQueue.length && S.npcQueue.some((q) => q.due <= now)) {
        const due = S.npcQueue.filter((q) => q.due <= now);
        S.npcQueue = S.npcQueue.filter((q) => q.due > now);
        for (const q of due) { this.pushInbox(q.text, q.kind); out.push(q); }
      }
      const d = dayKey(new Date(now)); if (S.npcDay.d !== d) S.npcDay = { d, gift: 0, steal: 0 };
      if (force || (allowAct && now >= S.npcNext)) {
        S.npcNext = now + (25 + Math.random() * 30) * 60000;
        let ev = null; try { ev = npcAct.call(this, force); } catch (e) { console.warn('npcAct', e); }
        if (ev) out.push(ev);
        save();
      }
      return out.length ? out : null;
    },
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
      const name = fishName(o.v);
      const syn = isSynthV(o.v);
      if (mine) S.creatorScore += syn ? 25 : 15;
      // v0.9 C：放生的合成鱼被别人钓走 → 带「新物种 · 第 N 代」的通知
      const text = syn
        ? (mine ? `🧬 你创造的新物种『${name}』（第${o.v.gen || 1}代）被 @${who.name} 钓走了！+25 创作分` : `🧬 @${who.name} 钓走了你放生的新物种『${name}』（由 ${o.v.creator || '无名氏'} 创造）`)
        : (mine ? `🎨 你的作品『${name}』被 @${who.name} 钓到了！+15 创作分` : `@${who.name} 钓到了你放生的『${name}』！`);
      this.pushInbox(text, mine ? 'creator' : 'caught');
      save();
      return { v: o.v, who, mine, syn, text };
    },
    // v0.9 C 海洋回流：玩家每杆 3~5%（luck 只轻微提升）钓到「别的玩家造的合成鱼」= synth.wildSynth(seed, creator)；
    // 其中 ~8% 是自己放生、还没被别人钓走的合成鱼「游回来了」。wildSynth 不可用 / 出错 → 返回 null，调用方走普通钓获。
    rollOceanCatch({ p, own, luck = 0 } = {}) {
      if (typeof p === 'number' && p > 1) p = 1;
      const P = typeof p === 'number' ? p : OCEAN_P + OCEAN_LUCK_P * Math.min(1, Math.max(0, luck));
      if (Math.random() >= P) return null;
      lastOcean = null;
      const mineBack = S.ocean.filter((o) => !o.caughtBy && isSynthV(o.v) && o.v.creator === ME_TAG());
      if (mineBack.length && (own || Math.random() < 0.08)) {
        const o = mineBack[(Math.random() * mineBack.length) | 0];
        o.caughtBy = ME_TAG(); o.caughtAt = Date.now();
        const v = normFish(JSON.parse(JSON.stringify(o.v)));
        v.fromOcean = { by: v.creator, own: true, back: true };
        lastOcean = { o, v }; save();
        return v;
      }
      if (typeof synth.wildSynth !== 'function') return null;
      const creator = CREATORS[(Math.random() * CREATORS.length) | 0];
      let v = null;
      try { v = synth.wildSynth((Math.random() * 4294967296) >>> 0, creator); } catch (e) { console.warn('wildSynth (ocean) failed → 普通钓获', e); return null; }
      if (!v || !isSynthV(v)) return null;
      if (!v.creator) v.creator = creator;
      normFish(v);
      v.fromOcean = { by: v.creator };
      lastOcean = { o: null, v };
      return v;
    },
    // 渲染失败等情况撤销上一次海洋回流（自己的鱼放回大海）
    undoOceanCatch(v) {
      if (!lastOcean || (v && lastOcean.v !== v)) return;
      if (lastOcean.o) { lastOcean.o.caughtBy = null; lastOcean.o.caughtAt = 0; save(); }
      lastOcean = null;
    },
  };
}

export { RARITY, TRAITS };
