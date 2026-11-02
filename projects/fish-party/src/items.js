// 道具系统 items.js —— 钓上来的「奇妙装饰物」配置表（纯数据 + 掉落，零依赖，node 可直接 import）
// 四大类：装饰配件(deco) → 长出部件 / 天然着色剂(dye) → 换配色花纹 / 材质精华(essence) → 换质感 / 奇迹道具(wonder) → 体质、变异运气
// 效果字段 fx（全部映射到 v.gx / v.ugc，见 genes.designFromItems）：
//   extras: [extraId]   → gx.extras（parts.js 的 20 种部件）
//   deco: 'crown'       → v.ugc.decos（ugc.js 的头饰/脸饰，同槽位替换）
//   mat: 'jelly', matP  → gx.mat（matP 2 = 主效果，1 = 附带，可被精华覆盖）
//   pal: [c1,c2,c3]     → gx.palette     pat: n → gx.pattern（ugc PATTERNS 下标：2 波点 / 3 渐变 / 13 火焰 / 14 彩虹 / 15 斑马）
//   glow: 0~1           → gx.glow 取大     scale: k → 体型倍率（≠ 变异）     eyes: +n → 眼睛数量
//   luck: x             → 变异概率整体 ×(1+x)     rareBoost: x → 珍稀变异再 ×(1+x)     rarityUp: 1 → 稀有度必升一级
export const ITEM_RARITY = {
  common: { label: '普通', short: 'N', color: '#9fd8e3', w: 0.62, pts: 5 },
  rare: { label: '稀有', short: 'R', color: '#5fb6ff', w: 0.28, pts: 15 },
  epic: { label: '史诗', short: 'SR', color: '#c39bff', w: 0.085, pts: 40 },
  legendary: { label: '传说', short: 'UR', color: '#ffc94d', w: 0.015, pts: 100 },
};
export const ITEM_RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];
export const ITEM_CATS = {
  deco: { label: '装饰配件', emoji: '🎀', order: 0, hint: '装上后鱼会长出这个部件' },
  dye: { label: '天然着色剂', emoji: '🎨', order: 1, hint: '改变配色 / 花纹；两种混用 = 渐变双色' },
  essence: { label: '材质精华', emoji: '🧪', order: 2, hint: '改变身体质感' },
  wonder: { label: '奇迹道具', emoji: '🌟', order: 3, hint: '体型、发光、变异运气' },
};

