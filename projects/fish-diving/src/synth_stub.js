// 临时桩（B 自用）：与 docs/V09_CONTRACT.md §2 的 synth.js 同签名。A 的真引擎就位后，改 src/synth_bridge.js 一行即可切回。
// 返回的「合成鱼」sp 仍是某个天然物种（保证渲染 / 缩略图可用），name / fp / syn 等字段按契约填充。
import { SPECIES, SPECIES_BY_ID, makeVariant } from './fishes.js';
import { ITEM_BY_ID } from './items.js';

export const STUB = true;
const RAR = ['rare', 'epic', 'legendary', 'mythic'];
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x6d2b79f5 >>> 0) / 4294967296); }
function hash(str) { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const fpOf = (seed) => { const s = (seed >>> 0).toString(16).toUpperCase().padStart(8, '0'); const t = (Math.imul(seed, 2654435761) >>> 0).toString(16).toUpperCase().padStart(8, '0'); return `${s.slice(0, 4)}-${s.slice(4)}-${t.slice(0, 4)}`; };
const nm = (v) => v?.name || v?.nick || SPECIES_BY_ID[v?.sp]?.name || '鱼';
const spName = (v) => (v?.syn ? (v.syn.baseName || '无名种') : SPECIES_BY_ID[v?.sp]?.name || '鱼');

const PRE = ['镀铜', '雾面', '琥珀', '月白', '珐琅', '墨染', '薄荷', '鎏金', '霜纹', '珊瑚', '玻璃', '丝绒'];
const MID = ['钥齿', '双尾', '灯笼', '羽鳍', '长须', '环纹', '透骨', '星点', '折扇', '螺旋'];
const TAIL = ['鳗', '鲀', '鲷', '魟', '鲳', '鲹', '鳐', '鱚'];
const TAGS = ['半透明鳍膜', '金属光泽', '尾鳍分叉', '背鳍高耸', '会微微发光', '体型修长', '圆润短身', '斑点密布', '渐变体色', '多出一对胸鳍', '鳞片呈六边形', '眼睛格外大'];

export function synthName(v) {
  const r = rng(((v?.seed ?? 1) ^ 0x5bd1e995) >>> 0);
  const it = v?.synItem && ITEM_BY_ID[v.synItem];
  const a = it && r() < 0.5 ? it.name.slice(0, 2) : pick(r, PRE);
  return `${a}${pick(r, MID)}·${pick(r, PRE).slice(0, 1)}${pick(r, TAIL)}`;
}
export function genomeOf(v) { return v?.syn || { sp: v?.sp, stub: true }; }
export function synthTags(v) {
  if (v?.syn?.tags) return v.syn.tags.slice(0, 4);
  const r = rng(((v?.seed ?? 7) ^ 0x27d4eb2d) >>> 0); const out = new Set();
  while (out.size < 3) out.add(pick(r, TAGS));
  return [...out];
}
export function previewHints({ a, b, item = null, prompt = '' } = {}) {
  const it = item && ITEM_BY_ID[item];
  const tags = [];
  if (a) tags.push(`保留${spName(a)}的轮廓`);
  if (b) tags.push(`可能继承${spName(b)}的鳍形`);
  if (it) tags.push(`身上或许出现「${it.name}」的影子`);
  if (prompt && prompt.trim()) tags.push(`朝「${prompt.trim().slice(0, 10)}」的方向偏移`);
  if (tags.length < 2) tags.push('体色将重新混合');
  const h = hash(`${a?.uid}|${b?.uid}|${item}|${prompt}`);
  const risk = Math.min(0.95, 0.35 + (b ? 0.15 : 0) + (it ? 0.18 : 0) + (prompt ? 0.08 : 0) + ((a?.gen || 0) + (b?.gen || 0)) * 0.04 + (h % 9) / 100);
  return { tags: tags.slice(0, 4), risk };
}
export function synthesize({ a, b, item = null, prompt = '', seed = (Math.random() * 4294967296) >>> 0, creator = '' }) {
  const r = rng(seed);
  const pool = [a?.sp, b?.sp].filter((s) => SPECIES_BY_ID[s] && !SPECIES_BY_ID[s].odd && s !== 'synth');
  const sp = SPECIES_BY_ID[pool.length ? pick(r, pool) : pick(r, SPECIES.filter((s) => !s.odd)).id];
  const v = makeVariant(sp, 0);
  const gen = Math.max(a?.gen || 0, b?.gen || 0) + 1;
  const ri = Math.min(3, Math.floor(r() * 2) + (item && ITEM_BY_ID[item] && ITEM_BY_ID[item].rarity !== 'common' ? 1 : 0) + (gen > 2 ? 1 : 0));
  Object.assign(v, {
    uid: 'syn-' + seed.toString(36) + Date.now().toString(36).slice(-4), traits: [],
    syn: { stub: true, baseName: sp.name, tags: null }, rarity: RAR[ri], gen,
    cm: Math.round(((a?.cm || 30) + (b?.cm || 30)) * (0.45 + r() * 0.5) * 10) / 10,
    parents: [a, b].filter(Boolean).map((x) => ({ uid: x.uid, name: nm(x), sp: x.sp })),
    synItem: item || null, prompt: prompt || '', creator, seed, fp: fpOf(seed),
  });
  v.id = v.uid; v.kg = Math.max(0.05, Math.round(Math.pow(v.cm / 100, 3) * 18 * 100) / 100);
  v.syn.tags = synthTags({ seed });
  v.name = synthName(v); v.nick = v.name;
  return v;
}
export function wildSynth(seed = (Math.random() * 4294967296) >>> 0, creator = '') {
  const r = rng(seed ^ 0x9e3779b9);
  const nat = SPECIES.filter((s) => !s.odd);
  const a = makeVariant(pick(r, nat), 0), b = makeVariant(pick(r, nat), 0);
  a.gen = Math.floor(r() * 2); b.gen = Math.floor(r() * 3);
  return synthesize({ a, b, item: null, prompt: '', seed, creator });
}
export function buildSynthModel() { return null; }
