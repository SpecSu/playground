// 随机数 / 哈希 / 数学工具
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  const f = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a0, b0) => a0 + (b0 - a0) * f();
  f.int = (a0, b0) => Math.floor(a0 + (b0 - a0 + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  f.weighted = (items) => { // [[value, weight], ...]
    let s = 0; for (const it of items) s += it[1];
    let r = f() * s; for (const it of items) { r -= it[1]; if (r <= 0) return it[0]; }
    return items[items.length - 1][0];
  };
  return f;
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const smooth = (t) => t * t * (3 - 2 * t);
export function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
export function dampAngle(a, b, k, dt) { return a + angDiff(a, b) * (1 - Math.exp(-k * dt)); }
export const R = Math.random;
export const rr = (a, b) => a + (b - a) * Math.random();
export const rpick = (arr) => arr[Math.floor(Math.random() * arr.length)];
