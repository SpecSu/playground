// v0.9 A：合成物种基因引擎（纯逻辑，node 可测：node --import ./tools/v09a/three_loader.mjs tools/v09a/sim_synth.mjs）
// 两条亲本（天然物种 → 伪基因组 / 合成鱼 → syn）+ 道具 motif + 一句话 → 一条不属于任何物种的新生物：
//   ① 逐组遗传（取 A / 取 B / 插值混合；调色板跨亲本重组；偶发「返祖」从祖先谱系里捞回部件）
//   ② 高强度随机突变（连续量对数正态抖动 + 离散部件换型）
//   ③ 狂野突变（低概率：分节躯干 / 多眼 / 对称破缺 / 超长飘带 / 发光器阵列 / 双背鳍 / 眼柄 …）
//   ④ 一句话关键词加权（颜色 / 材质 / 大小胖瘦长短 / 凶萌 / 发光 / 刺 / 触手 / 翅膀 …）
//   ⑤ 道具 motif 强力覆写（配色 / 材质 / 花纹 / 部件优先级最高 → 一眼看出「吃了个马桶」）
// 确定性：同 seed + 同输入 ⇒ 同结果（uid 除外）。基因组格式见 synth_model.js G_DEFAULT / normGenome，形状词表见下方 SHAPES。
import { normGenome, G_DEFAULT, MATS, PAT_IDS } from './synth_model.js';
import * as SM from './synth_model.js';
import { ITEMS, ITEM_BY_ID } from './items.js';

// 3D 构建器由 A2 在 synth_model.js 实现；未就位时返回 null（Fish 类会回退）
export function buildSynthModel(v) { return typeof SM.buildSynthModel === 'function' ? SM.buildSynthModel(v) : null; }

// ---------------- 小工具 ----------------
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x6d2b79f5 >>> 0) / 4294967296); }
function hash(str) { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995); x ^= x >>> 15; return x >>> 0; }
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const pickW = (r, list, wf) => { let s = 0; for (const x of list) s += Math.max(0, wf(x)); let t = r() * s; for (const x of list) { t -= Math.max(0, wf(x)); if (t <= 0) return x; } return list[list.length - 1]; };
const gauss = (r) => { let u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v); };
const uniq = (a) => [...new Set(a)];

// ---- 颜色（纯 JS，不依赖 three）----
function hex2rgb(h) { h = String(h || '#888888').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h.slice(0, 6), 16) || 0; return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
function rgb2hex([r, g, b]) { return '#' + [r, g, b].map((x) => Math.round(clamp(x, 0, 1) * 255).toString(16).padStart(2, '0')).join(''); }
function rgb2hsl([r, g, b]) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h / 6, s, l]; }
function hsl2rgb([h, s, l]) { if (!s) return [l, l, l]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = (t) => { t = (t % 1 + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3), f(h), f(h - 1 / 3)]; }
const hsl = (c) => rgb2hsl(hex2rgb(c));
const fromHsl = (h, s, l) => rgb2hex(hsl2rgb([(h % 1 + 1) % 1, clamp(s, 0, 1), clamp(l, 0, 1)]));
const mixHex = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => lerp(v, y[i], t))); };
const tweak = (c, dh = 0, ds = 0, dl = 0) => { const [h, s, l] = hsl(c); return fromHsl(h + dh, s + ds, l + dl); };
const hueDist = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };

// ---------------- 形状词表（A2 构建器按这些 id 出模型；未知 id 请当作最接近的通用形状兜底） ----------------
export const SHAPES = {
  plan: ['fusiform', 'deep', 'globe', 'eel', 'flat', 'box', 'seg', 'disc', 'hourglass', 'diamond'],
  head: ['round', 'pointed', 'blunt', 'bevel', 'snub', 'dome', 'tube', 'bill', 'hammer', 'spout'],
  mouth: ['smile', 'gape', 'beak', 'fang', 'tube', 'underbite', 'sucker', 'whisker'],
  dor: ['none', 'shark', 'sail', 'spiny', 'crest', 'ribbon', 'fan', 'finlet', 'lid', 'canopy', 'handle', 'key', 'gear', 'quill', 'wedge', 'saw', 'cap', 'crystal'],
  tail: ['fork', 'lunate', 'round', 'fan', 'swallow', 'shark', 'fluke', 'whip', 'lobe', 'stiletto', 'ribbon', 'paddle', 'hook', 'ring', 'shears', 'feather', 'anchor', 'curl', 'leaf', 'rocket', 'none'],
  pect: ['std', 'long', 'wing', 'fan', 'frill', 'leg', 'paddle', 'bow', 'none'],
  // app 元素 = 'name' 或 'name:变体'；tentacle/arms/legs 的变体是数量
  app: ['tentacle:N', 'arms:N', 'legs:N', 'claws', 'claws:club', 'antennae', 'barbels', 'lure:bulb', 'horn:spiral', 'horn:bill', 'horn:cephalic', 'spikes', 'shell', 'crown', 'coronet', 'mane:knit', 'mane:petal', 'mane:spine', 'mane:crest', 'tophat', 'pearls', 'photo', 'bells', 'band', 'plates', 'swirl', 'calyx', 'flower', 'strings', 'ribbons'],
  mat: Object.keys(MATS),
  pat: Object.keys(PAT_IDS),
};
// 额外基因字段（normGenome 会原样透传）：asym 0~1 对称破缺强度；tail.n=2 双尾；eyes.n 可为 0（水母）；anc 祖先谱系 {sp:权重}；wild 狂野突变 id 列表；tags 卡片标签；item 道具 id

// ---------------- 中文描述表 ----------------
const PLAN_TXT = { fusiform: '流线身', deep: '高背侧扁身', globe: '圆球躯干', eel: '蛇形长躯', flat: '扁平宽体', box: '方箱躯干', seg: '分节躯干', disc: '圆盘身', hourglass: '沙漏细腰', diamond: '菱形身' };
const HEAD_TXT = { pointed: '尖吻', blunt: '钝圆大头', bevel: '斜切额', snub: '短吻', dome: '隆起圆额', tube: '管状长吻', bill: '长剑吻', hammer: '锤头', spout: '壶嘴吻' };
const MOUTH_TXT = { gape: '阔口', beak: '鹦鹉喙', fang: '獠牙', tube: '吸管嘴', underbite: '地包天', sucker: '吸盘口', whisker: '长须嘴' };
const DOR_TXT = { shark: '镰刀背鳍', sail: '帆状背鳍', spiny: '棘刺背鳍', crest: '长冠背鳍', ribbon: '缎带背鳍', fan: '折扇背鳍', finlet: '背侧小鳍列', lid: '马桶盖背鳍', canopy: '伞面背鳍', handle: '提手背鳍', key: '钥匙齿背鳍', gear: '齿轮背鳍', quill: '羽管背鳍', wedge: '楔形背鳍', saw: '锯齿背鳍', cap: '菌盖背鳍', crystal: '晶簇背鳍' };
const TAIL_TXT = { fork: '叉尾', lunate: '新月尾', round: '圆扇尾', fan: '扇形尾', swallow: '燕尾分叉尾', shark: '歪形鲨尾', fluke: '水平尾叶', whip: '长鞭尾', lobe: '三叶尾', stiletto: '细跟尾刺', ribbon: '缎带长尾', paddle: '桨状尾', hook: '钩形尾', ring: '环形尾', shears: '剪刀尾', feather: '羽毛尾', anchor: '锚形尾', curl: '卷曲尾', leaf: '叶状尾鳍', rocket: '火箭喷口尾' };
const PECT_TXT = { long: '长胸鳍', wing: '翼状胸鳍', fan: '扇形胸鳍', frill: '裙边鳍', leg: '腿状鳍', paddle: '桨状鳍肢', bow: '领结胸鳍' };
const APP_TXT = { tentacle: '垂坠触手', arms: '星状腕', legs: '节肢步足', claws: '一对大螯', 'claws:club': '拳击锤螯', antennae: '长触角', barbels: '口须', lure: '头顶小灯笼', 'horn:spiral': '螺旋长角', 'horn:bill': '剑状长吻', 'horn:cephalic': '头鳍卷角', spikes: '满身棘刺', shell: '花纹背甲', crown: '王冠头饰', coronet: '小冠突', mane: '鬃领', 'mane:knit': '针织鬃领', 'mane:petal': '花瓣鬃', 'mane:spine': '毒棘长鬃', 'mane:crest': '红色冠鬃', tophat: '礼帽头冠', pearls: '珍珠颈环', photo: '体侧发光器阵列', bells: '铃铛垂饰', band: '腰间束带', plates: '甲片覆体', swirl: '螺旋壳', calyx: '花萼领', flower: '头顶开花', strings: '琴弦鳍条', ribbons: '飘带' };
const PAT_TXT = { bars: '横带纹', lines: '纵纹', spots: '圆斑', freckle: '雀斑', mottle: '斑驳迷彩', grad: '渐变体色', tiger: '虎纹', stars: '星点', scale: '鳞纹格', stripe: '粗条纹', marble: '云石纹', ring: '环纹', ocelli: '眼斑', geo: '龟甲纹', tux: '黑白礼服配色', lateral: '银色侧线', galaxy: '星河斑', sprinkle: '糖霜碎点', dial: '刻度纹', melon: '瓜纹', sunburst: '日轮放射纹', waffle: '华夫格纹', orca: '黑白分区', ribs: '肋骨纹' };
const MAT_TXT = { matte: '雾面绒皮', glaze: '釉亮表皮', ceramic: '白瓷釉面', metal: '金属甲皮', brass: '黄铜质感', gold: '鎏金鳞', pearl: '珠母虹彩', satin: '缎面光泽', glow: '自体荧光', crystal: '琉璃透体', paper: '纸质褶皮' };
const appBase = (a) => String(a).split(':')[0];
const appTxt = (a) => APP_TXT[a] || APP_TXT[appBase(a)] || null;

