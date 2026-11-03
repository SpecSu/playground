// 道具系统 items.js（v0.9）—— 钓上来的「稀奇古怪的东西」（纯数据 + 掉落，零依赖，node 可直接 import）
// 道具唯一用途：基因改造时放进「道具槽」，被合成进新物种的身体里（不是装扮！鱼不能被装扮）。
// motif = 道具的「优雅转译」（v0.9.1，解释器见 synth.js applyMotif）：只影响配色 / 材质 / 纹样 / 鳍形气质，绝不贴器物零件
//   pal: [背色, 腹色, 点缀色, 鳍色, 鳍缘高光]   mat: wet|satin|glaze|ceramic|metal|brass|gold|pearl|glow|crystal
//   pat: none|grad|scale|koi|marble|cloud|stars|bands|tux|porcelain|crackle|fret|ocelli|neon|leopard|sunset|pearlline|mesh|speckle|spots   d: 纹样密度
//   dor/tail/pect: 鳍型（synth_model.js FIN_KINDS 词表）   fx: { glow, irid, finA 鳍膜透明度, fil 丝状鳍条, scl 金属鳞缘 }
//   tags: 「基因预感」/ 卡片标签用的具象性状描述     adj: 默认名用的两字定语
export const ITEM_RARITY = {
  common: { label: '普通', short: 'N', color: '#9fd8e3', w: 0.70, pts: 5 },
  rare: { label: '稀有', short: 'R', color: '#5fb6ff', w: 0.24, pts: 15 },
  epic: { label: '史诗', short: 'SR', color: '#c39bff', w: 0.05, pts: 40 },
  legendary: { label: '传说', short: 'UR', color: '#ffc94d', w: 0.01, pts: 100 },
};
export const ITEM_RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];
export const ITEM_CATS = {
  wear: { label: '衣物', emoji: '👔', order: 0, hint: '布料、剪裁与配色会长进鳍和花纹里' },
  home: { label: '日用', emoji: '🏠', order: 1, hint: '器物的釉色与纹样会化进鳞片' },
  tool: { label: '工具', emoji: '🔧', order: 2, hint: '金属鳞光与精密纹样' },
  food: { label: '美食', emoji: '🍽️', order: 3, hint: '诱人的配色与花纹' },
  nature: { label: '自然', emoji: '🌿', order: 4, hint: '植物与矿物的形态' },
  curio: { label: '奇物', emoji: '🔮', order: 5, hint: '稀有的光泽与华丽长鳍' },
};

