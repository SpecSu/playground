import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
const path = new URL('../components/fishing/FishingProfilePage.tsx', import.meta.url);
function load(useState) {
  assert.ok(existsSync(path), 'runtime ProfilePage component must exist');
  const source = readFileSync(path, 'utf8').replace(/import '\.\.\/ProfilePage\.css';/, '');
  const output = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX, target:ts.ScriptTarget.ES2022}}).outputText;
  const context = {
    exports: {},
    require: name => name === 'react' && useState ? {...require('react'), useState} : require(name),
  };
  vm.runInNewContext(output, context);
  return context.exports;
}
test('works retain the approved nine-tile order with drafts followed by live room', () => {
  const {getProfileMedia} = load();
  const media = getProfileMedia('works', false);
  assert.equal(media.length, 9);
  assert.equal(media[0].kind, 'drafts');
  assert.equal(media[1].kind, 'live');
  assert.equal(media[1].src, '/yacht-preview.png');
  assert.equal(media[2].src, '/feed-ui/archive-placeholder.svg');
});
test('likes include the live work if and only if the live liked state is true', () => {
  const {getProfileMedia} = load();
  assert.equal(getProfileMedia('likes', false).filter(item => item.kind === 'live').length, 0);
  assert.equal(getProfileMedia('likes', true).filter(item => item.kind === 'live').length, 1);
  assert.equal(getProfileMedia('likes', true)[0].kind, 'live');
  assert.equal(getProfileMedia('likes', false).every(item => item.kind === 'sample'), true);
});
test('appearance and likes tabs show distinct reference sample media', () => {
  const {getProfileMedia} = load();
  const appearances = getProfileMedia('appearances', false);
  const likes = getProfileMedia('likes', false);
  assert.ok(appearances.length > 0 && likes.length > 0);
  assert.notDeepEqual(appearances.map(item => item.id), likes.map(item => item.id));
  assert.equal(appearances.every(item => item.kind === 'sample'), true);
});
test('profile renders the approved accessible controls and complete assets', () => {
  const {default: ProfilePage} = load();
  const html = renderToStaticMarkup(createElement(ProfilePage, {liked:false, onOpenFeed(){},onOpenPanel(){},onManageAvatar(){}}));
  assert.match(html, /class="app-page profile-page"/);
  for (const label of ['作品 161', '我的出镜', '点赞', '管理分身', '邀请好友']) assert.ok(html.includes(label), label);
  assert.equal((html.match(/role="tab"/g) || []).length, 3);
  assert.match(html, /role="tabpanel"/);
  assert.match(html, /aria-label="进入出海钓鱼"/);
  assert.match(html, /aria-label="预览示例作品：骑摩托车的两个人"/);
  for (const [, asset] of html.matchAll(/src="([^"]+)"/g)) {
    assert.ok(existsSync(new URL(`../public${asset}`, import.meta.url)), `asset must exist: ${asset}`);
  }
});
test('profile styles retain approved grid geometry and stay scoped', () => {
  load();
  const css = readFileSync(new URL('../components/ProfilePage.css', import.meta.url), 'utf8');
  assert.match(css, /padding-top: 376px/);
  assert.match(css, /height: 172\.444px/);
  assert.match(css, /top: 328px/);
  for (const block of css.split('}')) {
    const selector = block.split('{')[0].trim();
    if (selector && !selector.startsWith('/*')) assert.ok(selector.startsWith('.feed-v020 .profile-page'), selector);
  }
});

// Execute the production component and its returned event closures without a
// browser. Only the useState host is supplied; JSX, media resolution, handlers,
// callback routing, and rendered accessibility props are production code.
function componentHarness(initialProps = {}) {
  const values = [];
  let cursor = 0;
  const useState = initial => {
    const index = cursor++;
    if (!(index in values)) values[index] = initial;
    return [values[index], value => { values[index] = typeof value === 'function' ? value(values[index]) : value; }];
  };
  const {default: ProfilePage} = load(useState);
  const calls = [];
  let props = {
    liked: false,
    onOpenFeed: () => calls.push(['feed']),
    onOpenPanel: (...args) => calls.push(['panel', ...args]),
    onManageAvatar: () => calls.push(['avatar']),
    ...initialProps,
  };
  let tree;
  function render(nextProps = {}) {
    props = {...props, ...nextProps};
    cursor = 0;
    tree = ProfilePage(props);
  }
  function elements(predicate, node = tree) {
    if (Array.isArray(node)) return node.flatMap(child => elements(predicate, child));
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...elements(predicate, node.props?.children ?? null)];
  }
  const tabs = () => elements(node => node.props?.role === 'tab');
  const media = () => elements(node => node.type === 'button' && node.props?.className?.split(' ').includes('media-tile'));
  const select = id => {
    const tab = tabs().find(node => node.props.id === `profile-tab-${id}`);
    assert.ok(tab, `missing tab: ${id}`);
    tab.props.onClick();
    render();
  };
  render();
  return {calls, render, elements, tabs, media, select};
}

