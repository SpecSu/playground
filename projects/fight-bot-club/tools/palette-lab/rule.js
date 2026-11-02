// 机甲随机配色规则 v9 —— 线上每次生成都按此规则完全随机（非固定方案）
// 结构：有色低饱和金属机身（10 个基底家族，各自带明度/色相随机区间） + 醒目主题色点缀
//  - 主题色：玫红 / 亮黄绿 / 淡紫 / 薄荷青 / 香蕉黄，按机身家族挑「好看的搭配」再随机
//  - 主题色覆盖：细节件 A（肩甲边、关节、胸甲面板等）+ 全部发光；约 1/3 概率副装甲 S 也用主题色（撞色款）
//  - 机身红褐/土黄等脏色区间全部排除；暖金属只保留偏金的古铜钛和明亮的金属橙
// 注意：此函数会被原样内联进线上构建产物，不能引用任何外部变量
export function makePaletteV9(rnd, form, kwHue) {
  const R = (a, b) => a + (b - a) * rnd();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const W = (list) => { let t = 0; for (const x of list) t += x[1]; let v = rnd() * t; for (const x of list) { if ((v -= x[1]) <= 0) return x[0]; } return list[0][0]; };
  const hex = (h, s, l) => {
    h = ((h % 360) + 360) % 360 / 360; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return '#' + [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('');
  };
  const T = { rose: ['#F569A8', 333], lime: ['#DEFF72', 74], lilac: ['#B7A4FF', 252], mint: ['#7FE5CD', 166], banana: ['#FFE135', 51] };
  // 机身家族：[名称, 权重, 主装甲(h,s,l 区间), 漆面候选, 是否金属漆, 推荐主题色]
  const BODY = [
    ['深蓝钢', 1.3, () => [R(206, 218), R(0.2, 0.3), R(0.26, 0.34)], ['satin', 'gloss'], 0, ['banana', 'mint', 'rose', 'lime']],
    ['烟紫灰', 1.1, () => [R(255, 272), R(0.1, 0.16), R(0.32, 0.42)], ['satin', 'matte'], 0, ['lime', 'mint', 'banana', 'rose']],
    ['古铜钛', 1.0, () => [R(36, 44), R(0.2, 0.28), R(0.42, 0.5)], ['satin', 'chrome'], 1, ['mint', 'lilac', 'rose']],
    ['军绿哑光', 0.9, () => [R(78, 92), R(0.12, 0.18), R(0.24, 0.31)], ['matte'], 0, ['banana', 'rose', 'lime']],
    ['金属橙', 0.7, () => [R(24, 30), R(0.45, 0.55), R(0.44, 0.5)], ['gloss', 'satin'], 1, ['mint', 'lilac']],
    ['青钢', 1.0, () => [R(180, 194), R(0.14, 0.22), R(0.28, 0.36)], ['satin', 'matte'], 0, ['rose', 'banana', 'lilac']],
    ['枪灰', 1.0, () => [R(212, 222), R(0.05, 0.08), R(0.3, 0.38)], ['satin', 'chrome'], 1, ['rose', 'lime', 'lilac', 'mint', 'banana']],
    ['钛银', 0.9, () => [R(205, 215), R(0.04, 0.07), R(0.6, 0.7)], ['chrome', 'satin'], 1, ['rose', 'lime', 'lilac', 'mint']],
    ['冷白', 0.8, () => [R(200, 220), R(0.03, 0.06), R(0.82, 0.88)], ['gloss', 'satin'], 0, ['rose', 'lilac', 'lime']],  // 白机身副装甲固定深石墨，保证对比
    ['哑黑', 1.0, () => [R(220, 240), R(0.04, 0.08), R(0.09, 0.13)], ['matte', 'satin'], 0, ['rose', 'lime', 'lilac', 'mint', 'banana']],
  ];
  const b = W(BODY.map((x) => [x, x[1]]));
  const [ph, ps, pl] = b[2]();
  // 主题色：颜色关键词优先映射到最近的主题色，否则在推荐列表里随机
  let tk;
  if (kwHue != null) { const d = (x) => Math.min(Math.abs(kwHue - x), 360 - Math.abs(kwHue - x)); tk = Object.keys(T).sort((a, c) => d(T[a][1]) - d(T[c][1]))[0]; }
  else tk = pick(b[5]);
  const theme = T[tk][0];
  const others = Object.keys(T).filter((k) => k !== tk);
  const e2 = rnd() < 0.25 ? T[pick(others)][0] : theme;
  const light = pl > 0.55;
  // 副装甲：撞色款用主题色，其余为同色相深/浅一档或中性色，拉开明度层次
  const bigForm = form === 'tank' || form === 'wraith' || form === 'hover' || form === 'dog' || form === 'spider';  // 这些形态副装甲面积大，少用撞色（撞色款主要给人形）
  const isWhite = b[0] === '冷白';
  const sTheme = !isWhite && rnd() < (bigForm ? 0.1 : 0.3);
  const sNeutral = W([
    [light ? hex(ph, Math.min(ps, 0.08), R(0.16, 0.24)) : hex(ph, ps * 0.7, Math.min(0.62, pl + R(0.2, 0.3))), isWhite ? 0 : 2],
    [light ? hex(220, 0.05, R(0.12, 0.18)) : hex(220, 0.05, R(0.7, 0.82)), 1.2],
    [hex(ph, ps * 0.9, Math.max(0.08, pl - R(0.1, 0.16))), 1],
  ]);
  const metal = W([[hex(R(205, 220), 0.06, R(0.36, 0.5)), 2], [hex(R(205, 220), 0.05, R(0.62, 0.74)), 1], [hex(40, 0.3, R(0.42, 0.5)), b[0] === '古铜钛' || b[0] === '金属橙' ? 1.5 : 0.2]]);
  return {
    body: b[0], theme: tk,
    palette: { primary: hex(ph, ps, pl), secondary: sTheme ? theme : sNeutral, accent: theme, emissive: theme, emissive2: e2, metal },
    finish: pick(b[3]), pMetal: !!b[4] && rnd() < 0.7, sMetal: !sTheme && rnd() < 0.25,
  };
}
// 花纹白名单（去掉迷彩/滴落/云纹等易脏的花纹）
export const PATTERN_OK = ['none', 'trim', 'stripes', 'chevron', 'split', 'carbon', 'hex', 'circuit'];
