// v11 联赛层单测：用户维度每日上限 / NPC 上限与清零复用 / 跨天重置 / 排行 / 本机存档   node tools/leaguetest.mjs
import { League, DAILY_MAX, NPC_MAX, scoreOf } from '../src/game/league.js';
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
let fail = 0; const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) fail++; };

const st = mem(); let day = new Date(2026, 4, 1, 10);
let L = new League(st, () => day);
// NPC 最多 5 个
for (const n of ['奶蛙', '牛来', '喵脆角', '香蕉猫', '刀盾狗', 'LX', 'Rummons', 'Jiaxin', '多余1', '多余2']) L.addNpc(n);
ok(L.npcNames().length === NPC_MAX, `NPC 账号上限 ${NPC_MAX}（实际 ${L.npcNames().length}）`);
// 用户维度每日 10 局：无论换几台机器人都共用
ok(L.left('me') === DAILY_MAX, '新的一天：我还剩 10 局');
for (let i = 0; i < DAILY_MAX; i++) L.record(i % 3 ? 'me' : '奶蛙', i % 3 ? '奶蛙' : 'me');
ok(L.left('me') === 0 && !L.canPlay('me'), `打满 ${DAILY_MAX} 局后不可再出战`);
ok(L.user('me').wins + L.user('me').losses === DAILY_MAX, '胜负合计 = 局数');
// NPC 打满后清零复用（不新增账号）
L.resetNpc('奶蛙');
ok(L.canPlay('奶蛙') && L.user('奶蛙').matches === 0 && L.user('奶蛙').resets === 1, 'NPC 打满后战绩清零重新计（resets=1）');
ok(L.npcNames().length === NPC_MAX, '清零复用不增加 NPC 数量');
// 人气 + 综合分
L.addPop('me', 1500);
const r = L.ranking();
ok(r.some((x) => x.uid === 'me'), '我始终在排行榜');
ok(r.every((x, i) => i === 0 || !x.matches || r[i - 1].score >= x.score || !r[i - 1].matches), '排行按综合分降序');
const a = scoreOf({ matches: 1, wins: 1, pop: 0 }), b = scoreOf({ matches: 10, wins: 8, pop: 0 });
ok(b.score > a.score, `胜率平滑：8/10(${b.score}) > 1/1(${a.score})`);
const c = scoreOf({ matches: 6, wins: 3, pop: 6000 }), d = scoreOf({ matches: 6, wins: 3, pop: 200 });
ok(c.score > d.score, `同胜率人气高者分高：${c.score} > ${d.score}`);
// 本机存档：重新打开（同一存储）机器人还在
L.addRobot({ id: 'r1', prompt: '霓虹刺客', seed: 123, form: 'dog', name: '霓刃', strat: 'attack' });
L.touchRobot('r1', 'defense');
const L2 = new League(st, () => day);
ok(L2.robots().length === 1 && L2.robot('r1').strat === 'defense' && L2.d.lastRobot === 'r1', '重开后本机机器人与上次策略仍在');
ok(L2.left('me') === 0, '同一天重开：今日局数不重置');
// 跨天：今日战绩清零，机器人保留
day = new Date(2026, 4, 2, 9);
const L3 = new League(st, () => day);
ok(L3.left('me') === DAILY_MAX && L3.robots().length === 1, '跨天：今日局数重置为 10，机器人保留');
ok(L3.npcNames().length === NPC_MAX && L3.npcNames().every((n) => L3.user(n).matches >= 2), '跨天：NPC 重新生成 mock 今日战绩');
// 名单变更：不在名单的旧 NPC 剔除，可补入新 NPC
const L4 = new League(st, () => day); L4.syncNpcs(['奶蛙', '牛来', '喵脆角', '吉吉', '刀盾狗', 'LX', 'Rummons', 'Jiaxin']); L4.addNpc('吉吉');
ok(!L4.npcNames().includes('香蕉猫') && L4.npcNames().includes('吉吉') && L4.npcNames().length === NPC_MAX, `名单同步：剔除旧 NPC、补入吉吉（${L4.npcNames().join('/')}）`);
// 损坏存档 → 回退空档不崩
const bad = mem(); bad.setItem('fbc.v11', '{oops');
ok(new League(bad).robots().length === 0, '损坏存档安全回退');
console.log(fail ? `FAIL ${fail}` : 'ALL PASS');
process.exit(fail ? 1 : 0);