test('production profile controls route to the intended drawers and avatar manager', () => {
  const app = componentHarness();
  for (const className of ['credit-pill', 'header-icon invite', 'header-icon bell', 'header-icon settings', 'profile-avatar']) {
    const button = app.elements(node => node.type === 'button' && node.props.className === className)[0];
    assert.ok(button, className);
    button.props.onClick();
  }
  for (const containerClass of ['profile-stats', 'profile-actions']) {
    const container = app.elements(node => node.props?.className === containerClass)[0];
    for (const button of app.elements(node => node.type === 'button', container)) button.props.onClick();
  }
  assert.deepEqual(app.calls, [
    ['panel', 'credits'], ['panel', 'invite'], ['panel', 'notifications'], ['panel', 'settings'], ['panel', 'edit-profile'],
    ['panel', 'media', '粉丝列表'], ['panel', 'media', '关注列表'], ['panel', 'media', '获赞列表'], ['panel', 'media', '跟拍列表'],
    ['avatar'], ['panel', 'invite'],
  ]);
});

test('production media closures open drafts, navigate live work, and identify every sample', () => {
  const app = componentHarness();
  const tiles = app.media();
  assert.equal(tiles.length, 9);
  for (const tile of tiles) tile.props.onClick();
  assert.deepEqual(app.calls, [
    ['panel', 'drafts'], ['feed'],
    ['panel', 'media', '骑摩托车的两个人'], ['panel', 'media', '躺在床上喝咖啡'],
    ['panel', 'media', '坐在沙发上的人物'], ['panel', 'media', '两人站在一起交谈'],
    ['panel', 'media', '街头场景'], ['panel', 'media', '街头人物合影'], ['panel', 'media', '戴帽子的男子'],
  ]);
});

test('production tab clicks update displayed media and live likes follow subsequent prop changes', () => {
  const app = componentHarness();
  app.select('appearances');
  const appearanceMedia = app.media().map(tile => tile.props['aria-label']).join('|');
  assert.equal(app.media().length, 6);
  app.select('likes');
  assert.notEqual(app.media().map(tile => tile.props['aria-label']).join('|'), appearanceMedia);
  assert.equal(app.media().some(tile => tile.props.className.includes('live-tile')), false);
  assert.equal(app.media().every(tile => tile.props['aria-label'].includes('示例作品')), true);
  app.render({liked: true});
  assert.equal(app.media().length, 7);
  assert.match(app.media()[0].props.className, /live-tile/);
  app.media()[0].props.onClick();
  assert.deepEqual(app.calls, [['feed']]);
  app.render({liked: false});
  assert.equal(app.media().length, 6);
  assert.equal(app.media().some(tile => tile.props.className.includes('live-tile')), false);
  assert.equal(app.tabs().filter(tab => tab.props['aria-selected']).length, 1);
  assert.equal(app.tabs().find(tab => tab.props['aria-selected']).props.id, 'profile-tab-likes');
});

test('production keyboard tab handler wraps, moves focus, and updates accessible selection', () => {
  const app = componentHarness();
  const steps = [
    ['ArrowLeft', 'likes'], ['Home', 'works'], ['ArrowRight', 'appearances'],
    ['ArrowRight', 'likes'], ['ArrowRight', 'works'], ['End', 'likes'],
  ];
  for (const [key, expected] of steps) {
    const tabs = app.tabs();
    const active = tabs.find(tab => tab.props['aria-selected']);
    let prevented = false;
    let focused = null;
    const event = {
      key,
      preventDefault() { prevented = true; },
      currentTarget: {parentElement: {querySelectorAll(selector) {
        assert.equal(selector, '[role="tab"]');
        return tabs.map(tab => ({focus() { focused = tab.props.id; }}));
      }}},
    };
    active.props.onKeyDown(event);
    app.render();
    assert.equal(prevented, true, `${key} should prevent page scrolling`);
    assert.equal(focused, `profile-tab-${expected}`);
    assert.equal(app.tabs().find(tab => tab.props['aria-selected']).props.id, `profile-tab-${expected}`);
    assert.equal(app.tabs().filter(tab => tab.props.tabIndex === 0).length, 1);
    assert.equal(app.elements(node => node.props?.role === 'tabpanel')[0].props['aria-labelledby'], `profile-tab-${expected}`);
  }
  app.tabs().find(tab => tab.props['aria-selected']).props.onKeyDown({key: 'Tab', preventDefault() { assert.fail('Tab must retain normal focus behavior'); }});
  app.render();
  assert.equal(app.tabs().find(tab => tab.props['aria-selected']).props.id, 'profile-tab-likes');
});