// ---------------- 40 种天然物种 → 伪基因组 ----------------
// [名称, 稀有度, cm, plan, ht, wd, len, head, mouth, dor(k,h,l), tail, pect, pat(k,d,a), mat, pal, extra]
const N = (name, rar, cm, plan, ht, wd, len, head, mouth, dor, tail, pect, pat, mat, pal, x = {}) => ({ name, rar, cm, g: { plan, ht, wd, len, head, mouth, dor, tail, pect, pat, mat, pal, ...x } });
const D = (k, h = 1, l = 1, x = 0.5) => (k ? { k, h, l, x } : { k: 'none', h: 0, l: 0, x: 0.5 });
const T = (k, s = 1) => ({ k, s });
const P = (k, d = 4, a = 0.8) => ({ k, d, a, r: 0 });
export const NATURAL = {
  clownfish: N('小丑鱼', 'common', 12, 'fusiform', 0.36, 0.55, 0.9, 'round', 'smile', D('spiny', 0.8, 1.1), T('round'), T('std'), P('bars', 3, 1), 'wet', ['#ff8a3d', '#fff4ea', '#1b1b1f', '#ff7a2e']),
  'blue-tang': N('蓝吊鱼', 'common', 24, 'deep', 0.48, 0.35, 1, 'snub', 'smile', D('crest', 0.6, 1.4), T('lunate'), T('std'), P('marble', 2, 0.7), 'wet', ['#2f6fe0', '#4b86f0', '#ffd23f', '#16244f']),
  sardine: N('沙丁鱼', 'common', 20, 'fusiform', 0.2, 0.65, 1.1, 'pointed', 'smile', D('shark', 0.6, 0.8), T('fork'), T('std', 0.8), P('lateral', 2, 0.7), 'wet', ['#4f86a0', '#eef6f8', '#203f52', '#a8d4dc'], { irid: 0.8 }),
  mackerel: N('鲭鱼', 'common', 42, 'fusiform', 0.19, 0.7, 1.2, 'pointed', 'smile', D('finlet', 0.7), T('fork'), T('std', 0.8), P('tiger', 4, 0.9), 'wet', ['#2f8f9a', '#eef3f0', '#14373d', '#4ca6ad'], { irid: 0.6 }),
  pufferfish: N('河豚', 'uncommon', 45, 'globe', 0.5, 1, 0.9, 'blunt', 'beak', D('cap', 0.5, 0.6), T('round', 0.8), T('fan'), P('spots', 5, 0.8), 'wet', ['#d9b25e', '#f6eed5', '#5b4a2a', '#c9a24f'], { app: ['spikes'], eyes: { n: 2, k: 1.3 } }),
  squid: N('鱿鱼', 'uncommon', 70, 'fusiform', 0.17, 0.9, 1.4, 'pointed', 'beak', D(null), T('leaf', 1.2), T('none'), P('freckle', 6, 0.7), 'wet', ['#ed9abd', '#fbe3ee', '#b0476f', '#f3b8d0'], { app: ['tentacle:10'], eyes: { n: 2, k: 1.5 }, pelv: 0, anal: 0, irid: 0.5 }),
  cuttlefish: N('乌贼', 'uncommon', 55, 'flat', 0.26, 1.5, 1.1, 'blunt', 'beak', D(null), T('none'), T('frill'), P('tiger', 6, 0.6), 'wet', ['#bc8df4', '#efe3ff', '#5d3a8e', '#d3b6fa'], { app: ['tentacle:8'], eyes: { n: 2, k: 1.3 }, pelv: 0, anal: 0, irid: 0.7 }),
  'snow-crab': N('雪蟹', 'uncommon', 65, 'flat', 0.22, 2.6, 0.8, 'blunt', 'beak', D(null), T('none'), T('none'), P('sprinkle', 3, 0.5), 'glaze', ['#efa97e', '#fbe9dc', '#b35a35', '#e79a6c'], { app: ['legs:8', 'claws'], eyes: { n: 2, k: 0.8, stalk: 0.5 }, pelv: 0, anal: 0 }),
  salmon: N('三文鱼', 'uncommon', 95, 'fusiform', 0.24, 0.7, 1.2, 'pointed', 'underbite', D('shark', 0.8), T('fork'), T('std'), P('freckle', 4, 0.7), 'wet', ['#8e9fb0', '#f1d9dc', '#3b4a5c', '#c9a0a8'], { irid: 0.6 }),
  octopus: N('章鱼', 'rare', 120, 'globe', 0.45, 1, 0.9, 'dome', 'tube', D(null), T('none'), T('none'), P('freckle', 5, 0.7), 'wet', ['#e67b8a', '#f8d2d6', '#9e3a4a', '#ef9aa6'], { app: ['tentacle:8'], eyes: { n: 2, k: 1.2 }, pelv: 0, anal: 0, irid: 0.2 }),
  lobster: N('锦绣龙虾', 'rare', 85, 'seg', 0.2, 0.9, 1.3, 'pointed', 'beak', D(null), T('fan'), T('none'), P('sprinkle', 2, 0.6), 'glaze', ['#e2563a', '#f6c2a6', '#7a1f12', '#f07855'], { seg: 6, app: ['claws', 'antennae', 'legs:8'], pelv: 0, anal: 0 }),
  'mahi-mahi': N('鲯鳅', 'rare', 150, 'fusiform', 0.3, 0.45, 1.3, 'bevel', 'smile', D('sail', 0.8, 1.9), T('fork'), T('std'), P('spots', 4, 0.6), 'wet', ['#3fa86b', '#f2e05a', '#1f5aa8', '#e4d45e'], { irid: 0.7 }),
  'king-crab': N('帝王蟹', 'epic', 160, 'flat', 0.26, 2.4, 0.8, 'blunt', 'beak', D(null), T('none'), T('none'), P('sprinkle', 3, 0.5), 'matte', ['#d84a3c', '#f3c9a8', '#7a1e18', '#e85e4e'], { app: ['legs:8', 'claws', 'spikes'], eyes: { n: 2, k: 0.7, stalk: 0.4 }, pelv: 0, anal: 0 }),
  tuna: N('蓝鳍金枪鱼', 'epic', 220, 'fusiform', 0.27, 0.8, 1.2, 'pointed', 'smile', D('shark', 1), T('lunate'), T('std', 0.8), P('lateral', 1, 0.5), 'wet', ['#23436e', '#dfe7ee', '#e8c64a', '#3a5f8f'], { dor2: D('finlet', 0.6), irid: 0.6 }),
  swordfish: N('剑鱼', 'epic', 280, 'fusiform', 0.2, 0.8, 1.5, 'bill', 'smile', D('shark', 1.4, 0.6), T('lunate', 1.1), T('std'), P('grad', 4, 0.7), 'wet', ['#3d556e', '#d9e2ea', '#22303f', '#5a7690'], { app: ['horn:bill'] }),
  sailfish: N('旗鱼', 'epic', 240, 'fusiform', 0.2, 0.75, 1.5, 'bill', 'smile', D('sail', 2, 1.8), T('lunate', 1.1), T('long'), P('bars', 6, 0.5), 'wet', ['#2a4f9a', '#e5ecf3', '#6ab0ff', '#2d3f78'], { app: ['horn:bill'], irid: 0.6 }),
  'manta-ray': N('蝠鲼', 'legendary', 450, 'flat', 0.1, 4.5, 0.9, 'blunt', 'gape', D(null), T('whip', 1.4), T('wing', 2.2), P('grad', 3, 0.7), 'wet', ['#2e3a4c', '#f2f4f6', '#86a2c1', '#26303e'], { app: ['horn:cephalic'], pelv: 0, anal: 0 }),
  hammerhead: N('双髻鲨', 'legendary', 380, 'fusiform', 0.18, 0.8, 1.3, 'hammer', 'fang', D('shark', 1.4), T('shark', 1.1), T('std', 1.2), P('grad', 3, 0.6), 'wet', ['#7f98a0', '#eef2f2', '#4e6168', '#8aa9b0']),
  oarfish: N('皇带鱼', 'legendary', 650, 'eel', 0.07, 0.4, 3, 'blunt', 'smile', D('ribbon', 1.3, 3), T('whip', 1.2), T('std', 0.5), P('lateral', 6, 0.7), 'pearl', ['#d9c1dd', '#f5f0f6', '#d43a4a', '#e2484f'], { app: ['mane:crest'] }),
  sunfish: N('翻车鱼', 'legendary', 300, 'disc', 0.5, 0.35, 1, 'round', 'tube', D('sail', 2.2, 0.35), T('paddle', 1.2), T('std', 0.5), P('mottle', 2, 0.4), 'matte', ['#9fb1ba', '#e7eef1', '#6b7c86', '#b3c3ca']),
  butterflyfish: N('蝴蝶鱼', 'common', 15, 'deep', 0.5, 0.3, 0.9, 'tube', 'tube', D('crest', 0.8, 1.3), T('round'), T('std'), P('ocelli', 1, 0.9), 'wet', ['#f2d04a', '#fff8de', '#1d1d22', '#f5c63a']),
  'sea-bream': N('真鲷', 'common', 40, 'deep', 0.38, 0.45, 1, 'blunt', 'smile', D('spiny', 0.9, 1.2), T('fork'), T('std'), P('stars', 5, 0.8), 'wet', ['#e88a94', '#fbe6e6', '#4db3ff', '#e7a0a6'], { irid: 0.5 }),
  flounder: N('比目鱼', 'common', 50, 'disc', 0.42, 0.25, 1, 'round', 'smile', D('crest', 0.5, 2), T('round'), T('std', 0.6), P('mottle', 4, 0.8), 'matte', ['#a38c66', '#efe7d8', '#5e4d33', '#b39c78'], { asym: 0.9 }),
  starfish: N('海星', 'common', 25, 'flat', 0.08, 1, 0.7, 'round', 'sucker', D(null), T('none'), T('none'), P('sprinkle', 6, 0.8), 'matte', ['#e8875f', '#f7d6c4', '#b34a2a', '#ee9a76'], { app: ['arms:5'], eyes: { n: 0, k: 1 }, pelv: 0, anal: 0 }),
  seahorse: N('海马', 'uncommon', 20, 'seg', 0.3, 0.7, 0.9, 'tube', 'tube', D('fan', 0.6, 0.6), T('curl', 1.2), T('fan', 0.5), P('ribs', 4, 0.6), 'matte', ['#e0b062', '#f5e1b0', '#9a6a22', '#e8c27a'], { seg: 8, app: ['coronet'], pelv: 0 }),
  jellyfish: N('海月水母', 'uncommon', 35, 'globe', 0.4, 1, 0.7, 'dome', 'tube', D(null), T('none'), T('none'), P('ring', 2, 0.5), 'crystal', ['#cfdff0', '#eef5ff', '#a6c4f0', '#dfeaff'], { app: ['tentacle:12'], eyes: { n: 0, k: 1 }, glow: 0.35, pelv: 0, anal: 0 }),
  parrotfish: N('鹦嘴鱼', 'uncommon', 55, 'fusiform', 0.32, 0.6, 1, 'blunt', 'beak', D('crest', 0.7, 1.3), T('lunate'), T('std'), P('scale', 4, 0.8), 'wet', ['#3fb3a0', '#9ee0d0', '#ff7fae', '#58a3d8'], { irid: 0.5 }),
  lionfish: N('狮子鱼', 'uncommon', 35, 'deep', 0.36, 0.55, 1, 'round', 'gape', D('spiny', 2.2, 1.1), T('round'), T('fan', 2), P('stripe', 7, 0.9), 'wet', ['#c8564a', '#f6e6dc', '#2a1a1a', '#e7a08e'], { app: ['mane:spine'] }),
  'moray-eel': N('巨型海鳝', 'rare', 250, 'eel', 0.1, 0.7, 2.6, 'blunt', 'fang', D('ribbon', 0.5, 3), T('whip'), T('none'), P('mottle', 4, 0.8), 'wet', ['#7a7a3a', '#c9c27a', '#3a3a1a', '#8f8a4a'], { pelv: 0 }),
  anglerfish: N('鮟鱇鱼', 'rare', 90, 'globe', 0.45, 0.9, 1, 'blunt', 'fang', D('spiny', 0.5, 0.6), T('round'), T('fan'), P('mottle', 3, 0.5), 'matte', ['#5a5168', '#8c8298', '#c9f6ff', '#463f54'], { app: ['lure:bulb'], glow: 0.5, eyes: { n: 2, k: 0.7 } }),
  'mantis-shrimp': N('雀尾螳螂虾', 'rare', 30, 'seg', 0.18, 0.9, 1.2, 'bevel', 'beak', D(null), T('fan', 1.1), T('none'), P('scale', 4, 0.7), 'wet', ['#3fa36a', '#f2d06a', '#ff5a6a', '#3d8fe0'], { seg: 7, app: ['claws:club', 'antennae', 'legs:6'], eyes: { n: 2, k: 1.2, stalk: 1 }, irid: 0.9, pelv: 0, anal: 0 }),
  barracuda: N('大魣', 'rare', 170, 'fusiform', 0.13, 0.7, 1.6, 'pointed', 'underbite', D('shark', 0.7), T('fork'), T('std', 0.8), P('bars', 8, 0.4), 'metal', ['#7d8f9a', '#eef2f4', '#2a3640', '#8ea3ae'], { dor2: D('shark', 0.6, 0.8, 0.3) }),
  'sea-turtle': N('绿海龟', 'epic', 130, 'disc', 0.3, 1.8, 1, 'round', 'beak', D(null), T('none'), T('paddle', 1.8), P('geo', 3, 0.9), 'matte', ['#7d6e44', '#e2d6a8', '#3e341c', '#9c8c5e'], { app: ['shell'], pelv: 0, anal: 0 }),
  dolphin: N('宽吻海豚', 'epic', 280, 'fusiform', 0.22, 0.85, 1.3, 'bill', 'smile', D('shark', 1.1), T('fluke'), T('std'), P('grad', 3, 0.7), 'glaze', ['#8396a6', '#eef2f5', '#4e5e6b', '#7a8c9b'], { pelv: 0, anal: 0 }),
  'giant-grouper': N('龙趸', 'epic', 230, 'deep', 0.33, 0.8, 1.1, 'blunt', 'gape', D('spiny', 0.9, 1.2), T('round'), T('fan'), P('mottle', 5, 0.8), 'wet', ['#6e6a48', '#c9c29a', '#2e2c1c', '#7d7650']),
  coelacanth: N('腔棘鱼', 'epic', 200, 'fusiform', 0.26, 0.7, 1.2, 'blunt', 'gape', D('fan', 0.9, 0.8), T('lobe'), T('leg'), P('sprinkle', 3, 0.8), 'matte', ['#3e5f80', '#8aa4ba', '#f2f4f0', '#46698c'], { dor2: D('fan', 0.7, 0.7, 0.3) }),
  'great-white': N('大白鲨', 'legendary', 550, 'fusiform', 0.22, 0.85, 1.3, 'pointed', 'fang', D('shark', 1.5), T('shark', 1.1), T('std', 1.2), P('grad', 3, 0.8), 'wet', ['#7c8994', '#f4f6f7', '#3c444b', '#6f7c86'], { eyes: { n: 2, k: 0.7 } }),
  orca: N('虎鲸', 'legendary', 750, 'fusiform', 0.24, 0.9, 1.3, 'round', 'smile', D('shark', 2.2, 0.7), T('fluke'), T('paddle'), P('orca', 2, 1), 'glaze', ['#22262c', '#f6f6f4', '#f6f6f4', '#1b1e22'], { pelv: 0, anal: 0 }),
  narwhal: N('独角鲸', 'legendary', 450, 'fusiform', 0.22, 0.9, 1.3, 'round', 'smile', D(null), T('fluke'), T('paddle'), P('freckle', 5, 0.7), 'wet', ['#a4adb2', '#e8ecee', '#4e575c', '#97a1a6'], { app: ['horn:spiral'], pelv: 0, anal: 0 }),
  'whale-shark': N('鲸鲨', 'legendary', 1200, 'fusiform', 0.2, 1.3, 1.4, 'blunt', 'gape', D('shark', 1), T('shark'), T('std'), P('stars', 6, 0.9), 'wet', ['#4f6779', '#e6ecef', '#f4f8fa', '#4a6070'], { eyes: { n: 2, k: 0.6 } }),
};
export const NATURAL_IDS = Object.keys(NATURAL);
const RAR_IDX = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
const SYN_RAR = ['rare', 'epic', 'legendary', 'mythic'];