// ---------------- 道具表（36 种）----------------
// adj：生成新名字用的定语；pv：预览短标签（"将会：+翅膀"）；ch：揭晓卡文案
export const ITEMS = [
  // ===== 装饰配件 deco ×18 =====
  { id: 'd_wings', name: '天使羽毛', emoji: '🪽', icon: '一根会自己扑腾的白色羽毛', cat: 'deco', rarity: 'rare', color: '#cfe8ff', desc: '捡起来的时候它扑腾了一下，好像想飞。', fx: { extras: ['wings'] }, adj: '长翅膀的', pv: '+翅膀', ch: '🪽 长出了会扇的翅膀' },
  { id: 'd_propeller', name: '竹蜻蜓', emoji: '🚁', icon: '头顶小螺旋桨帽', cat: 'deco', rarity: 'common', color: '#ffd23f', desc: '转起来能让鱼产生「我会飞」的错觉。', fx: { extras: ['propeller'] }, adj: '螺旋桨', pv: '+螺旋桨帽', ch: '🚁 头顶装上螺旋桨' },
  { id: 'd_catears', name: '猫耳发箍', emoji: '🐱', icon: '粉色毛绒猫耳发箍', cat: 'deco', rarity: 'common', color: '#ffb3d1', desc: '戴上后会不自觉地「喵」一声。', fx: { extras: ['catEars', 'whiskers'] }, adj: '喵喵', pv: '+猫耳胡须', ch: '🐱 长出猫耳和胡须' },
  { id: 'd_horn', name: '独角兽角', emoji: '🦄', icon: '螺旋纹珍珠色小角', cat: 'deco', rarity: 'rare', color: '#e3c8ff', desc: '据说是独角兽洗澡时掉进海里的。', fx: { extras: ['horn'] }, adj: '独角', pv: '+独角', ch: '🦄 头上长出独角' },
  { id: 'd_crown', name: '迷你皇冠', emoji: '👑', icon: '镶红宝石的小金冠', cat: 'deco', rarity: 'epic', color: '#ffd23f', desc: '戴上它，整个水族箱都得叫它陛下。', fx: { deco: 'crown' }, adj: '戴皇冠的', pv: '+皇冠', ch: '👑 戴上了小皇冠' },
  { id: 'd_shades', name: '爱心墨镜', emoji: '😎', icon: '桃心形粉框墨镜', cat: 'deco', rarity: 'common', color: '#ff5fa2', desc: '酷，但是是可爱的那种酷。', fx: { deco: 'shades' }, adj: '戴墨镜的', pv: '+墨镜', ch: '😎 戴上了墨镜' },
  { id: 'd_candles', name: '生日蜡烛', emoji: '🕯️', icon: '三根彩色螺旋蜡烛', cat: 'deco', rarity: 'common', color: '#ff9f80', desc: '每天都可以是它的生日。', fx: { extras: ['candles'] }, adj: '过生日的', pv: '+生日蜡烛', ch: '🕯️ 背上插满生日蜡烛' },
  { id: 'd_wreath', name: '樱花花环', emoji: '🌸', icon: '粉白樱花编的项圈', cat: 'deco', rarity: 'common', color: '#ffc0dc', desc: '在海底开了一整个春天。', fx: { deco: 'wreath', extras: ['flowers'] }, adj: '戴花环的', pv: '+花环+开花', ch: '🌸 戴上花环，身上开满小花' },
  { id: 'd_crystal', name: '水晶碎片', emoji: '💎', icon: '冰蓝色多面晶体', cat: 'deco', rarity: 'rare', color: '#9fe8ff', desc: '对着阳光看，里面有一条小彩虹。', fx: { extras: ['crystalSpikes'], mat: 'crystal', matP: 1 }, adj: '水晶刺', pv: '+水晶刺', ch: '💎 背上长出水晶刺' },
  { id: 'd_tentacles', name: '水母果冻须', emoji: '🪼', icon: '一团半透明飘带', cat: 'deco', rarity: 'rare', color: '#c7b8ff', desc: 'Q 弹，飘飘，摸起来凉凉的。', fx: { extras: ['jellyTentacles'] }, adj: '飘飘', pv: '+果冻触须', ch: '🪼 肚子下飘起果冻触须' },
  { id: 'd_legs', name: '跑跑小腿', emoji: '🦵', icon: '一双穿球鞋的小短腿', cat: 'deco', rarity: 'common', color: '#ffb84d', desc: '进化论：先长腿，再上岸，再去蹦迪。', fx: { extras: ['legs'] }, adj: '长腿的', pv: '+小短腿', ch: '🦵 长出两条小短腿' },
  { id: 'd_lantern', name: '深海灯笼', emoji: '🏮', icon: '带钓竿的暖黄小灯泡', cat: 'deco', rarity: 'rare', color: '#ffe08a', desc: '鮟鱇鱼的同款，深夜加班必备。', fx: { extras: ['lightbulb'], glow: 0.15 }, adj: '提灯', pv: '+深海灯笼', ch: '🏮 头顶挂上深海灯笼' },
  { id: 'd_mustache', name: '绅士胡子', emoji: '🥸', icon: '卷翘的八字胡贴', cat: 'deco', rarity: 'common', color: '#8a6a4a', desc: '贴上之后，说话都带点英伦腔。', fx: { extras: ['mustache'] }, adj: '留胡子的', pv: '+八字胡', ch: '🥸 长出八字胡' },
  { id: 'd_antlers', name: '驯鹿鹿角', emoji: '🦌', icon: '挂小铃铛的鹿角头箍', cat: 'deco', rarity: 'rare', color: '#c98a5a', desc: '圣诞老人的船队走丢的零件。', fx: { extras: ['antlers'] }, adj: '鹿角', pv: '+鹿角', ch: '🦌 长出圣诞鹿角' },
  { id: 'd_helmet', name: '泡泡头盔', emoji: '🧑‍🚀', icon: '透明玻璃宇航头盔', cat: 'deco', rarity: 'epic', color: '#bfefff', desc: '一条想去月亮上游泳的鱼。', fx: { extras: ['bubbleHelmet'] }, adj: '宇航员', pv: '+宇航头盔', ch: '🧑‍🚀 戴上泡泡头盔' },
  { id: 'd_startail', name: '许愿星星', emoji: '⭐', icon: '会眨眼的五角星', cat: 'deco', rarity: 'rare', color: '#fff2a8', desc: '流星掉进海里，变成了尾巴。', fx: { extras: ['starTail'] }, adj: '星星尾', pv: '+星星尾巴', ch: '⭐ 尾巴变成星星' },
  { id: 'd_halo', name: '天使光环', emoji: '😇', icon: '漂浮的金色光圈', cat: 'deco', rarity: 'epic', color: '#fff0a0', desc: '好鱼有好报。', fx: { deco: 'halo', glow: 0.25 }, adj: '有光环的', pv: '+光环', ch: '😇 头顶浮起天使光环' },
  { id: 'd_chili', name: '火焰辣椒', emoji: '🌶️', icon: '冒烟的红辣椒', cat: 'deco', rarity: 'rare', color: '#ff4a1c', desc: '吃一口，背上就着火了（物理）。', fx: { extras: ['flame'] }, adj: '着火的', pv: '+背火', ch: '🔥 背上燃起火焰' },
  // ===== 天然着色剂 dye ×7 =====
  { id: 'y_coral', name: '珊瑚粉', emoji: '🪸', icon: '粉色珊瑚研磨的颜料罐', cat: 'dye', rarity: 'common', color: '#ff6f91', desc: '纯天然珊瑚色，不伤鳞片。', fx: { pal: ['#ffe3ec', '#ff6f91', '#fff1c9'] }, adj: '珊瑚粉', pv: '+珊瑚粉配色', ch: '🪸 染成珊瑚粉' },
  { id: 'y_kelp', name: '海藻绿', emoji: '🌿', icon: '一瓶咕嘟冒泡的绿汁', cat: 'dye', rarity: 'common', color: '#2fbf71', desc: '有一点点海苔味。', fx: { pal: ['#e4f9d9', '#2fbf71', '#fff6c0'] }, adj: '抹茶', pv: '+海藻绿配色', ch: '🌿 染成海藻绿' },
  { id: 'y_ink', name: '墨鱼墨', emoji: '🦑', icon: '墨鱼签名款墨水瓶', cat: 'dye', rarity: 'common', color: '#3a3550', desc: '暗黑系，但是有一点亮粉色叛逆。', fx: { pal: ['#4a4366', '#16131f', '#ff5fa2'] }, adj: '暗黑', pv: '+墨黑配色', ch: '🦑 染上墨鱼墨' },
  { id: 'y_lemon', name: '柠檬海绵黄', emoji: '🍋', icon: '一块挤出黄汁的海绵', cat: 'dye', rarity: 'common', color: '#ffcc1a', desc: '酸酸甜甜，还自带海绵的小洞洞。', fx: { pal: ['#fffbd1', '#ffcc1a', '#ff7a5c'], pat: 2 }, adj: '柠檬', pv: '+柠檬黄波点', ch: '🍋 染成柠檬黄 + 海绵波点' },
  { id: 'y_sunset', name: '晚霞染料', emoji: '🌅', icon: '装着一小片晚霞的玻璃瓶', cat: 'dye', rarity: 'rare', color: '#ff8a5c', desc: '傍晚六点半的海面，被装进了瓶子。', fx: { pal: ['#ffe0c2', '#ff6b57', '#b06bff'], pat: 3 }, adj: '晚霞', pv: '+晚霞渐变', ch: '🌅 晚霞渐变色' },
  { id: 'y_aurora', name: '极光粉末', emoji: '🌌', icon: '会流动的青紫色闪粉', cat: 'dye', rarity: 'epic', color: '#5b6cff', desc: '北极的天空掉下来的一撮。', fx: { pal: ['#ccfff3', '#5b6cff', '#6dffb0'], pat: 3, glow: 0.2 }, adj: '极光', pv: '+极光配色', ch: '🌌 极光配色，还会微微发光' },
  { id: 'y_rainbow', name: '彩虹颜料', emoji: '🌈', icon: '七色旋转颜料盘', cat: 'dye', rarity: 'epic', color: '#ff6fb5', desc: '雨后在甲板上接到的。', fx: { pal: ['#fff6fb', '#ff6fb5', '#7fe3ff'], pat: 14, mat: 'holo', matP: 1 }, adj: '彩虹', pv: '+彩虹纹镭射', ch: '🌈 彩虹花纹 + 镭射光泽' },
  // ===== 材质精华 essence ×6 =====
  { id: 'e_jelly', name: '果冻凝露', emoji: '🍮', icon: '一颗 Q 弹的半透明露珠', cat: 'essence', rarity: 'common', color: '#ffb3d9', desc: '抹上去，整条鱼都 duang duang 的。', fx: { mat: 'jelly', matP: 2 }, adj: '果冻', pv: '+果冻质感', ch: '🍮 身体变成 Q 弹果冻' },
  { id: 'e_plush', name: '毛绒海藻', emoji: '🧸', icon: '一团毛茸茸的绒绒藻', cat: 'essence', rarity: 'common', color: '#f2c49b', desc: '想抱，非常想抱。', fx: { mat: 'plush', matP: 2 }, adj: '毛绒', pv: '+毛绒质感', ch: '🧸 变得毛茸茸' },
  { id: 'e_chrome', name: '镀铬贝壳', emoji: '🐚', icon: '镜面一样的银色贝壳', cat: 'essence', rarity: 'rare', color: '#c9d6e3', desc: '照得见你钓鱼时认真的脸。', fx: { mat: 'chrome', matP: 2 }, adj: '铁皮', pv: '+镀铬质感', ch: '🐚 镀上铬合金外壳' },
  { id: 'e_lava', name: '熔岩石', emoji: '🌋', icon: '裂缝里发红光的小石头', cat: 'essence', rarity: 'rare', color: '#ff5a1f', desc: '小心烫手，但是很暖和。', fx: { mat: 'lava', matP: 2 }, adj: '岩浆', pv: '+熔岩质感', ch: '🌋 岩浆身体，裂缝在发光' },
  { id: 'e_galaxy', name: '星空沙', emoji: '✨', icon: '一小瓶闪烁的深蓝细沙', cat: 'essence', rarity: 'epic', color: '#3a3f9e', desc: '每一粒沙都是一颗很远的星星。', fx: { mat: 'galaxy', matP: 2, glow: 0.15 }, adj: '星空', pv: '+星空质感', ch: '✨ 身体里装进一片星空' },
  { id: 'e_gold', name: '黄金鳞粉', emoji: '🏆', icon: '沉甸甸的金色粉末', cat: 'essence', rarity: 'legendary', color: '#ffcf4a', desc: '土豪鱼的入场券。', fx: { mat: 'gold', matP: 3, rarityUp: 1 }, adj: '黄金', pv: '+黄金质感 · 稀有度↑', ch: '🏆 全身镀金，身价暴涨' },
  // ===== 奇迹道具 wonder ×5 =====
  { id: 'w_plankton', name: '发光浮游生物', emoji: '🦠', icon: '一瓶闪着荧光的小点点', cat: 'wonder', rarity: 'rare', color: '#00e5c7', desc: '晚上打开瓶盖，像装了一瓶银河。', fx: { glow: 0.75 }, adj: '会发光的', pv: '+发光', ch: '🦠 会在黑暗里发光' },
  { id: 'w_kelpboost', name: '巨藻营养剂', emoji: '🥬', icon: '印着肌肉鱼的绿色药剂', cat: 'wonder', rarity: 'common', color: '#5fa046', desc: '一天一瓶，长成大块头（不是变异哦）。', fx: { scale: 1.4 }, adj: '大块头', pv: '+体型变大', ch: '🥬 吃了营养剂，体型变大了' },
  { id: 'w_eyedrop', name: '三眼眼药水', emoji: '👀', icon: '贴着眼睛贴纸的小滴瓶', cat: 'wonder', rarity: 'common', color: '#7b5cff', desc: '滴一滴，多看一眼这个世界。', fx: { eyes: 1 }, adj: '三眼', pv: '+多一只眼', ch: '👀 多长了一只眼睛' },
  { id: 'w_starfish', name: '幸运海星', emoji: '🌟', icon: '冲你眨眼的粉色海星', cat: 'wonder', rarity: 'rare', color: '#ff9fc4', desc: '揣着它改造，突变的概率会变高。', fx: { luck: 0.6 }, adj: '幸运', pv: '变异率↑', ch: '🌟 幸运海星祝福了这颗卵' },
  { id: 'w_pearl', name: '彩虹珍珠', emoji: '🦪', icon: '在蚌壳里转着七彩光的珍珠', cat: 'wonder', rarity: 'legendary', color: '#e8d8ff', desc: '传说中能唤醒珍稀基因的宝物。', fx: { luck: 0.3, rareBoost: 1.5, rarityUp: 1 }, adj: '珍珠', pv: '珍稀变异率↑↑ · 稀有度↑', ch: '🦪 彩虹珍珠唤醒了珍稀基因' },
];
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((x) => [x.id, x]));
export const ITEM_IDS = ITEMS.map((x) => x.id);
export const MAX_PICK = 3;

