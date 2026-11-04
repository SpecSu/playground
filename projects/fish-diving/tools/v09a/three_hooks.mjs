// node 钩子：把裸模块 'three' 映射到 vendor/three.module.min.js（让 synth_model.js / marine.js 能在 node 里 import）
import { pathToFileURL } from 'node:url';
import { resolve as res } from 'node:path';
const THREE_URL = pathToFileURL(res(new URL('../../vendor/three.module.min.js', import.meta.url).pathname)).href;
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: THREE_URL, shortCircuit: true };
  return next(spec, ctx);
}
