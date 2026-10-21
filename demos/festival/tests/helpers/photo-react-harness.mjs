import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';

export function photoReactHarness(path, makeProps, dependencies, globals = {}) {
  assert.ok(fs.existsSync(path), `${path.pathname.split('/').at(-1)} is implemented`);
  const slots = [], cleanup = new Map(), effects = [], listeners = new Map();
  let cursor = 0, dirty = true, value, mounted = true;
  const addEventListener = (name, fn) => { const handlers = listeners.get(name) ?? new Set(); handlers.add(fn); listeners.set(name, handlers); };
  const removeEventListener = (name, fn) => listeners.get(name)?.delete(fn);
  const document = { visibilityState: 'visible', hasFocus: () => true, addEventListener, removeEventListener, ...globals.document };
  const window = { addEventListener, removeEventListener, ...globals.window };
  const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { const result = typeof next === 'function' ? next(slots[i]) : next; if (!Object.is(result, slots[i])) { slots[i] = result; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !equal(slots[i].deps, deps)) { slots[i] = { deps }; effects.push(() => { cleanup.get(i)?.(); cleanup.set(i, fn()); }); } },
  };
  const element = (type, props, key) => {
    if (props?.ref && globals.refNode) props.ref.current = globals.refNode;
    return { type, props: props ?? {}, key };
  };
  const context = vm.createContext({ exports: {}, document, window, queueMicrotask, AbortController, File, Promise, console, ...globals, require(specifier) { if (specifier === 'react') return hooks; if (specifier === 'react/jsx-runtime') return { jsx: element, jsxs: element, Fragment: 'Fragment' }; if (specifier === 'lucide-react') return new Proxy({}, { get: (_, name) => name }); if (specifier in dependencies) return dependencies[specifier]; throw new Error(specifier); } });
  context.document = document; context.window = window;
  vm.runInContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const component = context.exports.default ?? context.exports.useFestivalMemoryPhoto;
  const render = () => { cursor = 0; dirty = false; value = component(makeProps()); for (const fn of effects.splice(0)) fn(); return value; };
  const api = { get value() { return value; }, get dirty() { return dirty; }, document, window, render, async settle() { for (let i = 0; i < 12; i++) { await Promise.resolve(); if (dirty && mounted) render(); } return value; }, fire(name, event = {}) { for (const fn of listeners.get(name) ?? []) fn(event); }, unmount() { mounted = false; for (const fn of cleanup.values()) fn?.(); cleanup.clear(); }, listeners };
  render(); return api;
}
export const findNodes = (tree, predicate) => Array.isArray(tree) ? tree.flatMap(node => findNodes(node, predicate)) : tree && typeof tree === 'object' && tree.props ? [...(predicate(tree) ? [tree] : []), ...findNodes(tree.props.children, predicate)] : [];
export const nodeText = tree => Array.isArray(tree) ? tree.map(nodeText).join('') : tree == null || typeof tree === 'boolean' ? '' : typeof tree === 'object' ? nodeText(tree.props?.children) : String(tree);
