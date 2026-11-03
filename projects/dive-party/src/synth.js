// v0.9.1 A：合成物种基因引擎（重构：遗传 = 形态融合，稀有 = 华丽）
// node 可测：node --import ./tools/v09a/three_loader.mjs tools/v09a/sim_synth.mjs 500
//   ① 身体：两亲本（天然物种 → 鱼形蓝本；合成鱼 → 其 base 谱系）的侧视轮廓按权重插值（构建器再过审美约束）
//   ② 鳍：从两亲本鳍型里「择优继承」（偏向观赏性更高的那一条），再按华丽度沿升级路径进化（圆尾 → 半月裙尾 → 斗鱼裙尾 …）
//   ③ 配色：主亲本底色 + 另一亲本点缀色，经和谐化（类比 / 三角 / 互补）；花纹从亲本继承并精致化
//   ④ 稀有度 = 华丽度：延长鳍丝、波纹鳍缘、珠光 / 金属鳞缘、发光鳍缘、流光
//   ⑤ 道具 = 优雅转译（配色 / 材质 / 花纹 / 鳍的轮廓气质），一句话 = 受约束的气质偏移
//   × 不再有：针状吻、多眼 / 眼柄、对称破缺、分节、器物部件插在身上
// 确定性：同 seed + 同输入 ⇒ 同结果（uid 除外）。基因组格式见 synth_model.js G_DEFAULT / normGenome。
import { normGenome, G_DEFAULT, MATS, PAT_IDS, FIN_KINDS, ANAL_OF, harmonizePal, morphProfile, proxyOf } from './synth_model.js';
import * as SM from './synth_model.js';
import { ITEMS, ITEM_BY_ID } from './items.js';

export function buildSynthModel(v) { return typeof SM.buildSynthModel === 'function' ? SM.buildSynthModel(v) : null; }

// ---------------- 小工具 ----------------
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const r2 = (x) => Math.round(x * 100) / 100;
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x6d2b79f5 >>> 0) / 4294967296); }
function hash(str) { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995); x ^= x >>> 15; return x >>> 0; }
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const pickW = (r, list, wf) => { let s = 0; for (const x of list) s += Math.max(0, wf(x)); let t = r() * s; for (const x of list) { t -= Math.max(0, wf(x)); if (t <= 0) return x; } return list[list.length - 1]; };
const gauss = (r) => { const u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v); };
const uniq = (a) => [...new Set(a.filter(Boolean))];
function hex2rgb(h) { h = String(h || '#888888').replace('#', ''); const n = parseInt(h.slice(0, 6), 16) || 0; return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
function rgb2hex(c) { return '#' + c.map((x) => Math.round(clamp(x, 0, 1) * 255).toString(16).padStart(2, '0')).join(''); }
function rgb2hsl([r, g, b]) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h / 6, s, l]; }
function hsl2rgb([h, s, l]) { if (!s) return [l, l, l]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = (t) => { t = (t % 1 + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3), f(h), f(h - 1 / 3)]; }
const hsl = (c) => rgb2hsl(hex2rgb(c));
const fromHsl = (h, s, l) => rgb2hex(hsl2rgb([(h % 1 + 1) % 1, clamp(s, 0, 1), clamp(l, 0, 1)]));
const mixHex = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => lerp(v, y[i], t))); };
const satOf = (c) => hsl(c)[1] * (1 - Math.abs(hsl(c)[2] - 0.5) * 1.6);

// ---------------- 词表 ----------------
export const SHAPES = { ...FIN_KINDS, pat: Object.keys(PAT_IDS), mat: Object.keys(MATS) };
export const WILD_IDS = [];   // v0.9.1：狂野突变已移除（保留导出，旧代码引用不崩）
const DOR_TXT = { soft: '圆润背鳍', sickle: '镰月背鳍', sail: '帆状高背鳍', crest: '长冠背鳍', fan: '扇形背鳍', plume: '羽状棘鳍', veil: '飘纱背鳍' };
const TAIL_TXT = { fork: '叉尾', lunate: '新月尾', round: '圆扇尾', swallow: '燕尾', lyre: '琴尾长丝', delta: '半月裙尾', veil: '斗鱼式裙尾' };
const PECT_TXT = { std: '胸鳍', fan: '扇形胸鳍', long: '长翼胸鳍', bow: '领结弧形胸鳍' };
const PAT_TXT = { none: '素色', grad: '渐变体色', scale: '龙鳞纹', koi: '锦鲤斑', marble: '大理石纹', cloud: '水墨云纹', stars: '星点纹', bands: '环带纹', tux: '礼服配色', porcelain: '青花纹', crackle: '冰裂纹', fret: '回纹', ocelli: '孔雀眼斑', neon: '霓虹侧线', leopard: '玫瑰斑', sunset: '晚霞渐变', pearlline: '珠点侧线', mesh: '网纹', speckle: '金箔碎点', spots: '圆斑' };
const MAT_TXT = { wet: '', satin: '丝绒质感', glaze: '釉亮表皮', ceramic: '白瓷釉面', metal: '镜面金属光', brass: '黄铜光泽', gold: '鎏金鳞', pearl: '珍珠光泽', glow: '自发光', crystal: '水晶鳍膜' };
const BEAUTY = { veil: 5, fan: 4.6, lyre: 4.6, delta: 4.4, sail: 4.2, plume: 4, swallow: 3.6, crest: 3.2, long: 3.2, bow: 3, sickle: 2.6, lunate: 2.6, fork: 2.2, round: 2, soft: 1.6, std: 1 };
const PAT_BEAUTY = { scale: 4, koi: 4, ocelli: 4, porcelain: 4, bands: 3.6, marble: 3.4, stars: 3.4, sunset: 3.4, neon: 3.4, tux: 3, cloud: 3, leopard: 3, pearlline: 3.2, crackle: 3, fret: 3, mesh: 2.6, spots: 2.6, speckle: 2.4, grad: 1.6, none: 0.5 };
// 华丽度升级路径（下标 = 升级步数：0 稀有 / 1 史诗「半月裙尾 + 长背鳍」/ 2 传说+「超长裙尾 + 帆状背臀鳍」）
const DOR_UP = { soft: ['fan', 'fan', 'veil'], sickle: ['sickle', 'sail', 'sail'], sail: ['sail', 'sail', 'veil'], crest: ['crest', 'veil', 'veil'], fan: ['fan', 'fan', 'veil'], plume: ['fan', 'fan', 'veil'], veil: ['veil', 'veil', 'veil'] };
const TAIL_UP = { fork: ['swallow', 'delta', 'veil'], lunate: ['lyre', 'delta', 'veil'], round: ['delta', 'delta', 'veil'], swallow: ['lyre', 'delta', 'veil'], lyre: ['lyre', 'delta', 'veil'], delta: ['delta', 'veil', 'veil'], veil: ['veil', 'veil', 'veil'] };
const PECT_UP = { std: ['std', 'fan', 'long'], fan: ['fan', 'fan', 'long'], long: ['long', 'long', 'long'], bow: ['bow', 'bow', 'bow'] };

