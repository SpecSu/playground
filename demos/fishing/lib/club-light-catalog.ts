import type { LightMode } from './room-types.ts';

/** User-facing identities share the authoritative room light IDs. */
export const CLUB_LIGHT_CATALOG = [
  { id: 'neon', label: '霓虹激光', description: '青粉六束交叉，紫色光纹' },
  { id: 'sunset', label: '落日律动', description: '琥珀双束慢摇，暖金光池' },
  { id: 'ice', label: '冰蓝风暴', description: '八束冰蓝流动，冷光圆环' },
  { id: 'ember', label: '赤焰节拍', description: '四道赤红光刃，脉动折线' },
  { id: 'acid', label: '酸性脉冲', description: '五束荧绿环游，酸性光点' },
  { id: 'moon', label: '月下漂浮', description: '三束银紫慢舞，柔亮月环' },
] as const satisfies readonly { id: LightMode; label: string; description: string }[];
