// 机甲配色方案 v8：12 套「金属基底 + 主题色点缀」
// 原则：
//  - P(主装甲)/S(副装甲)/M(金属件) 一律为中性金属、哑黑、冷白或极低饱和(≤10%)冷灰，构成 80%+ 面积
//  - 主题色只走 G(发光：眼睛/能量线/核心) + 少量 A(细节件)；A 若用主题色，则主体须为深色以形成焦点
//  - 每套只用 1 个主题色（个别套加第 2 色做极小面积 e2），避免花哨
//  - 杜绝棕/红褐/土黄/橄榄等暖脏色；金属偏冷或纯中性
// 字段：p 主装甲 s 副装甲 a 细节件 m 金属件 e 主发光 e2 副发光 finish 漆面 pattern 花纹 pMetal/sMetal 金属漆
export const T = { rose: '#F569A8', lime: '#DEFF72', lilac: '#B7A4FF', mint: '#7FE5CD', banana: '#FFE135' };

// 细节件 A 在履带战车/能量灵体上覆盖面积大，这两种形态的 A 自动换成中性深灰，主题色只走发光
export const BIG_ACCENT_FORMS = ['tank', 'wraith'];
export function accentFor(sc, form) { return BIG_ACCENT_FORMS.includes(form) ? sc.s : sc.a; }

export const SCHEMES_V8 = [
  { id: 'phantom', cn: '幻影·哑黑玫红', p: '#1B1C20', s: '#2C2E34', a: '#F569A8', m: '#5C6068', e: T.rose, finish: 'matte', pattern: 'none' },
  { id: 'polar', cn: '极地·冷白黄绿', p: '#E4E6E9', s: '#2A2C31', a: '#3B3E45', m: '#8E949C', e: T.lime, finish: 'satin', pattern: 'trim' },
  { id: 'steel', cn: '精钢·钢灰薄荷', p: '#6E737B', s: '#2B2E33', a: '#7FE5CD', m: '#B9BEC6', e: T.mint, finish: 'satin', pattern: 'none', pMetal: true },
  { id: 'gunmetal', cn: '枪灰·淡紫', p: '#3C3F46', s: '#868B94', a: '#B7A4FF', m: '#5A5E66', e: T.lilac, finish: 'satin', pattern: 'trim' },
  { id: 'titan', cn: '钛银·香蕉黄', p: '#A7ACB3', s: '#1E1F23', a: '#FFE135', m: '#5E636B', e: T.banana, finish: 'satin', pattern: 'none', pMetal: true },
  { id: 'carbon', cn: '碳纤·黄绿', p: '#17181B', s: '#45484F', a: '#2A2C31', m: '#6A6E76', e: T.lime, finish: 'satin', pattern: 'carbon' },
  { id: 'ceramic', cn: '白瓷·玫红', p: '#EEEDE9', s: '#C4C7CD', a: '#F569A8', m: '#4A4E56', e: T.rose, finish: 'gloss', pattern: 'none' },
  { id: 'abyss', cn: '深渊·蓝灰薄荷', p: '#252A31', s: '#4B535D', a: '#3A414A', m: '#7C848F', e: T.mint, finish: 'matte', pattern: 'circuit' },
  { id: 'nightshade', cn: '夜影·石墨淡紫', p: '#2A2B30', s: '#9A9EA6', a: '#B7A4FF', m: '#55585F', e: T.lilac, finish: 'satin', pattern: 'none' },
  { id: 'chrome', cn: '镜铬·黄绿', p: '#C9CDD3', s: '#26282D', a: '#DEFF72', m: '#9AA0A8', e: T.lime, finish: 'chrome', pattern: 'none', pMetal: true },
  { id: 'tactical', cn: '战术·石墨香蕉黄', p: '#4A4D52', s: '#2A2C30', a: '#FFE135', m: '#73777E', e: T.banana, finish: 'matte', pattern: 'digital' },
  { id: 'panda', cn: '黑白·薄荷', p: '#F0F0EE', s: '#1A1B1E', a: '#1A1B1E', m: '#6B6F77', e: T.mint, finish: 'gloss', pattern: 'split' },
];