// ---------------- 高级色板库（24 套观赏鱼 / 珠宝级配色：背 / 腹 / 点缀 / 鳍 / 鳍缘）----------------
// 规则：主色高纯度宝石色或干净的瓷白 / 墨黑；点缀色只取 撞色(互补) 或 金 / 银；杜绝灰褐、土黄、脏绿、脏粉
export const LUX_PAL = [
  ['宝石蓝金', '#1f4fd1', '#bcd4ff', '#ffc94a', '#2e6bf0', '#fff1b8'],
  ['孔雀翠', '#0f8f86', '#9ff0dc', '#2f5cff', '#13b5a6', '#d8fff4'],
  ['朱砂鎏金', '#d8242f', '#ffd6c2', '#ffbf3a', '#ff3b3b', '#fff0c0'],
  ['胭脂兰', '#c2257a', '#ffd3ea', '#7a3cff', '#e0409a', '#ffe0f2'],
  ['霓虹宝蓝', '#1265ff', '#c8f1ff', '#ff2d55', '#1ea0ff', '#e6fbff'],
  ['皇家紫金', '#5a2bd6', '#dccfff', '#ffd25a', '#7b4dff', '#fff2c4'],
  ['珊瑚晚霞', '#ff6a2b', '#ffe3cc', '#ff2f7a', '#ff8a3c', '#fff0d8'],
  ['樱花珠光', '#f27aa8', '#fff3f8', '#d6246e', '#ff9ec6', '#ffffff'],
  ['天青釉', '#3fbfb4', '#f2fffb', '#1f6fbf', '#6fe0d4', '#ffffff'],
  ['青花瓷', '#f4f7ff', '#ffffff', '#1b3fbf', '#2f5fe0', '#dfe8ff'],
  ['乌金', '#15161c', '#3a3540', '#f2c14e', '#23212c', '#ffe08a'],
  ['丹顶锦鲤', '#f6f4f0', '#ffffff', '#e0262e', '#ff4b3e', '#ffffff'],
  ['帝王金', '#f0b62e', '#fff2c0', '#d6362a', '#ffc94a', '#fff8dc'],
  ['极光', '#14b38a', '#c9ffe9', '#8a4dff', '#2fd3b0', '#e8ffff'],
  ['午夜星河', '#16246b', '#4a5fbf', '#7fe7ff', '#2638a8', '#d8f6ff'],
  ['火烈鸟', '#ff5f7e', '#ffe0e6', '#ffb13b', '#ff7896', '#fff1d6'],
  ['柠檬天青', '#ffd21f', '#fff8cc', '#00a6d6', '#ffe04a', '#e6fbff'],
  ['紫罗兰', '#9b6bff', '#efe6ff', '#ff6fb5', '#b38aff', '#fff0ff'],
  ['斗鱼绯蓝', '#c0122e', '#ff9aa8', '#2a5cff', '#e0203e', '#ffd0d8'],
  ['翡翠金', '#0b9f5a', '#c8f7dc', '#ffcf3f', '#19b86c', '#fff3b8'],
  ['银月', '#d4e2f4', '#ffffff', '#3d6dff', '#8fb6ff', '#ffffff'],
  ['蓝绿撞珊瑚', '#13c2d6', '#d8fbff', '#ff5a3c', '#2ed6e6', '#fff0e6'],
  ['玫瑰金', '#e89a86', '#fff0ea', '#c23a6a', '#f2a894', '#fff6ee'],
  ['星云', '#3b1a8f', '#8a5fd6', '#ff5fd2', '#5a2fd0', '#ffd8ff'],
];
// HSL 空间混色（色相走最短弧；一侧近中性时取另一侧色相）→ 不会像 RGB 混色那样在互补色之间混出脏灰
function mixHsl(a, b, t) {
  const [h1, s1, l1] = hsl(a), [h2, s2, l2] = hsl(b);
  let h;
  if (s1 < 0.1 && s2 >= 0.1) h = h2; else if (s2 < 0.1 && s1 >= 0.1) h = h1;
  else { let d = h2 - h1; d -= Math.round(d); h = h1 + d * t; }
  return fromHsl(h, lerp(s1, s2, t), lerp(l1, l2, t));
}
const hueD = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };
// 吸附：按亲本血统色（背色相 / 明度 / 点缀色相）找最近的 3 套高级色板，加权抽 1 套，按华丽度吸过去
const GOLDISH = new Set([10, 12]);   // 乌金 / 帝王金：金属材质只配暖金系（冷色 × 金 = 橄榄脏绿）
function luxSnap(r, pal, lux, motif, mat) {
  const [hb, sb, lb] = hsl(pal[0]), [ha, sa] = hsl(pal[2]);
  const neutral = sb < 0.18, metal = mat === 'gold' || mat === 'brass';
  const sc = LUX_PAL.map((p, i) => {
    if (metal && !GOLDISH.has(i)) return [i, 9];
    const [ph, ps, pl] = hsl(p[1]), [pah] = hsl(p[3]);
    const pn = ps < 0.18 || pl > 0.9 || pl < 0.12;
    let d = neutral ? (pn ? 0.04 : 0.22) + Math.abs(pl - lb) * 1.0 : (pn ? 0.3 : hueD(hb, ph) * 1.6) + Math.abs(pl - lb) * 0.25;
    if (sa > 0.25) d += hueD(ha, pah) * 0.35;
    return [i, d];
  }).sort((x, y) => x[1] - y[1]).slice(0, 3);
  const P = LUX_PAL[pickW(r, sc, (x) => 1 / (x[1] + 0.06) ** 2)[0]].slice(1);
  // 道具配色（礼服 / 白瓷 …）身体保留道具气质，只吸鳍与点缀
  const T = motif ? [0.14, 0.15, 0.5, 0.62, 0.55] : [0, 1, 2, 3, 4].map((i) => [0.62, 0.7, 0.78, 0.84][lux - 1] + (i >= 2 ? 0.08 : 0));
  return pal.map((c, i) => mixHsl(c, P[i], clamp(T[i], 0, 0.95)));
}

