// v11 联赛层（纯逻辑，可在 node 里单测）：本机存档 / 用户维度每日参赛上限 / 用户维度排行 / NPC 兜底
//  · 每个用户（我 / NPC 账号）每天最多参赛 DAILY_MAX 局，按「打完一局」计数（擂主连胜也逐局计数）
//  · 排行按用户聚合：综合分 = 平滑胜率 × 60% + 人气指数 × 40%
//  · NPC 账号固定 NPC_MAX 个（v11.4：8 位，战绩全部保留，开场只随机挑人上场），不新增；某个 NPC 当天打满还需要它兜底时，清零它的今日战绩重新计
export const DAILY_MAX = 10;
export const NPC_MAX = 8;
export const W_WIN = 0.6, W_POP = 0.4, POP_HALF = 2000; // 人气指数：票数 2000 ≈ 50 分，饱和增长
const KEY = 'fbc.v11';

export function dayKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const blankDay = () => ({ matches: 0, wins: 0, losses: 0, pop: 0, streak: 0, best: 0, resets: 0 });

// 综合分：胜率做贝叶斯平滑（+1/+2），1 战 1 胜不会直接 100%；人气按 pop/(pop+POP_HALF) 饱和
export function scoreOf(u) {
  const wr = (u.wins + 1) / (u.matches + 2);
  const popIdx = 100 * u.pop / (u.pop + POP_HALF);
  const raw = u.matches ? (u.wins / u.matches) : 0;
  return { wr, raw, popIdx, score: Math.round(wr * 100 * W_WIN + popIdx * W_POP) };
}

export class League {
  constructor(store = (typeof localStorage !== 'undefined' ? localStorage : null), now = () => new Date()) {
    this.store = store; this.now = now;
    let d = null;
    try { d = store && JSON.parse(store.getItem(KEY) || 'null'); } catch (e) { d = null; }
    this.d = d && d.v === 1 ? d : { v: 1, day: '', me: blankDay(), npc: {}, robots: [], lastRobot: null, lastStrat: 'balanced' };
    this.rollDay();
  }
  save() { try { this.store && this.store.setItem(KEY, JSON.stringify(this.d)); } catch (e) { /* 存储满 / 隐私模式：忽略 */ } }
  // 跨天：所有用户今日战绩清零；NPC 重新生成一份 mock 今日战绩（让排行榜开场就有内容）
  rollDay() {
    const k = dayKey(this.now());
    if (this.d.day === k) return false;
    this.d.day = k; this.d.me = blankDay();
    for (const n of Object.keys(this.d.npc)) this.d.npc[n] = this.mockDay();
    this.save(); return true;
  }
  mockDay() {
    const m = 2 + Math.floor(Math.random() * 4); // 已打 2~5 局
    const w = Math.round(m * (0.25 + Math.random() * 0.55));
    return { ...blankDay(), matches: m, wins: w, losses: m - w, pop: 600 + Math.floor(Math.random() * 3600), best: Math.min(w, 1 + Math.floor(Math.random() * 3)) };
  }
  // NPC 账号注册（上限 NPC_MAX，超出直接拒绝，不无限繁殖）
  addNpc(name) {
    if (this.d.npc[name]) return true;
    if (Object.keys(this.d.npc).length >= NPC_MAX) return false;
    this.d.npc[name] = this.mockDay(); this.save(); return true;
  }
  npcNames() { return Object.keys(this.d.npc); }
  syncNpcs(names) { let ch = false; for (const n of Object.keys(this.d.npc)) if (!names.includes(n)) { delete this.d.npc[n]; ch = true; } if (ch) this.save(); }
  user(uid) { this.rollDay(); return uid === 'me' ? this.d.me : this.d.npc[uid]; }
  left(uid) { const u = this.user(uid); return u ? Math.max(0, DAILY_MAX - u.matches) : 0; }
  canPlay(uid) { return this.left(uid) > 0; }
  resetNpc(name) { const u = this.d.npc[name]; if (!u) return; this.d.npc[name] = { ...blankDay(), resets: (u.resets || 0) + 1 }; this.save(); }
  // 一局结束：双方各计 1 局；胜者连胜 +1，败者连胜清零
  record(wUid, lUid) {
    const w = this.user(wUid), l = this.user(lUid);
    if (w) { w.matches++; w.wins++; w.streak = (w.streak || 0) + 1; w.best = Math.max(w.best || 0, w.streak); }
    if (l) { l.matches++; l.losses++; l.streak = 0; }
    this.save();
  }
  addPop(uid, n) { const u = this.user(uid); if (u && n > 0) { u.pop += Math.round(n); this.save(); } }
  // 用户维度排行：[{ uid, ...today, wr, popIdx, score }]，我始终在榜（未参赛也显示）
  ranking() {
    this.rollDay();
    const rows = [{ uid: 'me', ...this.d.me }, ...Object.entries(this.d.npc).map(([uid, u]) => ({ uid, ...u }))]
      .filter((r) => r.uid === 'me' || r.matches > 0)
      .map((r) => ({ ...r, ...scoreOf(r) }));
    rows.sort((a, b) => (b.matches > 0) - (a.matches > 0) || b.score - a.score || b.wins - a.wins);
    return rows;
  }
  // —— 本机机器人存档 ——
  robots() { return this.d.robots; }
  robot(id) { return this.d.robots.find((r) => r.id === id) || null; }
  addRobot(r) { this.d.robots.unshift(r); this.d.lastRobot = r.id; this.save(); return r; }
  removeRobot(id) { this.d.robots = this.d.robots.filter((r) => r.id !== id); if (this.d.lastRobot === id) this.d.lastRobot = this.d.robots[0]?.id || null; this.save(); }
  touchRobot(id, strat) { const r = this.robot(id); if (r) { r.strat = strat; r.used = Date.now(); } this.d.lastRobot = id; this.d.lastStrat = strat; this.save(); }
  robotResult(id, win) { const r = this.robot(id); if (!r) return; if (win) r.wins = (r.wins || 0) + 1; else r.losses = (r.losses || 0) + 1; this.save(); }
}
