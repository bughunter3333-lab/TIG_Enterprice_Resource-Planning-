/**
 * One renderer for five documents.
 *
 * The point of the template model is that a job sheet and a consignment note
 * differ only in data. So the thing worth asserting is not that any one
 * document looks right — it is that the renderer has no per-document
 * behaviour: give it a different template and different output appears, with
 * no branch in the code that knows what a "delivery note" is.
 *
 * The defaults are also pinned here, because they exist to reproduce what the
 * two hardcoded renderers printed. If a default quietly loses the picked
 * column, a picker gets a sheet they cannot use.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import TemplateRenderer, { deriveTotals } from '../TemplateRenderer';
import { DOC_TYPES, defaultTemplate } from '../../../lib/documentTemplates';

const job = {
  id: '1207512',
  customer: 'Zephyr Apparel',
  shipTo: 'ZEPH.SYD',
  shippingAddress: '14 Loom St\nBotany NSW 2019',
  nameContact: 'Dana Reyes',
  dateIn: '02/08/2026',
  due: '15/08/2026',
  custRef: 'PO-4471',
  assignedTo: 'Sam Okafor',
  priority: 'Normal',
  branch: 'HQ',
  weightTotal: 18.4,
  totalEx: 1240,
  tax: 124,
  totalInc: 1364,
  items: [
    { id: 1, displayType: 'section', description: 'Embroidery' },
    { id: 2, stockCode: 'TEE-BLK-M', description: 'Heavy Tee Black M', order: 40, qty: 40, qtyPick: 40, qtyDelivered: 40, weightKg: 0.2, decorationType: 'EMB', decPosition: 'Chest', sizes: 'M(40)', priceEx: 12, total: 480 },
    { id: 3, stockCode: 'CAP-NVY', description: 'Trucker Cap Navy', order: 20, qty: 20, qtyPick: 12, qtyDelivered: 0, weightKg: 0.1, decorationType: 'EMB', decPosition: 'Cap Front', sizes: 'OSFA(20)', priceEx: 18, total: 360 },
    { id: 4, displayType: 'note', description: 'Match thread to Pantone 288C' },
    { id: 5, stockCode: 'HID', description: 'Hidden line', order: 99, hide: true },
  ],
};

const company = { company_name: 'Total Image', address: '9 Mill Rd', phone: '02 9000 0000', email: 'info@totalimage.com.au' };

const renderDoc = (docType) =>
  render(<TemplateRenderer template={defaultTemplate(docType)} job={job} company={company} />);

describe('deriveTotals', () => {
  test('counts only real lines', () => {
    // Sections, notes and hidden rows are not stock and must not be counted, or
    // a picker is told to pick five things when there are two.
    const t = deriveTotals(job);
    expect(t.lineCount).toBe(2);
    expect(t.totalQty).toBe(60);
    expect(t.totalPicked).toBe(52);
  });

  test('weight is per unit, multiplied by quantity', () => {
    // 40 × 0.2 + 20 × 0.1 = 10. A connote that reports 0.3kg for 60 garments
    // is the sort of thing a carrier bills you for.
    expect(deriveTotals(job).totalWeight).toBe(10);
  });

  test('an empty job totals to zero rather than NaN', () => {
    const t = deriveTotals({ items: [] });
    expect(t.lineCount).toBe(0);
    expect(t.totalQty).toBe(0);
    expect(t.totalWeight).toBe(0);
  });
});

describe('the renderer is document-agnostic', () => {
  test.each(Object.keys(DOC_TYPES))('%s renders from its default template', (docType) => {
    expect(() => renderDoc(docType)).not.toThrow();
  });

  test('each document announces itself and its job', () => {
    renderDoc('jobSheet');
    expect(screen.getByText('JOB SHEET')).toBeInTheDocument();
    expect(screen.getByText('#1207512')).toBeInTheDocument();
  });

  test('paper size follows the template, not the document type', () => {
    const { container } = renderDoc('shipLabel');
    expect(container.querySelector('.doc-page')).toHaveStyle({ width: '100mm' });
    const { container: a4 } = renderDoc('jobSheet');
    expect(a4.querySelector('.doc-page')).toHaveStyle({ width: '210mm' });
  });
});

describe('the item table', () => {
  test('a picking list carries the columns a picker needs', () => {
    const { container } = renderDoc('pickingList');
    const heads = [...container.querySelectorAll('th')].map(th => th.textContent);
    // Bin is the reason a picker can use this sheet: it is resolved against
    // stock rather than read off the job line.
    expect(heads).toEqual(['SKU', 'Description', 'Sizes', 'Bin', 'Ordered', 'Picked']);
  });

  test('hidden lines never print', () => {
    const { container } = renderDoc('pickingList');
    expect(within(container).queryByText('Hidden line')).toBeNull();
  });

  test('section rows survive where the template asks for them', () => {
    const { container } = renderDoc('pickingList');
    expect(within(container).getByText('Embroidery')).toBeInTheDocument();
  });

  test('and are dropped where it does not', () => {
    // The delivery note turns sections off: the customer does not need the
    // production breakdown.
    const { container } = renderDoc('deliveryNote');
    expect(within(container).queryByText('Embroidery')).toBeNull();
  });
});

describe('the consignment note', () => {
  test('carries a scannable barcode of the job number', () => {
    const { container } = renderDoc('consignmentNote');
    const svg = container.querySelector('svg[role="img"]');
    expect(svg).toHaveAttribute('aria-label', 'Barcode 1207512');
    expect(svg.querySelectorAll('rect').length).toBeGreaterThan(20);
  });

  test('names both parties, because a carrier needs sender and receiver', () => {
    const { container } = renderDoc('consignmentNote');
    expect(within(container).getByText('Sender')).toBeInTheDocument();
    expect(within(container).getByText('Receiver')).toBeInTheDocument();
    expect(within(container).getByText('Total Image')).toBeInTheDocument();
    expect(within(container).getByText('Zephyr Apparel')).toBeInTheDocument();
  });
});

describe('free text', () => {
  test('tokens resolve against the job', () => {
    const { container } = renderDoc('jobSheet');
    expect(within(container).getByText('Job 1207512 — Zephyr Apparel')).toBeInTheDocument();
  });

  test('an unknown token renders as nothing rather than as itself', () => {
    const template = defaultTemplate('jobSheet');
    template.bands.footer = [{ id: 'x', type: 'freeText', text: 'A{nosuchfield}B' }];
    const { container } = render(<TemplateRenderer template={template} job={job} company={company} />);
    expect(within(container).getByText('AB')).toBeInTheDocument();
  });
});
