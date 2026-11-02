// 合成引擎接入点（B）：UI / meta 一律从这里拿 synth API。
// A 的 src/synth.js 就位后把下面一行改成：export * from './synth.js';  （STUB 会变成 undefined → 视为真引擎）
export * from './synth.js';
