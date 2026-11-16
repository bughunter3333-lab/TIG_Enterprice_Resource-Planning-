/**
 * A picking list is walked, so its order is part of its correctness.
 *
 * The warehouse runs five aisles of ten bays, labelled `aisle.bay.level.position`
 * (`B.3.H.1`). Printed in job-line order, a slip sends the picker up and down
 * the same aisle once per line; printed in bin order it is one pass.
 *
 * Two things must survive the reordering, and neither is obvious from the sort
 * itself: a section row titles the block beneath it, and a note annotates the
 * line above it. Both are asserted here because a flat sort passes every
 * ordering test while quietly detaching them.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import TemplateRenderer from '../TemplateRenderer';
import { defaultTemplate } from '../../../lib/documentTemplates';

// Deliberately entered in an order that is not the walk order.
const items = [
  { id: 1, stockCode: 'FAR', description: 'Far end of the aisle', order: 1 },
  { id: 2, stockCode: 'NEAR', description: 'Near the aisle mouth', order: 1 },
  { id: 3, stockCode: 'DEEP', description: 'Bay ten', order: 1 },
];

const inventory = [
  { sku: 'FAR', stock: 5, location: 'B.2.A.1' },
  { sku: 'NEAR', stock: 5, location: 'B.1.A.1' },
  { sku: 'DEEP', stock: 5, location: 'B.10.A.1' },
];

const job = { id: 'J-1', customer: 'Zephyr Apparel', items };

const rowOrder = () =>
  screen.getAllByRole('row')
    .map((r) => r.textContent)
    .filter((t) => /B\.\d+\.A\.1|Section|thread/i.test(t));

const renderPicking = (overrides = {}) =>
  render(
    <TemplateRenderer
      template={defaultTemplate('pickingList')}
      job={{ ...job, ...overrides }}
      company={{ company_name: 'Total Image' }}
      inventory={inventory}
    />,
  );

describe('picking list walk order', () => {
  test('lines print in bin order, with bay 10 last rather than second', () => {
    renderPicking();
    const order = rowOrder();

    expect(order[0]).toContain('B.1.A.1');
    expect(order[1]).toContain('B.2.A.1');
    expect(order[2]).toContain('B.10.A.1');
  });

  test('a section keeps the lines that belong under it', () => {
    renderPicking({
      items: [
        { id: 10, displayType: 'section', description: 'Embroidery' },
        items[0],
        { id: 11, displayType: 'section', description: 'Screen Print' },
        items[1],
      ],
    });
    const text = screen.getAllByRole('row').map((r) => r.textContent).join('|');

    // B.1 sorts before B.2, but it is under the second section and must stay there.
    expect(text.indexOf('Embroidery')).toBeLessThan(text.indexOf('B.2.A.1'));
    expect(text.indexOf('B.2.A.1')).toBeLessThan(text.indexOf('Screen Print'));
    expect(text.indexOf('Screen Print')).toBeLessThan(text.indexOf('B.1.A.1'));
  });

  test('a note travels with the line it annotates', () => {
    renderPicking({
      items: [
        items[0],
        { id: 12, displayType: 'note', description: 'Match thread to Pantone 288C' },
        items[1],
      ],
    });
    const order = rowOrder();

    // The note is written under the far line, so it moves down with it.
    expect(order[0]).toContain('B.1.A.1');
    expect(order[1]).toContain('B.2.A.1');
    expect(order[2]).toContain('thread');
  });

  test('a document without a bin column is left in the order it was entered', () => {
    render(
      <TemplateRenderer
        template={defaultTemplate('jobSheet')}
        job={job}
        company={{ company_name: 'Total Image' }}
        inventory={inventory}
      />,
    );
    const text = screen.getAllByRole('row').map((r) => r.textContent).join('|');

    expect(text.indexOf('Far end')).toBeLessThan(text.indexOf('Near the aisle'));
  });
});