// ---------------- genomeOf：任意鱼 → 基因组 ----------------
const TRAIT_PAL = { gold: ['#e9b949', '#fff1c2', '#b8862b', '#f2c75c'] };
const clone = (o) => JSON.parse(JSON.stringify(o));
export function genomeOf(v) {
  if (!v) return normGenome({});
  if (v.syn && typeof v.syn === 'object' && !v.syn.stub) return normGenome(v.syn);
  const N0 = NATURAL[v.sp];
  const g = N0 ? clone(N0.g) : { plan: 'fusiform', pal: G_DEFAULT.pal.slice() };
  g.anc = { [v.sp || 'unknown']: 1 };
  // 个体色差（makeVariant 的 hue / sat / light）
  const dh = +v.hue || 0, ks = Number.isFinite(+v.sat) ? +v.sat : 1, kl = Number.isFinite(+v.light) ? +v.light : 1;
  if (dh || ks !== 1 || kl !== 1) g.pal = g.pal.map((c) => { const [h, s, l] = hsl(c); return fromHsl(h + dh, s * ks, l * kl); });
  // 天然色变 traits → 调色板 / 材质
  const tr = Array.isArray(v.traits) ? v.traits : [];
  if (tr.includes('gold')) { g.pal = g.pal.map((c, i) => mixHex(c, TRAIT_PAL.gold[i], 0.75)); g.mat = 'gold'; }
  if (tr.includes('rainbow')) { const h0 = hsl(g.pal[0])[0]; g.pal = g.pal.map((c, i) => { const [, s, l] = hsl(c); return fromHsl(h0 + i * 0.23, Math.max(0.7, s), clamp(l, 0.45, 0.75)); }); g.irid = 1; }
  if (tr.includes('glow')) g.glow = Math.max(g.glow || 0, 0.65);
  if (tr.includes('pastel')) g.pal = g.pal.map((c) => { const [h, s, l] = hsl(c); return fromHsl(h, s * 0.6, lerp(l, 0.86, 0.6)); });
  if (tr.includes('neon')) { g.pal = g.pal.map((c) => { const [h, s, l] = hsl(c); return fromHsl(h, 1, clamp(l, 0.45, 0.62)); }); g.glow = Math.max(g.glow || 0, 0.3); }
  if (tr.includes('jelly')) g.mat = 'crystal';
  return normGenome(g);
}
const isSynth = (v) => !!(v && v.sp === 'synth' && v.syn && !v.syn.stub);
const nameOf = (v) => (v && (isSynth(v) ? v.name || v.nick : NATURAL[v.sp]?.name || v.name || v.nick)) || '鱼';
const shortName = (v) => { const n = nameOf(v); return n.length > 6 ? n.split('·').pop() : n; };
const rarOf = (v) => RAR_IDX[v?.rarity] ?? RAR_IDX[NATURAL[v?.sp]?.rar] ?? 0;

// ---------------- 体型约束：让「取 A 的体型 + 取 B 的比例」也成立 ----------------
const PLAN_FIT = {
  fusiform: { ht: [0.13, 0.3], wd: [0.5, 1.1] }, deep: { ht: [0.32, 0.5], wd: [0.28, 0.6] }, globe: { ht: [0.38, 0.5], wd: [0.8, 1.25] },
  eel: { ht: [0.05, 0.12], wd: [0.4, 1], len: [1.8, 3.2] }, flat: { ht: [0.06, 0.3], wd: [1.4, 5] }, box: { ht: [0.25, 0.42], wd: [0.8, 1.2], sq: [3.5, 6] },
  seg: { ht: [0.14, 0.32], seg: [3, 9] }, disc: { ht: [0.4, 0.5], wd: [0.25, 0.5] }, hourglass: { ht: [0.18, 0.36], waist: [0.3, 0.6] }, diamond: { ht: [0.3, 0.5], wd: [0.3, 0.7] },
};
function planFit(g, r, force = false) {
  const f = PLAN_FIT[g.plan]; if (!f) return;
  for (const [k, [a, b]] of Object.entries(f)) {
    if (!force && r() < 0.12) continue;           // 12% 保留「不合规」的怪比例 → 惊喜
    const x = +g[k] || 0;
    if (x < a || x > b) g[k] = k === 'seg' ? Math.round(lerp(a, b, r())) : lerp(clamp(x, a, b), lerp(a, b, r()), 0.35);
  }
}