// ---------------- 40 种天然物种 → 伪基因组 ----------------
// [名称, 稀有度, cm, 身体蓝本, 背鳍, 尾鳍, 胸鳍, 花纹, 材质, 调色板(背/腹/点缀/鳍/鳍缘), 特征描述, 名字字, 额外]
const N = (name, rar, cm, body, dor, tail, pect, pat, mat, pal, ess, ch, x = {}) => ({ name, rar, cm, ess, ch, g: { v: 2, base: [[body, 1]], dor: { k: dor, h: 1 }, tail: { k: tail, s: 1 }, pect: { k: pect, s: 1 }, pelv: { k: x.pelv || 'std', s: 1 }, pat: { k: pat, d: x.d || 3, a: 0.85 }, mat, pal, irid: x.irid ?? 0.3, glow: x.glow || 0, scl: x.scl || 0, finA: x.finA ?? null } });
export const NATURAL = {
  clownfish: N('小丑鱼', 'common', 12, 'clownfish', 'soft', 'round', 'fan', 'bands', 'wet', ['#ff8a3d', '#fff1e2', '#fffaf3', '#ff9a45', '#2a2226'], { body: '圆润短身', dor: '双峰背鳍', tail: '圆扇尾', pat: '三道白环纹' }, '绯', { d: 2.6 }),
  'blue-tang': N('蓝吊鱼', 'common', 24, 'blue-tang', 'crest', 'lunate', 'std', 'cloud', 'wet', ['#2f6fe0', '#6aa0f5', '#13224d', '#2a5ed0', '#ffd23f'], { body: '椭圆高身', dor: '长冠背鳍', tail: '金边新月尾', pat: '墨色调色板纹' }, '琉'),
  sardine: N('沙丁鱼', 'common', 20, 'sardine', 'sickle', 'fork', 'std', 'pearlline', 'wet', ['#4f86a0', '#eef6f8', '#203f52', '#7fb0c4', '#e6f4fa'], { body: '银亮梭形身', tail: '利落叉尾', pat: '珠点侧线' }, '银', { irid: 0.8 }),
  mackerel: N('鲭鱼', 'common', 42, 'mackerel', 'sickle', 'fork', 'std', 'marble', 'wet', ['#2f8f9a', '#eef3f0', '#14373d', '#4ca6ad', '#d8f0ee'], { body: '流线梭身', pat: '波浪虎纹', tail: '深叉尾' }, '碧', { irid: 0.6 }),
  pufferfish: N('河豚', 'uncommon', 45, 'pufferfish', 'soft', 'round', 'fan', 'spots', 'wet', ['#d9b25e', '#f8f0d8', '#5b4a2a', '#d4ad5a', '#fff4d0'], { body: '圆滚身段', pect: '小扇胸鳍', pat: '豹纹圆斑' }, '团'),
  squid: N('鱿鱼', 'uncommon', 70, 'squid', 'crest', 'delta', 'std', 'speckle', 'pearl', ['#ed9abd', '#fbe6ef', '#b0476f', '#f3b8d0', '#fff0f6'], { body: '修长外套膜', tail: '菱形肉鳍', pat: '色素斑点', mat: '珍珠光泽' }, '玉', { irid: 0.6 }),
  cuttlefish: N('乌贼', 'uncommon', 55, 'cuttlefish', 'crest', 'round', 'fan', 'cloud', 'pearl', ['#bc8df4', '#efe3ff', '#5d3a8e', '#d3b6fa', '#f6efff'], { body: '椭圆外套膜', dor: '裙边鳍', pat: '斑马云纹', mat: '虹彩' }, '墨', { irid: 0.7 }),
  'snow-crab': N('雪蟹', 'uncommon', 30, 'snow-crab', 'plume', 'round', 'fan', 'speckle', 'glaze', ['#e07a4f', '#fbeee2', '#a84a2e', '#ee9468', '#fff1e2'], { body: '宽厚甲身', dor: '棘刺背鳍', pat: '蟹壳碎点', mat: '甲壳釉光' }, '霜'),
  salmon: N('三文鱼', 'uncommon', 75, 'salmon', 'sickle', 'fork', 'std', 'speckle', 'wet', ['#547f87', '#f1e3d8', '#e8826a', '#6f97a0', '#f9d9cc'], { body: '健美纺锤身', pat: '珊瑚粉星点', tail: '叉尾' }, '樱'),
  octopus: N('章鱼', 'rare', 60, 'octopus', 'veil', 'veil', 'fan', 'spots', 'wet', ['#c8553d', '#f6dccf', '#7e2f22', '#d9705a', '#ffd8c8'], { body: '圆额身形', tail: '触腕般的飘尾', pat: '吸盘圆斑' }, '缎', { pelv: 'fil' }),
  lobster: N('锦绣龙虾', 'rare', 40, 'lobster', 'plume', 'delta', 'long', 'scale', 'glaze', ['#c0392b', '#f7dcc9', '#2c4a7a', '#d24a35', '#ffe0c0'], { body: '披甲长身', pect: '螯钳般的长胸鳍', tail: '扇形尾肢', pat: '甲片鳞纹' }, '锦'),
  'mahi-mahi': N('鲯鳅', 'rare', 110, 'mahi-mahi', 'crest', 'fork', 'std', 'sunset', 'wet', ['#23b2a0', '#ffe77e', '#1a6fb0', '#39c0a8', '#fff2a0'], { body: '高额流线身', dor: '通背长冠鳍', pat: '翠金渐变' }, '翠', { irid: 0.7 }),
  'king-crab': N('帝王蟹', 'epic', 50, 'king-crab', 'plume', 'round', 'fan', 'mesh', 'glaze', ['#b8322a', '#f6dccd', '#6e1a16', '#c8443a', '#ffd9c4'], { body: '帝王般的厚甲身', dor: '棘冠背鳍', pat: '甲壳网纹' }, '赤'),
  tuna: N('蓝鳍金枪鱼', 'epic', 200, 'tuna', 'sickle', 'lunate', 'long', 'grad', 'wet', ['#264e83', '#d8e2ea', '#f2c94c', '#2f5b92', '#e9f0f6'], { body: '鱼雷流线身', tail: '新月尾', pect: '镰形长胸鳍', pat: '金色尾柄' }, '玄', { irid: 0.5 }),
  swordfish: N('剑鱼', 'epic', 250, 'swordfish', 'sickle', 'lunate', 'long', 'grad', 'wet', ['#446082', '#d6e2ea', '#8fa9c4', '#4a6688', '#e8f0f6'], { body: '修长剑形身', dor: '高耸镰鳍', tail: '新月尾' }, '剑'),
  sailfish: N('旗鱼', 'epic', 280, 'sailfish', 'sail', 'lunate', 'long', 'pearlline', 'wet', ['#24679b', '#d6e4ee', '#7fd0ff', '#2a5f9a', '#cfefff'], { dor: '帆状高背鳍', body: '流线长身', pat: '蓝点列纹' }, '旗', { irid: 0.5 }),
  'manta-ray': N('蝠鲼', 'legendary', 450, 'manta-ray', 'soft', 'swallow', 'long', 'tux', 'wet', ['#2b3540', '#f0ece4', '#8aa0b4', '#2f3a46', '#e6eef4'], { pect: '蝠鲼般的长翼胸鳍', pat: '黑白双色', body: '宽展身形' }, '鹞'),
  hammerhead: N('双髻鲨', 'legendary', 350, 'hammerhead', 'sickle', 'lunate', 'long', 'grad', 'wet', ['#73999e', '#eef0e6', '#4f6f74', '#6c9095', '#e3ece8'], { dor: '高镰背鳍', body: '鲨式流线身', tail: '鲨式新月尾' }, '钺'),
  oarfish: N('皇带鱼', 'legendary', 800, 'oarfish', 'crest', 'veil', 'std', 'speckle', 'pearl', ['#c9d6e4', '#f4f0ee', '#7c8fa6', '#e2483f', '#ff9a8a'], { dor: '朱红通背鳍', body: '银带长身', mat: '银箔光泽' }, '绫'),
  sunfish: N('翻车鱼', 'legendary', 300, 'sunfish', 'sail', 'round', 'fan', 'grad', 'wet', ['#a0b1bc', '#e6e8e2', '#6d7f8c', '#97a8b4', '#eef2f4'], { body: '圆盘高身', dor: '高耸背鳍', tail: '舵状圆尾' }, '月'),
  butterflyfish: N('蝴蝶鱼', 'common', 15, 'butterflyfish', 'fan', 'round', 'fan', 'ocelli', 'wet', ['#ffc928', '#fff4c2', '#1d1d24', '#ffd84a', '#ffffff'], { dor: '扇形背鳍', body: '圆盘侧扁身', pat: '假眼斑' }, '蝶'),
  'sea-bream': N('真鲷', 'common', 40, 'sea-bream', 'soft', 'fork', 'std', 'stars', 'wet', ['#e2425a', '#ffe6de', '#7fd6ff', '#ea5a6c', '#ffd0d6'], { body: '端正高背身', pat: '蓝星点', mat: '红珍珠光' }, '丹', { irid: 0.6 }),
  flounder: N('比目鱼', 'common', 35, 'flounder', 'crest', 'round', 'std', 'leopard', 'wet', ['#8a7352', '#f4efe4', '#4c3d2a', '#9a8462', '#efe2c8'], { dor: '裙边长背鳍', pat: '沙地玫瑰斑' }, '沙'),
  starfish: N('海星', 'common', 20, 'starfish', 'fan', 'delta', 'fan', 'speckle', 'glaze', ['#e8743b', '#ffe2c6', '#ffd27a', '#f08a4e', '#fff0d8'], { pat: '星芒碎点', tail: '星芒般的半月尾', body: '圆润身形' }, '星'),
  seahorse: N('海马', 'uncommon', 15, 'seahorse', 'fan', 'veil', 'fan', 'bands', 'wet', ['#e8a33d', '#fff0cf', '#b86a1e', '#f2b85a', '#fff3d8'], { dor: '海马式扇鳍', pat: '细密环节纹', body: '弓背身形' }, '驹', { d: 6 }),
  jellyfish: N('海月水母', 'uncommon', 30, 'jellyfish', 'veil', 'veil', 'fan', 'pearlline', 'crystal', ['#c9b8f0', '#f4efff', '#ffb3e6', '#e3d8ff', '#ffffff'], { tail: '水母般的飘纱尾', pelv: '触须般的丝状腹鳍', mat: '通透晶感' }, '纱', { pelv: 'fil', irid: 0.9, glow: 0.25, finA: 0.55 }),
  parrotfish: N('鹦嘴鱼', 'uncommon', 50, 'parrotfish', 'crest', 'lunate', 'std', 'scale', 'wet', ['#16a596', '#9cebdc', '#ff8fb0', '#3fbfae', '#ffd2e0'], { body: '隆额身形', pat: '彩釉大鳞', tail: '新月尾' }, '翎'),
  lionfish: N('狮子鱼', 'uncommon', 35, 'lionfish', 'plume', 'round', 'fan', 'bands', 'wet', ['#c8432f', '#ffe6d8', '#fff6ee', '#d65a44', '#fff0e6'], { dor: '羽状棘鳍', pect: '狮鬃般的大扇胸鳍', pat: '红白细环纹' }, '狮', { d: 6 }),
  'moray-eel': N('巨型海鳝', 'rare', 150, 'moray-eel', 'crest', 'round', 'std', 'leopard', 'wet', ['#86733a', '#c9b56c', '#2e2812', '#8d7a40', '#e8d898'], { body: '龙形长身', dor: '通背长鳍', pat: '金豹斑' }, '蛟'),
  anglerfish: N('鮟鱇鱼', 'rare', 60, 'anglerfish', 'soft', 'round', 'fan', 'stars', 'wet', ['#3d3448', '#6b5c72', '#9be8ff', '#4a3f56', '#c9f3ff'], { pat: '深海发光点', body: '大头圆身' }, '烛', { glow: 0.35 }),
  'mantis-shrimp': N('雀尾螳螂虾', 'rare', 18, 'mantis-shrimp', 'crest', 'delta', 'fan', 'sunset', 'wet', ['#2fb37a', '#ffe0a8', '#ff5a7a', '#3ec08a', '#7fd8ff'], { pat: '彩虹渐变', tail: '孔雀尾扇', mat: '虹彩' }, '虹', { irid: 1 }),
  barracuda: N('大魣', 'rare', 140, 'barracuda', 'sickle', 'fork', 'std', 'cloud', 'wet', ['#536b79', '#eef3f3', '#2a3a44', '#5f7886', '#e2ecf0'], { body: '修长利箭身', tail: '叉尾', pat: '暗纹' }, '箭'),
  'sea-turtle': N('绿海龟', 'epic', 110, 'sea-turtle', 'soft', 'round', 'long', 'mesh', 'wet', ['#6e5a32', '#ecdcaa', '#3a2e16', '#7c6a3e', '#f2e6c0'], { pect: '海龟鳍肢般的长胸鳍', pat: '龟甲网纹' }, '玳'),
  dolphin: N('宽吻海豚', 'epic', 280, 'dolphin', 'sickle', 'lunate', 'long', 'grad', 'wet', ['#7f93a5', '#eef2f3', '#b8c8d6', '#7a8ea0', '#f0f6fa'], { body: '海豚流线身', dor: '弯月背鳍' }, '澜'),
  'giant-grouper': N('龙趸', 'epic', 200, 'giant-grouper', 'soft', 'round', 'fan', 'spots', 'wet', ['#5a5440', '#d8cba0', '#2c2818', '#6a6448', '#e8dcb0'], { body: '敦厚身段', pat: '斑驳圆斑' }, '岳'),
  coelacanth: N('腔棘鱼', 'epic', 180, 'coelacanth', 'crest', 'round', 'fan', 'stars', 'wet', ['#24476b', '#3d6488', '#e6eef6', '#2c527a', '#9fc0e0'], { pect: '肉质叶鳍', pat: '白星斑', body: '古老厚鳞身' }, '古', { scl: 0.5 }),
  'great-white': N('大白鲨', 'legendary', 500, 'great-white', 'sickle', 'lunate', 'long', 'grad', 'wet', ['#66717b', '#f4f4f0', '#3d464e', '#6b767f', '#e8ecee'], { dor: '三角镰鳍', body: '鲨式纺锤身', tail: '新月尾' }, '雪'),
  orca: N('虎鲸', 'legendary', 700, 'orca', 'sickle', 'lunate', 'long', 'tux', 'wet', ['#121418', '#f4f4f2', '#f4f4f2', '#16181c', '#e8e8ea'], { pat: '黑白分区', dor: '高耸背鳍' }, '玄'),
  narwhal: N('独角鲸', 'legendary', 450, 'narwhal', 'soft', 'lunate', 'std', 'spots', 'wet', ['#8c969c', '#eef1f1', '#4e585e', '#8a949a', '#f0f4f4'], { pat: '斑驳灰白', body: '圆润流线身' }, '角'),
  'whale-shark': N('鲸鲨', 'legendary', 1200, 'whale-shark', 'sickle', 'lunate', 'long', 'stars', 'wet', ['#3d5465', '#e9eef0', '#e9f2f6', '#435a6b', '#e9f2f6'], { pat: '星斑棋盘', body: '宽阔流线身' }, '鲸', { d: 4 }),
};
export const NATURAL_IDS = Object.keys(NATURAL);
const RAR_IDX = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
const SYN_RAR = ['rare', 'epic', 'legendary', 'mythic'];

