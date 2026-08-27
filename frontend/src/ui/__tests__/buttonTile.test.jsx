/**
 * The tile shape and the warn tier.
 *
 * Both exist to stop the same thing: an action or a state reaching for a raw
 * Tailwind colour because the design system had no word for it. Six job
 * actions were six decorative pastels, and every "needs attention" state was a
 * hand-picked amber, because `tile` and `warn` did not exist.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import Button from '../Button';
import { T } from '../tokens';

describe('the tile shape', () => {
  test('stacks its icon over its label', () => {
    render(<Button size="tile">Job Sheet</Button>);
    const style = getComputedStyle(screen.getByRole('button'));
    expect(style.flexDirection).toBe('column');
    expect(style.display).toBe('flex');
  });

  test('a normal button stays on one line', () => {
    render(<Button>Save</Button>);
    const style = getComputedStyle(screen.getByRole('button'));
    expect(style.flexDirection).toBe('row');
  });

  test('it is a shape, not a palette — the variants still apply', () => {
    const { rerender } = render(<Button size="tile" variant="primary">Edit</Button>);
    expect(getComputedStyle(screen.getByRole('button')).backgroundColor).toBe(
      'rgb(28, 95, 168)' // T.accentStrong
    );

    rerender(<Button size="tile" variant="secondary">Clone</Button>);
    expect(getComputedStyle(screen.getByRole('button')).backgroundColor).toBe(
      'rgb(255, 255, 255)' // T.panel
    );
  });

  test('every corner in the system comes from one radius token', () => {
    render(<Button size="tile">Picking</Button>);
    expect(getComputedStyle(screen.getByRole('button')).borderRadius).toBe(
      `${T.radius}px`
    );
  });
});

describe('the traffic light', () => {
  test('has all three tiers', () => {
    // Without warn, the middle of the scale had nowhere to live and every
    // caller picked its own amber.
    for (const tier of ['ok', 'warn', 'danger']) {
      expect(T[tier]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(T[`${tier}Tint`]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test('the three are distinguishable from each other', () => {
    expect(new Set([T.ok, T.warn, T.danger]).size).toBe(3);
  });
});