// ---------------- 道具表（38 种）----------------
// 字段：id/name/emoji/icon/cat/rarity/color/desc + motif；pv / ch / adj 兼容旧 UI（预览短标签 / 揭晓文案 / 名字定语）
const T = (id, name, emoji, cat, rarity, color, icon, desc, motif) => ({ id, name, emoji, icon, cat, rarity, color, desc, motif, adj: motif.adj, pv: motif.tags[0], ch: `${emoji} ${motif.tags.join(' · ')}`, fx: {} });
export const ITEMS = [
  // ===== 衣物 wear =====
  T('suit', '西装', '🤵', 'wear', 'common', '#2a2d34', '一件被海水泡过的燕尾服', '口袋里还有半张晚宴请柬。',
    { pal: ['#23262d', '#efe9de', '#9a2236', '#2a2d36', '#e8e2d6'], pat: 'tux', mat: 'satin', pect: 'bow', tail: 'swallow', tags: ['礼服黑白配色', '领结状胸鳍', '燕尾分叉尾'], adj: '燕尾' }),
  T('heels', '高跟鞋', '👠', 'wear', 'common', '#9e1f33', '一只红色漆皮细高跟', '另一只大概还在某个舞会上。',
    { pal: ['#9b1f33', '#f1dcd4', '#d8b56c', '#8a1a2c', '#f0c9c4'], mat: 'glaze', pat: 'grad', tail: 'lyre', fx: { irid: 0.45 }, tags: ['红漆釉面', '琴尾长丝', '金色描边'], adj: '绯漆' }),
  T('scarf', '毛线围巾', '🧣', 'wear', 'common', '#b8452f', '手织的粗棒针条纹围巾', '织到一半的线头还挂着。',
    { pal: ['#b4472f', '#f2e7d6', '#2f4f6b', '#a8402b', '#f0d2b4'], pat: 'bands', d: 4, mat: 'satin', dor: 'soft', tags: ['暖绒条纹', '柔缎鳞光', '围巾暖色'], adj: '绒纹' }),
  T('tophat', '礼帽', '🎩', 'wear', 'rare', '#1c1d22', '缎面黑礼帽，帽檐微卷', '魔术师说里面曾经住过一只兔子。',
    { pal: ['#1d1e24', '#d6cfc2', '#a8864a', '#26272e', '#cdb27a'], mat: 'satin', pat: 'grad', dor: 'sail', fx: { scl: 0.6 }, tags: ['墨缎高帆背鳍', '缎面墨黑', '古金鳞缘'], adj: '墨缎' }),
  T('pearls', '珍珠项链', '📿', 'wear', 'epic', '#e8e2d8', '一串温润的南洋珍珠', '每一颗都在月光下转过身。',
    { pal: ['#e6dfd4', '#f8f4ee', '#c9b3d4', '#e4dbe8', '#ffffff'], mat: 'pearl', pat: 'pearlline', fx: { irid: 0.9, scl: 0.8 }, tags: ['珍珠侧线', '珠母虹彩', '温润月白'], adj: '珠母' }),
  T('veil', '婚纱头纱', '👰', 'wear', 'epic', '#f3efe9', '三米长的蕾丝拖尾头纱', '被风吹进海里，从此再也没有落地。',
    { pal: ['#efe9e1', '#ffffff', '#d8c7b0', '#f6f1ea', '#ffffff'], mat: 'satin', pat: 'mesh', tail: 'veil', dor: 'veil', pect: 'long', fx: { finA: 0.42, fil: 1 }, tags: ['蕾丝纱鳍', '象牙白缎', '拖尾长鳍'], adj: '纱尾' }),
  // ===== 日用 home =====
  T('toilet', '马桶', '🚽', 'home', 'rare', '#eef0f2', '一只完好无损的白瓷马桶', '没人知道它是怎么漂到海里的。',
    { pal: ['#f3f1ec', '#ffffff', '#3f6aa8', '#e6ebef', '#c9d6e6'], mat: 'ceramic', pat: 'porcelain', tail: 'round', tags: ['白瓷釉身', '青花细纹', '圆润扇尾'], adj: '白瓷' }),
  T('umbrella', '雨伞', '☂️', 'home', 'common', '#2d4a6b', '一把藏青色长柄伞', '撑开的时候会“啪”地一声。',
    { pal: ['#2c4a6b', '#ebe6db', '#c8a35a', '#2f4f72', '#d9c08a'], mat: 'satin', pat: 'grad', dor: 'fan', tags: ['伞面扇形背鳍', '藏青缎面', '伞骨鳍条'], adj: '伞鳍' }),
  T('bulb', '灯泡', '💡', 'home', 'common', '#ffd36b', '一颗还温热的钨丝灯泡', '拧上去之前，它自己亮了一下。',
    { pal: ['#d8c38a', '#f8f1dc', '#ffcf6a', '#e7d39a', '#fff2c0'], mat: 'glow', pat: 'neon', fx: { glow: 0.6 }, tags: ['暖光侧线', '钨丝金辉', '琥珀体光'], adj: '钨光' }),
  T('clock', '闹钟', '⏰', 'home', 'rare', '#c84b3c', '双铃铛的复古闹钟', '每天早上七点准时在海底响起。',
    { pal: ['#c04a3c', '#f4eee4', '#b8892f', '#b8453a', '#e9c87a'], mat: 'glaze', pat: 'ocelli', tail: 'round', fx: { scl: 0.5 }, tags: ['表盘眼斑', '复古红釉', '黄铜鳍缘'], adj: '铃纹' }),
  T('lipstick', '口红', '💄', 'home', 'common', '#a4243b', '金管丝绒口红，旋出一半', '色号叫「深海初吻」。',
    { pal: ['#a3233b', '#f3ddd6', '#caa55a', '#8a1c30', '#e8b0b0'], mat: 'satin', pat: 'grad', fx: { scl: 0.5 }, tags: ['丝绒绯红', '金管描边', '唇色渐变'], adj: '绯唇' }),
  T('teapot', '茶壶', '🫖', 'home', 'rare', '#8fb3a6', '一把青瓷小茶壶', '壶里还剩一口凉掉的乌龙。',
    { pal: ['#8db2a5', '#eef3ee', '#5a7f74', '#a6c4b8', '#e2ece6'], mat: 'ceramic', pat: 'crackle', dor: 'soft', tags: ['青瓷釉色', '冰裂开片', '温润圆鳍'], adj: '青瓷' }),
  // ===== 工具 tool =====
  T('key', '钥匙', '🔑', 'tool', 'common', '#c99b45', '一把老式黄铜钥匙', '能打开哪扇门？海底也许知道。',
    { pal: ['#b8893b', '#efdba6', '#6e4c1e', '#c99b45', '#f3d98e'], mat: 'brass', pat: 'fret', fx: { scl: 0.8 }, tags: ['黄铜鳞甲', '回纹暗花', '金属鳞缘'], adj: '鎏铜' }),
  T('gear', '齿轮', '⚙️', 'tool', 'common', '#7b8590', '从怀表里掉出来的齿轮', '还在以每秒一格的速度转动。',
    { pal: ['#7b8590', '#d4d9de', '#b5763a', '#8a949e', '#e1c39a'], mat: 'metal', pat: 'scale', fx: { scl: 0.7 }, tags: ['银钢鳞片', '机芯铜缘', '精密鳞列'], adj: '机芯' }),
  T('telescope', '望远镜', '🔭', 'tool', 'rare', '#1f3554', '可伸缩的黄铜单筒望远镜', '镜片里映着一颗很远的星星。',
    { pal: ['#1f3554', '#ddd2bb', '#c8a04f', '#28426a', '#e6cc8a'], mat: 'satin', pat: 'stars', fx: { scl: 0.5 }, tags: ['星图斑点', '深海军蓝', '黄铜鳍缘'], adj: '远瞳' }),
  T('scissors', '剪刀', '✂️', 'tool', 'common', '#b9c2ca', '一把锃亮的裁缝剪', '咔嚓一声，剪断了一段浪花。',
    { pal: ['#b7c0c8', '#eef1f3', '#2f3a46', '#a8b2bb', '#ffffff'], mat: 'metal', pat: 'grad', tail: 'swallow', dor: 'sickle', tags: ['镜面银鳞', '剪刃燕尾', '镰刀背鳍'], adj: '剪尾' }),
  T('quill', '羽毛笔', '🪶', 'tool', 'rare', '#2b2f4a', '蘸过墨的天鹅羽毛笔', '笔尖还挂着一滴没写完的诗。',
    { pal: ['#2c304b', '#ece6d8', '#5b6b9a', '#3a3f60', '#c9cfe6'], mat: 'satin', pat: 'marble', dor: 'plume', fx: { fil: 1 }, tags: ['翎羽背鳍', '墨渍大理石纹', '羽丝鳍条'], adj: '翎羽' }),
  T('neon', '霓虹灯管', '🔆', 'tool', 'epic', '#ff5fa8', '一截还会闪的霓虹灯管', '弯成了一个看不懂的字。',
    { pal: ['#1b1f2e', '#2e3449', '#ff5fa8', '#2a3048', '#3cd6e0'], mat: 'glow', pat: 'neon', fx: { glow: 0.9 }, tags: ['霓虹侧线', '暗夜体色', '荧光鳍缘'], adj: '霓虹' }),
  T('anchor', '船锚', '⚓', 'tool', 'rare', '#3b4148', '一只长满藤壶的小铁锚', '它终于等到一条愿意带它走的鱼。',
    { pal: ['#3b4148', '#b4babf', '#9a5b2e', '#454c54', '#c98a5a'], mat: 'metal', pat: 'cloud', tail: 'lunate', tags: ['铸铁深灰', '铜锈云纹', '新月锚尾'], adj: '铁锚' }),
  // ===== 美食 food =====
  T('pizza', '披萨', '🍕', 'food', 'common', '#e7b54f', '一角拉丝的意式披萨', '还热乎，芝士拉得老长。',
    { pal: ['#e3b14e', '#f6e3ad', '#b4352a', '#e0a64a', '#f7d27a'], mat: 'wet', pat: 'spots', d: 2.2, tags: ['芝士暖金渐变', '番茄红圆斑', '烘烤金边'], adj: '芝士' }),
  T('watermelon', '西瓜', '🍉', 'food', 'common', '#3b7d47', '半个冰镇西瓜', '中间那一勺已经被谁挖走了。',
    { pal: ['#2f6b3a', '#f07d8a', '#14251a', '#e0606f', '#ffd0d4'], mat: 'glaze', pat: 'bands', d: 6, tags: ['瓜皮深绿条纹', '红瓤粉腹', '清甜釉光'], adj: '瓜纹' }),
  T('icecream', '冰淇淋甜筒', '🍦', 'food', 'rare', '#f1e4d0', '一支快要化掉的香草甜筒', '在海里居然一点都没化。',
    { pal: ['#f0e3cf', '#fbe6ea', '#c98d4a', '#f3dfe4', '#ffffff'], mat: 'satin', pat: 'cloud', tail: 'veil', tags: ['香草奶油色', '奶霜云纹', '柔纱裙尾'], adj: '奶霜' }),
  T('donut', '甜甜圈', '🍩', 'food', 'common', '#d9708a', '一个粉色糖霜甜甜圈', '上面的彩针糖少了三根。',
    { pal: ['#d77c93', '#f5dcc0', '#7fc6d8', '#e797aa', '#fff0f4'], mat: 'glaze', pat: 'speckle', tags: ['粉糖霜背', '彩糖细点', '奶油腹面'], adj: '糖霜' }),
  T('chili', '辣椒', '🌶️', 'food', 'common', '#b3261e', '一根油亮的朝天椒', '只是看着它，鳃就开始发烫。',
    { pal: ['#b1261e', '#f2c2a8', '#3f6b2a', '#c8331f', '#ff9a6a'], mat: 'glaze', pat: 'sunset', dor: 'sickle', tags: ['赤焰渐变', '红釉亮皮', '镰刀背鳍'], adj: '赤椒' }),
  T('croissant', '可颂', '🥐', 'food', 'common', '#d29a4a', '一只层次分明的黄油可颂', '咬一口，酥皮掉了满海底。',
    { pal: ['#c98f43', '#f3dca8', '#8a5420', '#d9a65e', '#f5d08a'], mat: 'glaze', pat: 'scale', tail: 'delta', tags: ['焦糖金色', '层酥鳞列', '半月裙尾'], adj: '层酥' }),
  // ===== 自然 nature =====
  T('cactus', '仙人掌', '🌵', 'nature', 'common', '#5b8754', '一盆开着小粉花的仙人掌', '浑身是刺，但花很温柔。',
    { pal: ['#4f7a4a', '#dfe8cf', '#e8a0b4', '#6a9a62', '#f5c6d4'], mat: 'satin', pat: 'speckle', dor: 'crest', tags: ['仙掌青绿', '粉花鳍梢', '细刺冠鳍'], adj: '棘花' }),
  T('maple', '枫叶', '🍁', 'nature', 'common', '#c75a2a', '一片红透了的枫叶', '从很远的秋天漂过来。',
    { pal: ['#b6452a', '#f0c27a', '#7a2a1a', '#d4622e', '#f7b25a'], pat: 'sunset', dor: 'crest', mat: 'satin', tags: ['秋色渐变', '枫红冠鳍', '叶脉鳍条'], adj: '枫红' }),
  T('conch', '贝壳号角', '🐚', 'nature', 'rare', '#e3bfa9', '一只能吹响的螺号', '贴在耳边，能听见另一片海。',
    { pal: ['#e6c7b3', '#f8ece2', '#c07868', '#ecd0c0', '#fff4ec'], mat: 'pearl', pat: 'bands', d: 7, fx: { irid: 0.7 }, tags: ['珠母光泽', '螺纹环带', '贝粉鳍膜'], adj: '螺号' }),
  T('sunflower', '向日葵', '🌻', 'nature', 'rare', '#e0a92e', '一朵追着太阳转的向日葵', '在海里，它改成追着灯笼鱼转。',
    { pal: ['#d9a12c', '#f6dc85', '#5a3a1e', '#e9b43a', '#ffe08a'], mat: 'satin', pat: 'grad', pect: 'fan', dor: 'fan', tags: ['金黄体色', '花瓣扇鳍', '葵心暖棕'], adj: '葵冠' }),
  T('mushroom', '蘑菇', '🍄', 'nature', 'common', '#b6322b', '一朵红伞白点的小蘑菇', '童话书里掉出来的那种。',
    { pal: ['#b1322b', '#f3ebdd', '#f8f2e8', '#c4473c', '#ffffff'], mat: 'satin', pat: 'spots', d: 1.6, dor: 'sail', tags: ['红底白点', '菌伞帆鳍', '奶白腹面'], adj: '菌伞' }),
  T('snowflake', '雪花', '❄️', 'nature', 'epic', '#cfe3ee', '一片永不融化的六角雪花', '据说来自北极最深的那个冬天。',
    { pal: ['#c9dfeb', '#f5f9fc', '#7fb2cf', '#dcebf4', '#ffffff'], mat: 'crystal', pat: 'crackle', fx: { glow: 0.25, irid: 0.6, finA: 0.4 }, tags: ['霜白晶体', '冰裂细纹', '冰晶透鳍'], adj: '霜晶' }),
  // ===== 奇物 curio =====
  T('crown', '皇冠', '👑', 'curio', 'legendary', '#d4a94a', '一顶镶红宝石的旧王冠', '戴过它的国王，名字已经没人记得。',
    { pal: ['#6b1d2f', '#e4d3ac', '#d4a94a', '#7a2236', '#f1d27a'], mat: 'gold', pat: 'fret', dor: 'crest', tail: 'veil', fx: { glow: 0.3, scl: 1, fil: 1 }, tags: ['鎏金鳍缘', '王冠冠鳍', '宝石红体色'], adj: '鎏金' }),
  T('guitar', '吉他', '🎸', 'curio', 'epic', '#a5642f', '一把日落色木吉他', '第六根弦断了，但还能弹。',
    { pal: ['#a8642c', '#efd0a0', '#2a1d14', '#b8743a', '#f2c27a'], mat: 'glaze', pat: 'sunset', tail: 'lyre', fx: { fil: 1 }, tags: ['日落渐变漆面', '琴尾长丝', '弦状鳍条'], adj: '琴弦' }),
  T('rubik', '魔方', '🎲', 'curio', 'epic', '#2d5fa8', '一个只差一步就拼好的魔方', '最后一步，留给海浪去转。',
    { pal: ['#2d5fa8', '#f3f3ef', '#e8b72f', '#c9302c', '#f4d36a'], mat: 'glaze', pat: 'koi', tags: ['三色锦鲤斑', '亮面撞色', '红黄鳍梢'], adj: '方格' }),
  T('rocket', '火箭', '🚀', 'curio', 'legendary', '#c2412d', '一枚还在冒烟的玩具火箭', '它本来要去月球，结果掉进了海里。',
    { pal: ['#e9e6e0', '#f4f5f6', '#c2412d', '#d6dadf', '#ff8a4a'], mat: 'metal', pat: 'grad', tail: 'lunate', dor: 'sickle', fx: { glow: 0.5 }, tags: ['银白流线身', '尾焰发光鳍', '新月尾'], adj: '星舰' }),
  T('crystalball', '水晶球', '🔮', 'curio', 'legendary', '#6b5bb8', '一颗装着星云的占卜水晶球', '盯着看久了，会看见自己的鱼。',
    { pal: ['#33295f', '#8678c4', '#cbbcff', '#4b3f88', '#e8e0ff'], mat: 'crystal', pat: 'stars', fx: { glow: 0.6, irid: 0.8, finA: 0.38 }, tags: ['体内星云', '晶体鳞光', '星辉透鳍'], adj: '星象' }),
  T('hourglass', '沙漏', '⌛', 'curio', 'rare', '#d8b47a', '一只黄铜框的沙漏', '倒过来，时间就往回流。',
    { pal: ['#d6b277', '#f3e6c8', '#8a6a3a', '#dcbc84', '#f6dfa8'], mat: 'satin', pat: 'grad', fx: { scl: 0.6 }, tags: ['流沙渐变', '黄铜鳞缘', '暖沙体色'], adj: '流沙' }),
  T('origami', '千纸鹤', '🕊️', 'curio', 'rare', '#e9dfcf', '一只和纸折的千纸鹤', '翅膀上写着一个没人看得懂的愿望。',
    { pal: ['#e8ddcc', '#f8f3ea', '#b8423a', '#ece2d3', '#ffffff'], mat: 'satin', pat: 'none', pect: 'long', tail: 'fork', fx: { finA: 0.5 }, tags: ['和纸素白', '鹤翼长胸鳍', '朱红点睛'], adj: '纸鹤' }),
];
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((x) => [x.id, x]));
export const ITEM_IDS = ITEMS.map((x) => x.id);
// v0.9：道具槽只有 1 个（旧 UI 兼容：最多选 1 个）
export const MAX_PICK = 1;
// 旧「组合彩蛋」已移除（保留空表，旧代码引用不崩）
export const COMBOS = [];

