// 机甲随机配色规则 v10：「美术定调的配色原型库 + 随机变奏」
// 每次生成：随机抽一个原型 → 色相/明度微抖动 → 30% 概率主副色反转 → 60% 概率套用原型涂装花纹 → 随机发光色
// 原型参考：高达三色、EVA 初号机、Gulf/马天尼赛车涂装、Nike Volt、Teenage Engineering、赛博朋克荒坂、合成波、珍珠幻彩等
// 注意：函数会被原样内联进线上构建产物，不能引用外部变量
export function makePaletteV10(rnd, form, kwHue, forceIdx) {
  const R = (a, b) => a + (b - a) * rnd();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  // [名称, 主装甲, 副装甲, 细节件, 金属件, 发光[], 漆面, 花纹, 主金属漆, 副金属漆]
  const A = [
    ['初号机', '#4B2E83', '#2A1F3D', '#B6F23A', '#3A3542', ['#DEFF72', '#FF7A3D'], 'gloss', 'trim', 0, 0],
    ['RX 三色', '#ECEDEF', '#2747D9', '#E8384F', '#6B7280', ['#FFE135'], 'gloss', 'none', 0, 0],
    ['海湾赛车', '#8CC8EC', '#FF6B1A', '#1C1D21', '#9AA3AD', ['#FFE135', '#F5F4F0'], 'gloss', 'stripes', 0, 0],
    ['伏特', '#C6F51E', '#141518', '#2A2C31', '#5B5F66', ['#DEFF72'], 'matte', 'none', 0, 0],
    ['工业橙', '#D9D8D3', '#1B1B1D', '#FF5B1F', '#8A8A86', ['#FF5B1F', '#FFE135'], 'matte', 'trim', 0, 0],
    ['合成波', '#4A35B8', '#1C1650', '#F569A8', '#6A68A0', ['#7FE5CD', '#F569A8'], 'gloss', 'circuit', 0, 0],
    ['珍珠幻彩', '#E6E0F5', '#B7A4FF', '#7FE5CD', '#C9CDD6', ['#7FE5CD', '#F569A8'], 'gloss', 'none', 0, 1],
    ['黑金', '#16161A', '#C9A45C', '#2A2A2E', '#C9A45C', ['#FFE135'], 'satin', 'none', 0, 1],
    ['深海', '#0F6470', '#0B2D33', '#FFE135', '#5A8C92', ['#FFE135', '#7FE5CD'], 'satin', 'trim', 0, 0],
    ['冰川', '#F2F6F8', '#9FC9E6', '#2B3A4A', '#B8C4CE', ['#7FE5CD'], 'gloss', 'none', 0, 1],
    ['樱花', '#F2A9C6', '#F4F2F0', '#4A2340', '#56505C', ['#F569A8', '#B7A4FF'], 'gloss', 'trim', 0, 0],
    ['赤黑', '#121214', '#D7263D', '#F5F4F0', '#3B3B40', ['#FF3B5C', '#F569A8'], 'satin', 'stripes', 0, 0],
    ['马天尼', '#F3F3F1', '#12284C', '#E63A3A', '#8C939C', ['#7FE5CD', '#F5F4F0'], 'gloss', 'stripes', 0, 0],
    ['隐形热粉', '#2E3138', '#3F434B', '#F569A8', '#6C717A', ['#F569A8'], 'satin', 'carbon', 1, 0],
    ['薄荷珊瑚', '#8EDBC8', '#24282E', '#FF7A45', '#A9B1B8', ['#FFE135', '#FF7A45'], 'gloss', 'none', 0, 0],
    ['警示黄', '#FFC414', '#1A1B1E', '#F5F4F0', '#5E636B', ['#7FE5CD', '#F5F4F0'], 'satin', 'hazard', 0, 0],
  ];
  const toHsl = (hex) => { const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; };
  const toHex = (h, s, l) => { h = ((h % 360) + 360) % 360 / 360; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return '#' + [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join(''); };
  const jit = (hex) => { const [h, s, l] = toHsl(hex); if (s < 0.08) return toHex(h, s, Math.min(0.96, Math.max(0.05, l + R(-0.03, 0.03)))); return toHex(h + R(-6, 6), Math.min(1, s * R(0.92, 1.05)), Math.min(0.92, Math.max(0.08, l + R(-0.035, 0.035)))); };
  let idx;
  if (forceIdx != null) idx = forceIdx;
  else if (kwHue != null) {
    // 颜色关键词：挑「主/副/细节」里含最接近该色相的高饱和色的原型
    const d = (h) => Math.min(Math.abs(kwHue - h), 360 - Math.abs(kwHue - h));
    const sc = A.map((a, i) => [i, Math.min(...[a[1], a[2], a[3]].map((c) => { const [h, s] = toHsl(c); return s > 0.3 ? d(h) : 999; }))]).filter((x) => x[1] < 30);
    idx = sc.length ? pick(sc)[0] : Math.floor(rnd() * A.length);
  } else idx = Math.floor(rnd() * A.length);
  const a = A[idx];
  let p = jit(a[1]), s = jit(a[2]);
  const flip = rnd() < 0.3 && !['警示黄', '黑金', '伏特', '合成波', '隐形热粉'].includes(a[0]);
  if (flip) [p, s] = [s, p];
  const e = pick(a[5]);
  return {
    body: a[0] + (flip ? '·反色' : ''), theme: e,
    palette: { primary: p, secondary: s, accent: jit(a[3]), emissive: e, emissive2: rnd() < 0.3 ? pick(a[5]) : e, metal: jit(a[4]) },
    finish: a[6], pattern: rnd() < 0.6 ? a[7] : 'none', pMetal: flip ? !!a[9] : !!a[8], sMetal: flip ? !!a[8] : !!a[9],
  };
}
export const ARCHETYPE_COUNT = 16;