// ---------------- 遗传 ----------------
const BODY = ['len', 'ht', 'wd', 'sq', 'arch', 'hump', 'belly', 'peak', 'ped', 'waist'];
const ADDITIVE = new Set(['arch', 'hump', 'belly', 'peak', 'ped', 'waist']);
function mixPal(r, pA, pB, wA) {
  let out = [];
  for (let i = 0; i < 4; i++) {
    const fromA = r() < wA, src = fromA ? pA : pB, oth = fromA ? pB : pA;
    let c = src[r() < 0.2 ? Math.floor(r() * 4) : i];          // 20% 跨槽重组（腹色跑到鳍上…）
    if (r() < 0.32) c = mixHex(c, oth[i], 0.25 + r() * 0.5);   // 32% 两亲本插值
    out.push(c);
  }
  const dh = gauss(r) * 0.035;
  out = out.map((c) => tweak(c, dh + gauss(r) * 0.018, gauss(r) * 0.06, gauss(r) * 0.045));
  if (r() < 0.25) { const k = Math.floor(r() * 4); out[k] = tweak(out[k], (r() < 0.5 ? 1 : -1) * (0.12 + r() * 0.3), 0.12, 0); }   // 一个色槽大跳
  return out;
}
function mergeAnc(a, b, wA) {
  const o = {};
  for (const [k, x] of Object.entries(a || {})) o[k] = (o[k] || 0) + x * wA;
  for (const [k, x] of Object.entries(b || {})) o[k] = (o[k] || 0) + x * (1 - wA);
  const top = Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, 6), s = top.reduce((t, [, x]) => t + x, 0) || 1;
  return Object.fromEntries(top.map(([k, x]) => [k, r3(x / s)]));
}
function inherit(r, gA, gB, wA, src) {
  const A = () => r() < wA;
  // 返祖：从谱系里随机捞一个天然祖先的部件（隔代遗传）
  const ancIds = uniq([...Object.keys(gA.anc || {}), ...Object.keys(gB.anc || {})]).filter((k) => NATURAL[k]);
  const ancestor = () => (ancIds.length ? normGenome(NATURAL[pick(r, ancIds)].g) : null);
  const choose = (key, recall = 0.08) => {
    if (r() < recall) { const an = ancestor(); if (an) { src[key] = 'anc'; return clone(an[key]); } }
    const fa = A(); src[key] = fa ? 'a' : 'b'; return clone(fa ? gA[key] : gB[key]);
  };
  const g = {};
  // 体型：35% 整组跟随体型来源（连贯），否则逐项交叉 / 插值
  g.plan = choose('plan', 0.05);
  const planSrc = src.plan === 'a' ? gA : src.plan === 'b' ? gB : null;
  const coherent = planSrc && r() < 0.35;
  for (const k of BODY) {
    const a = +gA[k] || 0, b = +gB[k] || 0;
    g[k] = coherent ? +planSrc[k] : r() < 0.3 ? lerp(a, b, r()) : (A() ? a : b);
  }
  g.seg = coherent ? planSrc.seg | 0 : (A() ? gA.seg : gB.seg) | 0;
  // 体型杂交：两亲本体型不同 → 小概率生出第三种体型
  if (gA.plan !== gB.plan && r() < 0.14) {
    const pair = [gA.plan, gB.plan].sort().join('+');
    const HY = { 'eel+globe': 'hourglass', 'disc+eel': 'seg', 'flat+globe': 'disc', 'deep+eel': 'diamond', 'flat+fusiform': 'diamond', 'fusiform+globe': 'box' };
    g.plan = HY[pair] || pick(r, SHAPES.plan); src.plan = 'hybrid';
  }
  g.head = choose('head'); g.mouth = choose('mouth');
  g.eyes = { ...choose('eyes', 0.05) }; g.eyes.k = lerp(gA.eyes.k, gB.eyes.k, r());
  g.dor = choose('dor'); if (r() < 0.35) { g.dor.h = lerp(gA.dor.h || 1, gB.dor.h || 1, r()); g.dor.l = lerp(gA.dor.l || 1, gB.dor.l || 1, r()); }
  g.dor2 = A() ? gA.dor2 : gB.dor2; g.dor2 = g.dor2 ? clone(g.dor2) : null;
  g.tail = choose('tail'); if (r() < 0.35) g.tail.s = lerp(gA.tail.s || 1, gB.tail.s || 1, r());
  g.pect = choose('pect'); if (r() < 0.35) g.pect.s = lerp(gA.pect.s || 1, gB.pect.s || 1, r());
  g.pelv = A() ? gA.pelv : gB.pelv; g.anal = A() ? gA.anal : gB.anal;
  // 附肢：两亲本附肢池里逐个抽签（主导亲本的更容易留下）
  g.app = [];
  for (const x of uniq([...gA.app, ...gB.app])) {
    const inA = gA.app.includes(x), inB = gB.app.includes(x);
    const p = inA && inB ? 0.85 : inA ? 0.3 + wA * 0.45 : 0.3 + (1 - wA) * 0.45;
    if (r() < p) g.app.push(x);
  }
  if (r() < 0.06) { const an = ancestor(); if (an && an.app.length) { g.app.push(pick(r, an.app)); src.app = 'anc'; } }
  g.pal = mixPal(r, gA.pal, gB.pal, wA);
  g.pat = choose('pat', 0.07); g.pat.d = lerp(gA.pat.d, gB.pat.d, r()); g.pat.a = lerp(gA.pat.a, gB.pat.a, r()); g.pat.r = r3(r());
  g.mat = r() < 0.1 ? pick(r, SHAPES.mat) : choose('mat', 0.05);
  g.glow = r() < 0.5 ? Math.max(gA.glow, gB.glow) * (0.5 + r() * 0.6) : lerp(gA.glow, gB.glow, r());
  g.irid = lerp(gA.irid, gB.irid, r());
  g.asym = Math.max(+gA.asym || 0, +gB.asym || 0) * (r() < 0.5 ? r() : 0);
  return g;
}

// ---------------- 随机突变（高强度） ----------------
function mutate(r, g, heat) {
  for (const k of BODY) {
    if (ADDITIVE.has(k)) g[k] = (+g[k] || 0) + gauss(r) * 0.08 * heat;
    else g[k] = (+g[k] || 0.1) * Math.exp(gauss(r) * 0.17 * heat);
  }
  g.arch = clamp(g.arch, -0.6, 0.8); g.hump = clamp(g.hump, 0, 1); g.belly = clamp(g.belly, 0, 1); g.waist = clamp(g.waist, 0, 0.7);
  const P = 0.11 * heat;   // 离散部件换型率
  if (r() < P * 0.5) g.plan = pick(r, SHAPES.plan);
  if (r() < P) g.head = pick(r, SHAPES.head);
  if (r() < P) g.mouth = pick(r, SHAPES.mouth);
  if (r() < P) g.dor = { k: pick(r, SHAPES.dor.slice(0, 8)), h: 0.6 + r() * 1.2, l: 0.6 + r() * 1.2, x: 0.35 + r() * 0.3 };
  if (r() < P) g.tail = { k: pick(r, SHAPES.tail.slice(0, 9)), s: 0.8 + r() * 0.6 };
  if (r() < P) g.pect = { k: pick(r, SHAPES.pect.slice(0, 8)), s: 0.7 + r() * 0.8 };
  if (r() < P) g.pat = { k: pick(r, SHAPES.pat.slice(1)), d: 1 + r() * 7, a: 0.5 + r() * 0.5, r: r3(r()) };
  if (r() < P * 0.6 && g.app.length) g.app.splice(Math.floor(r() * g.app.length), 1);
  g.dor.h = clamp((g.dor.h || 1) * Math.exp(gauss(r) * 0.2 * heat), 0.3, 3); g.dor.l = clamp((g.dor.l || 1) * Math.exp(gauss(r) * 0.2 * heat), 0.3, 3.2);
  g.tail.s = clamp((g.tail.s || 1) * Math.exp(gauss(r) * 0.18 * heat), 0.5, 3.2); g.pect.s = clamp((g.pect.s || 1) * Math.exp(gauss(r) * 0.2 * heat), 0.4, 3);
  g.eyes.k = clamp(g.eyes.k * Math.exp(gauss(r) * 0.15 * heat), 0.5, 2);
  g.pat.d = clamp(g.pat.d * Math.exp(gauss(r) * 0.2), 0.5, 10);
  g.irid = clamp(g.irid + gauss(r) * 0.12, 0, 1); g.glow = clamp(g.glow + (r() < 0.06 ? 0.4 + r() * 0.4 : 0), 0, 1);
}

// ---------------- 狂野突变（低概率，决定稀有度） ----------------
// id → [基础概率, 应用函数(g, r, ctx) → 标签]
const WILD = {
  seg: [0.03, (g, r) => { g.seg = 3 + Math.floor(r() * 6); if (r() < 0.5) g.plan = 'seg'; return `${'三四五六七八'[g.seg - 3]}节分段躯干`; }],
  eyes: [0.03, (g, r) => { g.eyes.n = 3 + Math.floor(r() * 5); g.eyes.k = clamp(g.eyes.k * 0.8, 0.5, 1.4); return `${'三四五六七'[g.eyes.n - 3]}目环列`; }],
  asym: [0.026, (g, r) => { g.asym = 0.5 + r() * 0.5; return '左右不对称'; }],
  ribbons: [0.03, (g, r) => { g.tail = { k: 'ribbon', s: 2.2 + r() * 1 }; if (r() < 0.6) g.dor = { ...g.dor, k: 'ribbon', l: 2.4 + r() * 0.8 }; if (r() < 0.5) g.pect = { k: 'long', s: 2 + r() }; g.app.push('ribbons'); return '拖地超长飘带'; }],
  photo: [0.03, (g, r) => { g.app.push('photo'); g.glow = Math.max(g.glow, 0.6 + r() * 0.4); return '体侧发光器阵列'; }],
  dor2: [0.03, (g, r) => { g.dor2 = { k: pick(r, ['shark', 'sail', 'spiny', 'crest', 'fan', 'saw']), h: 0.6 + r() * 0.8, l: 0.5 + r() * 0.6, x: 0.25 + r() * 0.1 }; g.dor.x = 0.62; return '前后双背鳍'; }],
  stalk: [0.026, (g, r) => { g.eyes.stalk = 0.6 + r() * 0.4; g.eyes.k = Math.max(g.eyes.k, 1.1); return '高举的眼柄'; }],
  twin: [0.028, (g, r) => { g.tail = { ...g.tail, n: 2, s: Math.max(1, g.tail.s) }; return '双尾并生'; }],
  giant: [0.02, (g, r, c) => { c.cmMul *= 3 + r() * 3; return '巨型体格'; }],
  wings: [0.028, (g, r) => { g.pect = { k: 'wing', s: 2 + r() * 0.9 }; return '翼展式胸鳍'; }],
  spikes: [0.026, (g) => { g.app.push('spikes'); if (g.dor.k === 'none' || (g.dor.h || 0) < 0.5) g.dor = { ...g.dor, k: 'spiny', h: Math.max(1.4, g.dor.h || 0) }; return '满背棘冠'; }],
  tentacle: [0.026, (g, r) => { g.app = g.app.filter((x) => appBase(x) !== 'tentacle'); g.app.push(`tentacle:${4 + Math.floor(r() * 9)}`); return '腹下触须丛'; }],
  glass: [0.022, (g, r) => { g.mat = 'crystal'; g.irid = 0.9; g.glow = Math.max(g.glow, 0.2 + r() * 0.3); return '琉璃透骨'; }],
  waist: [0.024, (g, r) => { g.waist = 0.45 + r() * 0.25; if (r() < 0.5) g.plan = 'hourglass'; return '蜂腰细身'; }],
  noodle: [0.02, (g, r) => { g.plan = 'eel'; g.len = 2.6 + r() * 0.6; g.ht = 0.05 + r() * 0.03; return '面条般细长'; }],
  horn: [0.024, (g, r) => { g.app.push(pick(r, ['horn:spiral', 'horn:spiral', 'horn:cephalic'])); return '额前长角'; }],
  chroma: [0.024, (g, r) => { g.pal = g.pal.map((c) => { const [h, s, l] = hsl(c); return fromHsl(h + 0.5, Math.max(s, 0.55), 1 - l * 0.85); }); return '反色体斑'; }],
};
export const WILD_IDS = Object.keys(WILD);
const WILD_NAME = { seg: ['节', '连节'], eyes: ['瞳', '复眼'], asym: ['偏', '偏身'], ribbons: ['绫', '飘带'], photo: ['萤', '萤列'], dor2: ['双', '双鳍'], stalk: ['望', '望眼'], twin: ['歧', '双尾'], giant: ['巨', '巨躯'], wings: ['翼', '翼鳍'], spikes: ['棘', '棘冠'], tentacle: ['须', '垂须'], glass: ['琉', '透骨'], waist: ['腰', '蜂腰'], noodle: ['绦', '长绦'], horn: ['角', '独角'], chroma: ['幻', '反色'] };

