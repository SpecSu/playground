import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

const sheets = ['../app/globals.css', '../components/FeedInterface.css', '../components/DanceMachine.css']
  .map(path => postcss.parse(readFileSync(new URL(path, import.meta.url), 'utf8')));
function cascade(selectors) {
  const winners = new Map();
  for (const sheet of sheets) sheet.walkRules(rule => {
    const priority = Math.max(-1, ...rule.selectors.map(selector => selectors.get(selector) ?? -1));
    if (priority < 0) return;
    rule.walkDecls(declaration => {
      if (priority >= (winners.get(declaration.prop)?.priority ?? -1)) {
        winners.set(declaration.prop, { value: declaration.value, priority });
      }
    });
  });
  return Object.fromEntries([...winners].map(([key, { value }]) => [key, value]));
}
function style(selector) { return cascade(new Map([[selector, 20]])); }
const px = value => Number.parseFloat(value);

for (const variant of ['toast', 'feed-toast']) {
  for (const dance of [false, true]) {
    test(`${variant} clears music and status in ${dance ? 'dance' : 'normal'} mode`, () => {
      const toast = cascade(new Map([
        [`.feed-v020 .${variant}`, 20],
        ...(dance ? [[`.feed-v020.dance-active .${variant}`, 30]] : []),
      ]));
      const top = px(toast.top);
      const music = cascade(new Map([
        ['.feed-v020 .feed-page > .music-row', 30],
        ...(dance ? [['.feed-v020.dance-active .music-row', 30]] : []),
      ]));
      assert.ok(top >= px(music.top) + px(music.height) + 8, 'toast must clear the music strip');
      // The reduced-motion control is 44 px high; group status has one 16 px line.
      assert.ok(top >= px(style('.feed-v020 .motion-preference').top) + 44 + 8, 'toast must clear reduced-motion control');
      if (!dance) assert.ok(top >= px(style('.feed-v020 .group-action-status').top) + 34 + 8, 'toast must clear group status');
      if (dance) {
        // Score: 8/23/9 px text, inherited 1.5 line height, plus 3/7 px gaps.
        const scoreBottom = px(style('.feed-v020 .dance-score').top) + (8 + 23 + 9) * 1.5 + 10;
        assert.ok(top >= scoreBottom, 'toast must sit below the score');
        const twoLineBottom = top + 2 * 12 * 1.5 + 2 * 10 + 2;
        assert.ok(twoLineBottom + 8 <= px(style('.feed-v020 .dance-feedback').top), 'two-line toast must clear dance feedback and note controls');
      }
      assert.equal(toast['pointer-events'], 'none', 'toast never intercepts floor or control input');
    });
  }
}