// ---------------- 组合彩蛋（同时选中触发；all = 全部包含，cats = 某类数量要求）----------------
// fx 额外效果：title 称号（名字前缀 + 卡片标签）、glow / pal / pat / mat / luck / rarityUp
export const COMBOS = [
  { id: 'pegasus', all: ['d_wings', 'd_horn'], title: '飞马', emoji: '🦄', ch: '🦄 彩蛋「飞马」：翅膀 + 独角，梦幻配色！', fx: { palIfNone: ['#fdf0ff', '#c59bff', '#7fe3ff'] } },
  { id: 'angel', all: ['d_wings', 'd_halo'], title: '小天使', emoji: '😇', ch: '😇 彩蛋「小天使」：光环 + 翅膀，圣光加倍', fx: { glow: 0.5, palIfNone: ['#fffdf2', '#ffe08a', '#ffffff'] } },
  { id: 'king', all: ['d_crown', 'e_gold'], title: '国王', emoji: '🤴', ch: '🤴 彩蛋「国王」：皇冠 + 黄金，稀有度再升一级', fx: { rarityUp: 1 } },
  { id: 'astronaut', all: ['d_helmet', 'e_galaxy'], title: '宇航员', emoji: '🚀', ch: '🚀 彩蛋「宇航员」：头盔 + 星空，出发去月球', fx: { glow: 0.35 } },
  { id: 'gentlecat', all: ['d_catears', 'd_mustache'], title: '喵大叔', emoji: '🎩', ch: '🎩 彩蛋「喵大叔」：猫耳 + 绅士胡子', fx: {} },
  { id: 'lighthouse', all: ['d_lantern', 'w_plankton'], title: '深海灯塔', emoji: '🗼', ch: '🗼 彩蛋「深海灯塔」：灯笼 + 浮游生物，亮到满格', fx: { glow: 1 } },
  { id: 'volcano', all: ['d_chili', 'e_lava'], title: '火山', emoji: '🌋', ch: '🌋 彩蛋「火山」：辣椒 + 熔岩，火焰花纹喷发', fx: { pal: ['#3a1a1a', '#ff5a1f', '#ffd23f'], pat: 13 } },
  { id: 'medusa', all: ['d_tentacles', 'e_jelly'], title: '水母精', emoji: '🪼', ch: '🪼 彩蛋「水母精」：触须 + 果冻，变成会发光的水母', fx: { glow: 0.35 } },
  { id: 'party', all: ['d_candles', 'd_crown'], title: '寿星', emoji: '🎂', ch: '🎂 彩蛋「寿星」：蜡烛 + 皇冠，今天它最大', fx: { palIfNone: ['#fff3dc', '#ff6fb5', '#ffd23f'] } },
  { id: 'lucky', all: ['w_starfish', 'w_pearl'], title: '欧皇', emoji: '🍀', ch: '🍀 彩蛋「欧皇」：海星 + 珍珠，运气爆棚', fx: { luck: 0.4 } },
  { id: 'spring', all: ['d_wreath', 'y_coral'], title: '春日', emoji: '🌷', ch: '🌷 彩蛋「春日」：花环 + 珊瑚粉，冒出爱心花纹', fx: { pat: 11 } },
  { id: 'cosmic', all: ['y_aurora', 'e_galaxy'], title: '银河', emoji: '🌠', ch: '🌠 彩蛋「银河」：极光 + 星空沙，夜空一样闪', fx: { glow: 0.45 } },
  // 同类全套（3 个同类）
  { id: 'fullDress', cats: { deco: 3 }, title: '盛装', emoji: '🎉', ch: '🎉 彩蛋「盛装出席」：三件配饰一次戴满', fx: { luck: 0.1 } },
  { id: 'tricolor', cats: { dye: 3 }, title: '三色', emoji: '🎨', ch: '🎨 彩蛋「三色条纹」：三种着色剂调出三色条纹', fx: {} },
  { id: 'chaos', cats: { essence: 3 }, title: '大乱炖', emoji: '🍲', ch: '🍲 彩蛋「材质大乱炖」：三种精华打了一架，全身发光', fx: { glow: 0.4 } },
];