// ---------------- genomeOf：任意鱼 → 基因组 ----------------
const TRAIT_GOLD = ['#e9b949', '#fff1c2', '#b8862b', '#f2c75c', '#fff4d0'];
const clone = (o) => JSON.parse(JSON.stringify(o));
export function genomeOf(v) {
  if (!v) return normGenome({});
  if (v.syn && typeof v.syn === 'object' && !v.syn.stub) return normGenome(v.syn);
  const N0 = NATURAL[v.sp];
  const g = N0 ? clone(N0.g) : { v: 2, base: [[proxyOf(v.sp || 'salmon'), 1]] };
  g.anc = { [v.sp || 'unknown']: 1 };
  const dh = +v.hue || 0, ks = Number.isFinite(+v.sat) ? +v.sat : 1, kl = Number.isFinite(+v.light) ? +v.light : 1;
  if (g.pal && (dh || ks !== 1 || kl !== 1)) g.pal = g.pal.map((c) => { const [h, s, l] = hsl(c); return fromHsl(h + dh, s * ks, l * kl); });
  const tr = Array.isArray(v.traits) ? v.traits : [];
  if (g.pal && tr.includes('gold')) { g.pal = g.pal.map((c, i) => mixHex(c, TRAIT_GOLD[i], 0.7)); g.mat = 'gold'; }
  if (tr.includes('rainbow')) { g.irid = 1; if (g.pat) g.pat.k = 'sunset'; }
  if (tr.includes('glow')) g.glow = Math.max(g.glow || 0, 0.55);
  if (g.pal && tr.includes('pastel')) g.pal = g.pal.map((c) => { const [h, s, l] = hsl(c); return fromHsl(h, s * 0.6, lerp(l, 0.86, 0.55)); });
  if (g.pal && tr.includes('neon')) { g.pal = g.pal.map((c) => { const [h, s, l] = hsl(c); return fromHsl(h, Math.min(1, s * 1.2), clamp(l, 0.42, 0.62)); }); g.glow = Math.max(g.glow || 0, 0.3); }
  if (tr.includes('jelly')) { g.mat = 'crystal'; g.finA = 0.55; }
  return normGenome(g);
}
const isSynth = (v) => !!(v && (v.sp === 'synth' || v.syn) && v.syn && !v.syn.stub);
const nameOf = (v) => (v && (isSynth(v) ? v.name || v.nick : NATURAL[v.sp]?.name || v.name || v.nick)) || '鱼';
const shortName = (v) => { const n = nameOf(v); return n.length > 6 ? n.split('·').pop() : n; };
const rarOf = (v) => RAR_IDX[v?.rarity] ?? RAR_IDX[NATURAL[v?.sp]?.rar] ?? 0;
// 亲本某部位的「血统描述」（天然物种用校准过的描述；合成鱼用其当前鳍型 / 花纹）
function essOf(v, g, part) {
  const e = !isSynth(v) && NATURAL[v?.sp]?.ess?.[part];
  if (e) return e;
  if (part === 'dor') return DOR_TXT[g.dor.k];
  if (part === 'tail') return TAIL_TXT[g.tail.k];
  if (part === 'pect') return g.pect.k === 'std' ? null : PECT_TXT[g.pect.k];
  if (part === 'pat') return g.pat.k === 'grad' ? null : PAT_TXT[g.pat.k];
  if (part === 'mat') return MAT_TXT[g.mat] || null;
  if (part === 'body') return isSynth(v) ? '流线身段' : null;
  return null;
}

