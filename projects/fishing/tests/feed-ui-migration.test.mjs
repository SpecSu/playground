import './room-loader.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const { PHONE_SCREEN, fitVisiblePhoneViewport } = await import('../lib/phone-viewport.ts');
const { stickFromPoint } = await import('../lib/club-joystick.ts');
const { INITIAL_ROOM_STATE } = await import('../lib/room-client.ts');
const { MUSIC_CATALOG } = await import('../lib/music-catalog.ts');
const { LIGHT_IDLE_INTERVAL_MS } = await import('../lib/room-lighting.ts');
const { ROOM_CAPACITY } = await import('../lib/room-types.ts');

test('the independent yacht release metadata consistently identifies product v0.3.5', () => {
  const readJson = file => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
  const pkg = readJson('../package.json');
  const lock = readJson('../package-lock.json');
  const build = readJson('../public/build-info.json');
  assert.equal(pkg.version, '0.3.5');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(build.version, pkg.version);
  assert.match(readFileSync(new URL('../README.md', import.meta.url), 'utf8'), /^# 出海钓鱼 · v0\.3\.5\n/);
});

// Execute production closures with an isolated hook store. The returned tree is
// data only: no browser, layout, WebGL, network, or sound. Effects run only when
// explicitly selected. Existing service tests cover real room/audio services.
const source = readFileSync(new URL('../components/LiveFeed.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('LiveFeed.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const feed = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'LiveFeed');
const returnStatement = feed.body.statements.find(ts.isReturnStatement);
const names = [];
function collectNames(binding) {
  if (ts.isIdentifier(binding)) names.push(binding.text);
  else for (const item of binding.elements) if (ts.isBindingElement(item)) collectNames(item.name);
}
for (const statement of feed.body.statements) {
  if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) collectNames(declaration.name);
}
const instrumented = source.slice(0, returnStatement.getStart(ast)) + `globalThis.__scope = { ${names.join(', ')} };\n` + source.slice(returnStatement.getStart(ast));
const javascript = ts.transpileModule(instrumented, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const profileJavascript = ts.transpileModule(readFileSync(new URL('../components/ProfilePage.tsx', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const libraries = new Map();
for (const statement of ast.statements) {
  if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue;
  const specifier = statement.moduleSpecifier.text;
  if (specifier.startsWith('@/lib/')) libraries.set(specifier, await import(new URL(`../${specifier.slice(2)}.ts`, import.meta.url)));
}
const element = (type, props, key) => ({ type, props: props ?? {}, key });
const component = name => Object.assign(() => null, { displayName: name });
function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  if (!tree || typeof tree !== 'object' || !tree.props) return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props.children, predicate)];
}
function textContent(tree) {
  if (Array.isArray(tree)) return tree.map(textContent).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  return textContent(tree.props?.children);
}
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
function snapshot(joined = true) {
  const person = { id: 'self', name: 'Dancer', preset: 'cat', slot: 0, joinedAt: 1000, lastSeenAt: 1000, action: 'dance', actionAt: 1000, actionUntil: 0 };
  return { roomId: 'main', revision: 1, serverNow: 2000, self: { id: 'self', role: joined ? 'participant' : 'visitor', lastSequence: 0 }, participants: joined ? [person] : [], capacity: 10, totalVisits: 1, events: [], track: { id: MUSIC_CATALOG[0].id, startedAt: 1000, durationMs: MUSIC_CATALOG[0].durationMs }, lightMode: 'neon', lightCycle: { mode: 'neon', startedAt: 1000 } };
}
function harness({ joined = true, storage = new Map() } = {}) {
  const slots = []; let cursor = 0; let effects = []; let tree;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useCallback(callback) { return callback; },
    useMemo(callback) { return callback(); },
    useEffect(callback, dependencies) { effects.push({ callback, dependencies }); },
  };
  const modules = new Map();
  const context = vm.createContext({
    exports: {}, console, Date, URL, URLSearchParams, queueMicrotask: callback => callback(), setInterval: () => 1, clearInterval() {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    window: { location: { href: 'https://example.test/?room=main', search: '?room=main' }, addEventListener() {}, removeEventListener() {} },
    Element: class { constructor(sound = false) { this.sound = sound; } closest(selector) { return selector === '[data-sound-toggle]' && this.sound ? this : null; } },
    require(specifier) {
      if (specifier === 'react') return hooks;
      if (specifier === 'react/jsx-runtime') return { jsx: element, jsxs: element, Fragment: 'Fragment' };
      if (specifier === 'lucide-react') return new Proxy({}, { get: (_object, name) => component(name) });
      if (libraries.has(specifier)) return libraries.get(specifier);
      if (specifier.endsWith('.css')) return {};
      if (specifier.startsWith('./')) {
        if (!modules.has(specifier)) {
          let named = {};
          if (specifier === './ProfilePage') {
            const profileContext = vm.createContext({ exports: {}, require: context.require });
            vm.runInContext(profileJavascript, profileContext);
            named = profileContext.exports;
          }
          modules.set(specifier, { ...named, default: component(specifier.slice(2)) });
        }
        return modules.get(specifier);
      }
      throw new Error(`Unexpected import: ${specifier}`);
    },
  });
  context.window.localStorage = context.localStorage;
  vm.runInContext(javascript, context);
  const render = () => { cursor = 0; effects = []; tree = context.exports.default(); return context.__scope; };
  let scope = render();
  scope.setRoom({ ...INITIAL_ROOM_STATE, status: 'live', snapshot: snapshot(joined), serverOffsetMs: 250, lastSyncedAt: 2000 });
  scope = render();
  const calls = { commands: [], playback: 0, muted: [], movement: [], track: [], offset: [] };
  scope.client.current = { getState: () => context.__scope.room, command: async input => { calls.commands.push(input); return snapshot(input.type !== 'leave'); } };
  scope.audio.current = { requestPlayback() { calls.playback++; }, setMuted(value) { calls.muted.push(value); }, setPlaylistOrder() {}, setTrack(...args) { calls.track.push(args); }, setServerOffset(value) { calls.offset.push(value); } };
  scope.movementClient.current = { offer(sample) { calls.movement.push(sample); } };
  return { render, calls, storage, context,
    get scope() { return context.__scope; }, get tree() { return tree; },
    button(label) { const button = nodes(tree, node => node.type === 'button' && (node.props['aria-label'] === label || textContent(node).includes(label)))[0]; assert.ok(button, `button ${label} exists`); return button; },
    component(name) { return nodes(tree, node => node.type?.displayName === name); },
    effect(fragment) { const match = effects.find(effect => effect.callback.toString().includes(fragment)); assert.ok(match, `effect ${fragment} exists`); return match.callback(); },
  };
}

test('approved 390×844 canvas fits keyboard and safe-area intersections without stretching', () => {
  assert.deepEqual(PHONE_SCREEN, { width: 390, height: 844 });
  for (const [host, visible] of [
    [{ left: 0, top: 0, width: 390, height: 844 }, { left: 0, top: 0, width: 390, height: 330 }],
    [{ left: 0, top: 59, width: 402, height: 781 }, { left: 0, top: 120, width: 402, height: 360 }],
    [{ left: 0, top: 0, width: 844, height: 390 }, undefined],
  ]) {
    const fit = fitVisiblePhoneViewport(host, visible);
    assert.ok(Math.abs(fit.width / fit.height - 195 / 422) < 1e-12);
    const top = host.top + (host.height - fit.height) / 2 + fit.offsetY;
    const left = host.left + (host.width - fit.width) / 2 + fit.offsetX;
    assert.ok(top >= Math.max(host.top, visible?.top ?? host.top) - 1e-9);
    assert.ok(left >= Math.max(host.left, visible?.left ?? host.left) - 1e-9);
    assert.ok(top + fit.height <= Math.min(host.top + host.height, visible ? visible.top + visible.height : Infinity) + 1e-9);
  }
});

test('profile and drawers suspend manual movement while the real scene and shared clock stay connected', () => {
  const h = harness();
  assert.equal(h.scope.movementEnabled, true);
  assert.equal(typeof h.scope.setPage, 'function', 'migration provides local profile navigation');
  const scene = h.component('ClubScene')[0];
  assert.equal(scene.props.participants, h.scope.snapshot.participants);
  assert.equal(scene.props.track, h.scope.snapshot.track);
  assert.equal(scene.props.lightCycle, h.scope.snapshot.lightCycle);
  assert.equal(scene.props.serverOffsetMs, 250);
  h.scope.setPage('profile'); h.render();
  assert.equal(h.scope.movementEnabled, false);
  assert.equal(h.component('ClubScene').length, 1, 'profile does not remount or disconnect the room');
  h.scope.setPage('feed'); h.scope.setSheet('actions'); h.render();
  assert.equal(h.scope.movementEnabled, false);
  h.scope.closeSheet(); h.render();
  assert.equal(h.scope.movementEnabled, true);
  h.effect('setPlaylistOrder');
  assert.deepEqual(h.calls.track[0], [h.scope.snapshot.track.id, 1000, 250]);
  assert.deepEqual(h.calls.offset, [250]);
  assert.equal(ROOM_CAPACITY, 10);
  assert.equal(LIGHT_IDLE_INTERVAL_MS, 60_000);
});

test('movement interruption sends a single stop and never replays a held vector after returning', () => {
  const h = harness();
  h.scope.onJoystickInput({ x: 0.7, y: -0.2 }, true);
  h.scope.onMovementSample({ mode: 'manual', x: 1, z: 2, vx: 0.7, vz: 0.2, reason: 'start' });
  h.scope.setSheet('actions'); h.render(); h.effect('movementControl.current.enabled');
  assert.equal(h.scope.movementControl.current.active, false);
  assert.equal(h.scope.movementControl.current.x, 0);
  assert.equal(h.scope.movementControl.current.y, 0);
  assert.equal(h.calls.movement.filter(sample => sample.reason === 'stop').length, 1);
  assert.equal(h.calls.movement.at(-1).vx, 0); assert.equal(h.calls.movement.at(-1).vz, 0);
  h.scope.stopMovement();
  assert.equal(h.calls.movement.filter(sample => sample.reason === 'stop').length, 1);
  h.scope.closeSheet(); h.render(); h.effect('movementControl.current.enabled');
  assert.equal(h.scope.movementControl.current.active, false);
  assert.equal(h.scope.movementControl.current.x, 0);
});

test('scaled joystick coordinates preserve the same movement vector', () => {
  const expected = stickFromPoint(54, 31, { left: 0, top: 0, width: 88, height: 88 });
  for (const scale of [0.4, 390 / 402, 1, 1.7]) {
    const actual = stickFromPoint(54 * scale + 12, 31 * scale + 19, { left: 12, top: 19, width: 88 * scale, height: 88 * scale });
    assert.ok(Math.abs(actual.x - expected.x) < 1e-12);
    assert.ok(Math.abs(actual.y - expected.y) < 1e-12);
  }
});

test('duplicate join submits issue one command and a late success preserves a newer drawer', async () => {
  const h = harness({ joined: false });
  h.scope.setName('  Dancer  '); h.scope.setSheet('join'); h.render();
  const gate = deferred();
  h.scope.client.current.command = input => { h.calls.commands.push(input); return gate.promise; };
  const first = h.scope.join({ preventDefault() {} });
  const repeated = h.scope.join({ preventDefault() {} });
  assert.equal(h.calls.commands.length, 1);
  assert.equal(h.calls.commands[0].name, 'Dancer');
  if (h.scope.openSheet) h.scope.openSheet('music'); else h.scope.setSheet('music');
  h.render();
  gate.resolve(snapshot()); await Promise.all([first, repeated]); h.render();
  assert.equal(h.scope.sheet, 'music', 'late join completion cannot dismiss a newer drawer');
  assert.equal(h.scope.pending, null);
  assert.equal(h.scope.pendingAction.current, false);
});

test('failed joining stays editable and a retry submits again without clearing session mute', async () => {
  const h = harness({ joined: false });
  h.scope.setName('Dancer'); h.scope.setSheet('join'); h.render();
  let attempts = 0;
  h.scope.client.current.command = async () => { if (++attempts === 1) throw new Error('offline'); return snapshot(); };
  await h.scope.join({ preventDefault() {} }); h.render();
  assert.equal(h.scope.sheet, 'join');
  assert.equal(h.scope.pending, null);
  await h.scope.join({ preventDefault() {} }); h.render();
  assert.equal(attempts, 2);
  assert.equal(h.scope.sheet, null);
  assert.deepEqual(h.calls.muted, [], 'joining retries playback but never unmutes');
});

test('closing and reopening the join drawer gives it a new session immune to the old response', async () => {
  const h = harness({ joined: false });
  h.scope.openSheet('join'); h.scope.setName('Dancer'); h.render();
  const gate = deferred(); h.scope.client.current.command = () => gate.promise;
  const joining = h.scope.join({ preventDefault() {} });
  h.scope.closeSheet(); h.scope.openSheet('join'); h.render();
  gate.resolve(snapshot()); await joining; h.render();
  assert.equal(h.scope.sheet, 'join', 'an older request cannot dismiss a new session of the same drawer');
});

test('navigation handlers stop joystick immediately and clear drawers without losing membership', () => {
  const h = harness();
  const originalSnapshot = h.scope.snapshot;
  h.scope.onJoystickInput({ x: 1, y: 0 }, true);
  h.scope.openSheet('actions');
  assert.equal(h.scope.movementControl.current.active, false, 'opening a drawer stops before the next effect');
  h.render();
  h.scope.onJoystickInput({ x: 0, y: 1 }, true);
  h.scope.selectPage('profile');
  assert.equal(h.scope.movementControl.current.active, false, 'profile navigation stops before the next effect');
  h.render();
  assert.equal(h.scope.sheet, null);
  assert.equal(h.scope.page, 'profile');
  assert.equal(h.scope.snapshot, originalSnapshot);
  h.scope.selectPage('feed'); h.render();
  assert.equal(h.scope.joined, true);
  assert.equal(h.scope.movementControl.current.active, false);
  assert.equal(h.calls.commands.length, 0, 'local navigation never leaves or rejoins the room');
});

test('live likes display the 556 demo baseline and add only the current device preference', () => {
  const h = harness();
  const like = () => nodes(h.tree, node => node.type === 'button' && node.props.className === 'feed-like')[0];
  assert.equal(textContent(like()), '556');
  assert.equal(like().props['aria-pressed'], false);
  assert.match(like().props['aria-label'], /556.*示例基础值/);
  assert.match(like().props.title, /556.*示例基础值/);
  assert.doesNotMatch(like().props['aria-label'], /本机556次赞/);
  like().props.onClick(); h.render();
  assert.equal(textContent(like()), '557');
  assert.equal(like().props['aria-pressed'], true);
  assert.match(like().props['aria-label'], /取消点赞.*557.*556.*示例基础值/);
  like().props.onClick(); h.render();
  assert.equal(textContent(like()), '556');
  assert.equal(like().props['aria-pressed'], false);
  assert.equal(h.calls.commands.length, 0, 'the demo baseline is never written to the room backend');
});

test('rapid likes persist one device preference and survive profile/feed navigation and reload', () => {
  const storage = new Map(); const h = harness({ storage });
  h.scope.toggleLike(); h.scope.toggleLike(); h.scope.toggleLike(); h.render();
  assert.equal(h.scope.liked, true, 'rapid toggles use the latest preference rather than stale render state');
  assert.equal(textContent(nodes(h.tree, node => node.props.className === 'feed-like-count')[0]), '557');
  assert.equal(storage.size, 1);
  assert.equal([...storage.values()][0], '1');
  h.scope.selectPage('profile'); h.render();
  const profile = h.component('ProfilePage')[0];
  assert.ok(profile);
  assert.equal(profile.props.liked, true);
  profile.props.onOpenFeed(); h.render();
  assert.equal(h.scope.page, 'feed');
  assert.equal(h.scope.liked, true);
  const reloaded = harness({ storage }); reloaded.effect('readLiveWorkLiked'); reloaded.render();
  assert.equal(reloaded.scope.liked, true);
  assert.equal(textContent(nodes(reloaded.tree, node => node.props.className === 'feed-like-count')[0]), '557');
  reloaded.scope.toggleLike(); reloaded.render();
  assert.equal([...storage.values()][0], '0');
  assert.equal(reloaded.scope.liked, false);
  assert.equal(textContent(nodes(reloaded.tree, node => node.props.className === 'feed-like-count')[0]), '556');
  assert.equal(h.calls.commands.length, 0, 'local likes never invent shared account or room commands');
});

test('blocked local storage retains this-session likes and gives honest unsaved feedback', () => {
  const h = harness();
  h.context.window.localStorage = { getItem() { throw new Error('private mode'); }, setItem() { throw new Error('private mode'); } };
  assert.doesNotThrow(() => { h.effect('readLiveWorkLiked'); h.render(); h.scope.toggleLike(); h.render(); });
  assert.equal(h.scope.liked, true);
  assert.match(h.scope.toast, /无法保存/);
  h.scope.selectPage('profile'); h.render();
  assert.equal(h.component('ProfilePage')[0].props.liked, true);
});

test('repeated feed tabs preserve the room and return from following without stale drawers', () => {
  const h = harness();
  const original = h.scope.snapshot;
  for (let index = 0; index < 3; index++) {
    h.button('关注').props.onClick(); h.render();
    assert.equal(h.scope.feedTab, 'following');
    assert.equal(h.scope.sheet, 'following');
    h.button('回到推荐舞池').props.onClick(); h.render();
    assert.equal(h.scope.feedTab, 'recommended');
    assert.equal(h.scope.sheet, null);
  }
  assert.equal(h.scope.snapshot, original);
  assert.equal(h.calls.commands.length, 0);
  assert.equal(h.component('ClubScene').length, 1);
});

test('a repeated leave sends one command, stops immediately, and preserves a newer drawer', async () => {
  const h = harness();
  h.scope.showProfile(); h.render();
  const gate = deferred();
  h.scope.client.current.command = input => { h.calls.commands.push(input); return gate.promise; };
  h.scope.onJoystickInput({ x: 1, y: 0 }, true);
  const leave = h.button('退出舞池');
  leave.props.onClick(); leave.props.onClick();
  assert.equal(h.calls.commands.length, 1);
  assert.equal(h.calls.commands[0].type, 'leave');
  assert.equal(h.scope.movementControl.current.active, false);
  h.scope.openSheet('music'); h.render();
  gate.resolve(snapshot(false));
  for (let turn = 0; turn < 5; turn++) await Promise.resolve();
  h.render();
  assert.equal(h.scope.sheet, 'music');
  assert.equal(h.scope.pending, null);
  assert.equal(h.scope.pendingAction.current, false);
});

test('a delayed group action cannot dismiss a reopened actions drawer session', async () => {
  const h = harness();
  h.scope.openSheet('actions'); h.render();
  const gate = deferred();
  h.scope.client.current.command = input => { h.calls.commands.push(input); return gate.promise; };
  h.scope.chooseGroupMove('train');
  assert.equal(h.calls.commands.length, 1);
  h.scope.closeSheet(); h.scope.openSheet('actions'); h.render();
  gate.resolve(snapshot());
  for (let turn = 0; turn < 5; turn++) await Promise.resolve();
  h.render();
  assert.equal(h.scope.sheet, 'actions');
});

test('online count is derived from the server snapshot rather than the reference image', () => {
  const h = harness();
  for (const count of [0, 3, 10]) {
    const current = snapshot(false);
    current.participants = Array.from({ length: count }, (_, index) => ({ ...snapshot().participants[0], id: `person-${index}`, slot: index }));
    h.scope.setRoom({ ...h.scope.room, snapshot: current }); h.render();
    const status = nodes(h.tree, node => node.props.role === 'status' && String(node.props['aria-label']).includes('在线'));
    assert.equal(status.length, 1);
    assert.match(status[0].props['aria-label'], new RegExp(`在线 ${count} 人，最多 10 人`));
    assert.ok(textContent(status[0]).includes(`在线 ${count}`));
    assert.ok(textContent(status[0]).includes('热度 828'), 'heat stays at the requested fixed value as real attendance changes');
    const heat = nodes(status[0], node => textContent(node) === '热度 828')[0];
    assert.match(heat.props.title, /固定演示值/);
  }
});

test('camera dock toggles the real scene locally without opening a drawer or changing the room', () => {
  for (const joined of [false, true]) {
    const h = harness({ joined }); const original = h.scope.snapshot;
    for (const [label, mode, reset] of [['沉浸', 'third-person', 1], ['全景', 'overview', 2]]) {
      h.button(label).props.onClick(); h.render();
      const scene = h.component('ClubScene')[0];
      assert.equal(scene.props.cameraMode, mode);
      assert.equal(scene.props.cameraResetKey, reset);
      assert.equal(scene.props.ownId, original.self.id);
      assert.equal(scene.props.participants, original.participants);
      assert.equal(h.scope.sheet, null);
      assert.equal(nodes(h.tree, node => node.type?.name === 'Sheet').length, 0);
      assert.equal(h.scope.snapshot, original);
      assert.equal(h.scope.movementEnabled, joined, 'a camera tap does not suspend the interaction dock');
    }
    assert.equal(h.calls.commands.length, 0, 'view choice stays local');
  }
});

test('the outer sound icon directly mutes and unmutes without opening a drawer or changing shared state', () => {
  for (const joined of [false, true]) {
    const h = harness({ joined }); const original = h.scope.snapshot;
    const soundButton = () => nodes(h.tree, node => node.type === 'button' && node.props.className?.includes('sound-control'))[0];
    // Audio state notifications are synchronous; render after each discrete click.
    h.scope.audio.current.setMuted = value => {
      h.calls.muted.push(value); h.scope.setMuted(value); h.scope.setSoundPlaying(!value);
    };
    h.scope.setSoundEnabled(true); h.scope.setSoundPlaying(true); h.render();
    for (const muted of [true, false, true, false]) {
      const button = soundButton();
      assert.equal(button.props['data-sound-toggle'], true);
      assert.equal(button.props['aria-pressed'], muted);
      assert.equal(button.props.children.type.displayName, muted ? 'Volume2' : 'VolumeX');
      assert.match(button.props['aria-label'], muted ? /静音/ : /开启声音/);
      button.props.onClick(); h.render();
      assert.equal(h.scope.muted, muted);
      assert.equal(h.scope.sheet, null);
      assert.equal(nodes(h.tree, node => node.type?.name === 'Sheet').length, 0);
      assert.equal(h.scope.snapshot, original);
      assert.equal(h.scope.movementEnabled, joined);
    }
    assert.deepEqual(h.calls.muted, [true, false, true, false]);
    assert.equal(h.calls.playback, 2, 'each unmute requests playback immediately; mute does not');
    assert.equal(h.calls.commands.length, 0, 'sound only affects this device');
  }
});

test('the direct sound control retries blocked or failed playback and can mute while music loads', () => {
  for (const status of [
    { enabled: false, gesture: true, error: null, loading: false, muted: false, nextMuted: false, label: /开启声音/ },
    { enabled: true, gesture: true, error: null, loading: false, muted: false, nextMuted: false, label: /开启声音/ },
    { enabled: true, gesture: false, error: 'failed', loading: false, muted: false, nextMuted: false, label: /重试声音/ },
    { enabled: true, gesture: false, error: null, loading: true, muted: false, nextMuted: true, label: /静音/ },
    { enabled: false, gesture: false, error: null, loading: false, muted: true, nextMuted: false, label: /开启声音/ },
  ]) {
    const h = harness();
    h.scope.setSoundEnabled(status.enabled); h.scope.setSoundNeedsGesture(status.gesture);
    h.scope.setSoundError(status.error); h.scope.setSoundLoading(status.loading); h.scope.setMuted(status.muted); h.render();
    const button = nodes(h.tree, node => node.type === 'button' && node.props.className?.includes('sound-control'))[0];
    assert.equal(button.props['aria-pressed'], false, 'loading or blocked playback never claims audible sound');
    assert.equal(button.props.children.type.displayName, 'VolumeX');
    assert.match(button.props['aria-label'], status.label);
    button.props.onClick();
    assert.deepEqual(h.calls.muted, [status.nextMuted]);
    assert.equal(h.calls.playback, status.nextMuted ? 0 : 1, 'unmute/retry stays synchronous in the gesture stack');
    h.render();
    assert.equal(h.scope.sheet, null);
  }
});

test('music and settings no longer expose the removed local-volume module', () => {
  const h = harness();
  for (const panel of ['music', 'settings']) {
    h.scope.openSheet(panel); h.render();
    assert.doesNotMatch(textContent(h.tree), /本机音量|声音设置/);
    assert.equal(nodes(h.tree, node => node.type === 'input' && node.props.type === 'range').length, 0);
  }
  h.scope.openSheet('music'); h.render();
  assert.equal(nodes(h.tree, node => node.type === 'button' && node.props.className?.includes('track-option')).length, MUSIC_CATALOG.length);
});

test('every migrated drawer opens and dismisses without mutating the live room', () => {
  const h = harness(); const original = h.scope.snapshot;
  for (const panel of ['actions', 'join', 'music', 'lights', 'invite', 'notifications', 'search', 'create', 'following', 'settings', 'edit-profile', 'credits', 'drafts', 'media', 'about']) {
    h.scope.openSheet(panel); h.render();
    assert.equal(h.scope.sheet, panel);
    const dialogs = nodes(h.tree, node => node.type?.name === 'Sheet');
    assert.equal(dialogs.length, 1, `${panel} produces exactly one dialog`);
    assert.equal(typeof dialogs[0].props.onClose, 'function');
    dialogs[0].props.onClose(); h.render();
    assert.equal(h.scope.sheet, null, `${panel} dismisses completely`);
    assert.equal(nodes(h.tree, node => node.type?.name === 'Sheet').length, 0);
    assert.equal(h.scope.snapshot, original);
  }
  assert.equal(h.calls.commands.length, 0);
});

test('one combined grid retains all eight personal actions and five spectator-enabled group routines', () => {
  for (const joined of [false, true]) {
    const h = harness({ joined }); h.scope.openSheet('actions'); h.render();
    const grid = nodes(h.tree, node => node.props['aria-label'] === '个人动作与表情')[0];
    assert.ok(grid);
    const personal = nodes(grid, node => node.type === 'button');
    assert.equal(personal.length, 8);
    assert.ok(personal.every(button => button.props.disabled === !joined));
    const group = nodes(h.tree, node => node.props['aria-labelledby'] === 'group-actions-title')[0];
    const routines = nodes(group, node => node.type === 'button');
    assert.equal(routines.length, 5);
    assert.ok(routines.every(button => button.props.disabled === false));
  }
});

test('the scoped joined layout targets its actual root and fits all dock controls in 366 pixels', () => {
  const css = readFileSync(new URL('../components/FeedInterface.css', import.meta.url), 'utf8').replace(/\s+/g, '');
  const h = harness();
  const root = nodes(h.tree, node => node.type === 'section' && node.props.className?.includes('feed-v020'))[0];
  assert.ok(root.props.className.split(/\s+/).includes('joined'));
  assert.match(css, /\.feed-v020\.joined\.joined-avatar\{display:block/);
  assert.match(css, /\.feed-v020\.joined\.join-control\{width:80px/);
  assert.match(css, /\.feed-v020\.joined\.dock-control\{width:66px/);
  assert.match(css, /\.feed-v020\.joined\.interaction-dock\{gap:6px/);
  assert.equal(64 + 80 + 3 * 66 + 4 * 6, 390 - 2 * 12);
});

test('idle actions drawer has only the approved grids and concise group heading', () => {
  const h = harness(); h.scope.openSheet('actions'); h.render();
  const dialog = nodes(h.tree, node => node.type?.name === 'Sheet')[0];
  const heading = nodes(dialog, node => node.props.id === 'group-actions-title')[0];
  assert.equal(textContent(heading).trim(), '一起玩');
  assert.equal(nodes(dialog, node => node.props.className?.includes('action-feedback')).length, 0, 'idle state adds no explanatory paragraph');
  assert.equal(nodes(dialog, node => node.type === 'button' && textContent(node).includes('恢复自动漫游')).length, 0, 'roaming belongs in avatar settings, outside the compact actions grid');
});

test('actions drawer still announces real pending and cooldown states', () => {
  const h = harness(); h.scope.openSheet('actions');
  for (const pending of [{ type: 'group-action', kind: 'train' }, null]) {
    h.scope.setPending(pending); h.scope.setGroupCooldown(pending ? 0 : Date.now() + 1000); h.render();
    const feedback = nodes(h.tree, node => node.props.className?.includes('action-feedback'));
    assert.equal(feedback.length, 1);
    assert.equal(feedback[0].props.role, 'status');
    assert.match(textContent(feedback[0]), pending ? /正在邀请/ : /稍后再发起/);
  }
  h.scope.setGroupCooldown(0);
  const current = snapshot();
  current.groupAction = { id: 'group', kind: 'train', version: 2, startsAt: 4000, endsAt: 8000, beatMs: 500, sourceClockBySlot: Array(10).fill(0) };
  h.scope.setRoom({ ...h.scope.room, snapshot: current });
  for (const [serverNow, phase, message] of [[3500, 'countdown', /秒后一起开始/], [4500, 'active', /进行中/], [9000, 'cooldown', /秒后可再次发起/]]) {
    h.scope.setActionClientNow(serverNow - 250); h.render();
    assert.equal(h.scope.groupFeedback.phase, phase);
    assert.match(textContent(nodes(h.tree, node => node.props.className?.includes('action-feedback'))[0]), message);
  }
  h.scope.setActionClientNow(13_000 - 250); h.render();
  assert.equal(h.scope.groupFeedback.phase, 'idle');
  assert.equal(nodes(h.tree, node => node.props.className?.includes('action-feedback')).length, 0, 'expired group feedback disappears');
});

test('joined avatar drawer preserves one-shot restore roaming without changing release-to-park semantics', () => {
  const h = harness(); h.scope.selectPage('profile'); h.render(); h.scope.showProfile(); h.render();
  const dialog = nodes(h.tree, node => node.type?.name === 'Sheet')[0];
  const restore = nodes(dialog, node => node.type === 'button' && textContent(node).includes('恢复自动漫游'))[0];
  assert.ok(restore, 'joined avatar settings retain the real automatic roaming control');
  const before = h.scope.movementControl.current.autoRequest;
  restore.props.onClick(); h.render();
  assert.equal(h.scope.sheet, null);
  assert.equal(h.scope.page, 'feed', 'restoring roaming from profile immediately returns to the live stage');
  h.effect('movementControl.current.enabled');
  assert.equal(h.scope.movementControl.current.autoRequest, before + 1);
  assert.equal(h.scope.pendingAutoRequest.current, false);
  h.effect('movementControl.current.enabled');
  assert.equal(h.scope.movementControl.current.autoRequest, before + 1, 'rendering again never repeats the request');
  assert.equal(h.calls.commands.length, 0, 'movement auto-resume does not send an ordinary room command');
});

test('caption, settings and about display the accepted v0.3.1 release', () => {
  const h = harness();
  const caption = nodes(h.tree, node => node.props.className === 'demo-caption')[0];
  assert.match(textContent(caption), /^v0\.3\.1/);
  h.scope.openSheet('settings'); h.render();
  const versionRow = nodes(h.tree, node => node.props.className === 'list-row' && textContent(node).startsWith('版本'))[0];
  assert.equal(textContent(versionRow), '版本v0.3.1');
  h.scope.openSheet('about'); h.render();
  const versionNote = nodes(h.tree, node => node.props.className === 'privacy-note')[0];
  assert.equal(textContent(versionNote), 'v0.3.1 · 多人实时舞池');
});
