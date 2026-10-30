// 机甲随机配色规则 v11：「主色板原型库 + 随机变化」
// 只用主色板：玫红 #F569A8 / 亮黄绿 #DEFF72 / 淡紫 #B7A4FF / 薄荷青 #7FE5CD / 香蕉黄 #FFE135
// + 中性色（黑 / 石墨 / 银灰 / 冷白）+ 从色板推导的低饱和有色金属（深紫灰、暗青钢、深玫灰、浅紫灰、浅青灰）
// 装甲用色在色板同色相上略加深/提纯，抵消 ACES 色调映射造成的发白；色相抖动 ±4° 内，保证不跑出色板
// 注意：函数会被原样内联进线上构建产物，不能引用外部变量
export function makePaletteV11(rnd, form, kwHue, forceIdx) {
  const R = (a, b) => a + (b - a) * rnd();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const ROSE = '#F569A8', LIME = '#DEFF72', LILAC = '#B7A4FF', MINT = '#7FE5CD', BANANA = '#FFE135', WHITE = '#F5F4F0';
  // [名称, 主装甲, 副装甲, 细节件, 金属件, 发光[], 漆面, 花纹, 主金属漆, 副金属漆, 可反色]
  const A = [
    ['伏特', '#CFF24A', '#18181B', WHITE, '#55585F', [LIME], 'matte', 'none', 0, 0, 0],
    ['热粉潜行', '#2E2C33', '#413E47', '#F2559C', '#6A6772', [ROSE], 'satin', 'carbon', 1, 0, 0],
    ['薰衣草', '#A994FF', '#EDEBF2', '#1E1D22', '#8C87A0', [MINT, LILAC], 'gloss', 'trim', 0, 0, 1],
    ['薄荷冷白', '#EEF1EF', '#6ADBC0', '#232428', '#A9B7B3', [MINT], 'gloss', 'stripes', 0, 0, 1],
    ['香蕉警示', '#FFD91A', '#19191C', WHITE, '#5B5E65', [LIME, WHITE], 'satin', 'trim', 0, 0, 0],
    ['珍珠幻彩', '#E3DDF3', '#B09CFF', '#6ADBC0', '#C6C3D2', [MINT, ROSE], 'gloss', 'none', 0, 1, 1],
    ['玫红×黄绿', '#F2559C', '#1C1B1F', '#D2F55A', '#56545C', [LIME], 'gloss', 'trim', 0, 0, 0],
    ['午夜紫', '#3D3554', '#24202F', '#B7A4FF', '#5E5875', [LILAC, ROSE], 'gloss', 'circuit', 0, 0, 0],
    ['暗青钢', '#2C4A47', '#1A1C1E', '#7FE5CD', '#5F7C78', [MINT, BANANA], 'satin', 'trim', 1, 0, 0],
    ['冷白竞速', '#F2F1EE', '#1D1D21', '#F2559C', '#9A9AA2', [ROSE, WHITE], 'gloss', 'stripes', 0, 0, 0],
    ['玫瑰钢', '#7A5A76', '#1E1C21', '#F569A8', '#9A8598', [ROSE, LILAC], 'satin', 'none', 1, 0, 0],
    ['柠檬薄荷', '#6ADBC0', '#FFDE2E', '#1E1F22', '#A5B5B1', [BANANA], 'gloss', 'split', 0, 0, 1],
    ['紫黄撞色', '#A48CFF', '#1C1B21', '#FFE135', '#5A5668', [BANANA], 'gloss', 'chevron', 0, 0, 0],
    ['银翼', '#B9BDC5', '#2B2B30', '#D2F55A', '#8D9199', [LIME], 'satin', 'none', 1, 0, 1],
    ['奶油玫红', '#F3F1EC', '#F2559C', '#A994FF', '#BDB8C0', [ROSE, LILAC], 'gloss', 'trim', 0, 0, 1],
    ['黑曜薄荷', '#16161A', '#6ADBC0', WHITE, '#3C3E44', [MINT], 'gloss', 'stripes', 0, 0, 1],
  ];
  const toHsl = (hex) => { const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; };
  const toHex = (h, s, l) => { h = ((h % 360) + 360) % 360 / 360; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return '#' + [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join(''); };
  const jit = (hex) => { const [h, s, l] = toHsl(hex); if (s < 0.08) return toHex(h, s, Math.min(0.96, Math.max(0.05, l + R(-0.025, 0.025)))); return toHex(h + R(-4, 4), Math.min(1, s * R(0.94, 1.04)), Math.min(0.92, Math.max(0.08, l + R(-0.03, 0.03)))); };
  let idx;
  if (forceIdx != null) idx = forceIdx;
  else if (kwHue != null) {
    // 颜色关键词：挑「主/副/细节」里含最接近该色相的高饱和色的原型
    const d = (h) => Math.min(Math.abs(kwHue - h), 360 - Math.abs(kwHue - h));
    const sc = A.map((a, i) => [i, Math.min(...[a[1], a[2], a[3]].map((c) => { const [h, s] = toHsl(c); return s > 0.3 ? d(h) : 999; }))]).filter((x) => x[1] < 35);
    idx = sc.length ? pick(sc)[0] : Math.floor(rnd() * A.length);
  } else idx = Math.floor(rnd() * A.length);
  const a = A[idx];
  let p = jit(a[1]), s = jit(a[2]);
  const flip = rnd() < 0.3 && !!a[10];
  if (flip) [p, s] = [s, p];
  const e = pick(a[5]);
  return {
    body: a[0] + (flip ? '·反色' : ''), theme: e,
    palette: { primary: p, secondary: s, accent: jit(a[3]), emissive: e, emissive2: rnd() < 0.3 ? pick(a[5]) : e, metal: jit(a[4]) },
    finish: a[6], pattern: rnd() < 0.6 ? a[7] : 'none', pMetal: flip ? !!a[9] : !!a[8], sMetal: flip ? !!a[8] : !!a[9],
  };
}
export const ARCHETYPE_COUNT = 16;