// ---------------- 遗传：形态融合 + 择优继承 ----------------
function mergeBase(gA, gB, wA) {
  const m = {};
  for (const [sp, w] of gA.base) m[sp] = (m[sp] || 0) + w * wA;
  for (const [sp, w] of gB.base) m[sp] = (m[sp] || 0) + w * (1 - wA);
  const top = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const s = top.reduce((a, b) => a + b[1], 0) || 1;
  return top.map(([sp, w]) => [sp, Math.round(w / s * 1000) / 1000]);
}
function mergeAnc(a, b, wA) {
  const m = {};
  for (const [k, w] of Object.entries(a || {})) m[k] = (m[k] || 0) + w * wA;
  for (const [k, w] of Object.entries(b || {})) m[k] = (m[k] || 0) + w * (1 - wA);
  const top = Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 6);
  const s = top.reduce((x, y) => x + y[1], 0) || 1;
  return Object.fromEntries(top.map(([k, w]) => [k, Math.round(w / s * 1000) / 1000]));
}
// 两亲本里择优：观赏性高的鳍型更容易遗传（但亲本权重仍起作用），返回 [kind, 'a'|'b']
function choose(r, kA, kB, wA, bias = 0) {
  const sa = Math.pow(BEAUTY[kA] || 1, 1.4) * (wA + bias), sb = Math.pow(BEAUTY[kB] || 1, 1.4) * (1 - wA - bias);
  return r() * (sa + sb) < sa ? [kA, 'a'] : [kB, 'b'];
}
function fusePal(r, gP, gS, patFromP) {
  // gP：主亲本（身体权重大）→ 底色 / 腹色；gS：另一亲本 → 点缀色或鳍色（确保两条血统都看得见）
  const P = gP.pal, S = gS.pal;
  let acc = patFromP ? P[2] : (satOf(S[2]) >= satOf(S[0]) * 0.7 ? S[2] : S[0]);
  const fin = patFromP ? mixHex(S[3], P[3], 0.3) : mixHex(P[3], acc, 0.4);
  const edge = patFromP ? S[4] : mixHex(P[4], acc, 0.35);
  const back = mixHex(P[0], S[0], 0.12 + r() * 0.1);
  return harmonizePal([back, P[1], acc, fin, edge]);
}

// ---------------- 一句话：受约束的气质偏移 ----------------
function setHue(g, h, sMin = 0.45) { const [, s, l] = hsl(g.pal[0]); g.pal[0] = fromHsl(h, Math.max(s, sMin), clamp(l, 0.3, 0.6)); g.pal[3] = mixHex(g.pal[3], g.pal[0], 0.5); }
const HUE = (h, txt) => [txt, (g) => setHue(g, h)];
const PROMPT_KW = [
  [/红|赤|绯|朱/, ...HUE(0.99, '偏向绯红色调')], [/橙|橘/, ...HUE(0.07, '偏向橘色调')], [/黄(?!金)|柠檬/, ...HUE(0.13, '偏向鹅黄色调')],
  [/绿|翠|碧/, ...HUE(0.4, '偏向翡翠色调')], [/青/, ...HUE(0.5, '偏向天青色调')], [/蓝|海洋/, ...HUE(0.6, '偏向深海蓝调')], [/紫/, ...HUE(0.77, '偏向紫棠色调')],
  [/粉|樱/, '粉彩樱色', (g) => { g.pal[0] = fromHsl(0.95, 0.55, 0.74); g.pal[1] = '#fff4f6'; g.pal[3] = fromHsl(0.95, 0.5, 0.82); }],
  [/黑|暗|夜/, '墨黑体色 + 亮色鳍缘', (g) => { g.pal[0] = mixHex(g.pal[0], '#121418', 0.8); g.pal[4] = mixHex(g.pal[4], '#ffffff', 0.4); }],
  [/白|雪|月/, '月白体色', (g) => { g.pal[0] = mixHex(g.pal[0], '#f2f0ec', 0.8); g.pal[1] = '#ffffff'; }],
  [/金|黄金|土豪/, '鎏金鳞片', (g) => { g.mat = 'gold'; g.pal[0] = mixHex(g.pal[0], '#d9a93f', 0.7); g.pal[4] = '#fff0b8'; }],
  [/发光|夜光|荧光|光/, '柔和自发光', (g) => { g.glow = Math.max(g.glow, 0.55); if (PAT_BEAUTY[g.pat.k] < 3) g.pat.k = 'pearlline'; }],
  [/透明|水晶|宝石|玻璃/, '水晶般的通透鳍膜', (g) => { g.finA = 0.48; g.irid = Math.max(g.irid, 0.85); if (g.mat === 'wet') g.mat = 'crystal'; }],
  [/凶|霸|酷|狠|帅/, '锐利鳍线 + 深色调', (g) => { g.dor.k = g.dor.k === 'soft' || g.dor.k === 'fan' ? 'sickle' : g.dor.k; g.tail.k = ['round', 'delta', 'veil'].includes(g.tail.k) ? 'swallow' : g.tail.k; g.pal[0] = mixHex(g.pal[0], '#141820', 0.35); g.eyeK = 0.9; g.mood = 'fierce'; }],
  [/可爱|萌|软|乖/, '圆润身形 + 粉彩', (g) => { g.ht = 1.1; g.len = 0.94; g.eyeK = 1.2; g.pal = g.pal.map((c, i) => (i === 2 ? c : (() => { const [h, s, l] = hsl(c); return fromHsl(h, s * 0.7, lerp(l, 0.8, 0.4)); })())); if (g.tail.k === 'fork' || g.tail.k === 'lunate') g.tail.k = 'round'; g.mood = 'cute'; }],
  [/梦|仙|飘|优雅|温柔/, '虹彩飘带般的鳍', (g) => { g.irid = Math.max(g.irid, 0.8); g.finA = Math.min(g.finA ?? 0.8, 0.58); g.tail.k = TAIL_UP[g.tail.k][2]; g.mood = 'dream'; }],
  [/长|修长|细/, '更修长的身段', (g) => { g.len = 1.14; }], [/胖|圆|肥/, '更圆润饱满', (g) => { g.ht = 1.12; g.len = 0.95; }],
  [/大|巨/, '体型更大', (g, c) => { c.cmMul = 2.6; }], [/小|迷你/, '迷你体型', (g, c) => { c.cmMul = 0.4; }],
  [/刺|棘/, '羽状棘鳍', (g) => { g.dor.k = 'plume'; }], [/翅膀|飞|翼/, '长翼胸鳍', (g) => { g.pect.k = 'long'; g.pect.s = 1.15; }],
  [/宇宙|星/, '星点纹 + 深空体色', (g) => { g.pat.k = 'stars'; g.pal[0] = mixHex(g.pal[0], '#1b1f3a', 0.6); g.pal[4] = '#e8f0ff'; }],
  [/机械|金属|钢|赛博/, '镜面金属光泽', (g) => { g.mat = 'metal'; }], [/王|皇|冠/, '冠状背鳍 + 金色鳍缘', (g) => { g.dor.k = 'crest'; g.dor.h = 1.2; g.pal[4] = '#ffe39a'; }],
  [/条纹|斑马/, '环带纹', (g) => { g.pat.k = 'bands'; }], [/斑点|点点|豹/, '圆斑', (g) => { g.pat.k = 'spots'; }], [/彩虹|七彩/, '彩虹虹彩', (g) => { g.irid = 1; g.pat.k = 'sunset'; }],
  [/触手|章鱼|飘带/, '丝状腹鳍 + 飘纱尾', (g) => { g.pelv.k = 'fil'; g.tail.k = 'veil'; }], [/眼/, '孔雀眼斑', (g) => { g.pat.k = 'ocelli'; }],
];
function parsePrompt(p) { const s = String(p || ''); return s ? PROMPT_KW.filter(([re]) => re.test(s)).slice(0, 3).map(([, txt, fn]) => ({ txt, fn })) : []; }

