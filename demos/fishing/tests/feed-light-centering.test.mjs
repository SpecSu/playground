import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

const stylesheets = ['../app/globals.css', '../components/FeedInterface.css'].map(path =>
  postcss.parse(readFileSync(new URL(path, import.meta.url), 'utf8')));

// Resolve the selectors relevant to the existing lighting-card markup across
// both real stylesheets. Parent centering alone cannot catch a growing label.
function cascade(selectors) {
  const winners = new Map();
  for (const sheet of stylesheets) sheet.walkRules(rule => {
    const specificity = Math.max(-1, ...rule.selectors.map(selector => selectors.get(selector.replace(/\s*>\s*/g, '>')) ?? -1));
    if (specificity < 0) return;
    rule.walkDecls(declaration => {
      const previous = winners.get(declaration.prop);
      const priority = specificity + (declaration.important ? 1000 : 0);
      if (!previous || priority >= previous.priority) winners.set(declaration.prop, { value: declaration.value, priority });
    });
  });
  return Object.fromEntries([...winners].map(([property, { value }]) => [property, value]));
}

const cardSelectors = new Map([
  ['button', 1], ['.mood-option', 10], ['.option-card', 10], ['.light-option', 10],
  ['.feed-v020 button', 11], ['.feed-v020 .mood-option', 20],
  ['.feed-v020 .option-card', 20], ['.feed-v020 .light-option', 20],
  ['.feed-v020 .mood-option.light-option', 30],
]);
function spanSelectors(index, scoped = true) {
  const selectors = new Map([['span', 1]]);
  for (const [selector, specificity] of cardSelectors) {
    if (!scoped && selector.startsWith('.feed-v020')) continue;
    selectors.set(`${selector}>span`, specificity + 1);
    selectors.set(`${selector}>span:nth-child(${index})`, specificity + 11);
  }
  return selectors;
}

test('light cards center their compact swatch and label stack on both axes', () => {
  const card = cascade(cardSelectors);
  assert.equal(card.display, 'flex');
  assert.equal(card['flex-direction'], 'column');
  assert.equal(card['align-items'], 'center');
  assert.equal(card['justify-content'], 'center');
  assert.equal(card['text-align'], 'center');
  assert.equal(card['min-height'], '91px');
  assert.equal(card.gap, '7px');
});

test('light card children do not grow vertically under the legacy mood-row cascade', () => {
  for (const index of [2, 1]) {
    assert.ok(['none', '0 0 auto'].includes(cascade(spanSelectors(index)).flex),
      `child ${index} must keep its intrinsic height instead of consuming the card's free space`);
  }
});

test('lighting centering is scoped without changing legacy mood rows or group buttons', () => {
  assert.equal(cascade(spanSelectors(2, false)).flex, '1', 'legacy row labels still fill horizontal space');
  assert.equal(cascade(new Map([
    ['.group-move-button>span', 11], ['.feed-v020 .group-move-button>span', 21],
  ])).flex, 'none');
});
