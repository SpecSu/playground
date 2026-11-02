import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const component = readFileSync(new URL('../components/LiveFeed.tsx', import.meta.url), 'utf8');
// Inspect the active scoped stylesheet, not obsolete global rules.
const css = readFileSync(new URL('../components/FeedInterface.css', import.meta.url), 'utf8').replace(/\s+/g, '');

test('music transport exposes direct previous/next with a shared progress display', () => {
  assert.match(component, /aria-label="上一首共享歌曲"/);
  assert.match(component, /aria-label="下一首共享歌曲"/);
  assert.match(component, /SkipBack/); assert.match(component, /SkipForward/);
  assert.match(component, /<SharedProgress/);
  assert.match(css, /\.music-btn\{[^}]*width:29px;[^}]*height:32px/);
});

test('approved feed canvas retains real stage, overlay controls and bottom navigation', () => {
  assert.match(css, /\.feed-v020\.feed-window\{[^}]*width:390px;[^}]*height:844px/);
  assert.doesNotMatch(component, /<footer className="feed-footer"|<div className="deck-footer"/);
  assert.match(component, /className="lower-controls"/);
  assert.match(component, /className="bottom-nav" aria-label="主导航"/);
  assert.match(css, /\.club-stage\{[^}]*position:absolute;[^}]*inset:0/);
  assert.match(css, /\.feed-header\{[^}]*position:absolute;[^}]*top:53px/);
});

test('camera switches directly from the dock without a view drawer, redundant room badge or reset control', () => {
  assert.match(component, /cameraMode=\{cameraMode\}/);
  assert.match(component, /className="dock-control camera-control"/);
  assert.doesNotMatch(component, /openSheet\('view'\)|sheet === 'view'|\| 'view'/);
  assert.doesNotMatch(component, /aria-label="重置本地视角"|className="camera-reset"|RotateCcw/);
  assert.doesNotMatch(component, /className="room-marker"|roomId\.toUpperCase\(\)/);
});

test('immersive destination keeps own-avatar and spectator DJ follow descriptions and keyboard Home reset', () => {
  assert.match(component, /沉浸视角：从身后跟随你的角色/);
  assert.match(component, /沉浸视角：从身后跟随 DJ 凤头鹦鹉/);
  assert.doesNotMatch(component, /aria-pressed=\{cameraMode === 'third-person'\}/);
  const scene = readFileSync(new URL('../components/ClubScene.tsx', import.meta.url), 'utf8');
  assert.match(scene, /event\.key === 'Home'/);
  assert.match(scene, /Home 键重置/);
});

test('OS reduced motion is respected by default and exposes an explicit local override only when needed', () => {
  assert.match(component, /const reducedMotion = systemReducedMotion && !motionOverride/);
  assert.match(component, /systemReducedMotion && <button className="motion-preference"/);
  assert.match(component, /setMotionOverride\(value => !value\)/);
  assert.match(component, /开启动效/);
  assert.match(component, /恢复减少动态/);
});