// ---------------- 一句话方向：关键词 → 基因加权 ----------------
// pre = 形状 / 材质 / 附肢（在道具覆写之前，道具优先级更高）；post = 颜色（道具覆写之后，有道具时只染点缀色 / 鳍色）
function tint(g, c, h, s, l, r) {
  const idx = c.hasItem ? [2, 3] : [0, 3, 2];
  idx.forEach((i, n) => { g.pal[i] = mixHex(g.pal[i], fromHsl(h + (r() - 0.5) * 0.04, s, l + (n === 2 ? 0.12 : 0)), n === 2 ? 0.45 : 0.78); });
  if (!c.hasItem) g.pal[1] = mixHex(g.pal[1], fromHsl(h, s * 0.4, 0.9), 0.4);
}
const COLOR = (h, s, l) => (g, r, c) => tint(g, c, h, s, l, r);
const PROMPT_KW = [
  // 颜色
  { id: 'red', kw: ['红', '赤', '绯', '朱'], txt: '体色偏向绯红', post: COLOR(0.99, 0.75, 0.5) },
  { id: 'pink', kw: ['粉', '桃', '樱'], txt: '体色泛起樱粉', post: COLOR(0.94, 0.7, 0.76) },
  { id: 'orange', kw: ['橙', '橘'], txt: '体色转为橘橙', post: COLOR(0.07, 0.85, 0.56) },
  { id: 'yellow', kw: ['黄', '柠檬'], txt: '体色染上明黄', post: COLOR(0.14, 0.85, 0.58) },
  { id: 'green', kw: ['绿', '抹茶', '翠', '碧'], txt: '体色转为翡翠绿', post: COLOR(0.38, 0.6, 0.45) },
  { id: 'blue', kw: ['蓝', '青', '靛'], txt: '体色沉入靛蓝', post: COLOR(0.6, 0.7, 0.5) },
  { id: 'purple', kw: ['紫', '葡萄', '薰衣草'], txt: '体色晕开紫雾', post: COLOR(0.77, 0.55, 0.55) },
  { id: 'black', kw: ['黑', '暗', '墨', '玄'], txt: '墨色暗身', post: (g, r, c) => tint(g, c, hsl(g.pal[0])[0], 0.25, 0.12, r) },
  { id: 'white', kw: ['白', '雪', '奶'], txt: '月白素身', post: (g, r, c) => tint(g, c, hsl(g.pal[0])[0], 0.1, 0.93, r) },
  { id: 'rainbow', kw: ['彩虹', '七彩', '炫彩', '五彩', '镭射'], txt: '七彩虹光', post: (g, r) => { const h0 = r(); g.pal = g.pal.map((x, i) => (i === 1 ? x : fromHsl(h0 + i * 0.27, 0.8, 0.58))); g.irid = 1; } },
  { id: 'fire', kw: ['火', '焰', '岩浆', '熔岩', '燃'], txt: '烈焰色尾', pre: (g, r) => { g.glow = Math.max(g.glow, 0.4); if (r() < 0.35) g.tail = { k: 'rocket', s: 1.2 }; }, post: (g) => { g.pal[2] = '#ffb238'; g.pal[3] = '#ff4a1c'; } },
  { id: 'ice', kw: ['冰', '霜', '雪花'], txt: '霜晶冰蓝', pre: (g, r) => { if (r() < 0.5) g.mat = 'crystal'; }, post: (g, r, c) => tint(g, c, 0.55, 0.6, 0.82, r) },
  // 材质
  { id: 'gold', kw: ['金', '土豪', '鎏金'], ex: ['金属'], txt: '鎏金鳞', pre: (g) => { g.mat = 'gold'; }, post: (g, r, c) => tint(g, c, 0.12, 0.75, 0.55, r) },
  { id: 'brass', kw: ['铜'], txt: '黄铜质感', pre: (g) => { g.mat = 'brass'; } },
  { id: 'metal', kw: ['铁', '钢', '机械', '金属', '赛博', '机甲', '齿轮', '蒸汽'], txt: '金属甲皮', pre: (g, r) => { g.mat = 'metal'; if (r() < 0.5) g.app.push('plates'); if (r() < 0.35) g.dor = { ...g.dor, k: 'gear' }; } },
  { id: 'ceramic', kw: ['瓷', '陶'], txt: '瓷釉表皮', pre: (g) => { g.mat = 'ceramic'; } },
  { id: 'crystal', kw: ['玻璃', '水晶', '透明', '宝石', '钻石', '幽灵'], txt: '琉璃透体', pre: (g, r) => { g.mat = 'crystal'; g.irid = Math.max(g.irid, 0.7); if (r() < 0.4) g.dor = { ...g.dor, k: 'crystal' }; } },
  { id: 'pearl', kw: ['珍珠', '贝壳', '珠'], txt: '珠母虹彩', pre: (g) => { g.mat = 'pearl'; } },
  { id: 'satin', kw: ['丝', '缎', '绸'], txt: '缎面光泽', pre: (g) => { g.mat = 'satin'; } },
  { id: 'plush', kw: ['毛绒', '绒', '毛茸茸', '软乎乎'], txt: '绒毛鬃领', pre: (g) => { g.mat = 'matte'; g.app.push('mane:knit'); } },
  { id: 'paper', kw: ['纸', '折纸'], txt: '纸质折痕', pre: (g) => { g.mat = 'paper'; } },
  { id: 'glaze', kw: ['釉', '漆', '糖果', '果冻'], txt: '釉亮表皮', pre: (g) => { g.mat = 'glaze'; } },
  // 大小 / 胖瘦 / 长短
  { id: 'big', kw: ['巨', '超大', '大只', '大块头', '庞大', '变大', '大一点', '大个'], txt: '体型可能暴涨', tag: '巨型体格', pre: (g, r, c) => { c.cmMul *= 2 + r() * 1.5; } },
  { id: 'tiny', kw: ['迷你', '小只', '袖珍', '小小', '变小', '小一点'], txt: '缩成掌心大小', tag: '掌心大小', pre: (g, r, c) => { c.cmMul *= 0.3 + r() * 0.2; } },
  { id: 'fat', kw: ['胖', '圆', '肥', '球', '鼓'], txt: '圆滚滚的身体', pre: (g, r) => { g.ht *= 1.4; g.wd *= 1.2; g.len *= 0.85; if (r() < 0.5) g.plan = 'globe'; } },
  { id: 'slim', kw: ['瘦', '苗条', '纤'], txt: '纤瘦体态', pre: (g) => { g.ht *= 0.65; g.wd *= 0.85; } },
  { id: 'long', kw: ['细长', '修长', '长长', '更长', '很长', '加长', '超长', '长条', '面条'], txt: '身体被拉长', tag: '修长身段', pre: (g, r) => { g.len *= 1.6; g.ht *= 0.7; if (r() < 0.35) g.plan = 'eel'; } },
  { id: 'short', kw: ['短', '矮', '墩'], txt: '短墩墩的身形', pre: (g) => { g.len *= 0.72; g.ht *= 1.2; } },
  { id: 'flat', kw: ['扁', '薄'], txt: '扁平宽体', pre: (g, r) => { if (r() < 0.6) g.plan = 'flat'; g.wd *= 1.8; g.ht *= 0.6; } },
  // 气质
  { id: 'fierce', kw: ['凶', '狠', '恶', '獠牙', '鲨', '霸', '暴', '杀', '酷'], txt: '獠牙与锋利背鳍', pre: (g, r) => { g.mouth = 'fang'; if (r() < 0.5) g.head = 'pointed'; g.dor = { ...g.dor, k: r() < 0.6 ? 'shark' : 'saw', h: Math.max(1.2, g.dor.h * 1.3) }; g.eyes.k *= 0.75; } },
  { id: 'cute', kw: ['萌', '可爱', '呆', '乖', '大眼', 'Q'], txt: '圆圆的大眼睛', pre: (g, r) => { g.eyes.k = Math.max(1.5, g.eyes.k); g.head = r() < 0.5 ? 'round' : 'dome'; g.mouth = 'smile'; g.len *= 0.9; } },
  { id: 'glow', kw: ['发光', '夜光', '荧光', '霓虹', '闪', '光'], ex: ['光滑'], txt: '体表会泛起荧光', tag: '通体荧光', pre: (g, r) => { g.glow = Math.max(g.glow, 0.75); if (r() < 0.4) g.app.push('photo'); } },
  // 部件
  { id: 'spike', kw: ['刺', '棘', '尖', '针'], txt: '浑身长刺', pre: (g) => { g.app.push('spikes'); g.dor = { ...g.dor, k: 'spiny', h: Math.max(1.2, g.dor.h) }; } },
  { id: 'tentacle', kw: ['触手', '触须', '章鱼', '水母'], txt: '长出触手', tag: '垂坠触手', pre: (g, r) => { g.app = g.app.filter((x) => appBase(x) !== 'tentacle'); g.app.push(`tentacle:${6 + Math.floor(r() * 6)}`); } },
  { id: 'wing', kw: ['翅膀', '翼', '飞', '天使', '蝙蝠'], txt: '胸鳍展开成翅膀', tag: '翅膀状胸鳍', pre: (g, r) => { g.pect = { k: 'wing', s: 2.2 + r() * 0.6 }; } },
  { id: 'horn', kw: ['角', '独角', '犄角', '恶魔', '龙'], txt: '额前长出角', tag: '额前长角', pre: (g) => { g.app.push('horn:spiral'); } },
  { id: 'eyes', kw: ['多眼', '三眼', '四眼', '千眼', '眼睛'], txt: '多出几只眼睛', tag: '多目', pre: (g, r) => { g.eyes.n = 3 + Math.floor(r() * 3); } },
  { id: 'cyclops', kw: ['独眼'], txt: '一只巨大的独眼', pre: (g) => { g.eyes.n = 1; g.eyes.k = 1.7; } },
  { id: 'tail', kw: ['尾巴', '长尾', '大尾'], txt: '尾鳍格外夸张', pre: (g, r) => { g.tail.s = Math.max(1.8, g.tail.s * 1.5); if (r() < 0.3) g.tail.k = 'ribbon'; } },
  { id: 'galaxy', kw: ['星', '宇宙', '银河', '太空'], txt: '星河斑纹', pre: (g) => { g.pat = { ...g.pat, k: 'galaxy', a: 1 }; }, post: (g, r, c) => { if (!c.hasItem) g.pal[0] = mixHex(g.pal[0], '#141a3a', 0.7); } },
  { id: 'stripe', kw: ['条纹', '斑马', '虎'], txt: '粗条纹', pre: (g, r) => { g.pat = { ...g.pat, k: r() < 0.5 ? 'stripe' : 'tiger', a: 1 }; } },
  { id: 'dots', kw: ['波点', '圆点', '斑点', '点点', '豹'], txt: '满身圆斑', pre: (g) => { g.pat = { ...g.pat, k: 'spots', a: 1 }; } },
  { id: 'flower', kw: ['开花', '花朵', '樱花', '春天', '花冠'], txt: '头顶开花', pre: (g) => { g.app.push('flower'); } },
  { id: 'crown', kw: ['王', '冠', '皇', '女王', '国王'], txt: '戴着王冠', pre: (g, r) => { g.app.push('crown'); if (r() < 0.4) g.mat = 'gold'; } },
  { id: 'armor', kw: ['盔甲', '铠甲', '甲壳', '硬'], txt: '甲片覆体', pre: (g, r) => { g.app.push(r() < 0.5 ? 'plates' : 'shell'); } },
  { id: 'beard', kw: ['胡子', '胡须'], txt: '长须嘴', pre: (g) => { g.mouth = 'whisker'; g.app.push('barbels'); } },
  { id: 'legs', kw: ['腿', '脚', '走路', '爬'], txt: '长出小短腿', tag: '小短腿', pre: (g) => { g.app.push('legs:6'); g.pect = { k: 'leg', s: 1 }; } },
];
function parsePrompt(p) {
  p = String(p || '').toLowerCase(); if (!p) return [];
  const hits = PROMPT_KW.filter((e) => { let q = p; for (const x of e.ex || []) q = q.split(x).join(''); return e.kw.some((k) => q.includes(k.toLowerCase())); });
  // 「金黄」只算金，「长出」不算长；彩虹吃掉单色
  return hits.some((h) => h.id === 'rainbow') ? hits.filter((h) => !['red', 'pink', 'orange', 'yellow', 'green', 'blue', 'purple'].includes(h.id)) : hits;
}

