/**
 * Printing a job document.
 *
 * This component no longer draws the documents. It resolves the template for
 * the requested type and hands it to the shared renderer, so most of what the
 * previous version of this file asserted — column sets, sections, hidden lines,
 * empty tables — now belongs to TemplateRenderer.test.jsx and is covered there
 * once for all five documents rather than four times over.
 *
 * What is left here is what this component is actually responsible for:
 * choosing the right template, falling back when none is saved, resolving the
 * legacy type name the job toolbar still uses, and the bin column — the one
 * piece of a picking list that is looked up in stock rather than read off the
 * job, and the thing a picker walks the racks with.
 */
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { renderWithQuery } from '../../../test/renderWithQuery';
import DocumentPrint from '../DocumentPrint';
import { documentTemplates, settings } from '../../../api';

const job = {
  id: '1207512',
  customer: 'Zephyr Apparel',
  due: '15/08/2026',
  items: [
    { id: 1, stockCode: 'TEE-BLK-M', description: 'Heavy Tee', sizes: 'M(40)', order: 40, qtyPick: 40 },
    { id: 2, stockCode: 'CAP-NVY', description: 'Cap', sizes: 'OSFA(20)', order: 20, qtyPick: 0 },
    { id: 3, stockCode: 'GHOST', description: 'Never stocked', sizes: '', order: 5, qtyPick: 0 },
  ],
};

const inventory = [
  { sku: 'TEE-BLK-M', stock: 580, location: 'A-12-3' },
  { sku: 'CAP-NVY', stock: 0, location: 'B-04-1' },
];

beforeEach(() => {
  vi.spyOn(documentTemplates, 'list').mockResolvedValue({});
  vi.spyOn(settings, 'getCompany').mockResolvedValue({ company_name: 'Total Image' });
});
afterEach(() => vi.restoreAllMocks());

const open = (type) =>
  renderWithQuery(
    <DocumentPrint
      documentPrint={{ type, job }}
      inventory={inventory}
      setDocumentPrint={vi.fn()}
    />,
  );

describe('choosing a template', () => {
  test('renders nothing when no document is selected', () => {
    const { container } = renderWithQuery(
      <DocumentPrint documentPrint={null} inventory={inventory} setDocumentPrint={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('falls back to the built-in default when nothing is saved', async () => {
    open('jobSheet');
    await waitFor(() => expect(screen.getByText('JOB SHEET')).toBeInTheDocument());
  });

  test('a saved template wins over the default', async () => {
    documentTemplates.list.mockResolvedValue({
      jobSheet: {
        docType: 'jobSheet', name: 'Works Order', paper: 'A4',
        bands: {
          header: [{ id: 'a', type: 'docTitle', text: 'WORKS ORDER', showJobNumber: true }],
          lines: [], footer: [],
        },
      },
    });
    open('jobSheet');
    await waitFor(() => expect(screen.getByText('WORKS ORDER')).toBeInTheDocument());
    expect(screen.queryByText('JOB SHEET')).toBeNull();
  });

  test('the toolbar’s legacy "pickingSlip" still finds the picking list', async () => {
    // A dozen call sites in the job toolbar predate templates and pass the old
    // name. Renaming them to fix a label would be a larger diff than the alias.
    open('pickingSlip');
    await waitFor(() => expect(screen.getByText('PICKING LIST')).toBeInTheDocument());
  });

  test('an unrecognised type says so instead of printing a blank page', async () => {
    open('nosuchdocument');
    await waitFor(() =>
      expect(screen.getByText(/no template for/i)).toBeInTheDocument(),
    );
  });
});

describe('the bin column', () => {
  test('prints the bin for a SKU that has stock', async () => {
    const { container } = open('pickingSlip');
    await waitFor(() => expect(screen.getByText('PICKING LIST')).toBeInTheDocument());
    expect(within(container).getByText('A-12-3')).toBeInTheDocument();
  });

  test('a SKU with a bin but no stock reads as out of stock, not as a bin', async () => {
    // CAP-NVY has a location recorded and nothing on hand. Printing B-04-1
    // sends a picker to an empty shelf.
    const { container } = open('pickingSlip');
    await waitFor(() => expect(screen.getByText('PICKING LIST')).toBeInTheDocument());
    expect(within(container).queryByText('B-04-1')).toBeNull();
    expect(within(container).getAllByText('OUT OF STOCK').length).toBeGreaterThan(0);
  });

  test('a SKU missing from stock entirely reads as out of stock, not as a blank', async () => {
    const { container } = open('pickingSlip');
    await waitFor(() => expect(screen.getByText('PICKING LIST')).toBeInTheDocument());
    // GHOST and CAP-NVY both: two rows, not one.
    expect(within(container).getAllByText('OUT OF STOCK')).toHaveLength(2);
  });

  test('documents that do not ask for a bin do not resolve one', async () => {
    const { container } = open('deliveryNote');
    await waitFor(() => expect(screen.getByText('DELIVERY NOTE')).toBeInTheDocument());
    expect(within(container).queryByText('OUT OF STOCK')).toBeNull();
    expect(within(container).queryByText('A-12-3')).toBeNull();
  });
});

describe('the dialog', () => {
  test('names the document and the job', async () => {
    open('jobSheet');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Job Sheet — Job #1207512/ })).toBeInTheDocument(),
    );
  });

  test('close reaches its handler', async () => {
    const setDocumentPrint = vi.fn();
    renderWithQuery(
      <DocumentPrint documentPrint={{ type: 'jobSheet', job }} inventory={inventory} setDocumentPrint={setDocumentPrint} />,
    );
    await waitFor(() => expect(screen.getByText('JOB SHEET')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(setDocumentPrint).toHaveBeenCalledWith(null);
  });
});