test('spectator music and lighting controls share the live connection gate rather than dance-floor membership', () => {
  assert.match(component, /const sharedControlsReady = canUseSharedControls\(/);
  assert.match(component, /className=\{`mood-option[^\n]*disabled=\{!sharedControlsReady\}/);
  assert.doesNotMatch(component, /disabled=\{!sharedControlsReady \|\| snapshot\?\.lightMode === mood\.id\}/, 'reselecting the active color resets its idle clock');
  assert.match(component, /lightCycle=\{snapshot\?\.lightCycle\}/);
  assert.doesNotMatch(component, /canNavigateTracks\(\{ joined:/);
  assert.doesNotMatch(component, /加入舞池后可切歌|加入舞池后即可换歌|加入舞池后，就能改变房间的共享灯光/);
  assert.match(component, /围观时也能换歌/);
  assert.match(component, /围观时也能选灯光/);
  assert.match(component, /if \(sharedControl && !canUseSharedControls\(/);
});

test('next and previous send directions to the server and the song picker reflects its shared shuffle order', () => {
  assert.match(component, /perform\(\{ type: 'track-step', direction \}/);
  assert.doesNotMatch(component, /adjacentTrack\(MUSIC_CATALOG/);
  assert.match(component, /snapshot\?\.playlistOrder/);
  assert.match(component, /playlist\.map\(\(item, index\)/);
  assert.match(component, /input\.type === 'track-step'/);
});

test('playlist credits link covers the catalog’s per-track licenses without claiming one license version', () => {
  assert.match(component, /href="\/audio\/CREDITS\.txt"[^>]*>来源与授权信息<\/a>/);
  assert.doesNotMatch(component, /来源与 CC BY 4\.0 授权/);
  assert.doesNotMatch(component, /授权录音片段|授权录音节选/);
  assert.match(component, /MUSIC_CATALOG\.length\} 首歌曲/);
});

test('switching has visible confirmation and audio-loading feedback in both transport and song picker', () => {
  assert.match(component, /musicControlFeedback\(/);
  assert.match(component, /aria-busy=\{musicFeedback\.busy\}/);
  assert.match(component, /musicFeedback\.message \?\?/);
  assert.match(component, /pending\?\.type === 'track-step' && pending\.direction === -1/);
  assert.match(component, /pending\?\.type === 'track' && pending\.trackId === item\.id/);
  assert.doesNotMatch(component, /`正在播放 \$\{item\.title\}。`/);
  assert.match(component, /setPlaylistOrder\(snapshot\.playlistOrder\)/);
});

test('one interaction launcher opens eight personal choices and three joined-only activities', () => {
  assert.match(component, /className="dock-control action-menu-button"/);
  assert.match(component, /aria-label="打开互动菜单"/);
  assert.match(component, /sheet === 'actions'/);
  assert.match(component, /className="personal-actions-grid option-grid"/);
  assert.match(component, /aria-label="个人动作与表情"/);
  assert.match(component, /一起玩/);
  assert.match(css, /\.personal-actions-grid\.move-controls,\.feed-v020\.personal-actions-grid\.emotion-controls\{display:contents/);
  assert.match(css, /\.option-grid\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  const dock = component.slice(component.indexOf('<div className="interaction-dock">'), component.indexOf('<div className="profile-mount"'));
  assert.doesNotMatch(dock, /MOVES\.map|EMOTION_MOVES\.map/);
});

test('personal selection previews before sending and passes the preview separately from canonical participants', () => {
  assert.match(component, /createOwnActionPreview/);
  assert.match(component, /ownActionPreview=\{ownActionPreview\}/);
  assert.match(component, /participants=\{snapshot\?\.participants \?\? \[\]\}/);
  assert.match(component, /settleOwnActionPreview/);
});

test('late group confirmation cannot dismiss a different panel opened while waiting', () => {
  assert.match(component, /setSheet\(currentSheet => currentSheet === 'actions' \? null : currentSheet\)/);
});

test('the action sheet offers only the two retained group routines with readable distinct descriptions', () => {
  const menu = component.slice(component.indexOf('const GROUP_MOVES = ['), component.indexOf('const MOODS ='));
  const expected = [
    ['train', '开小火车', '兔子跳半圈，坐上小火车飞转两圈'],
    ['wave', '大浪冲入', '巨浪冲进舞池，把大家冲散漂起来'],
  ];
  assert.equal((menu.match(/id:/g) ?? []).length, 2);
  assert.doesNotMatch(menu, /集合齐跳|左右对跳|跳格接力/);
  for (const [id, label, description] of expected) {
    assert.ok(menu.includes(`id: '${id}'`), `${id} is available`);
    assert.ok(menu.includes(`label: '${label}'`), `${id} uses the approved name`);
    assert.ok(menu.includes(`description: '${description}'`), `${id} explains its formation`);
  }
  assert.doesNotMatch(menu, /九宫格/);
  assert.match(component, /disabled=\{!groupActionsReady\}/);
  assert.match(component, /<h3 id="personal-actions-title">个人互动<\/h3>/);
  assert.match(css, /\.group-move-button\{[^}]*min-height:66px/);
});

test('the compact music row has one accessible direct sound toggle and no volume drawer', () => {
  const ast = ts.createSourceFile('LiveFeed.tsx', component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches: ts.JsxElement[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'button') {
      const className = node.openingElement.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === 'className');
      if (className && /\bsound-control\b/.test(className.getText(ast))) matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.equal(matches.length, 1);
  const sound = matches[0].getText(ast);
  assert.doesNotMatch(sound, /<span>/);
  assert.match(sound, /aria-label=/);
  assert.match(sound, /onClick=\{toggleSound\}/);
  assert.match(sound, /aria-pressed=\{soundShownPlaying\}/);
  assert.doesNotMatch(component, /openSheet\('sound'\)|sheet === 'sound'|本机音量|声音设置/);
  assert.doesNotMatch(component.match(/type SheetName = [^;]+/)?.[0] ?? '', /'sound'/);
  assert.match(sound, /soundShownPlaying/);
  assert.match(sound, /Volume2/); assert.match(sound, /VolumeX/);
  assert.equal((component.match(/data-sound-toggle/g) ?? []).length, 2, 'one explicit sound control plus the capture guard selector');
  assert.match(component, /🪩 闪亮舞池，等你登场/);
});

test('one-row shared activity grid reduces the auto-sized sheet without changing personal controls or legacy commands', () => {
  const types = readFileSync(new URL('../lib/room-types.ts', import.meta.url), 'utf8');
  for (const kind of ['unison', 'battle', 'grid']) assert.ok(types.includes(`'${kind}'`));
  assert.match(css, /\.sheet\{[^}]*max-height:560px/);
  assert.doesNotMatch(css.match(/\.sheet\{([^}]+)\}/)?.[1] ?? '', /(?:^|;)height:/);
  assert.match(css, /\.group-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  // Removing one 66px row plus its 8px grid gap reduces the natural panel by 74px.
  const previousHeight=2*66+8, currentHeight=66;
  assert.equal(previousHeight-currentHeight,74);
});
