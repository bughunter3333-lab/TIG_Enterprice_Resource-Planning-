/**
 * index.css must not drift from the palette.
 *
 * CSS cannot import a JS module, so `src/index.css` mirrors a handful of
 * palette values as custom properties for the things only CSS can style — the
 * scrollbar, the app-wide focus ring, the body ground. A mirror is a copy, and
 * a copy goes stale.
 *
 * It already did, twice. The old accent `#2b7bd4` sat in the focus rule long
 * after the tokens moved on, so keyboard focus painted the previous palette's
 * blue onto a screen that had none left in it. Then `--faint` was left on
 * `#8d8d99` when the palette raised it to clear 4.5:1, which put the stale
 * value back on the scrollbar.
 *
 * Both were found by looking. This finds them by failing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { palette } from '../palette';

const css = fs.readFileSync(path.resolve(__dirname, '../../index.css'), 'utf8');

const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
const vars = Object.fromEntries(
  [...root.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{3,8});/g)].map(m => [m[1], m[2].toLowerCase()])
);

// Every custom property in :root, and the palette key it copies.
const MIRROR = {
  paper: 'paper',
  panel: 'panel',
  hairline: 'hairline',
  'hairline-soft': 'hairlineSoft',
  accent: 'accent',
  'accent-strong': 'accentStrong',
  'accent-tint': 'accentTint',
  'accent-focus': 'accentFocus',
  faint: 'faint',
};

describe('index.css mirrors the palette', () => {
  test('every mirrored custom property matches its palette value', () => {
    const drift = Object.entries(MIRROR)
      .filter(([cssVar, key]) => vars[cssVar] !== String(palette[key]).toLowerCase())
      .map(([cssVar, key]) => `--${cssVar} is ${vars[cssVar]}, palette.${key} is ${palette[key]}`);

    expect(drift).toEqual([]);
  });

  test('no custom property in :root is missing from the mirror list', () => {
    // Otherwise a new one gets added to the CSS and silently goes unchecked,
    // which is how the first two drifted.
    const unlisted = Object.keys(vars).filter(v => !(v in MIRROR));
    expect(unlisted).toEqual([]);
  });

  test('the css carries no colour literal that is not a mirrored property', () => {
    // A hex written straight into a rule is the thing this file exists to stop.
    // The scrollbar thumb is the one deliberate exception: it is a shade between
    // hairline and faint that no token needs a name for.
    const ALLOWED = new Set(['#c4bcab']);
    const body = css.slice(css.indexOf('}', css.indexOf(':root')));
    const literals = [...body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
      .map(m => m[0].toLowerCase())
      .filter(h => !ALLOWED.has(h));

    expect(literals).toEqual([]);
  });
});
