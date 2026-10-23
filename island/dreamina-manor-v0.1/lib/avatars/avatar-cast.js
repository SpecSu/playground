/** Original boat cast. Identity aliases are presentation-only, never save migrations. */
export const AVATAR_CAST=Object.freeze([
  {
    "id": "milk-frog",
    "name": "奶蛙",
    "height": 1.2499999707464848
  },
  {
    "id": "niulai",
    "name": "牛来",
    "height": 1.499999875710769
  },
  {
    "id": "feidudu",
    "name": "肥嘟嘟",
    "height": 1.2499998956918716
  },
  {
    "id": "miaocuijiao",
    "name": "喵脆角",
    "height": 1.1250000074505806
  },
  {
    "id": "banana-cat",
    "name": "香蕉猫",
    "height": 1.4999999968822988
  },
  {
    "id": "sword-shield-dog",
    "name": "刀盾狗",
    "height": 0.9499999731779099
  },
  {
    "id": "human-lx",
    "name": "LX",
    "height": 1.4500000164670688
  },
  {
    "id": "human-kelly",
    "name": "Kelly",
    "height": 1.450000037994629
  },
  {
    "id": "human-bear",
    "name": "Bear熊",
    "height": 1.4500001696290379
  },
  {
    "id": "human-subeike",
    "name": "苏贝壳",
    "height": 1.450000048484926
  },
  {
    "id": "human-jiji",
    "name": "吉吉",
    "height": 1.4500000486054665
  },
  {
    "id": "human-jiaxin",
    "name": "Jiaxin",
    "height": 1.4500000209452928
  }
].map(item=>Object.freeze({...item,modelUrl:`/assets/avatars/cast-v1/${item.id}.glb`,portrait:`/assets/avatars/portraits/${item.id}.webp`})));
export const AVATAR_IDS=Object.freeze(AVATAR_CAST.map(item=>item.id));
export const LEGACY_AVATAR_IDS=Object.freeze(['frog','capybara','panda']);
export const ACCEPTED_AVATAR_IDS=Object.freeze([...LEGACY_AVATAR_IDS,...AVATAR_IDS]);
const aliases=Object.freeze({frog:'milk-frog',capybara:'feidudu',panda:'niulai'});
export const resolveAvatarId=value=>AVATAR_IDS.includes(value)?value:aliases[value]??'milk-frog';
export const avatarDefinition=value=>AVATAR_CAST.find(item=>item.id===resolveAvatarId(value));
export const avatarLabel=value=>avatarDefinition(value).name;
export const avatarPortrait=value=>avatarDefinition(value).portrait;
