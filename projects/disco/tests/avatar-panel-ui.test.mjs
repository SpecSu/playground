import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import postcss from 'postcss';
import { AvatarRenderGate, withAvatarLoadTimeout } from '../lib/club-avatar-submission.ts';
import { CLUB_AVATAR_PICKER_OPTIONS } from '../lib/club-avatar-catalog.ts';

// Run the actual form JSX and handler while replacing only network/audio/storage
// boundaries. Style contracts cover the fixed header/footer and independent list.
const source = readFileSync(new URL('../components/LiveFeed.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('LiveFeed.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let formJsx; let joinHandler;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'form' &&
      /className="join-form"/.test(node.openingElement.attributes.getText(ast))) formJsx = node.getText(ast);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'join') joinHandler = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const javascript = ts.transpileModule(`const join = ${joinHandler}; globalThis.form = (${formJsx});`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
function createForm({ name = '', joined = false, pending = null, ready = true, preload = Promise.resolve(), autoRender = true } = {}) {
  const observed = { toast: '', focused: false, prevented: false, commands: [], audioRequests: 0, saved: null, sheet: 'join' };
  const nicknameInput = { current: { focus: () => { observed.focused = true; } } };
  const icon = () => React.createElement('svg');
  const avatarGate = { current: new AvatarRenderGate() };
  const context = vm.createContext({
    avatarGate, pendingAction: { current: false }, avatarSubmitting: false,
    prewarmClubAvatars: () => preload, withAvatarLoadTimeout,
    setAvatarSubmitting: value => { observed.busy = value; },
    setAvatarRenderRequest: request => { observed.request = request; if (request && autoRender) avatarGate.current.report({ ...request, status: 'ready' }); },
    React, name, joined, pending, ready, full: false, count: 1, capacity: 10, profilePending: Boolean(pending),
    preset: CLUB_AVATAR_PICKER_OPTIONS[0].id, CLUB_AVATAR_PICKER_OPTIONS, nicknameInput,
    setName() {}, setPreset() {}, setPage() {}, setCameraMode() {}, setCameraResetKey() {}, setToast: value => { observed.toast = value; },
    setSheet: updater => { observed.sheet = updater(observed.sheet); }, sheetSession: { current: 1 },
    audio: { current: { requestPlayback: () => { observed.audioRequests++; } } },
    perform: async command => { observed.commands.push(JSON.parse(JSON.stringify(command))); return { self: { id: 'me', role: 'participant' } }; },
    localStorage: { setItem: (key, value) => { observed.saved = { key, value }; } },
    groupFeedback: { personalBlocked: false }, LoaderCircle: icon, PersonStanding: icon, LogOut: icon, X: icon,
  });
  vm.runInContext(javascript, context);
  return { ...context, observed, submit: () => context.form.props.onSubmit({ preventDefault: () => { observed.prevented = true; } }) };
}
function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
const hasClass = className => node => node.props?.className?.split(' ').includes(className);

for (const name of ['', '   ', '\u3000']) {
  for (const joined of [false, true]) {
    test(`${joined ? 'save' : 'join'} with ${JSON.stringify(name)} explains the missing nickname and focuses it`, async () => {
      const form = createForm({ name, joined });
      await form.submit();
      assert.equal(form.observed.prevented, true);
      assert.match(form.observed.toast, /输入昵称/);
      assert.equal(form.observed.focused, true);
      assert.equal(form.observed.commands.length, 0);
      assert.equal(form.observed.sheet, 'join');
    });
  }
}

test('the real nickname field lets blank submissions reach the custom validation and owns the focus ref', () => {
  const form = createForm();
  const input = nodes(form.form, node => node.type === 'input' && node.props.id === 'nickname')[0];
  const button = nodes(form.form, hasClass('join-button'))[0];
  assert.equal(button.props.disabled, false);
  assert.notEqual(input.props.required, true, 'native required validation would prevent the toast handler');
  assert.equal(input.props['aria-required'], 'true');
  assert.equal(input.props.ref, form.nicknameInput);
  assert.equal(input.props.maxLength, 24);
  assert.equal(input.props.pattern, '[^<>]+');
});

for (const joined of [false, true]) {
  test(`${joined ? 'save' : 'join'} still submits a trimmed valid name and chosen avatar`, async () => {
    const form = createForm({ name: '  小舞者  ', joined });
    await form.submit();
    assert.deepEqual(form.observed.commands, [{ type: joined ? 'profile' : 'join', name: '小舞者', preset: CLUB_AVATAR_PICKER_OPTIONS[0].id }]);
    assert.equal(form.observed.audioRequests, 1);
    assert.equal(form.observed.sheet, null);
    assert.equal(form.observed.focused, false);
    assert.equal(JSON.parse(form.observed.saved.value).name, '小舞者');
  });
}

test('nickname and confirmation stay outside the independently scrolling list in both join and edit mode', () => {
  for (const joined of [false, true]) {
    const { form } = createForm({ joined });
    const scroll = nodes(form, hasClass('join-form-scroll'))[0];
    const footer = nodes(form, hasClass('join-form-footer'))[0];
    assert.ok(scroll, 'the twelve avatars need a separate scroll region');
    assert.ok(footer, 'the submit button needs a non-scrolling footer');
    assert.equal(nodes(scroll, hasClass('avatar-option')).length, 12);
    assert.equal(nodes(scroll, node => node.props.id === 'nickname').length, 0);
    assert.equal(nodes(scroll, hasClass('join-button')).length, 0);
    assert.equal(nodes(footer, hasClass('join-button')).length, 1);
    assert.equal(nodes(scroll, hasClass('leave-button')).length, Number(joined));
  }
});

const css = postcss.parse(readFileSync(new URL('../components/FeedInterface.css', import.meta.url), 'utf8'));
function style(selector) {
  const result = {};
  css.walkRules(rule => { if (rule.selectors.includes(selector)) rule.walkDecls(decl => { result[decl.prop] = decl.value; }); });
  return result;
}
test('avatar panel constrains its scroll body while the input and safe-area footer cannot shrink', () => {
  const sheet = style('.feed-v020 .sheet.avatar-sheet');
  assert.equal(sheet.display, 'flex');
  assert.equal(sheet['flex-direction'], 'column');
  assert.equal(sheet.overflow, 'hidden');
  assert.equal(sheet.height, '560px');
  assert.match(sheet['max-height'], /--phone-visible-height/);
  const form = style('.feed-v020 .avatar-sheet .join-form');
  assert.equal(form.display, 'flex');
  assert.equal(form['min-height'], '0');
  assert.equal(form['flex-direction'], 'column');
  const scroll = style('.feed-v020 .join-form-scroll');
  assert.equal(scroll['overflow-y'], 'auto');
  assert.equal(scroll['min-height'], '0');
  assert.equal(scroll.flex, '1 1 auto');
  assert.equal(scroll['overscroll-behavior-y'], 'contain');
  assert.equal(style('.feed-v020 .join-form-field').flex, 'none');
  const footer = style('.feed-v020 .join-form-footer');
  assert.equal(footer.flex, 'none');
  assert.match(footer.padding, /safe-area-inset-bottom/);
  assert.equal(style('.feed-v020 .join-form-footer .join-button')['margin-top'], '0');
  assert.equal(style('.phone-viewport[data-keyboard-held] .feed-v020 .sheet.avatar-sheet').overflow, 'hidden');
  assert.equal(style('.phone-viewport[data-keyboard-held] .feed-v020 .avatar-sheet .sheet-handle').display, 'none');
  assert.equal(style('.phone-viewport[data-keyboard-held] .feed-v020 .avatar-sheet .sheet-heading .eyebrow').display, 'none');
  assert.match(style('.phone-viewport[data-keyboard-held] .feed-v020 .feed-toast').top, /--phone-visible-height/);
});

const flushLoads = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };
test('actual submit remains busy after model fetch and server acknowledgement until render receipt', async () => {
  let release; const preload = new Promise(resolve => { release=resolve; });
  const form = createForm({name:'Dancer', preload, autoRender:false});
  const submit = form.submit(); const repeated = form.submit();
  assert.equal(form.observed.busy,true); assert.equal(form.observed.commands.length,0);
  release(); await flushLoads();
  assert.equal(form.observed.commands.length,1); assert.equal(form.observed.sheet,'join'); assert.equal(form.observed.toast,''); assert.equal(form.observed.busy,true);
  form.avatarGate.current.report({...form.observed.request,status:'ready'}); await Promise.all([submit,repeated]);
  assert.match(form.observed.toast,/加入成功/); assert.equal(form.observed.busy,false);
});
test('actual submit fetch failure stays editable without a server command or false success', async () => {
  const form=createForm({name:'Dancer',preload:Promise.reject(new Error('offline'))}); await form.submit();
  assert.equal(form.observed.commands.length,0); assert.match(form.observed.toast,/加载失败/); assert.equal(form.observed.busy,false); assert.equal(form.observed.sheet,'join');
});
