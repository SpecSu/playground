// Node ESM 解析钩子：把浏览器 importmap 里的 'three' 映射到 vendor/three.module.min.js（仅模拟脚本用）
import { pathToFileURL } from 'node:url';
import { resolve as r } from 'node:path';
const THREE_URL = pathToFileURL(r(import.meta.dirname, '../../vendor/three.module.min.js')).href;
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: THREE_URL, shortCircuit: true };
  return next(spec, ctx);
}
