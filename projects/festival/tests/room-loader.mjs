import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const url = new URL(specifier, context.parentURL);
    if (!/\.[a-z]+$/i.test(url.pathname) && existsSync(new URL(`${url.href}.ts`))) return nextResolve(`${url.href}.ts`, context);
  }
  return nextResolve(specifier, context);
}});
