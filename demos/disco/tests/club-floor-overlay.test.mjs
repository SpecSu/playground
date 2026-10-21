import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

// Offline cascade check for the overlay hit policy, using both production CSS
// files in their actual order. This deliberately does not claim browser layout QA.
const rules = [];
for (const file of ['../app/globals.css', '../components/FeedInterface.css']) {
  postcss.parse(readFileSync(new URL(file, import.meta.url), 'utf8')).walkDecls('pointer-events', declaration => {
    for (const selector of declaration.parent.selector.split(',')) {
      rules.push({ selector: selector.trim(), value: declaration.value, order: rules.length });
    }
  });
}
function matches(simple, node) {
  const tag = simple.match(/^[a-z]+/)?.[0];
  const classes = [...simple.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
  return (!tag || tag === node.tag) && classes.every(name => node.classes.includes(name));
}
function applicable(selector, path) {
  if (/[:>\[+~]/.test(selector)) return false;
  const parts = selector.split(/\s+/);
  if (!matches(parts.pop(), path.at(-1))) return false;
  let index = path.length - 2;
  while (parts.length) {
    const part = parts.pop();
    while (index >= 0 && !matches(part, path[index])) index--;
    if (index < 0) return false;
    index--;
  }
  return true;
}
function pointerEvents(path) {
  let inherited = 'auto';
  for (let length = 1; length <= path.length; length++) {
    const matching = rules.filter(rule => applicable(rule.selector, path.slice(0, length)));
    matching.sort((a, b) => {
      const specificity = selector => (selector.match(/\./g)?.length ?? 0) * 100 + (selector.match(/(?:^|\s)[a-z]+/g)?.length ?? 0);
      return specificity(a.selector) - specificity(b.selector) || a.order - b.order;
    });
    inherited = matching.at(-1)?.value ?? inherited;
  }
  return inherited;
}
const node = (classes, tag = 'div') => ({ tag, classes: classes.split(' ') });
const base = [node('feed-v020 feed-window joined', 'section'), node('app-page feed-page', 'section')];

test('transparent header, caption and control spacing lets floor taps reach the canvas', () => {
  for (const overlay of ['feed-header', 'creator-caption', 'lower-controls']) {
    assert.equal(pointerEvents([...base, node(overlay)]), 'none', `${overlay} blank space must not steal floor taps`);
  }
  for (const path of [
    [node('creator-caption'), node('creator-copy'), node('creator-line'), node('live-tag', 'span')],
    [node('creator-caption'), node('creator-copy'), node('', 'p')],
    [node('lower-controls'), node('interaction-dock')],
    [node('lower-controls'), node('music-row'), node('music-buttons')],
  ]) assert.equal(pointerEvents([...base, ...path]), 'none');
});

test('overlay controls and the joystick retain their original pointer hit areas', () => {
  for (const path of [
    [node('feed-header', 'header'), node('feed-tabs'), node('', 'button')],
    [node('feed-header', 'header'), node('header-icon bell', 'button')],
    [node('creator-caption'), node('creator-copy'), node('creator-line'), node('creator-name', 'button')],
    [node('creator-caption'), node('feed-like', 'button')],
    [node('lower-controls'), node('music-row'), node('track-title', 'button')],
    [node('lower-controls'), node('music-row'), node('music-buttons'), node('music-btn', 'button')],
    [node('lower-controls'), node('interaction-dock'), node('join-control', 'button')],
    [node('lower-controls'), node('interaction-dock'), node('dock-control', 'button')],
    [node('lower-controls'), node('interaction-dock'), node('club-joystick'), node('joystick-pad', 'button')],
  ]) assert.equal(pointerEvents([...base, ...path]), 'auto', path.at(-1).classes.join(' '));
});
