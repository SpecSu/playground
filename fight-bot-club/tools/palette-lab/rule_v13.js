// 机甲随机配色规则 v13（在 v12 基础上）：明度结构 + 鲜艳色预算 + 中性主体方案
// 面积实测（各形态平均表面积占比）：P 主装甲≈30% · M 金属件≈27% · S 副装甲≈15% · K 关节黑≈13% · A 细节≈6% · G 发光≈2%
// 规则：
//   1. 鲜艳色 = 主色板 5 色（玫红/亮黄绿/淡紫/薄荷青/香蕉黄）+ 黄铜系（黄铜/古铜/香槟金算同一种）
//      每台最多 2 种鲜艳色；有 2 种时必须一主一次：主色可上大面积（P/S/M 之一），次色只能上细节件 A / 发光 G
//      其余全部来自黑白灰、银/钛/枪灰、以及低饱和有色金属（深紫钢、暗青钢、带色珍珠白）
//   2. 明度结构：P / M / S 分处不同明度带，两两明度差 ≥ 0.2（不满足自动校正）
//   3. 主题色上大面积时做金属烤漆（环境反射自带明暗渐变，消除塑料感）
//   4. 允许「中性主体」方案：P/S/M 全部黑白灰/低饱和金属，只用 1 种亮色做细节和发光
//   5. 涂装只用左右镜像对称的花纹（去掉左右分色 split，避免阴阳配色）
// 注意：函数会被原样内联进线上构建产物，不能引用外部变量
export function makePaletteV13(rnd, form, kwHue, forceIdx) {
  const R = (a, b) => a + (b - a) * rnd();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const wpick = (arr) => { let t = 0; for (const x of arr) t += x[0]; let r = rnd() * t; for (const x of arr) { if ((r -= x[0]) <= 0) return x; } return arr[arr.length - 1]; };
  const toHsl = (hex) => { const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; };
  const hsl = (h, s, l) => { h = ((h % 360) + 360) % 360 / 360; s = Math.min(1, Math.max(0, s)); l = Math.min(0.97, Math.max(0.04, l)); const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return '#' + [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); };
  const val = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const jit = (hex, dl) => { const [h, s, l] = toHsl(hex); return hsl(h + (s > 0.1 ? R(-4, 4) : 0), s * R(0.94, 1.04), l + R(-(dl || 0.03), dl || 0.03)); };
  const gap = (a, b) => Math.abs(val(a) - val(b));

  // 鲜艳色库：[名, 色相, 原色]
  const VIVID = [['玫红', 333, '#F569A8'], ['亮黄绿', 74, '#DEFF72'], ['淡紫', 252, '#B7A4FF'], ['薄荷青', 166, '#7FE5CD'], ['香蕉黄', 51, '#FFE135'], ['黄铜', 38, '#BE9142']];
  const V = (n) => VIVID.find((x) => x[0] === n);
  // 次色搭配表（只上细节/发光）；黄铜不和黄、黄绿搭（同色相发棕）
  const PAIR = { 玫红: ['淡紫', '亮黄绿', '薄荷青', '黄铜'], 亮黄绿: ['淡紫', '玫红', '薄荷青'], 淡紫: ['薄荷青', '香蕉黄', '玫红', '亮黄绿', '黄铜'], 薄荷青: ['香蕉黄', '淡紫', '玫红', '黄铜'], 香蕉黄: ['淡紫', '薄荷青'], 黄铜: ['薄荷青', '淡紫', '玫红'] };
  // 中性 / 低饱和金属库：[色, 明度带 0暗 1中 2亮, 金属漆]
  // v9.2：不用纯白/纯黑 —— 白 = 银白（金属），黑 = 铸铁（金属），全部带金属反射
  const NEU = { 银白: ['#C8CBD1', 2, 1], 银: ['#A9AEB7', 2, 1], 钛灰: ['#767C86', 1, 1], 枪灰: ['#5A5E66', 0, 1], 铸铁: ['#45474D', 0, 1] }; // 金属反射≈固有色×环境，暗金属固有色要比漆面亮一档才不会变成死黑
  const N = (k) => ({ c: jit(NEU[k][0], 0.025), metal: !!NEU[k][2], name: k });
  // 低饱和有色金属：只从淡紫 / 薄荷青推导（玫红暗版=酒红，黄/黄绿暗版=橄榄，都发脏）
  const tintHue = (v) => (v && (v[0] === '淡紫' || v[0] === '薄荷青')) ? v[1] : pick([252, 166]);
  const darkTint = (v) => { const h = tintHue(v); return { c: hsl(h, R(0.18, 0.28), h === 252 ? R(0.26, 0.31) : R(0.21, 0.26)), metal: true, name: h === 252 ? '深紫钢' : '暗青钢' }; };
  const pearl = (v) => ({ c: hsl(tintHue(v), R(0.1, 0.16), R(0.74, 0.8)), metal: true, name: '珠光白' });

  // 鲜艳色的「大面积版本」：中明度、略降饱和；黄铜就是黄铜金属
  const big = (v) => {
    if (v[0] === '黄铜') { const b = pick([['黄铜', '#BE9142'], ['古铜', '#8A6A3E'], ['香槟金', '#D2B26E']]); return { c: jit(b[1], 0.02), metal: true, name: b[0] }; }
    const [hh, s] = toHsl(v[2]); const w = v[0] === '亮黄绿' || v[0] === '香蕉黄';
    return { c: hsl(hh, Math.min(s, 0.95) * (w ? R(0.52, 0.62) : R(0.62, 0.74)), w ? R(0.45, 0.5) : v[0] === '淡紫' ? R(0.66, 0.7) : R(0.58, 0.64)), metal: true, name: v[0] };
  };
  // 小面积版本（细节件）：原色
  const small = (v) => (v[0] === '黄铜' ? jit('#C99A48', 0.02) : v[2]);

  // —— 选鲜艳色：主色 V1（+ 60% 概率次色 V2）
  let v1;
  if (kwHue != null) { const dd = (x) => Math.min(Math.abs(kwHue - x), 360 - Math.abs(kwHue - x)); v1 = VIVID.slice(0, 5).sort((a, b) => dd(a[1]) - dd(b[1]))[0]; }
  else v1 = wpick(VIVID.map((x) => [x[0] === '黄铜' ? 0.8 : 1, x]))[1];
  const v2 = rnd() < 0.6 ? V(pick(PAIR[v1[0]])) : null;
  const warm = v1[0] === '香蕉黄' || v1[0] === '亮黄绿';

  // —— 明度结构方案：主色 V1 落在哪块大面积；P/S/M 其余部分全部中性
  const PLANS = [
    // [权重, 名称, () => { p, s, m, fin }]
    [2, '亮甲', () => ({ p: big(v1), s: pick([N('铸铁'), N('枪灰')]), m: pick([N('银'), N('钛灰')]), fin: 'satin', cut: 1 })],
    [2.5, '暗甲', () => ({ p: rnd() < 0.5 ? darkTint(v2 || v1) : pick([N('枪灰'), N('铸铁')]), s: big(v1), m: pick([N('银'), N('钛灰')]), fin: pick(['satin', 'gloss']) })],
    [2.2, '白甲', () => ({ p: rnd() < 0.5 ? N('银白') : pearl(v2 || v1), s: big(v1), m: pick([N('枪灰'), N('铸铁')]), fin: 'gloss' })],
    [2, '金属甲', () => (v1[0] === '黄铜'
      ? { p: big(v1), s: pick([N('铸铁'), N('枪灰')]), m: N('银'), fin: 'chrome' }
      : { p: pick([N('银'), N('钛灰')]), s: big(v1), m: pick([N('枪灰'), N('铸铁')]), fin: rnd() < 0.5 ? 'chrome' : 'satin' })],
    // 中性主体：P/S/M 全部黑白灰 / 低饱和金属，亮色只做细节件 + 发光
    [2.3, '中性', () => {
      const t = pick([
        () => ({ p: N('铸铁'), s: N('钛灰'), m: N('银') }), () => ({ p: N('银白'), s: N('铸铁'), m: N('钛灰') }),
        () => ({ p: N('银'), s: N('铸铁'), m: N('枪灰') }), () => ({ p: darkTint(v1), s: N('银'), m: N('铸铁') }),
        () => ({ p: pearl(v1), s: N('枪灰'), m: N('银') }), () => ({ p: N('枪灰'), s: N('银白'), m: N('铸铁') }),
      ])();
      return { ...t, fin: pick(['satin', 'gloss', 'matte']), neutral: 1 };
    }],
  ];
  const plan = forceIdx != null ? PLANS[forceIdx % PLANS.length] : wpick(PLANS);
  const o = plan[2]();
  let p = o.p.c, s = o.s.c, m = o.m.c;

  // —— 明度结构校正：主题色只往亮推（压暗会变脏），推不动就推另一侧的中性色
  const NEUTRAL = /^(银白|银|钛灰|枪灰|铸铁|深紫钢|暗青钢|珠光白)$/;
  const pVivid = !NEUTRAL.test(o.p.name), sVivid = !NEUTRAL.test(o.s.name);
  const push = (c, ref, need, upOnly) => { const [h, ss, l] = toHsl(c); const dir = val(c) <= val(ref) ? -1 : 1; for (const d of (upOnly ? [1] : [dir, -dir])) { for (let k = 1; k <= 14; k++) { const t = hsl(h, ss, l + d * k * 0.035); if (gap(t, ref) >= need) return t; } } return c; };
  if (gap(p, s) < 0.2) { if (sVivid) p = push(p, s, 0.22); else if (pVivid) s = push(s, p, 0.22); else s = push(s, p, 0.22); }
  if (gap(p, m) < 0.2 || gap(s, m) < 0.2) {
    const lo = Math.min(val(p), val(s)), hi = Math.max(val(p), val(s));
    const target = [0.16, (lo + hi) / 2, 0.76].map((t) => [t, Math.min(Math.abs(t - lo), Math.abs(t - hi))]).sort((a, b) => b[1] - a[1])[0][0];
    const [h, ss] = toHsl(m); m = hsl(h, ss, target);
  }

  // —— 细节件 / 发光：只能用 V1 或 V2（次色只出现在这里），否则用冷白
  let acc, e, e2;
  if (o.neutral) {
    // 中性主体：只有 1 种亮色（V1），点缀在细节和发光上
    acc = small(v1); e = v1[0] === '黄铜' ? '#F5F4F0' : v1[2]; e2 = e;
  } else {
    acc = v2 ? small(v2) : (rnd() < 0.5 ? '#D3D7DD' : small(v1));
    const glowOf = (v) => (v[0] === '黄铜' ? null : v[2]);
    e = (v2 && rnd() < 0.4 && glowOf(v2)) || glowOf(v1) || (v2 && glowOf(v2)) || '#F5F4F0';
    e2 = e;
  }

  // —— 涂装：只用左右对称花纹（stripes 中线条纹 / chevron V 字 / trim 横向包边 / carbon / circuit）
  //    涂装色 = 副装甲色，副装甲是主题色时只用细包边（防止主题色借涂装再铺一大片）
  const darkP = val(p) < 0.3;
  const pattern = sVivid
    ? wpick([[2, 'trim'], [3, 'none'], [darkP ? 1.5 : 0, 'carbon'], [darkP ? 1 : 0, 'circuit']])[1]
    : o.cut ? wpick([[3, 'stripes'], [3, 'chevron'], [1.5, 'trim']])[1]
    : wpick([[2.5, 'stripes'], [2, 'chevron'], [2, 'trim'], [darkP ? 1.5 : 0, 'carbon'], [1.5, 'none']])[1];

  const pMetal = !!o.p.metal || pVivid, sMetal = !!o.s.metal || sVivid;
  const used = [v1[0]].concat(v2 && !o.neutral ? [v2[0]] : []);
  return {
    body: plan[1] + ' · ' + used.join('+'), theme: v1[0],
    palette: { primary: p, secondary: s, accent: acc, emissive: e, emissive2: e2, metal: m },
    finish: o.fin, pattern, pMetal, sMetal, worn: R(0.15, 0.45), vivid: used,
  };
}
export const PLAN_COUNT = 5;