// ---------------- 道具：优雅转译 ----------------
function applyMotif(g, m, r) {
  if (Array.isArray(m.pal) && m.pal.length >= 5) g.pal = m.pal.map((c, i) => (i === 0 ? mixHex(c, g.pal[0], 0.1) : i === 3 ? mixHex(c, g.pal[3], 0.15) : c));
  if (m.mat && MATS[m.mat]) g.mat = m.mat;
  if (m.pat && PAT_IDS[m.pat] != null) g.pat = { k: m.pat, d: m.d || g.pat.d, a: 0.9 };
  if (m.dor) { g.dor.k = m.dor; if (m.dorH) g.dor.h = m.dorH; g.src.dor = 'item'; }
  if (m.tail) { g.tail.k = m.tail; g.src.tail = 'item'; }
  if (m.pect) { g.pect.k = m.pect; g.src.pect = 'item'; }
  const fx = m.fx || {};
  if (fx.glow != null) g.glow = Math.max(g.glow, fx.glow);
  if (fx.irid != null) g.irid = Math.max(g.irid, fx.irid);
  if (fx.finA != null) g.finA = fx.finA;
  if (fx.fil) g.fil = 1;
  if (fx.scal) g.scal = 1;
  if (fx.scl) g.scl = Math.max(g.scl, fx.scl);
}

// ---------------- 默认名（高级、不土味） ----------------
const MAT_ADJ = { pearl: ['珠母', '月华'], gold: ['鎏金', '金缕'], crystal: ['琉璃', '冰魄'], glow: ['流萤', '星烛'], metal: ['银镜', '霜刃'], brass: ['鎏铜', '古铜'], ceramic: ['白瓷', '素釉'], glaze: ['釉彩', '琳琅'], satin: ['丝绒', '锦缎'] };
const COLOR_W = [[0.03, ['绯红', '朱砂']], [0.09, ['琥珀', '赤金']], [0.16, ['缃叶', '鹅黄']], [0.3, ['柳青', '松花']], [0.46, ['翡翠', '碧玉']], [0.54, ['天青', '湖光']], [0.66, ['黛蓝', '霁蓝']], [0.75, ['靛青', '暮蓝']], [0.84, ['紫棠', '藕荷']], [0.94, ['胭脂', '海棠']], [1.01, ['绯红', '朱砂']]];
function colorWord(c, r) {
  const [h, s, l] = hsl(c);
  if (l < 0.18) return pick(r, ['玄墨', '乌金']);
  if (l > 0.84 && s < 0.4) return pick(r, ['月白', '霜雪']);
  if (s < 0.16) return pick(r, ['烟灰', '银霜']);
  return pick(r, COLOR_W.find(([t]) => h <= t)[1]);
}
const MID_W = { veil: ['凤尾', '裙尾'], delta: ['月尾', '半月'], lyre: ['琴尾', '长丝'], swallow: ['燕尾'], fan: ['蝶翅', '扇鳍'], sail: ['帆鳍', '旗鳍'], plume: ['羽冠', '狮鬃'], crestD: ['冠鳍'], veilD: ['绫鳍', '纱鳍'], long: ['长翼'], bow: ['领结'] };
function midWord(g, r) {
  const c = [];
  if (MID_W[g.tail.k]) c.push([MID_W[g.tail.k], BEAUTY[g.tail.k]]);
  const dk = g.dor.k === 'crest' ? 'crestD' : g.dor.k === 'veil' ? 'veilD' : g.dor.k;
  if (MID_W[dk]) c.push([MID_W[dk], BEAUTY[g.dor.k]]);
  if (MID_W[g.pect.k]) c.push([MID_W[g.pect.k], BEAUTY[g.pect.k] - 0.5]);
  if (!c.length) return null;
  return pick(r, pickW(r, c, (x) => x[1] ** 2)[0]);
}
function coreWord(g, r) {
  const anc = g.anc || {};
  const shark = ['great-white', 'hammerhead', 'whale-shark'].reduce((s, k) => s + (anc[k] || 0), 0);
  if (shark > 0.45) return '鲨';
  let M = null; try { M = morphProfile(g); } catch (e) { M = null; }
  if (!M) return '鲈';
  if (M.mh < 0.115) return pick(r, ['龙', '螭']);
  if (M.compressed && M.mh > 0.24) return pick(r, ['鲷', '鲳', '蝶']);
  if (M.mh > 0.25) return pick(r, ['鲈', '鲷']);
  return pick(r, ['鲭', '鲹', '鲑', '鳟']);
}
export function synthName(v) {
  if (!v) return '无名新种';
  const g = normGenome(v.syn), it = ITEM_BY_ID[v.synItem || g.item] || null;
  const r = rng(hash(`${v.fp || ''}|${v.seed || 0}|${v.salt || 0}|name`));
  const adj = it?.motif?.adj || (MAT_ADJ[g.mat] && r() < 0.65 ? pick(r, MAT_ADJ[g.mat]) : colorWord(g.pal[0], r));
  const core = coreWord(g, r);
  let mid = midWord(g, r);
  if (!mid) { const top = Object.entries(g.anc || {}).sort((a, b) => b[1] - a[1]).map(([k]) => NATURAL[k]?.ch).filter(Boolean); mid = top.length ? pick(r, top.slice(0, 2)) : pick(r, ['锦', '澜', '霓']); }
  return `${adj}·${mid}${core}`;
}
export function synthTags(v) {
  const t = v?.syn?.tags;
  if (Array.isArray(t) && t.length) return t.slice(0, 4);
  const g = normGenome(v?.syn);
  return uniq([TAIL_TXT[g.tail.k], DOR_TXT[g.dor.k], PAT_TXT[g.pat.k], MAT_TXT[g.mat]]).slice(0, 3);
}

