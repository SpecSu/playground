// 机甲随机配色规则 v12：「明度结构 + 色彩预算」生成机制（不再是固定配色原型）
// 面积实测（各形态平均表面积占比）：P 主装甲≈30% · M 金属件≈27% · S 副装甲≈15% · K 关节黑≈13% · A 细节≈6% · G 发光≈2%
// 旧版问题根源：P/M/S 经常落在同一明度、同一色相（如淡紫主甲 + 淡紫灰金属 + 冷白副甲）→ 60%+ 面积一片纯色、发塑料
// v12 用三条规则从机制上保证层次：
//   1. 明度结构：P / M / S 必须分处「暗 / 中 / 亮」不同明度带，两两明度差 ≥ 0.2（不满足会自动校正）
//   2. 色彩预算：P / M / S 里最多只有一个是高饱和主题色，其余必须是中性色 / 黄铜金属 / 主题色的低饱和衍生色
//   3. 主题色上大面积时：用中明度版本（不用粉彩高亮版）+ 50~60% 概率做「金属烤漆」（环境反射自带明暗渐变，消除塑料感）+ 分色涂装/轻磨损打散平铺
// 颜色来源：主色板 5 色（玫红/亮黄绿/淡紫/薄荷青/香蕉黄）+ 中性金属（冷白/银/钛灰/枪灰/石墨）+ 黄铜/古铜/香槟金
// 注意：函数会被原样内联进线上构建产物，不能引用外部变量
export function makePaletteV12(rnd, form, kwHue, forceIdx) {
  const R = (a, b) => a + (b - a) * rnd();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const wpick = (arr) => { let t = 0; for (const x of arr) t += x[0]; let r = rnd() * t; for (const x of arr) { if ((r -= x[0]) <= 0) return x; } return arr[arr.length - 1]; };
  const toHsl = (hex) => { const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; };
  const hsl = (h, s, l) => { h = ((h % 360) + 360) % 360 / 360; s = Math.min(1, Math.max(0, s)); l = Math.min(0.97, Math.max(0.04, l)); const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return '#' + [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); };
  const val = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const jit = (hex, dl) => { const [h, s, l] = toHsl(hex); return hsl(h + (s > 0.1 ? R(-4, 4) : 0), s * R(0.94, 1.04), l + R(-(dl || 0.03), dl || 0.03)); };

  // 主色板：[名, 色相, 原色]
  const HERO = [['玫红', 333, '#F569A8'], ['亮黄绿', 74, '#DEFF72'], ['淡紫', 252, '#B7A4FF'], ['薄荷青', 166, '#7FE5CD'], ['香蕉黄', 51, '#FFE135']];
  // 和谐搭档（第二色只上细节件 / 发光 / 涂装，面积小）
  const PAIR = { 玫红: ['淡紫', '亮黄绿', '薄荷青'], 亮黄绿: ['淡紫', '玫红', '薄荷青'], 淡紫: ['薄荷青', '香蕉黄', '玫红', '亮黄绿'], 薄荷青: ['香蕉黄', '淡紫', '玫红'], 香蕉黄: ['淡紫', '薄荷青'] };
  // 中性 / 金属库：[名, 色, 明度带 0暗 1中 2亮, 是否金属漆]
  const NEU = {
    冷白: ['#ECEBE6', 2, 0], 银: ['#BCC0C8', 2, 1], 香槟金: ['#D2B26E', 2, 1],
    钛灰: ['#7E838C', 1, 1], 黄铜: ['#BE9142', 1, 1],
    古铜: ['#7A6443', 0, 1], 枪灰: ['#3D3F47', 0, 1], 石墨: ['#232327', 0, 0],
  };
  const heroBright = (h) => h[2];
  const heroMid = (h) => { const [hh, s] = toHsl(h[2]); const w = h[0] === '亮黄绿' || h[0] === '香蕉黄'; return hsl(hh, Math.min(s, 0.95) * (w ? R(0.52, 0.62) : R(0.62, 0.74)), w ? R(0.45, 0.5) : h[0] === '淡紫' ? R(0.66, 0.7) : R(0.58, 0.64)); }; // 淡紫在金属反射下最容易发黑，基础明度单独提高 // 大面积用：中明度、略降饱和
  const COOL = HERO.filter((x) => x[0] !== '香蕉黄' && x[0] !== '亮黄绿');
  // 深色有色金属只从「淡紫 / 薄荷青」推导（深紫钢、暗青钢）：玫红的暗版=酒红/干血色，黄/黄绿的暗版=橄榄土色，都会发脏
  const DARKABLE = HERO.filter((x) => x[0] === '淡紫' || x[0] === '薄荷青');
  const heroDarkTint = (h) => { const t = DARKABLE.find((x) => x[0] === h[0]) || DARKABLE.find((x) => x[0] === mate[0]) || pick(DARKABLE); return hsl(t[1], R(0.2, 0.3), t[0] === '淡紫' ? R(0.26, 0.31) : R(0.21, 0.26)); };
  const heroPearl = (h) => hsl(h[1], R(0.12, 0.2), R(0.85, 0.9)); // 色板色衍生：带色珍珠白（取搭档色相，避免和主题色同色一片）

  let hero;
  if (kwHue != null) { const dd = (x) => Math.min(Math.abs(kwHue - x), 360 - Math.abs(kwHue - x)); hero = HERO.slice().sort((a, b) => dd(a[1]) - dd(b[1]))[0]; }
  else hero = pick(HERO);
  const mateName = pick(PAIR[hero[0]]); const mate = HERO.find((x) => x[0] === mateName);
  const warm = hero[0] === '香蕉黄' || hero[0] === '亮黄绿'; // 暖黄系主题色不配黄铜/古铜/香槟（同色相会发脏发棕）
  const N = (k) => ({ c: jit(NEU[k][0], 0.025), band: NEU[k][1], metal: !!NEU[k][2], name: k });

  // 明度结构方案：决定主题色落在哪里、P/M/S 各占哪个明度带
  const PLANS = [
    // [权重, 名称, 生成函数] → 返回 { p, s, m, pM, sM, fin }
    [1.6, '亮甲', () => ({ p: heroMid(hero), pM: warm || rnd() < 0.6 ? 1 : 0, s: pick([N('石墨'), N('枪灰')]), m: pick(warm ? [N('银'), N('钛灰')] : [N('银'), N('香槟金'), N('黄铜'), N('钛灰')]), fin: 'satin', mustPat: 1 })],
    [3, '暗甲', () => { const dark = rnd() < 0.55 ? { c: heroDarkTint(hero), metal: true } : pick([N('枪灰'), N('石墨')]); return { p: dark.c, pM: dark.metal ? 1 : 0, s: { c: (() => { const [hh, ss] = toHsl(hero[2]); return hsl(hh, ss * R(0.75, 0.88), warm ? R(0.52, 0.58) : R(0.62, 0.68)); })(), metal: rnd() < 0.5 }, m: pick(warm ? [N('银'), N('银'), N('钛灰')] : [N('银'), N('香槟金'), N('黄铜'), N('钛灰')]), fin: pick(['satin', 'gloss']) }; }],
    [2.5, '白甲', () => ({ p: rnd() < 0.5 ? jit(NEU.冷白[0], 0.02) : heroPearl(mate), pM: 0, s: rnd() < 0.5 ? { c: heroMid(hero), metal: rnd() < 0.4 } : pick([N('石墨'), N('枪灰'), { c: heroDarkTint(hero), metal: true }]), heroAcc: 1, m: pick(warm ? [N('枪灰'), N('石墨')] : [N('枪灰'), N('古铜'), N('石墨')]), fin: 'gloss' })],
    [2.5, '金属甲', () => { const mt = pick(warm ? [N('银'), N('钛灰'), N('银')] : [N('银'), N('香槟金'), N('钛灰'), N('黄铜')]); return { p: mt.c, pn: mt.name, pM: 1, s: (mt.name !== '钛灰' && rnd() < 0.4) ? N('石墨') : { c: heroMid(hero), metal: rnd() < 0.5 }, m: mt.band === 0 ? N('银') : pick([N('枪灰'), N('石墨')]), fin: /黄铜|香槟/.test(mt.name) ? 'chrome' : 'satin' }; }], // 黄铜/香槟金机身用低粗糙度抛光，高光锐利才读得出贵金属
    [1.5, '撞色', () => ({ p: heroMid(hero), pM: rnd() < 0.5 ? 1 : 0, s: { c: (() => { const t = DARKABLE.find((x) => x[0] === mate[0] && x[0] !== hero[0]) || DARKABLE.find((x) => x[0] !== hero[0]); return hsl(t[1], R(0.28, 0.4), R(0.22, 0.28)); })(), metal: true }, m: pick(warm ? [N('银')] : [N('银'), N('香槟金'), N('黄铜')]), fin: 'gloss' })],
  ];
  const plan = forceIdx != null ? PLANS[forceIdx % PLANS.length] : wpick(PLANS);
  const o = plan[2]();
  let p = o.p, s = o.s.c, m = o.m.c;

  // 规则 1：明度结构校正 —— 两两明度差 < 0.2 时，把金属件推到离 P/S 都最远的明度
  const gap = (a, b) => Math.abs(val(a) - val(b));
  // P/S 明度差不足：沿 S 原来的明暗方向推开（S 更暗就继续压暗，更亮就继续提亮），推不动再反向
  const push = (c, ref, need) => { const [h, ss, l] = toHsl(c); const dir = val(c) <= val(ref) ? -1 : 1; const warmC = h >= 20 && h <= 60 && ss > 0.2; for (const d of (warmC ? [1] : [dir, -dir])) { for (let k = 1; k <= 12; k++) { const t = hsl(h, ss, l + d * k * 0.04); if (gap(t, ref) >= need) return t; } } return c; };
  // 主题色只允许往亮推（压暗会变酒红/橄榄这类脏色）；主题色推不动时改推另一侧的中性色
  const isHero = (c) => { const [h, ss] = toHsl(c); return ss > 0.45 && val(c) > 0.3 && !(h >= 25 && h <= 46); }; // 黄铜/香槟金色相段（25~46°）算金属，不算主题色
  const pushUp = (c, ref, need) => { const [h, ss, l] = toHsl(c); for (let k = 1; k <= 8; k++) { const t = hsl(h, ss, l + k * 0.03); if (gap(t, ref) >= need && t !== '#f7f7f7') return t; } return null; };
  if (gap(p, s) < 0.2) {
    if (isHero(s) && !isHero(p)) p = push(p, s, 0.22);
    else if (isHero(p) && !isHero(s)) s = push(s, p, 0.22);
    else s = pushUp(s, p, 0.22) || (isHero(s) ? (p = push(p, s, 0.22), s) : push(s, p, 0.22)); // 主题色只往亮推，推不动就推另一侧
  }
  if (gap(p, m) < 0.2 || gap(s, m) < 0.2) {
    const vp = val(p), vs = val(s); const lo = Math.min(vp, vs), hi = Math.max(vp, vs);
    const target = [0.16, (lo + hi) / 2, 0.76].map((t) => [t, Math.min(Math.abs(t - lo), Math.abs(t - hi))]).sort((a, b) => b[1] - a[1])[0][0]; // 选离 P/S 都最远的明度带
    const [h, ss] = toHsl(m); m = hsl(h, ss, target);
  }
  // 规则 2：细节件 = 搭档色 / 黄铜 / 冷白 —— 制造第二、第三色调穿插
  const acc = (o.heroAcc && val(s) < 0.35) ? hero[2] : wpick([[5, mate[2]], [warm ? 0 : 2, NEU.黄铜[0]], [2, '#F2F1EC'], [1.5, hero[2]]])[1]; // 白甲+深色副甲：主题色落到细节件
  // 规则 3：涂装分色（用副装甲色）+ 轻磨损，打散主装甲平铺
  const darkP = val(p) < 0.3;
  // 涂装颜色 = 副装甲色：副装甲是主题色时只用细包边/碳纤维（防止主题色借涂装再扩散一大片）；副装甲是深色时用大分色切开主装甲
  const sHero = toHsl(s)[1] > 0.45 && val(s) > 0.35;
  const pattern = plan[1] === '白甲'
    ? (sHero ? wpick([[3, 'trim'], [1.5, 'stripes'], [1, 'none']])[1] : wpick([[3, 'split'], [2, 'stripes'], [2, 'chevron'], [1.5, 'trim']])[1])
    : sHero
    ? wpick([[1, 'trim'], [3, 'none'], [darkP ? 2 : 0, 'carbon'], [darkP ? 1.5 : 0, 'circuit']])[1]
    : o.mustPat ? wpick([[3, 'split'], [2, 'stripes'], [2, 'chevron']])[1] // 亮甲：主题色主装甲必须被深色大分色切开
    : wpick([[3, 'split'], [2.5, 'stripes'], [1.5, 'chevron'], [2, 'trim'], [darkP ? 1.5 : 0, 'carbon'], [o.mustPat ? 0 : 1, 'none']])[1];
  // 主题色大面积表面一律做金属烤漆（candy metallic）：环境反射自带明暗渐变，从材质上杜绝"纯色平涂塑料感"
  const pMetal = !!o.pM || isHero(p), sMetal = !!o.s.metal || isHero(s);
  const e = rnd() < 0.7 ? hero[2] : mate[2];
  return {
    body: plan[1] + ' · ' + hero[0] + ' / ' + (o.pn ? o.pn + '机身' : o.m.name + '金属件'), theme: hero[0],
    palette: { primary: p, secondary: s, accent: jit(acc, 0.02), emissive: e, emissive2: rnd() < 0.35 ? (e === hero[2] ? mate[2] : hero[2]) : e, metal: m },
    finish: o.fin, pattern, pMetal, sMetal, worn: R(0.15, 0.45),
  };
}
export const PLAN_COUNT = 5;
