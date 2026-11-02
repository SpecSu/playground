import './room-loader.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import postcss from 'postcss';
import { CLUB_AVATAR_CATALOG, CLUB_AVATAR_PICKER_OPTIONS, DEFAULT_AVATAR_PRESET } from '../lib/club-avatar-catalog.ts';
import { AVATAR_PRESETS, resolveAvatarPreset } from '../lib/room-types.ts';

// Run the actual panel JSX and Sheet renderer without starting WebGL or a browser.
const source = readFileSync(new URL('../components/DesertFeed.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('DesertFeed.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const sheet = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'Sheet');
let picker;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'Sheet' && node.getText(ast).includes('className="join-form"')) picker = node;
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(picker, 'the existing avatar picker is present');
const javascript = ts.transpileModule(`${sheet.getText(ast)}\nglobalThis.render = () => (${picker.getText(ast)});`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
function render(overrides = {}) {
  const changes = { name: null, preset: null, submitted: 0, left: 0, closed: 0 };
  const context = vm.createContext({
    joined: false, name: '沙丘旅人', preset: CLUB_AVATAR_PICKER_OPTIONS[0].id, count: 0, pending: false, ready: true,
    CLUB_AVATAR_PICKER_OPTIONS, X: 'X', LogOut: 'LogOut', LoaderCircle: 'LoaderCircle',
    useRef: () => ({ current: null }), useEffect() {},
    setName: value => { changes.name = value; }, setPreset: value => { changes.preset = value; },
    join: () => { changes.submitted++; }, leave: () => { changes.left++; }, closeSheet: () => { changes.closed++; },
    React: { createElement(type, props, ...children) {
      const resolved = { ...props, children };
      return typeof type === 'function' ? type(resolved) : { type, props: resolved };
    } },
    ...overrides,
  });
  vm.runInContext(javascript, context);
  return { tree: context.render(), changes };
}
const nodes = (tree, predicate) => Array.isArray(tree) ? tree.flatMap(child => nodes(child, predicate)) :
  tree && typeof tree === 'object' && tree.props ? [...(predicate(tree) ? [tree] : []), ...nodes(tree.props.children, predicate)] : [];
const hasClass = (node, name) => String(node.props.className ?? '').split(/\s+/).includes(name);
const byClass = (tree, name) => nodes(tree, node => hasClass(node, name));
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : tree == null || typeof tree === 'boolean' ? '' :
  typeof tree === 'object' ? text(tree.props?.children) : String(tree);
const children = node => node.props.children.flat(Infinity).filter(child => child && typeof child === 'object');

test('the nickname is above the independently scrolling choices and the internal confirmation footer', () => {
  const { tree } = render();
  assert.equal(byClass(tree, 'festival-avatar-sheet').length, 1, 'only the avatar dialog opts into the layout');
  const form = byClass(tree, 'join-form')[0];
  assert.deepEqual(children(form).map(node => node.props.className), ['festival-avatar-field', 'festival-avatar-scroll', 'festival-avatar-footer']);
  const field = byClass(tree, 'festival-avatar-field')[0];
  const input = nodes(field, node => node.type === 'input')[0];
  const label = nodes(field, node => node.type === 'label')[0];
  assert.equal(label.props.htmlFor, input.props.id);
  assert.equal(input.props.autoComplete, 'nickname');
  assert.equal(input.props.required, true);
  assert.equal(nodes(byClass(tree, 'festival-avatar-scroll')[0], node => node.type === 'input').length, 0);
  assert.equal(nodes(byClass(tree, 'festival-avatar-footer')[0], node => node.props.type === 'submit').length, 1);
});

test('the three-column list renders all twelve choices with decorative transparent portraits and accessible selection', () => {
  const selected = CLUB_AVATAR_PICKER_OPTIONS.at(-1);
  const { tree, changes } = render({ preset: selected.id });
  const cards = byClass(tree, 'avatar-option');
  assert.equal(cards.length, 12, 'twelve choices make four rows at three columns');
  assert.equal(cards.filter(card => card.props['aria-pressed']).length, 1);
  assert.equal(cards.at(-1).props['aria-pressed'], true);
  for (let index = 0; index < cards.length; index++) {
    const card = cards[index], avatar = CLUB_AVATAR_PICKER_OPTIONS[index];
    assert.equal(card.props.type, 'button');
    assert.equal(card.props['aria-label'], avatar.label);
    const preview = byClass(card, 'avatar-preview')[0];
    assert.equal(preview.props['aria-hidden'], 'true');
    if (avatar.previewImage) assert.equal(preview.props.style.backgroundImage, `url("${avatar.previewImage}")`);
    card.props.onClick();
    assert.equal(changes.preset, avatar.id);
  }
});

test('the nickname preserves its twenty-code-point limit and the form retains its submit handler', () => {
  const { tree, changes } = render();
  nodes(tree, node => node.type === 'input')[0].props.onChange({ target: { value: '🌵'.repeat(25) } });
  assert.equal(changes.name, '🌵'.repeat(20));
  byClass(tree, 'join-form')[0].props.onSubmit();
  assert.equal(changes.submitted, 1);
});

test('the footer preserves join, save, capacity, connection, blank-name and pending behavior', () => {
  for (const [state, label] of [[{}, '进入荒原'], [{ joined: true }, '保存形象'], [{ count: 10 }, '尝试加入 · 房间已满']]) {
    const idle = render(state).tree, busy = render({ ...state, pending: true }).tree;
    const button = nodes(byClass(idle, 'festival-avatar-footer')[0], node => node.type === 'button')[0];
    const pendingButton = nodes(byClass(busy, 'festival-avatar-footer')[0], node => node.type === 'button')[0];
    assert.equal(text(button), label);
    assert.equal(text(pendingButton), label);
    assert.equal(button.props.type, 'submit');
    assert.equal(button.props.disabled, false);
    assert.equal(pendingButton.props.disabled, true);
    assert.equal(nodes(pendingButton, node => node.type === 'LoaderCircle').length, 1);
  }
  for (const state of [{ name: '  ' }, { ready: false }]) {
    assert.equal(nodes(byClass(render(state).tree, 'festival-avatar-footer')[0], node => node.type === 'button')[0].props.disabled, true);
  }
});

test('privacy and leave remain available without turning leave into a form submit', () => {
  const visitor = render(), participant = render({ joined: true });
  assert.match(text(visitor.tree), /昵称和分身会同步给这个房间的所有人/);
  assert.equal(byClass(visitor.tree, 'leave-button').length, 0);
  const leave = byClass(participant.tree, 'leave-button')[0];
  assert.equal(leave.props.type, 'button');
  leave.props.onClick();
  assert.equal(participant.changes.left, 1);
  assert.equal(participant.changes.submitted, 0);
  nodes(participant.tree, node => node.type === 'button' && node.props['aria-label'] === '关闭面板').at(-1).props.onClick();
  assert.equal(participant.changes.closed, 1);
});

const stylesheets = ['../components/FeedInterface.css', '../components/DesertFeed.css'].map(path => postcss.parse(readFileSync(new URL(path, import.meta.url), 'utf8')));
function cascade(selectors) {
  const winners = new Map();
  for (const stylesheet of stylesheets) stylesheet.walkRules(rule => {
    const priority = Math.max(-1, ...rule.selectors.map(selector => selectors.get(selector) ?? -1));
    if (priority < 0) return;
    rule.walkDecls(declaration => {
      const previous = winners.get(declaration.prop);
      if (!previous || priority >= previous.priority) winners.set(declaration.prop, { value: declaration.value, priority });
    });
  });
  return Object.fromEntries([...winners].map(([key, { value }]) => [key, value]));
}
const style = selector => cascade(new Map([[selector, 30]]));

test('only the avatar list scrolls; the dialog, field and footer remain bounded flex siblings', () => {
  const dialog = cascade(new Map([['.feed-v020 .sheet', 20], ['.desert-feed .sheet.festival-avatar-sheet', 30]]));
  assert.equal(dialog.display, 'flex');
  assert.equal(dialog['flex-direction'], 'column');
  assert.equal(dialog.height, '560px');
  assert.equal(dialog.overflow, 'hidden');
  assert.match(dialog['max-height'], /var\(--phone-visible-height,844px\)/);
  const form = style('.desert-feed .festival-avatar-sheet .join-form');
  assert.equal(form.display, 'flex');
  assert.equal(form['min-height'], '0');
  assert.equal(form.overflow, 'hidden');
  const scroll = style('.desert-feed .festival-avatar-scroll');
  assert.equal(scroll['overflow-y'], 'auto');
  assert.equal(scroll['min-height'], '0');
  assert.equal(scroll['overscroll-behavior-y'], 'contain');
  assert.equal(style('.desert-feed .festival-avatar-field').flex, 'none');
  assert.equal(style('.desert-feed .festival-avatar-footer').flex, 'none');
  assert.equal(style('.desert-feed .festival-avatar-footer .primary-button')['margin-top'], '0');
});

test('the portrait grid stays three columns and uses unclipped, unbacked face images', () => {
  const grid = style('.desert-feed .festival-avatar-scroll .avatar-grid');
  assert.equal(grid['grid-template-columns'], 'repeat(3,minmax(0,1fr))');
  assert.equal(grid['grid-auto-rows'], '84px');
  const portrait = style('.desert-feed .festival-avatar-sheet .avatar-preview');
  assert.equal(portrait['background-color'], 'transparent');
  assert.equal(portrait['background-size'], 'contain');
  assert.equal(portrait['background-repeat'], 'no-repeat');
  assert.equal(portrait['background-position'], 'center');
  assert.equal(portrait['border-radius'], '0');
});

test('the keyboard override cannot restore whole-dialog scrolling for the avatar picker', () => {
  const dialog = cascade(new Map([
    ['.feed-v020 .sheet', 20], ['.desert-feed .sheet.festival-avatar-sheet', 30],
    ['.phone-viewport[data-keyboard-held] .feed-v020 .sheet', 40],
    ['.phone-viewport[data-keyboard-held] .desert-feed .sheet.festival-avatar-sheet', 50],
  ]));
  assert.equal(dialog['overflow-y'], 'hidden');
  assert.equal(style('.phone-viewport[data-keyboard-held] .desert-feed .festival-avatar-sheet .sheet-handle').display, 'none');
  assert.equal(style('.phone-viewport[data-keyboard-held] .desert-feed .festival-avatar-sheet .sheet-heading .eyebrow').display, 'none');
});

// Exercise the existing state ingress points with the real catalog and resolver.
const declarations = new Map();
let restoreEffect;
function stateNodes(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node.initializer?.getText(ast));
  if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === 'useEffect' && node.getText(ast).includes('localStorage.getItem(PROFILE_KEY)')) restoreEffect = node.getText(ast);
  ts.forEachChild(node, stateNodes);
}
stateNodes(ast);
const stateJavascript = ts.transpileModule(`const ownAvatar = ${declarations.get('ownAvatar')}; const showProfile = ${declarations.get('showProfile')}; ${restoreEffect}\nglobalThis.state = { ownAvatar, showProfile };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function profileState({ self = null, saved = null } = {}) {
  const updates = { preset: DEFAULT_AVATAR_PRESET, name: '', sheet: null };
  const context = vm.createContext({
    self, preset: DEFAULT_AVATAR_PRESET, CLUB_AVATAR_CATALOG, AVATAR_PRESETS, resolveAvatarPreset,
    useCallback: callback => callback, useEffect: callback => callback(), queueMicrotask: callback => callback(),
    setInterval: () => 1, clearInterval() {}, serverTime: () => 1000,
    PROFILE_KEY: 'profile', LIKE_KEY: 'like', localStorage: { getItem: key => key === 'profile' ? saved : null },
    setLiked() {}, setName: value => { updates.name = value; }, setPreset: value => { updates.preset = value; },
    openSheet: value => { updates.sheet = value; },
  });
  vm.runInContext(stateJavascript, context);
  return { updates, ...context.state };
}

test('legacy participant presets resolve consistently in the existing external avatar and reopened picker', () => {
  for (const [legacy, canonical] of [['cat', 'miaocuijiao'], ['frog', 'milk-frog'], ['dog', 'sword-shield-dog'], ['capybara', 'feidudu'], ['panda', 'niulai'], ['monster-star', 'milk-frog']]) {
    const state = profileState({ self: { name: '原来的旅人', preset: legacy } });
    assert.equal(state.ownAvatar.id, canonical);
    state.showProfile();
    assert.equal(state.updates.preset, canonical);
    assert.equal(state.updates.name, '原来的旅人');
    assert.equal(state.updates.sheet, 'join');
  }
});

test('saved recognized presets migrate while unknown and malformed saved values cannot select a missing card', () => {
  for (const preset of AVATAR_PRESETS) {
    const state = profileState({ saved: JSON.stringify({ name: '保存的旅人', preset }) });
    assert.equal(state.updates.preset, resolveAvatarPreset(preset));
    assert.equal(state.updates.name, '保存的旅人');
    assert.ok(CLUB_AVATAR_CATALOG.some(avatar => avatar.id === state.updates.preset));
  }
  for (const saved of [null, '{bad json', '{}', '{"preset":"unknown-avatar"}', '{"preset":42}', '{"preset":null}']) {
    assert.equal(profileState({ saved }).updates.preset, DEFAULT_AVATAR_PRESET);
  }
});