// ---------------- 指纹 ----------------
const H4 = (n) => (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
function fpOf(g) { const s = JSON.stringify({ ...g, tags: 0 }); const a = H4(hash(s)), b = H4(hash(s + '#')); return `${a.slice(0, 4)}-${a.slice(4)}-${b.slice(0, 4)}`; }
const sig = (g) => hash(JSON.stringify(g)).toString(36);

// ---------------- 合成 ----------------
let UIDN = 0;
const ITEM_RAR_PTS = { common: 0.2, rare: 0.7, epic: 1.3, legendary: 2.1 };
export function synthesize({ a, b, item = null, prompt = '', seed, creator = '' } = {}) {
  seed = (seed ?? Math.random() * 4294967296) >>> 0;
  if (!a && !b) a = { sp: 'clownfish' };
  const selfMix = !b || !a || a === b || (a.uid && a.uid === b?.uid);
  a = a || b; b = b || a;
  const gA = genomeOf(a), gB = genomeOf(b);
  const it = (item && ITEM_BY_ID[item]) || null, m = it?.motif || null;
  prompt = String(prompt || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  const cmA = +a.cm || NATURAL[a.sp]?.cm || 40, cmB = +b.cm || NATURAL[b.sp]?.cm || 40;
  const r = rng(hash(`${seed}|${sig(gA)}|${sig(gB)}|${cmA}|${cmB}|${it ? it.id : ''}|${prompt}`));
  const gen = Math.max(+a.gen || 0, +b.gen || 0) + 1;
  const wA = clamp(0.5 + gauss(r) * 0.12, 0.32, 0.68);
  const hits = parsePrompt(prompt), c = { cmMul: 1 };
  // ---- 稀有度 → 华丽度（先定，后面所有华丽特征按它来）----
  const parRar = Math.max(rarOf(a), rarOf(b));
  const score = (it ? ITEM_RAR_PTS[it.rarity] || 0 : 0) + (it?.cat === 'curio' ? 0.3 : 0) + Math.min(1.4, (gen - 1) * 0.4) + parRar * 0.22 + (hits.length ? 0.15 : 0) + r() * 1.5 + (selfMix ? 0.1 : 0);
  const rarity = SYN_RAR[score < 1.45 ? 0 : score < 2.35 ? 1 : score < 3.25 ? 2 : 3];
  const lux = SYN_RAR.indexOf(rarity) + 1;
  // ---- 形态融合 ----
  const src = {};
  const g = { v: 2, src, base: mergeBase(gA, gB, wA), anc: mergeAnc(gA.anc, gB.anc, wA) };
  g.len = clamp(lerp(gB.len, gA.len, wA) * Math.exp(gauss(r) * 0.03), 0.9, 1.1);
  g.ht = clamp(lerp(gB.ht, gA.ht, wA) * Math.exp(gauss(r) * 0.04), 0.9, 1.1);
  g.eyeK = clamp(lerp(gB.eyeK, gA.eyeK, wA), 0.85, 1.2);
  // 鳍：择优继承（背鳍和尾鳍倾向于来自不同亲本 → 两条血统都看得见）
  const [dk, ds] = choose(r, gA.dor.k, gB.dor.k, wA);
  const [tk, ts] = choose(r, gA.tail.k, gB.tail.k, wA, ds === 'a' ? -0.22 : 0.22);
  const [pk, ps] = choose(r, gA.pect.k, gB.pect.k, wA);
  src.dor = ds; src.tail = ts; src.pect = ps;
  // 华丽升级
  // 步数 -1 = 保留亲本鳍型；稀有：约半数换上更长的燕尾 / 琴尾；史诗：半月裙尾；传说+：斗鱼式超长裙尾（偶尔琴尾长丝）
  const up = (k, tbl, s) => (s < 0 ? k : tbl[k][s]);
  const sT = [0, r() < 0.88 ? 1 : 2, r() < 0.55 ? 2 : 1, 2][lux - 1];
  const sD = [0, 1, r() < 0.5 ? 2 : 1, 2][lux - 1];
  const sP = [r() < 0.5 ? 1 : -1, r() < 0.6 ? 1 : 0, 2, 2][lux - 1];
  g.dor = { k: up(dk, DOR_UP, sD), h: clamp(lerp(gB.dor.h, gA.dor.h, wA) * (1 + 0.06 * lux), 0.9, 1.4) };
  g.tail = { k: up(tk, TAIL_UP, sT), s: clamp(1 + 0.07 * lux + gauss(r) * 0.04, 0.95, 1.45) };
  if (lux >= 3 && tk === 'lyre' && r() < 0.4) g.tail.k = 'lyre';
  g.pect = { k: up(pk, PECT_UP, sP), s: clamp(1 + 0.05 * lux + gauss(r) * 0.04, 0.95, 1.3) };
  g.up = { dor: sD >= 0 && g.dor.k !== dk, tail: sT >= 0 && g.tail.k !== tk, pect: sP >= 0 && g.pect.k !== pk };
  const filPar = gA.pelv.k === 'fil' || gB.pelv.k === 'fil';
  g.pelv = { k: filPar || lux >= 2 || r() < 0.3 ? 'fil' : 'std', s: clamp(1 + 0.08 * lux, 1, 1.4) };
  // 花纹 / 配色
  const [patK, patS] = (() => { const ka = gA.pat.k, kb = gB.pat.k; const sa = (PAT_BEAUTY[ka] || 1) * wA, sb = (PAT_BEAUTY[kb] || 1) * (1 - wA); return r() * (sa + sb) < sa ? [ka, 'a'] : [kb, 'b']; })();
  src.pat = patS;
  const gP = wA >= 0.5 ? gA : gB, gS = wA >= 0.5 ? gB : gA, pSide = wA >= 0.5 ? 'a' : 'b';
  src.body = pSide;
  g.pal = fusePal(r, gP, gS, patS === pSide);
  g.pat = { k: patK === 'none' ? 'grad' : patK, d: clamp((patS === 'a' ? gA : gB).pat.d * Math.exp(gauss(r) * 0.12), 1.5, 7), a: 0.85 };
  const matPar = [gA.mat, gB.mat].filter((x) => x !== 'wet');
  g.mat = matPar.length && r() < 0.7 ? pick(r, matPar) : 'wet';
  g.irid = clamp(Math.max(gA.irid, gB.irid) * 0.6 + 0.2 + 0.15 * lux, 0, 1);
  g.glow = clamp(Math.max(gA.glow, gB.glow) * 0.7, 0, 0.6);
  g.finA = gA.finA != null || gB.finA != null ? Math.min(gA.finA ?? 1, gB.finA ?? 1) : null;
  g.fil = lux >= 2 || r() < 0.45 ? 1 : 0; g.scal = lux >= 3 || (lux === 2 && r() < 0.6) ? 1 : 0;
  g.scl = Math.max(gA.scl, gB.scl, [0.2, 0.42, 0.62, 0.72][lux - 1] + r() * 0.2);
  if (lux >= 2 && g.mat === 'wet' && r() < [0, 0.35, 0.6, 0.7][lux - 1]) g.mat = 'pearl';
  if (lux >= 3) g.glow = Math.max(g.glow, lux >= 4 ? 0.5 + r() * 0.25 : 0.18 + r() * 0.12);
  if (lux >= 4) g.irid = Math.max(g.irid, 0.85);
  g.mood = 'calm';
  // 一句话 + 道具（道具优先级最高，最后施加）
  for (const h of hits) h.fn(g, c);
  if (m) applyMotif(g, m, r);
  // 高级色板吸附（保留血统色相，剔除灰褐 / 土黄 / 脏绿）；传说+ 鳍缘带一点金 / 银
  g.pal = luxSnap(r, g.pal, lux, !!(m && Array.isArray(m.pal)) && !['gold', 'brass'].includes(g.mat), g.mat);
  // 传说+：素白身体大多「染上鳍色」变成宝石色身（白瓷 / 礼服配色保留素体）→ 高稀有度一眼更浓郁、更惊艳
  if (lux >= 3 && !['ceramic', 'metal', 'crystal'].includes(g.mat) && g.pat.k !== 'tux' && (hsl(g.pal[0])[1] < 0.22 || hsl(g.pal[0])[2] > 0.8) && r() < 0.75) {
    const [hf] = hsl(g.pal[3]), [ha] = hsl(g.pal[2]);
    g.pal[0] = fromHsl(hf, 0.78, 0.42); g.pal[1] = fromHsl(hf + 0.03, 0.62, 0.72);
    if (hueD(ha, hf) < 0.08) g.pal[2] = fromHsl(hf + 0.5, 0.75, 0.6);
  }
  if (lux >= 3) { const [h] = hsl(g.pal[0]); g.pal[4] = mixHsl(g.pal[4], h < 0.2 || h > 0.9 ? '#ffe7b0' : '#f2faff', 0.35); }
  g.anal = { k: ANAL_OF[g.dor.k], h: 1 };
  if (g.pelv.k !== 'fil' && ['fan', 'veil'].includes(g.dor.k) && lux >= 2) g.pelv.k = 'fil';
  g.pal = harmonizePal(g.pal);
  g.lux = lux; g.item = it ? it.id : null;
  // ---- 标签：道具 / 双亲血统 / 华丽特征 ----
  const tags = [];
  if (it) tags.push(m.tags?.[0]);
  const inh = (side) => {
    const v = side === 'a' ? a : b, gg = side === 'a' ? gA : gB, parts = [];
    for (const part of ['dor', 'tail', 'pect']) if (src[part] === side && !g.up[part] && g.src?.[part] !== 'item') parts.push(part);
    if (src.pat === side && !(m?.pat)) parts.push('pat');
    if (src.body === side) parts.push('body');
    const opts = parts.map((p) => essOf(v, gg, p)).filter(Boolean);
    return opts.length ? `${shortName(v)}的${pick(r, opts)}` : null;
  };
  tags.push(inh('a'));
  if (!selfMix) tags.push(inh('b'));
  const luxTag = g.up.tail ? TAIL_TXT[g.tail.k] : g.up.dor ? DOR_TXT[g.dor.k] : g.fil ? '延长鳍丝' : null;
  tags.push(luxTag);
  if (lux >= 4) tags.push(pick(r, ['流光鳍缘', '星辉自发光']));
  else if (lux >= 3) tags.push(g.scl > 0.5 ? '珠光鳞缘' : '波纹鳍缘');
  if (it && m.tags?.[1]) tags.push(m.tags[1]);
  if (hits.length) tags.push(hits[0].txt);
  tags.push(PAT_TXT[g.pat.k], MAT_TXT[g.mat]);
  const out = normGenome(g);
  out.src = src; out.up = g.up;
  out.tags = uniq(tags.filter(Boolean)).slice(0, 4);
  for (const t of [TAIL_TXT[g.tail.k], DOR_TXT[g.dor.k], '融合血统']) if (out.tags.length < 3 && t && !out.tags.includes(t)) out.tags.push(t);
  // ---- 体长 / 体重 ----
  let cm = Math.sqrt(Math.max(3, cmA) * Math.max(3, cmB)) * Math.exp(gauss(r) * 0.3) * c.cmMul;
  cm = Math.round(clamp(cm, 4, 2400) * 10) / 10;
  const kgRaw = 14 * Math.pow(cm / 100, 3) * clamp(out.ht / out.len, 0.6, 1.6);
  const kg = kgRaw >= 1 ? Math.round(kgRaw * 10) / 10 : Math.max(0.02, Math.round(kgRaw * 100) / 100);
  const uid = `syn-${seed.toString(36)}-${(Date.now() % 46656).toString(36)}${(++UIDN % 1296).toString(36)}`;
  const v = {
    uid, id: uid, sp: 'synth', syn: out, rarity, cm, kg, gen,
    parents: [a, b].map((x) => ({ uid: x.uid || null, name: nameOf(x), sp: x.sp || null })),
    synItem: it ? it.id : null, prompt, creator, seed, fp: fpOf(out),
    traits: [], hue: 0, sat: 1, light: 1, sizeK: 1, mut: null,
  };
  v.name = synthName(v);
  for (let k = 1; k < 6 && v.parents.some((p) => p.name === v.name); k++) v.name = synthName({ ...v, salt: k });
  v.nick = v.name;
  return v;
}

// ---------------- 基因预感 ----------------
export function previewHints({ a, b, item = null, prompt = '' } = {}) {
  if (!a && !b) return { tags: ['先放进一条鱼'], risk: 0 };
  const A = a || b, gA = genomeOf(A), gB = b ? genomeOf(b) : null;
  const it = (item && ITEM_BY_ID[item]) || null, m = it?.motif;
  const r = rng(hash(`hint|${sig(gA)}|${gB ? sig(gB) : ''}|${item}|${prompt}`));
  const tags = [];
  const best = (v, g, skip) => {
    const parts = ['dor', 'tail', 'pect', 'pat', 'body'].filter((p) => p !== skip && !(m && ((p === 'dor' && m.dor) || (p === 'tail' && m.tail) || (p === 'pect' && m.pect) || (p === 'pat' && m.pat))));
    const opts = parts.map((p) => [p, essOf(v, g, p), p === 'dor' ? BEAUTY[g.dor.k] : p === 'tail' ? BEAUTY[g.tail.k] : p === 'pect' ? BEAUTY[g.pect.k] : p === 'pat' ? PAT_BEAUTY[g.pat.k] : 2]).filter((x) => x[1]);
    return opts.length ? pickW(r, opts, (x) => x[2] ** 2) : null;
  };
  const fa = best(A, gA, null);
  if (fa) tags.push(`可能继承${shortName(A)}的${fa[1]}`);
  if (gB && b !== a) { const fb = best(b, gB, fa?.[0]); if (fb) tags.push(`${shortName(b)}的${fb[1]}或许会保留`); }
  if (m) tags.push(`${it.name} → ${(m.tags || [])[0] || it.name}`);
  const hits = parsePrompt(prompt);
  if (hits.length) tags.push(pick(r, hits).txt);
  else if (prompt && prompt.trim()) tags.push(`朝「${prompt.trim().slice(0, 8)}」的气质偏移`);
  if (tags.length < 4) tags.push(pick(r, ['稀有度越高，鳍越飘逸华丽', '可能长出延长的丝状鳍条', '鳍膜或许会带珠光渐变']));
  let dist = 0;
  if (gB) {
    dist += gA.base[0][0] !== gB.base[0][0] ? 0.25 : 0; dist += gA.dor.k !== gB.dor.k ? 0.12 : 0; dist += gA.tail.k !== gB.tail.k ? 0.12 : 0;
    const ha = hsl(gA.pal[0])[0], hb = hsl(gB.pal[0])[0], dh = Math.abs(ha - hb) % 1; dist += Math.min(dh, 1 - dh) * 0.4;
  }
  const gen = Math.max(a?.gen || 0, b?.gen || 0);
  const risk = clamp(0.12 + dist * 0.6 + (it ? 0.08 + (ITEM_RAR_PTS[it.rarity] || 0) * 0.08 : 0) + (hits.length ? 0.06 : 0) + Math.min(0.2, gen * 0.05) + (r() - 0.5) * 0.06, 0.05, 0.95);
  return { tags: uniq(tags).slice(0, 4), risk: r2(risk) };
}

// ---------------- 别人造的合成鱼 ----------------
const WILD_PROMPTS = ['想要会发光的', '再胖一点', '凶一点', '粉粉的', '长出翅膀', '像宝石一样透明', '要很长很长', '迷你一点', '黄金打造', '可爱到犯规', '优雅一点', '浑身是刺', '像宇宙一样', '黑色的', '飘逸的', '戴王冠', '冰蓝色', '机械感', '梦幻一点', '红白条纹'];
const NPC_NAMES = ['海雾', '阿汀', '小鲣', '潮生', '鲸落', '七七', '南屿', '橘子汽水'];
const NAT_W = { common: 5, uncommon: 4, rare: 3, epic: 2, legendary: 1.4 };
export function wildSynth(seed = (Math.random() * 4294967296) >>> 0, creator = '', depth = 0) {
  seed >>>= 0;
  const r = rng(hash(`wild|${seed}|${depth}`));
  const mk = (k) => {
    if (depth < 2 && r() < (depth ? 0.12 : 0.28)) { const p = wildSynth((r() * 4294967296) >>> 0, '@' + pick(r, NPC_NAMES), depth + 1); p.uid = p.id = `wp-${seed.toString(36)}-${depth}${k}`; return p; }
    const sp = pickW(r, NATURAL_IDS, (id) => NAT_W[NATURAL[id].rar] || 1), n0 = NATURAL[sp];
    const tr = r() < 0.12 ? [pick(r, ['gold', 'rainbow', 'glow', 'pastel', 'neon'])] : [];
    return { uid: `wn-${seed.toString(36)}-${depth}${k}`, sp, cm: Math.round(n0.cm * (0.75 + r() * 0.6) * 10) / 10, gen: 0, traits: tr, hue: (r() - 0.5) * 0.12, sat: 0.92 + r() * 0.2, light: 0.95 + r() * 0.1 };
  };
  const a = mk('a'), b = mk('b');
  const item = r() < 0.55 ? pickW(r, ITEMS, (x) => ({ common: 6, rare: 3, epic: 1.2, legendary: 0.4 }[x.rarity] || 1)).id : null;
  const prompt = r() < 0.4 ? pick(r, WILD_PROMPTS) : '';
  return synthesize({ a, b, item, prompt, seed, creator });
}
void G_DEFAULT;
