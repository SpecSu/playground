// 道具系统 items.js（v0.9）—— 钓上来的「稀奇古怪的东西」（纯数据 + 掉落，零依赖，node 可直接 import）
// 道具唯一用途：基因改造时放进「道具槽」，被合成进新物种的身体里（不是装扮！鱼不能被装扮）。
// motif = 对基因组的具象影响（解释器见 synth.js applyMotif）：
//   pal: [底色, 腹色, 点缀色, 鳍色]   mat: 皮肤材质 wet|matte|glaze|ceramic|metal|brass|gold|pearl|satin|glow|crystal|paper
//   pat: 花纹 none|stripe|spots|grad|scale|marble|ring|ocelli|geo|tux|lateral|galaxy|sprinkle|dial|melon|sunburst|waffle
//   plan: 体型 fusiform|deep|globe|eel|flat|box|seg|disc|hourglass|diamond     head / mouth / dorsal / tail / pect: 见 synth.js 形状表
//   app: 附肢 ['bells', 'lure:bulb', 'mane:knit', ...]     eyes: { n, k, stalk, lens }     glow: 0~1     cm: 体长倍率
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
  home: { label: '日用', emoji: '🏠', order: 1, hint: '器物的轮廓会变成躯干和背鳍' },
  tool: { label: '工具', emoji: '🔧', order: 2, hint: '金属质感 + 机械结构的鳍' },
  food: { label: '美食', emoji: '🍽️', order: 3, hint: '诱人的配色与花纹' },
  nature: { label: '自然', emoji: '🌿', order: 4, hint: '植物与矿物的形态' },
  curio: { label: '奇物', emoji: '🔮', order: 5, hint: '罕见的造型，容易引发狂野突变' },
};