// ---------------- 道具 motif 强力覆写 ----------------
function applyMotif(g, m, r, c) {
  const P = c.itemParts;
  if (m.pal) {
    const keep = r() < 0.65 ? 2 : r() < 0.5 ? 3 : 1;   // 留一个亲本色槽 → 千丝万缕
    g.pal = m.pal.map((x, i) => (i === keep ? mixHex(g.pal[i], x, 0.3) : mixHex(x, g.pal[i], 0.06 + r() * 0.14)));
    P.add('pal');
  }
  if (m.mat) { g.mat = m.mat; P.add('mat'); }
  if (m.pat) { g.pat = { k: m.pat, d: m.patD ?? (m.pat === 'none' ? g.pat.d : clamp(g.pat.d, 2, 6)), a: Math.max(0.8, g.pat.a), r: g.pat.r }; P.add('pat'); }
  if (m.plan && r() < 0.88) { g.plan = m.plan; P.add('plan'); planFit(g, r, true); }
  if (m.head) { g.head = m.head; P.add('head'); }
  if (m.mouth) { g.mouth = m.mouth; P.add('mouth'); }
  if (m.dorsal) { g.dor = { k: m.dorsal, h: clamp(g.dor.h || 1, 0.9, 1.7), l: clamp(g.dor.l || 1, 0.7, 1.6), x: clamp(g.dor.x ?? 0.5, 0.4, 0.6) }; P.add('dor'); }
  if (m.tail) { g.tail = { ...g.tail, k: m.tail, s: clamp(g.tail.s, 1, 2.4) }; P.add('tail'); }
  if (m.pect) { g.pect = { k: m.pect, s: clamp(g.pect.s, 1, 2.4) }; P.add('pect'); }
  if (m.app) { g.app = [...m.app, ...g.app]; P.add('app'); for (const a of m.app) P.add('app:' + appBase(a)); }
  if (m.eyes) { g.eyes = { ...g.eyes, ...m.eyes }; P.add('eyes'); }
  if (m.glow) g.glow = Math.max(g.glow, m.glow);
  if (m.cm) c.cmMul *= m.cm;
  if (m.slim) { g.len *= m.slim; g.ht /= m.slim; }
  if (m.boxy) g.sq = Math.max(g.sq, m.boxy);
  if (m.arch != null) g.arch = m.arch;
}

// ---------------- 收尾：去重 / 限幅 / 压缩小数 ----------------
function finalize(g) {
  const seen = new Set(), app = [];
  for (const a of g.app) { const b = appBase(a); if (seen.has(b)) continue; seen.add(b); app.push(a); }
  g.app = app.slice(0, 6);
  if (g.app.some((a) => appBase(a) === 'horn' && a !== 'horn:bill')) g.app = g.app.filter((a) => a !== 'horn:bill' || g.head === 'bill');
  g.eyes.n = clamp(Math.round(g.eyes.n), 0, 7); g.eyes.stalk = clamp(+g.eyes.stalk || 0, 0, 1); g.eyes.lens = g.eyes.lens ? 1 : 0;
  g.pelv = g.pelv ? 1 : 0; g.anal = g.anal ? 1 : 0; g.asym = clamp(+g.asym || 0, 0, 1);
  if (g.tail.n !== 2) delete g.tail.n;
  g.pal = g.pal.map((c) => rgb2hex(hex2rgb(c)));
  const out = normGenome(g);
  for (const k of BODY) out[k] = r3(out[k]);
  for (const o of [out.eyes, out.dor, out.dor2, out.tail, out.pect, out.pat]) if (o) for (const k in o) if (typeof o[k] === 'number') o[k] = r3(o[k]);
  out.glow = r2(clamp(out.glow, 0, 1)); out.irid = r2(clamp(out.irid, 0, 1)); out.asym = r2(out.asym);
  return out;
}

// ---------------- 性状短语（卡片标签 / 基因预感） ----------------
function featureList(g) {
  const f = [];
  if (DOR_TXT[g.dor.k]) f.push({ part: 'dor', txt: DOR_TXT[g.dor.k], w: g.dor.k === 'shark' ? 1.8 : 2 });
  if (g.dor2 && DOR_TXT[g.dor2.k]) f.push({ part: 'dor2', txt: '前后双背鳍', w: 2.5 });
  if (TAIL_TXT[g.tail.k]) f.push({ part: 'tail', txt: g.tail.n === 2 ? '双尾并生' : TAIL_TXT[g.tail.k], w: ['fork', 'round'].includes(g.tail.k) ? 0.6 : 1.6 });
  if (HEAD_TXT[g.head]) f.push({ part: 'head', txt: HEAD_TXT[g.head], w: ['hammer', 'bill', 'tube', 'spout'].includes(g.head) ? 2.4 : 0.6 });
  if (MOUTH_TXT[g.mouth]) f.push({ part: 'mouth', txt: MOUTH_TXT[g.mouth], w: 1 });
  if (PECT_TXT[g.pect.k]) f.push({ part: 'pect', txt: PECT_TXT[g.pect.k], w: ['wing', 'bow', 'leg'].includes(g.pect.k) ? 2 : 1 });
  for (const a of g.app) { const t = appTxt(a); if (t) f.push({ part: 'app:' + appBase(a), txt: t, w: 2.6 }); }
  if (g.eyes.n !== 2) f.push({ part: 'eyes', txt: g.eyes.n === 0 ? '没有眼睛' : g.eyes.n === 1 ? '一只独眼' : `${'零一二三四五六七'[g.eyes.n]}只眼睛`, w: 2.4 });
  else if (g.eyes.stalk > 0.4) f.push({ part: 'eyes', txt: '眼柄', w: 2 });
  else if (g.eyes.k > 1.35) f.push({ part: 'eyes', txt: '铜铃大眼', w: 1.2 });
  if (PAT_TXT[g.pat.k]) f.push({ part: 'pat', txt: PAT_TXT[g.pat.k], w: 1.2 });
  if (MAT_TXT[g.mat]) f.push({ part: 'mat', txt: MAT_TXT[g.mat], w: 1.4 });
  if (g.plan !== 'fusiform') f.push({ part: 'plan', txt: g.seg >= 3 && g.plan !== 'seg' ? '分节躯干' : PLAN_TXT[g.plan], w: 1.3 });
  if (g.glow > 0.55 && g.mat !== 'glow') f.push({ part: 'glow', txt: '会微微发光', w: 1.5 });
  if (g.asym > 0.5) f.push({ part: 'asym', txt: '左右不对称', w: 2 });
  return f;
}

