// 统一线性图标（24×24 · 圆头圆角描边，颜色继承 currentColor；样式见 index.html `svg.i`）
// 用法：ic('back') → '<svg class="i" ...>'；所有按钮 = 图标 + 文字，图标只做识别辅助
const P = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  fish: '<path d="M2.5 12c2.6-3.6 6-5.2 9.6-5 3 .2 5.3 2 6.4 5-1.1 3-3.4 4.8-6.4 5-3.6.2-7-1.4-9.6-5z"/><path d="M18.5 12l3-3.5v7z"/><circle cx="7.5" cy="11.2" r=".6"/>',
  rod: '<path d="M4 20L18 4"/><path d="M18 4v9"/><path d="M18 13a2 2 0 1 0 2 2"/>',
  dna: '<path d="M7 3c0 6 10 6 10 12M17 3c0 6-10 6-10 12"/><path d="M7 21c0-2 1-3.4 2.5-4.5M17 21c0-2-1-3.4-2.5-4.5"/><path d="M8.5 7h7M8.5 11.5h7"/>',
  wave: '<path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  bag: '<path d="M5 9h14l-1 11H6z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/><path d="M9.5 13.5h5"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  fuse: '<circle cx="8" cy="12" r="4.5"/><circle cx="16" cy="12" r="4.5"/>',
  egg: '<path d="M12 3c3.6 0 6.5 5.4 6.5 10a6.5 6.5 0 0 1-13 0C5.5 8.4 8.4 3 12 3z"/>',
  bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9.5" r="2.5"/><path d="M16 14.2c2.3.1 4 1.6 4.5 4.3"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M3 9h18M12 9v11"/><path d="M12 9C10 5 6.5 5.5 7.5 8M12 9c2-4 5.5-3.5 4.5-1"/>',
  bottle: '<path d="M10 3h4M10.5 3v4.2L8 10v9.5a1.5 1.5 0 0 0 1.5 1.5h5a1.5 1.5 0 0 0 1.5-1.5V10l-2.5-2.8V3"/><path d="M8 14h8"/>',
  hand: '<path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1.5V4.5a1.5 1.5 0 0 1 3 0V10m0-3.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.6-2.2L4 15.2a1.6 1.6 0 0 1 2.4-2.1L8 14.5"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4.5a3 3 0 0 0 3.5 3.5M16 6h3.5a3 3 0 0 1-3.5 3.5"/><path d="M12 13v4M8.5 20h7M10 17h4v3h-4z"/>',
  task: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.2"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.4-1.3-1.6-1.3-2.9 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
  bow: '<path d="M12 12L5 7.5v9zM12 12l7-4.5v9z"/><circle cx="12" cy="12" r="1.8"/>',
  flask: '<path d="M9.5 3h5M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/>',
  pencil: '<path d="M14.5 5.5l4 4L9 19H5v-4z"/><path d="M12.5 7.5l4 4"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
};
export const ic = (name, cls = '') => `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || P.sparkle}</svg>`;
// 道具类别 → 图标
export const CAT_IC = { all: 'bag', deco: 'bow', dye: 'palette', essence: 'flask', wonder: 'star' };
// 道具类别短名（chip 用，保证 390 宽一行放下不截断）
export const CAT_SHORT = { deco: '配件', dye: '着色剂', essence: '精华', wonder: '奇迹' };
