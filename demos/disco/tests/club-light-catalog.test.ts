import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { LIGHT_MODES } from '../lib/room-types.ts';

test('one six-mode light catalog supplies unique picker labels and useful style descriptions', async () => {
  assert.ok(existsSync(new URL('../lib/club-light-catalog.ts', import.meta.url)), 'light picker has a shared catalog');
  const { CLUB_LIGHT_CATALOG } = await import('../lib/club-light-catalog.ts');
  assert.deepEqual(CLUB_LIGHT_CATALOG.map((mode) => mode.id), LIGHT_MODES);
  assert.equal(new Set(CLUB_LIGHT_CATALOG.map((mode) => mode.label)).size, 6);
  assert.ok(CLUB_LIGHT_CATALOG.every((mode) => mode.label.length <= 6 && mode.description.length >= 8));
});

test('shared room validation accepts every light profile and rejects unregistered effects', async () => {
  const { validateCommand } = await import('../lib/room-server.ts');
  for (const lightMode of LIGHT_MODES) {
    const command = { roomId: 'main', requestId: `light-mode-${lightMode}`, sequence: 1, type: 'lights', lightMode };
    assert.deepEqual(validateCommand(command), command);
  }
  assert.throws(() => validateCommand({ roomId: 'main', requestId: 'unknown-light-mode', sequence: 1, type: 'lights', lightMode: 'strobe' }), /Invalid room command/);
});

test('light picker consumes the six-mode catalog in a compact two-column touch layout', () => {
  const component = readFileSync(new URL('../components/LiveFeed.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(component, /const MOODS = CLUB_LIGHT_CATALOG/);
  assert.match(css, /\.mood-list\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.mood-option\{[^}]*min-height:96px/);
  for (const mode of LIGHT_MODES) assert.ok(css.includes(`.swatch-${mode}{`));
});