// ---------------- 命名 ----------------
const MAT_ADJ = { gold: ['鎏金', '金箔'], brass: ['镀铜', '黄铜'], ceramic: ['白瓷', '瓷釉'], glaze: ['釉彩', '漆光'], pearl: ['珠母', '珍珠'], satin: ['缎面', '丝光'], crystal: ['琉璃', '水晶'], glow: ['萤火', '流萤'], paper: ['宣纸', '折纸'], metal: ['铁铸', '锻钢'], matte: ['雾面', '绒光'] };
const PAT_ADJ = { stripe: '条纹', spots: '星斑', marble: '云石', galaxy: '星河', tux: '礼服', ring: '环纹', ocelli: '眼斑', geo: '龟甲', melon: '瓜纹', sunburst: '日轮', waffle: '格纹', grad: '渐染', sprinkle: '糖霜', dial: '刻度', lateral: '银线', tiger: '虎纹', bars: '横带', scale: '鳞纹', stars: '星点', freckle: '雀斑', mottle: '斑驳', lines: '纵纹', orca: '玄白', ribs: '肋纹' };
const COLOR_W = [[15, ['绯红', '朱砂']], [40, ['琥珀', '赭金']], [62, ['鹅黄', '缃色']], [90, ['柳绿', '橄榄']], [160, ['翡翠', '碧玉']], [195, ['湖青', '松石']], [235, ['靛蓝', '海蓝']], [275, ['绀青', '黛紫']], [320, ['藕荷', '绛紫']], [345, ['桃夭', '胭脂']], [361, ['绯红', '朱砂']]];
function colorWord(c, r) {
  const [h, s, l] = hsl(c);
  if (l > 0.86) return pick(r, ['月白', '霜白', '象牙']);
  if (l < 0.16) return pick(r, ['玄墨', '乌金', '鸦青']);
  if (s < 0.14) return pick(r, ['银灰', '鸽灰', '烟灰']);
  const H = h * 360; for (const [lim, w] of COLOR_W) if (H < lim) return pick(r, w);
  return '绯红';
}
const W_DOR = { shark: ['镰', '镰鳍'], sail: ['帆', '帆鳍'], spiny: ['棘', '棘背'], crest: ['冠', '长冠'], ribbon: ['绫', '绫鳍'], fan: ['扇', '折扇'], finlet: ['鬣', '鬣鳍'], lid: ['盖', '盖鳍'], canopy: ['伞', '伞鳍'], handle: ['柄', '提柄'], key: ['钥', '钥齿'], gear: ['轮', '齿轮'], quill: ['翎', '翎背'], wedge: ['楔', '楔鳍'], saw: ['锯', '锯背'], cap: ['菌', '菌盖'], crystal: ['晶', '晶簇'] };
const W_TAIL = { swallow: ['燕', '燕尾'], ribbon: ['缎', '缎尾'], rocket: ['焰', '焰尾'], anchor: ['锚', '锚尾'], fan: ['扇', '扇尾'], curl: ['卷', '卷尾'], shears: ['剪', '剪尾'], feather: ['羽', '羽尾'], hook: ['钩', '钩尾'], ring: ['环', '环尾'], stiletto: ['跟', '细跟'], leaf: ['叶', '叶尾'], lunate: ['月', '月尾'], whip: ['鞭', '鞭尾'], fluke: ['鲸', '鲸尾'], lobe: ['萼', '三叶'], paddle: ['桨', '桨尾'], shark: ['镰', '歪尾'] };
const W_HEAD = { hammer: ['锤', '锤头'], bill: ['剑', '剑吻'], tube: ['笛', '笛吻'], spout: ['壶', '壶嘴'], dome: ['盔', '圆盔'], bevel: ['斧', '斧额'] };
const W_MOUTH = { fang: ['牙', '獠牙'], whisker: ['髯', '长髯'], beak: ['喙', '鹦喙'], sucker: ['盘', '吸盘'] };
const W_PECT = { wing: ['翼', '翼鳍'], bow: ['结', '领结'], leg: ['足', '步足'], frill: ['裙', '裙鳍'], long: ['袖', '长袖'] };
const W_APP = { tentacle: ['须', '垂须'], arms: ['星', '星腕'], legs: ['足', '百足'], claws: ['螯', '巨螯'], antennae: ['触', '长触'], barbels: ['髭', '须髭'], lure: ['灯', '灯笼'], horn: ['角', '独角'], spikes: ['刺', '棘刺'], shell: ['甲', '龟甲'], crown: ['冠', '冠冕'], coronet: ['冠', '小冠'], mane: ['鬃', '鬃领'], tophat: ['冕', '礼冠'], pearls: ['珠', '珠颈'], photo: ['萤', '萤列'], bells: ['铃', '铃铛'], band: ['带', '束带'], plates: ['鳞', '甲鳞'], swirl: ['螺', '螺旋'], calyx: ['萼', '花萼'], flower: ['花', '花冠'], strings: ['弦', '琴弦'], ribbons: ['绦', '飘带'] };
const W_PAT = { galaxy: ['星', '星河'], ring: ['环', '环纹'], melon: ['瓜', '瓜纹'], geo: ['龟', '龟纹'], ocelli: ['目', '眼斑'], sunburst: ['葵', '日轮'], tiger: ['虎', '虎纹'], stripe: ['纹', '条纹'], spots: ['斑', '星斑'], dial: ['晷', '刻度'], waffle: ['格', '方格'], marble: ['云', '云纹'], tux: ['礼', '礼服'], orca: ['玄', '玄白'] };
const W_PLAN = { globe: ['圆', '团团'], eel: ['长', '长身'], flat: ['扁', '扁身'], box: ['方', '方身'], seg: ['节', '连节'], disc: ['盘', '圆盘'], hourglass: ['腰', '细腰'], diamond: ['菱', '菱身'], deep: ['高', '高背'], fusiform: ['梭', '梭身'] };
const TAILCH = { fusiform: ['鲹', '鲭', '鲻', '鱚', '鲈'], deep: ['鲷', '鲳', '鲂', '鲉'], globe: ['鲀', '鮟', '鲀'], eel: ['鳗', '鳝', '鳚', '鳗'], flat: ['鳐', '魟', '鲼'], box: ['鲀', '鲂'], seg: ['鳚', '螈', '鲻'], disc: ['鲳', '鲆', '鲽'], hourglass: ['鳚', '鲉'], diamond: ['鲂', '鳊', '鲳'] };
function nameFeatures(g, it) {
  const f = [], add = (w, c, k) => { if (w) f.push({ c1: w[0], c2: w[1], w: c, k }); };
  const mp = it?.motif || {};
  for (const id of g.wild || []) if (WILD_NAME[id]) add(WILD_NAME[id], 3, 'w:' + id);
  add(W_DOR[g.dor.k], mp.dorsal ? 3 : 1.4, 'dor');
  add(W_TAIL[g.tail.k], mp.tail ? 3 : 1, 'tail');
  add(W_HEAD[g.head], mp.head ? 2.6 : 1.6, 'head');
  add(W_MOUTH[g.mouth], 0.8, 'mouth');
  add(W_PECT[g.pect.k], mp.pect ? 2.6 : 1.2, 'pect');
  for (const a of g.app) add(W_APP[appBase(a)], (mp.app || []).includes(a) ? 3 : 2, 'app:' + appBase(a));
  add(W_PAT[g.pat.k], mp.pat ? 1.6 : 0.8, 'pat');
  if (!f.length || g.plan !== 'fusiform') add(W_PLAN[g.plan], 0.7, 'plan');
  return f;
}
function tailChar(g, r) {
  const has = (b) => g.app.some((a) => appBase(a) === b);
  if (has('tentacle') && r() < 0.45) return pick(r, ['蛸', '鲼']);
  if ((has('claws') || has('legs')) && r() < 0.4) return g.plan === 'seg' ? '虾' : '蟹';
  if (g.pect.k === 'wing' && r() < 0.4) return pick(r, ['鳐', '鲼']);
  return pick(r, TAILCH[g.plan] || TAILCH.fusiform);
}
export function synthName(v) {
  const g = v?.syn && !v.syn.stub ? normGenome(v.syn) : genomeOf(v);
  const it = ITEM_BY_ID[v?.synItem || g.item];
  const r = rng(hash(`${(v?.seed ?? 1) >>> 0}|${v?.salt ?? ''}|name|${g.pal[0]}`));
  const A = [];
  if (it?.adj) A.push({ s: it.adj, w: 5 });
  if (MAT_ADJ[g.mat]) A.push({ s: pick(r, MAT_ADJ[g.mat]), w: it?.motif?.mat ? 1 : 2 });
  A.push({ s: colorWord(g.pal[0], r), w: 1.5 });
  if (PAT_ADJ[g.pat.k]) A.push({ s: PAT_ADJ[g.pat.k], w: 0.9 });
  A.push({ s: colorWord(g.pal[2], r), w: 0.5 });
  const F = nameFeatures(g, it);
  for (let tries = 0; tries < 8; tries++) {
    const a = pickW(r, A, (x) => x.w).s, f1 = pickW(r, F, (x) => x.w);
    const rest = F.filter((x) => x !== f1 && x.c1 !== f1.c1 && !a.includes(x.c1));
    const f2 = rest.length ? pickW(r, rest, (x) => x.w) : null, t = tailChar(g, r);
    const fm = r();
    let s;
    if (fm < 0.3 && f2) s = `${a}${f1.c2}·${f2.c1}${t}`;
    else if (fm < 0.6) s = `${a}·${f1.c2}${t}`;
    else if (fm < 0.88 && f2) s = `${a}${f1.c2}·${f2.c2}${t}`;
    else s = `${a}·${f1.c1}${t}`;
    const chars = s.replace('·', '');
    if (new Set(chars).size === chars.length) return s;
  }
  return `${pickW(r, A, (x) => x.w).s}·${tailChar(g, r)}`;
}

export function synthTags(v) {
  if (Array.isArray(v?.syn?.tags) && v.syn.tags.length) return v.syn.tags.slice(0, 4);
  return featureList(genomeOf(v)).sort((a, b) => b.w - a.w).slice(0, 3).map((x) => x.txt);
}