// ---------------- 道具表（38 种）----------------
// 字段：id/name/emoji/icon/cat/rarity/color/desc + motif；pv / ch / adj 兼容旧 UI（预览短标签 / 揭晓文案 / 名字定语）
const T = (id, name, emoji, cat, rarity, color, icon, desc, motif) => ({ id, name, emoji, icon, cat, rarity, color, desc, motif, adj: motif.adj, pv: motif.tags[0], ch: `${emoji} ${motif.tags.join(' · ')}`, fx: {} });
export const ITEMS = [
  // ===== 衣物 wear =====
  T('suit', '西装', '🤵', 'wear', 'common', '#2a2d34', '一件被海水泡过的燕尾服', '口袋里还有半张晚宴请柬。',
    { pal: ['#23262d', '#ece6da', '#7e1f2d', '#1d2026'], pat: 'tux', mat: 'satin', pect: 'bow', tail: 'swallow', dorsal: 'shark', tags: ['领结状胸鳍', '燕尾分叉尾', '黑白礼服配色'], adj: '燕尾' }),
  T('heels', '高跟鞋', '👠', 'wear', 'common', '#9e1f33', '一只红色漆皮细高跟', '另一只大概还在某个舞会上。',
    { pal: ['#9b1f33', '#ead8d0', '#d6b26a', '#7b1828'], mat: 'glaze', tail: 'stiletto', head: 'pointed', plan: 'fusiform', slim: 1.25, tags: ['细跟尾刺', '红漆釉面', '尖头流线身'], adj: '细跟' }),
  T('scarf', '毛线围巾', '🧣', 'wear', 'common', '#b8452f', '手织的粗棒针条纹围巾', '织到一半的线头还挂着。',
    { pal: ['#b4472f', '#efe4d2', '#2f4f6b', '#a8402b'], pat: 'stripe', patD: 5, mat: 'matte', app: ['mane:knit'], tags: ['针织鬃领', '粗棒针条纹', '哑光绒感'], adj: '绒领' }),
  T('tophat', '礼帽', '🎩', 'wear', 'rare', '#1c1d22', '缎面黑礼帽，帽檐微卷', '魔术师说里面曾经住过一只兔子。',
    { pal: ['#1d1e24', '#cfc8bb', '#8b6d3b', '#2a2b31'], mat: 'satin', app: ['tophat'], pat: 'grad', tags: ['礼帽状头冠', '缎面墨黑', '高耸头骨'], adj: '礼冠' }),
  T('pearls', '珍珠项链', '📿', 'wear', 'epic', '#e8e2d8', '一串温润的南洋珍珠', '每一颗都在月光下转过身。',
    { pal: ['#e6dfd4', '#f7f3ec', '#c9b3d4', '#ddd3e2'], mat: 'pearl', pat: 'grad', app: ['pearls', 'photo'], tags: ['珍珠颈环', '珠母虹彩', '温润月白'], adj: '珠颈' }),
  T('veil', '婚纱头纱', '👰', 'wear', 'epic', '#f3efe9', '三米长的蕾丝拖尾头纱', '被风吹进海里，从此再也没有落地。',
    { pal: ['#efe9e1', '#ffffff', '#d8c7b0', '#f4efe8'], mat: 'satin', tail: 'ribbon', dorsal: 'ribbon', pect: 'long', wild: ['ribbons'], tags: ['拖尾纱鳍', '象牙白缎', '飘逸长鳍'], adj: '纱尾' }),
  // ===== 日用 home =====
  T('toilet', '马桶', '🚽', 'home', 'rare', '#eef0f2', '一只完好无损的白瓷马桶', '没人知道它是怎么漂到海里的。',
    { pal: ['#f1efea', '#e2e5e7', '#a9b3b9', '#e9ebed'], mat: 'ceramic', pat: 'none', plan: 'globe', dorsal: 'lid', mouth: 'gape', tail: 'paddle', tags: ['马桶盖背鳍', '白瓷釉面', '圆碗形躯干'], adj: '瓷碗' }),
  T('umbrella', '雨伞', '☂️', 'home', 'common', '#2d4a6b', '一把藏青色长柄伞', '撑开的时候会“啪”地一声。',
    { pal: ['#2c4a6b', '#e7e2d6', '#c8a35a', '#2a4565'], mat: 'satin', pat: 'stripe', patD: 3, dorsal: 'canopy', tail: 'hook', tags: ['伞盖背鳍', '弯柄钩尾', '伞骨条纹'], adj: '伞骨' }),
  T('bulb', '灯泡', '💡', 'home', 'common', '#ffd36b', '一颗还温热的钨丝灯泡', '拧上去之前，它自己亮了一下。',
    { pal: ['#d8c38a', '#f6efd8', '#ffcf6a', '#d2bd84'], mat: 'glow', glow: 0.85, pat: 'lateral', app: ['lure:bulb'], head: 'blunt', plan: 'globe', tags: ['灯泡饵球', '钨丝光纹', '暖光体表'], adj: '钨光' }),
  T('clock', '闹钟', '⏰', 'home', 'rare', '#c84b3c', '双铃铛的复古闹钟', '每天早上七点准时在海底响起。',
    { pal: ['#c04a3c', '#f1ebe0', '#2a2a2e', '#b8892f'], mat: 'glaze', plan: 'disc', pat: 'dial', app: ['bells'], tail: 'fan', tags: ['双铃头冠', '表盘体侧', '圆盘身形'], adj: '铃顶' }),
  T('lipstick', '口红', '💄', 'home', 'common', '#a4243b', '金管丝绒口红，旋出一半', '色号叫「深海初吻」。',
    { pal: ['#a3233b', '#f0d9d2', '#caa55a', '#8a1c30'], mat: 'glaze', head: 'bevel', app: ['band'], plan: 'fusiform', boxy: 2.8, tags: ['斜切吻部', '金属颈环', '丝绒红釉'], adj: '绯唇' }),
  T('teapot', '茶壶', '🫖', 'home', 'rare', '#8fb3a6', '一把青瓷小茶壶', '壶里还剩一口凉掉的乌龙。',
    { pal: ['#8db2a5', '#e9efe9', '#5a7f74', '#9cbcb0'], mat: 'ceramic', head: 'spout', dorsal: 'handle', plan: 'globe', pat: 'none', tags: ['壶嘴长吻', '提梁背鳍', '青瓷釉色'], adj: '青瓷' }),
  // ===== 工具 tool =====
  T('key', '钥匙', '🔑', 'tool', 'common', '#c99b45', '一把老式黄铜钥匙', '能打开哪扇门？海底也许知道。',
    { pal: ['#b8893b', '#e2c67f', '#6e4c1e', '#c99b45'], mat: 'brass', dorsal: 'key', tail: 'ring', tags: ['钥匙齿背鳍', '圆环尾', '黄铜质感'], adj: '镀铜' }),
  T('gear', '齿轮', '⚙️', 'tool', 'common', '#7b8590', '从怀表里掉出来的齿轮', '还在以每秒一格的速度转动。',
    { pal: ['#7b8590', '#c9ced3', '#b5763a', '#69737d'], mat: 'metal', dorsal: 'gear', app: ['plates'], pat: 'geo', tags: ['齿轮背鳍', '铆接甲板', '钢铁质感'], adj: '机芯' }),
  T('telescope', '望远镜', '🔭', 'tool', 'rare', '#1f3554', '可伸缩的黄铜单筒望远镜', '镜片里映着一颗很远的星星。',
    { pal: ['#1f3554', '#d9cdb4', '#b8893b', '#243d60'], mat: 'satin', eyes: { n: 1, lens: 1, k: 1.3 }, pat: 'grad', tags: ['伸缩望远眼', '黄铜镜筒', '深海军蓝'], adj: '远瞳' }),
  T('scissors', '剪刀', '✂️', 'tool', 'common', '#b9c2ca', '一把锃亮的裁缝剪', '咔嚓一声，剪断了一段浪花。',
    { pal: ['#b7c0c8', '#e8ecef', '#2f3a46', '#9aa5af'], mat: 'metal', tail: 'shears', head: 'pointed', plan: 'fusiform', slim: 1.2, tags: ['剪刃双尾', '镜面钢', '锋利吻部'], adj: '剪尾' }),
  T('quill', '羽毛笔', '🪶', 'tool', 'rare', '#2b2f4a', '蘸过墨的天鹅羽毛笔', '笔尖还挂着一滴没写完的诗。',
    { pal: ['#2c304b', '#e8e2d3', '#5b6b9a', '#3a3f60'], mat: 'satin', pat: 'marble', dorsal: 'quill', tail: 'feather', tags: ['翎羽背鳍', '墨渍大理石纹', '羽片尾'], adj: '翎羽' }),
  T('neon', '霓虹灯管', '🔆', 'tool', 'epic', '#ff5fa8', '一截还会闪的霓虹灯管', '弯成了一个看不懂的字。',
    { pal: ['#1b1f2e', '#2a2f45', '#ff5fa8', '#3cd6e0'], mat: 'glow', glow: 1, pat: 'lateral', app: ['photo'], tags: ['霓虹侧线', '暗夜体色', '灯管发光纹'], adj: '霓虹' }),
  T('anchor', '船锚', '⚓', 'tool', 'rare', '#3b4148', '一只长满藤壶的小铁锚', '它终于等到一条愿意带它走的鱼。',
    { pal: ['#3b4148', '#a7adb3', '#9a5b2e', '#30363c'], mat: 'metal', pat: 'marble', tail: 'anchor', app: ['plates'], tags: ['锚爪尾', '铸铁质感', '锈斑纹'], adj: '铁锚' }),
  // ===== 美食 food =====
  T('pizza', '披萨', '🍕', 'food', 'common', '#e7b54f', '一角拉丝的意式披萨', '还热乎，芝士拉得老长。',
    { pal: ['#e3b14e', '#f2dca0', '#b4352a', '#c98a3c'], mat: 'matte', pat: 'spots', patD: 0.8, dorsal: 'wedge', tags: ['披萨角背鳍', '意式香肠斑', '芝士暖黄'], adj: '芝士' }),
  T('watermelon', '西瓜', '🍉', 'food', 'common', '#3b7d47', '半个冰镇西瓜', '中间那一勺已经被谁挖走了。',
    { pal: ['#2f6b3a', '#d9566a', '#14251a', '#3b7d47'], mat: 'glaze', pat: 'melon', plan: 'globe', tags: ['瓜皮条纹', '红瓤腹部', '瓜子斑点'], adj: '瓜纹' }),
  T('icecream', '冰淇淋甜筒', '🍦', 'food', 'rare', '#f1e4d0', '一支快要化掉的香草甜筒', '在海里居然一点都没化。',
    { pal: ['#f0e3cf', '#f6dadf', '#c98d4a', '#eee0cc'], mat: 'satin', pat: 'waffle', app: ['swirl'], tags: ['奶油旋顶', '华夫格尾段', '香草奶油色'], adj: '甜筒' }),
  T('donut', '甜甜圈', '🍩', 'food', 'common', '#d9708a', '一个粉色糖霜甜甜圈', '上面的彩针糖少了三根。',
    { pal: ['#c48a55', '#e9c9a0', '#d46f8a', '#c48a55'], mat: 'glaze', pat: 'sprinkle', plan: 'globe', tags: ['糖霜背部', '彩针糖斑', '圆胖身形'], adj: '糖霜' }),
  T('chili', '辣椒', '🌶️', 'food', 'common', '#b3261e', '一根油亮的朝天椒', '只是看着它，鳃就开始发烫。',
    { pal: ['#b1261e', '#d84a32', '#3f6b2a', '#9c2119'], mat: 'glaze', plan: 'fusiform', arch: 0.5, tail: 'curl', app: ['calyx'], tags: ['萼片头冠', '弯钩身形', '红釉亮皮'], adj: '赤椒' }),
  T('croissant', '可颂', '🥐', 'food', 'common', '#d29a4a', '一只层次分明的黄油可颂', '咬一口，酥皮掉了满海底。',
    { pal: ['#c98f43', '#efd29a', '#8a5420', '#d6a35a'], mat: 'glaze', plan: 'seg', arch: 0.35, pat: 'grad', tags: ['分节层酥躯干', '焦糖金色', '弯月身形'], adj: '层酥' }),
  // ===== 自然 nature =====
  T('cactus', '仙人掌', '🌵', 'nature', 'common', '#5b8754', '一盆开着小粉花的仙人掌', '浑身是刺，但花很温柔。',
    { pal: ['#4f7a4a', '#8fae7a', '#e8a0b4', '#5b8754'], mat: 'matte', pat: 'lateral', app: ['spikes', 'flower'], tags: ['满身棘刺', '头顶开花', '纵棱纹'], adj: '棘花' }),
  T('maple', '枫叶', '🍁', 'nature', 'common', '#c75a2a', '一片红透了的枫叶', '从很远的秋天漂过来。',
    { pal: ['#b6452a', '#e3a44a', '#7a2a1a', '#c75a2a'], pat: 'grad', dorsal: 'saw', tail: 'leaf', mat: 'matte', tags: ['枫叶尾鳍', '锯齿背鳍', '秋色渐变'], adj: '枫红' }),
  T('conch', '贝壳号角', '🐚', 'nature', 'rare', '#e3bfa9', '一只能吹响的螺号', '贴在耳边，能听见另一片海。',
    { pal: ['#e6c7b3', '#f6e8dc', '#c07868', '#e2bea8'], mat: 'pearl', pat: 'ring', app: ['horn:spiral'], tags: ['螺旋号角', '珠母光泽', '螺纹环带'], adj: '螺号' }),
  T('sunflower', '向日葵', '🌻', 'nature', 'rare', '#e0a92e', '一朵追着太阳转的向日葵', '在海里，它改成追着灯笼鱼转。',
    { pal: ['#d9a12c', '#f2d16b', '#5a3a1e', '#d69a2a'], mat: 'matte', app: ['mane:petal'], pat: 'grad', tags: ['花瓣鬃领', '葵籽纹面', '金黄体色'], adj: '葵冠' }),
  T('mushroom', '蘑菇', '🍄', 'nature', 'common', '#b6322b', '一朵红伞白点的小蘑菇', '童话书里掉出来的那种。',
    { pal: ['#b1322b', '#efe6d6', '#f6efe4', '#c9bfae'], mat: 'matte', pat: 'spots', patD: 1.1, dorsal: 'cap', tags: ['菌盖背鳍', '红底白点', '奶白腹面'], adj: '菌伞' }),
  T('snowflake', '雪花', '❄️', 'nature', 'epic', '#cfe3ee', '一片永不融化的六角雪花', '据说来自北极最深的那个冬天。',
    { pal: ['#c9dfeb', '#f3f8fb', '#7fb2cf', '#d8e7f0'], mat: 'crystal', pat: 'geo', dorsal: 'crystal', app: ['spikes'], glow: 0.25, tags: ['六角冰晶棘', '霜白晶体', '几何冰纹'], adj: '霜晶' }),
  // ===== 奇物 curio =====
  T('crown', '皇冠', '👑', 'curio', 'legendary', '#d4a94a', '一顶镶红宝石的旧王冠', '戴过它的国王，名字已经没人记得。',
    { pal: ['#6b1d2f', '#d8c49a', '#d4a94a', '#5a1828'], mat: 'gold', app: ['crown', 'photo'], pat: 'grad', glow: 0.35, tags: ['王冠棘环', '鎏金鳍缘', '宝石发光器'], adj: '鎏金' }),
  T('guitar', '吉他', '🎸', 'curio', 'epic', '#a5642f', '一把日落色木吉他', '第六根弦断了，但还能弹。',
    { pal: ['#a8642c', '#e6c08a', '#2a1d14', '#7c4722'], mat: 'glaze', plan: 'hourglass', head: 'bill', app: ['strings'], pat: 'sunburst', tags: ['琴颈长吻', '琴弦背脊', '日落渐变漆面'], adj: '琴弦' }),
  T('rubik', '魔方', '🎲', 'curio', 'epic', '#2d5fa8', '一个只差一步就拼好的魔方', '最后一步，留给海浪去转。',
    { pal: ['#c9302c', '#f2f2ee', '#2d5fa8', '#e8b72f'], mat: 'glaze', plan: 'box', pat: 'geo', tags: ['方块躯干', '六色棋盘格', '塑料亮面'], adj: '方格' }),
  T('rocket', '火箭', '🚀', 'curio', 'legendary', '#c2412d', '一枚还在冒烟的玩具火箭', '它本来要去月球，结果掉进了海里。',
    { pal: ['#e9e6e0', '#c9cdd2', '#c2412d', '#d0d4d8'], mat: 'metal', head: 'pointed', tail: 'rocket', pat: 'ocelli', glow: 0.6, tags: ['尾焰喷口', '三翼尾鳍', '舷窗眼斑'], adj: '星舰' }),
  T('crystalball', '水晶球', '🔮', 'curio', 'legendary', '#6b5bb8', '一颗装着星云的占卜水晶球', '盯着看久了，会看见自己的鱼。',
    { pal: ['#33295f', '#6f61ad', '#cbbcff', '#463b80'], mat: 'crystal', pat: 'galaxy', plan: 'globe', eyes: { n: 1, k: 1.4 }, glow: 0.7, wild: ['photo'], tags: ['体内星云', '晶体外壳', '预言独眼'], adj: '星象' }),
  T('hourglass', '沙漏', '⌛', 'curio', 'rare', '#d8b47a', '一只黄铜框的沙漏', '倒过来，时间就往回流。',
    { pal: ['#d6b277', '#efe0bf', '#8a6a3a', '#c9a465'], mat: 'matte', plan: 'hourglass', pat: 'grad', app: ['band'], tags: ['细腰沙漏身', '流沙渐变', '黄铜腰环'], adj: '流沙' }),
  T('origami', '千纸鹤', '🕊️', 'curio', 'rare', '#e9dfcf', '一只和纸折的千纸鹤', '翅膀上写着一个没人看得懂的愿望。',
    { pal: ['#e8ddcc', '#f5efe4', '#b8423a', '#e2d6c3'], mat: 'paper', plan: 'diamond', pect: 'wing', tail: 'fork', pat: 'none', tags: ['折纸棱面', '鹤翼胸鳍', '和纸肌理'], adj: '纸鹤' }),
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