// ---------------- 掉落 ----------------
// v0.9 C 道具稀缺化：每杆 7% 钓上道具 + 1.5% 鱼嘴叼一个 ≈ 平均 12 杆 1 个；稀有度权重见 ITEM_RARITY.w（普通 70 / 稀有 24 / 史诗 5 / 传说 1）
export const ITEM_CATCH_P = 0.07;   // 这一杆钓上来的是「道具」而不是鱼
export const ITEM_MOUTH_P = 0.015;  // 钓到鱼时，鱼嘴里叼着一个道具
export const ITEM_LUCK_K = 0.5;     // 好运（幸运饵 / 鱼潮 / 完美抛竿）对道具稀有度只做轻微加成：luck 截到 ≤1 再 ×0.5
// 漂流物外观：v0.9 C 宝箱 / 漂流瓶下线，统一「被海藻缠住的小包裹」（旧 pod_shell / pod_bottle / pod_chest 仅旧存档兼容）
export const ITEM_POD = { common: 'pod_kelp', rare: 'pod_kelp', epic: 'pod_kelp', legendary: 'pod_kelp' };
// 新手包：3 个普通道具（西装 / 钥匙 / 披萨）
export const STARTER_PACK = { suit: 1, key: 1, pizza: 1 };

const pickIn = (arr, x) => arr[Math.min(arr.length - 1, Math.floor(x * arr.length))];
// r: rng 函数；ctx.luck: 0~1 提升高稀有度权重；ctx.minRarity / ctx.rarity：指定最低 / 固定稀有度；ctx.cat：限定类别
export function rollItemDrop(r = Math.random, ctx = {}) {
  const luck = Math.min(1, Math.max(0, +ctx.luck || 0)) * ITEM_LUCK_K;
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
