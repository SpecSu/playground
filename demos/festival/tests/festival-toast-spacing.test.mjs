import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const desert = readFileSync(new URL('../components/DesertFeed.css', import.meta.url), 'utf8');
const shared = readFileSync(new URL('../components/FeedInterface.css', import.meta.url), 'utf8');
const rule = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  assert.ok(match, `Missing ${selector}`);
  return Object.fromEntries(match[1].split(';').filter(Boolean).map(declaration => declaration.trim().split(/:\s*/)));
};
const toast = rule(desert, '.desert-feed .feed-toast');
const banner = rule(desert, '.desert-feed .placement-banner');
const bannerText = rule(desert, '.desert-feed .placement-banner>div');
const bannerSmall = rule(desert, '.desert-feed .placement-banner small');
const baseToast = rule(shared, '.feed-v020 .feed-toast');

test('festival toast leaves at least 24px below the two-line construction banner', () => {
  // Tailwind preflight supplies inherited 1.5 line height; both banner lines fit
  // the fixed 390px design frame. This is a CSS geometry contract, not a DOM measurement.
  const bannerBottom = parseFloat(banner.top) + 2 * parseFloat(banner.padding)
    + 2 * parseFloat(banner.border) + 1.5 * parseFloat(bannerText['font-size'])
    + parseFloat(bannerSmall['margin-top']) + 1.5 * parseFloat(bannerSmall['font-size']);
  assert.ok(parseFloat(toast.top) - bannerBottom >= 24, `Toast gap is ${parseFloat(toast.top) - bannerBottom}px`);
  const twoLineToastBottom = parseFloat(toast.top) + 2 * parseFloat(baseToast.padding)
    + 2 * parseFloat(baseToast.border) + 2 * parseFloat(toast['font-size']) * parseFloat(baseToast['line-height']);
  const firstLowerOverlay = parseFloat(rule(shared, '.feed-v020 .creator-caption').top);
  assert.ok(twoLineToastBottom + 24 < firstLowerOverlay, 'Toast must stay clear of lower overlays and controls');
});

test('festival toast has a lighter translucent background and readable light text', () => {
  assert.match(toast.background, /^#[\da-f]{8}$/i);
  const alpha = parseInt(toast.background.slice(-2), 16) / 255;
  assert.ok(alpha >= 0.6 && alpha <= 0.65, `Background alpha is ${alpha}`);
  assert.equal(toast.color, '#f0dabe');
  assert.ok(toast['text-shadow'], 'Light text needs a separate contrast shadow');
  assert.ok(baseToast['box-shadow'], 'Keep the existing capsule shadow');
});

test('construction banner is transparent with readable warm text and unchanged geometry', () => {
  assert.match(banner.background, /^#[\da-f]{8}$/i);
  const alpha = parseInt(banner.background.slice(-2), 16) / 255;
  assert.ok(alpha >= 0.28 && alpha <= 0.34, `Construction backdrop alpha is ${alpha}`);
  assert.equal(banner['backdrop-filter'], 'blur(3px)');
  assert.equal(banner.border, '1px solid #f4ce962e');
  assert.equal(banner['box-shadow'], '0 3px 12px #0000000d');
  assert.equal(banner.color, '#fff1dc');
  assert.equal(bannerSmall.color, '#f4e2cc');
  assert.ok(banner['text-shadow'], 'Transparent banner needs independent text contrast');
  assert.equal(banner.top, '174px');
  assert.equal(banner.left, '14px');assert.equal(banner.right, '14px');
  assert.equal(banner.padding, '11px 12px');assert.equal(banner['border-radius'], '13px');
  assert.equal(bannerText['font-size'], '12px');assert.equal(bannerSmall['font-size'], '10px');
  assert.equal(bannerSmall['margin-top'], '4px');
});