// ---------------- 掉落 ----------------
export const ITEM_CATCH_P = 0.2;    // 这一杆钓上来的是「道具漂流物」而不是鱼
export const ITEM_MOUTH_P = 0.12;   // 钓到鱼时，鱼嘴里叼着一个道具
// 漂流物外观（odd 模型）：普通 → 贝壳包，稀有 → 漂流瓶，史诗/传说 → 小宝箱
export const ITEM_POD = { common: 'pod_shell', rare: 'pod_bottle', epic: 'pod_chest', legendary: 'pod_chest' };
// 新手装扮包：配件 ×2 + 着色剂 ×2 + 材质 ×1 + 奇迹 ×1（保证第一次进改造就能玩，且能凑出一个彩蛋：猫耳+胡子=喵大叔）
export const STARTER_PACK = { d_catears: 1, d_mustache: 1, y_coral: 1, y_kelp: 1, e_jelly: 1, w_kelpboost: 1 };

const pickIn = (arr, x) => arr[Math.min(arr.length - 1, Math.floor(x * arr.length))];
// r: rng 函数；ctx.luck: 0~1 提升高稀有度权重；ctx.minRarity / ctx.rarity：指定最低 / 固定稀有度；ctx.cat：限定类别
export function rollItemDrop(r = Math.random, ctx = {}) {
  const luck = Math.max(0, +ctx.luck || 0);
  let tier = ctx.rarity && ITEM_RARITY[ctx.rarity] ? ctx.rarity : null;
  if (!tier) {
    const minI = ctx.minRarity ? Math.max(0, ITEM_RARITY_ORDER.indexOf(ctx.minRarity)) : 0;
    const tiers = ITEM_RARITY_ORDER.slice(minI);
    const ws = tiers.map((t, i) => ITEM_RARITY[t].w * Math.pow(1 + luck * 1.5, i + minI));
    let s = ws.reduce((a, b) => a + b, 0), x = r() * s; tier = tiers[tiers.length - 1];
    for (let i = 0; i < tiers.length; i++) { x -= ws[i]; if (x <= 0) { tier = tiers[i]; break; } }
  }
  let pool = ITEMS.filter((it) => it.rarity === tier && (!ctx.cat || it.cat === ctx.cat));
  if (!pool.length) pool = ITEMS.filter((it) => it.rarity === tier);
  return pickIn(pool, r()).id;
}
// 一杆是否钓到道具漂流物：返回 { id, n, pod } 或 null
export function rollItemCatch(r = Math.random, { p = ITEM_CATCH_P, luck = 0, force = null } = {}) {
  if (!force && r() >= p) return null;
  const id = force && ITEM_BY_ID[force] ? force : rollItemDrop(r, { luck });
  return { id, n: 1, pod: ITEM_POD[ITEM_BY_ID[id].rarity] };
}
export const itemLabel = (id, n = 1) => { const it = ITEM_BY_ID[id]; return it ? `${it.emoji} ${it.name}${n > 1 ? ` ×${n}` : ''}` : id; };