// ---------------- 指纹 ----------------
const H4 = (n) => (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
function fpOf(g) { const s = JSON.stringify({ ...g, tags: 0 }); const a = H4(hash(s)), b = H4(hash(s + '#')); return `${a.slice(0, 4)}-${a.slice(4)}-${b.slice(0, 4)}`; }
const sig = (g) => hash(JSON.stringify(g)).toString(36);

// ---------------- 合成 ----------------
let UIDN = 0;
const ITEM_RAR_PTS = { common: 0, rare: 0.5, epic: 1.1, legendary: 1.9 };
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
  const wA = clamp(0.5 + gauss(r) * 0.17, 0.15, 0.85);
  const src = {};
  const g = inherit(r, gA, gB, wA, src);
  g.anc = mergeAnc(gA.anc, gB.anc, wA);
  const heat = 1 + Math.min(0.6, (gen - 1) * 0.12) + (selfMix ? 0.5 : 0);
  mutate(r, g, heat);
  planFit(g, r);
  const c = { cmMul: 1, hasItem: !!m, itemParts: new Set() };
  // 狂野突变
  const wk = (1 + Math.min(1, (gen - 1) * 0.15)) * (it?.cat === 'curio' ? 1.6 : 1) * (selfMix ? 1.3 : 1);
  const wild = WILD_IDS.filter((id) => r() < WILD[id][0] * wk);
  for (const w of m?.wild || []) if (WILD[w] && !wild.includes(w)) wild.push(w);
  const wildTags = wild.map((id) => WILD[id][1](g, r, c));
  // 一句话 + 道具
  const hits = parsePrompt(prompt);
  for (const h of hits) h.pre?.(g, r, c);
  if (m) applyMotif(g, m, r, c);
  for (const h of hits) h.post?.(g, r, c);
  planFit(g, r);
  const out = finalize(g);
  out.anc = g.anc; out.wild = wild; out.item = it ? it.id : null;
  // 体长 / 体重
  let cm = Math.sqrt(Math.max(3, cmA) * Math.max(3, cmB)) * Math.exp(gauss(r) * 0.38) * c.cmMul;
  cm = Math.round(clamp(cm, 4, 2400) * 10) / 10;
  const shapeK = clamp((out.ht * out.ht * out.wd) / (0.2 * 0.2 * 0.62), 0.12, 6);
  const kgRaw = 14 * Math.pow(cm / 100, 3) * shapeK;
  const kg = kgRaw >= 1 ? Math.round(kgRaw * 10) / 10 : Math.max(0.02, Math.round(kgRaw * 100) / 100);
  // 稀有度
  const parRar = Math.max(rarOf(a), rarOf(b));
  const score = wild.length * 1.0 + (it ? ITEM_RAR_PTS[it.rarity] || 0 : 0) + (it?.cat === 'curio' ? 0.3 : 0) + Math.min(1.5, (gen - 1) * 0.35) + parRar * 0.2 + (c.cmMul >= 3 ? 0.4 : 0) + r() * 0.9;
  const rarity = SYN_RAR[score < 1.6 ? 0 : score < 2.75 ? 1 : score < 4 ? 2 : 3];
  // 标签：道具 ≤2 + 狂野 ≤2 + 一句话 ≤1 + 至少 1 个亲本遗传性状
  const P = c.itemParts, tags = [];
  if (it) { const t = it.motif.tags || []; if (t[0]) tags.push(t[0]); if (t.length > 1) tags.push(pick(r, t.slice(1))); }
  tags.push(...wildTags.slice(0, it ? 1 : 2));
  const ph = hits.length ? pick(r, hits) : null, promptTag = ph ? ph.tag || ph.txt : null;
  const feats = featureList(out).filter((f) => !P.has(f.part) && !tags.includes(f.txt) && !wildTags.includes(f.txt));
  const inh = feats.filter((f) => src[f.part] === 'a' || src[f.part] === 'b' || src[f.part] === 'anc' || f.part.startsWith('app:'));
  const firstInh = inh.length ? pickW(r, inh, (f) => f.w) : null;
  const want = 3 + (r() < 0.5 ? 1 : 0);
  if (promptTag && tags.length < want - 1) tags.push(promptTag);
  if (firstInh) tags.push(firstInh.txt);
  const pool = feats.filter((f) => f !== firstInh);
  while (uniq(tags).length < want && pool.length) { const f = pickW(r, pool, (x) => x.w); pool.splice(pool.indexOf(f), 1); tags.push(f.txt); }
  out.tags = uniq(tags).slice(0, 4);
  if (out.tags.length < 3) out.tags.push(...['基因重组', '新物种'].slice(0, 3 - out.tags.length));
  const uid = `syn-${seed.toString(36)}-${(Date.now() % 46656).toString(36)}${(++UIDN % 1296).toString(36)}`;
  const v = {
    uid, id: uid, sp: 'synth', syn: out, rarity, cm, kg, gen,
    parents: [a, b].map((x) => ({ uid: x.uid || null, name: nameOf(x), sp: x.sp || null })),
    synItem: it ? it.id : null, prompt, creator, seed, fp: fpOf(out),
    traits: [], hue: 0, sat: 1, light: 1, sizeK: 1, mut: null,
  };
  v.name = synthName(v);
  for (let k = 1; k < 6 && v.parents.some((p) => p.name === v.name); k++) v.name = synthName({ ...v, salt: k });   // 别和亲本撞名
  v.nick = v.name;
  return v;
}

// ---------------- 基因预感 ----------------
export function previewHints({ a, b, item = null, prompt = '' } = {}) {
  if (!a && !b) return { tags: ['先放进一条鱼'], risk: 0 };
  const gA = genomeOf(a || b), gB = b ? genomeOf(b) : null;
  const it = (item && ITEM_BY_ID[item]) || null, m = it?.motif;
  const r = rng(hash(`hint|${sig(gA)}|${gB ? sig(gB) : ''}|${item}|${prompt}`));
  const tags = [];
  const best = (g, used) => { const f = featureList(g).filter((x) => !used.has(x.part) && !(m && ((x.part === 'dor' && m.dorsal) || (x.part === 'tail' && m.tail) || (x.part === 'pat' && m.pat) || (x.part === 'mat' && m.mat)))); return f.length ? pickW(r, f, (x) => x.w ** 3) : null; };
  const used = new Set();
  const fa = best(gA, used); if (fa) { used.add(fa.part); tags.push(`可能继承${shortName(a || b)}的${fa.txt}`); }
  if (gB) { const fb = best(gB, used); if (fb) tags.push(`${shortName(b)}的${fb.txt}或许会保留`); }
  if (m) { const t = m.tags || []; tags.push(`大概率长出${t[0] || it.name}`); if (t[1] && r() < 0.6) tags.push(`身上会带着${t[1]}`); }
  const hits = parsePrompt(prompt); if (hits.length) tags.push(pick(r, hits).txt);
  else if (prompt && prompt.trim()) tags.push(`朝「${prompt.trim().slice(0, 8)}」偏移`);
  if (tags.length < 2) tags.push('调色板将跨亲本重组');
  // 风险：亲本差异 + 道具 + 一句话 + 世代
  let dist = 0;
  if (gB) {
    dist += gA.plan !== gB.plan ? 0.3 : 0; dist += gA.dor.k !== gB.dor.k ? 0.12 : 0; dist += gA.tail.k !== gB.tail.k ? 0.12 : 0;
    dist += Math.min(0.2, Math.abs(Math.log(gA.ht / gB.ht)) * 0.2); dist += hueDist(hsl(gA.pal[0])[0], hsl(gB.pal[0])[0]) * 0.4;
    dist += Math.min(0.2, (uniq([...gA.app, ...gB.app]).length) * 0.05);
  }
  const gen = Math.max(a?.gen || 0, b?.gen || 0);
  const risk = clamp(0.12 + dist * 0.6 + (it ? 0.08 + (ITEM_RAR_PTS[it.rarity] || 0) * 0.08 + (it.cat === 'curio' ? 0.1 : 0) : 0) + (hits.length ? 0.05 + hits.length * 0.02 : 0) + Math.min(0.2, gen * 0.05) + (r() - 0.5) * 0.06, 0.05, 0.97);
  if (risk > 0.72 && tags.length < 4) tags.push('狂野突变的气息很浓');
  return { tags: uniq(tags).slice(0, 4), risk: r2(risk) };
}

// ---------------- 别人造的合成鱼 ----------------
const WILD_PROMPTS = ['想要会发光的', '再胖一点', '凶一点', '粉粉的', '长出翅膀', '像宝石一样透明', '要很长很长', '迷你一点', '黄金打造', '可爱到犯规', '多几只眼睛', '浑身是刺', '像宇宙一样', '黑色的', '触手怪', '戴王冠', '冰蓝色', '机械感', '扁扁的', '红白条纹'];
const NPC_NAMES = ['海雾', '阿汀', '小鲣', '潮生', '鲸落', '七七', '南屿', '橘子汽水'];
const NAT_W = { common: 5, uncommon: 4, rare: 3, epic: 2, legendary: 1.4 };
export function wildSynth(seed = (Math.random() * 4294967296) >>> 0, creator = '', depth = 0) {
  seed >>>= 0;
  const r = rng(hash(`wild|${seed}|${depth}`));
  const mk = (k) => {
    if (depth < 2 && r() < (depth ? 0.12 : 0.28)) { const p = wildSynth((r() * 4294967296) >>> 0, '@' + pick(r, NPC_NAMES), depth + 1); p.uid = p.id = `wp-${seed.toString(36)}-${depth}${k}`; return p; }
    const sp = pickW(r, NATURAL_IDS, (id) => NAT_W[NATURAL[id].rar] || 1), n0 = NATURAL[sp];
    const tr = r() < 0.12 ? [pick(r, ['gold', 'rainbow', 'glow', 'pastel', 'neon'])] : [];
    return { uid: `wn-${seed.toString(36)}-${depth}${k}`, sp, cm: Math.round(n0.cm * (0.75 + r() * 0.6) * 10) / 10, gen: 0, traits: tr, hue: (r() - 0.5) * 0.16, sat: 0.9 + r() * 0.35, light: 0.92 + r() * 0.16 };
  };
  const a = mk('a'), b = mk('b');
  const item = r() < 0.55 ? pickW(r, ITEMS, (x) => ({ common: 6, rare: 3, epic: 1.2, legendary: 0.4 }[x.rarity] || 1)).id : null;
  const prompt = r() < 0.4 ? pick(r, WILD_PROMPTS) : '';
  return synthesize({ a, b, item, prompt, seed, creator });
}
