import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../components/fishing/FishingFeed.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const inputSuffix = '.fishing-chat-composer input';
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selectors, body]) =>
  selectors.split(',').map(selector => ({ selector: selector.trim(), style: Object.fromEntries(body.split(';').filter(value => value.includes(':')).map(value => {
    const colon = value.indexOf(':');
    return [value.slice(0, colon).trim(), value.slice(colon + 1).trim()];
  })) })));
const placeholderRules = rules.filter(rule => rule.selector.endsWith(`${inputSuffix}::placeholder`));
const placeholder = Object.assign({}, ...placeholderRules.map(rule => rule.style));

test('empty chat hint matches Fishing at 12px with a translucent white glyph', () => {
  assert.ok(placeholderRules.length > 0);
  assert.equal(placeholder['font-size'], '12px');
  assert.equal(placeholder.color, 'rgba(255,255,255,.68)');
  assert.equal(placeholder.opacity, '1');
});

test('WebKit placeholder keeps its own translucent fill when the input is disabled', () => {
  assert.equal(placeholder['-webkit-text-fill-color'], 'rgba(255,255,255,.68)');
  const disabled = rules.filter(rule => rule.selector.endsWith(`${inputSuffix}:disabled`));
  assert.ok(disabled.length > 0);
  assert.ok(disabled.every(rule => !rule.style.opacity || rule.style.opacity === '1'));
});

test('chat inputs retain native 16px editing and caret without shrink transforms', () => {
  const inputs = rules.filter(rule => !rule.selector.includes('::') &&
    (rule.selector.endsWith(inputSuffix) || rule.selector.endsWith(`${inputSuffix}:focus`) || rule.selector.endsWith(`${inputSuffix}:focus-visible`)));
  const fontSizes = inputs.filter(rule => rule.style['font-size']);
  assert.ok(fontSizes.length > 0);
  for (const { style } of fontSizes) assert.ok(parseFloat(style['font-size']) >= 16);
  for (const { style } of inputs) {
    assert.ok(!style.transform || style.transform === 'none');
    assert.ok(!style.opacity || style.opacity === '1');
    if (style.color) assert.equal(style.color, '#ffffff');
    if (style['caret-color']) assert.equal(style['caret-color'], '#ffffff');
  }
});
