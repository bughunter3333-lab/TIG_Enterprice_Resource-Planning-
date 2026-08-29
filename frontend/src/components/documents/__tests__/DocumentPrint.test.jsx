/**
 * Four warehouse documents share one component, and `type` is the only thing
 * that separates them. Each branch is a different promise to a different
 * reader:
 *
 * - pickingSlip is the only one that consults inventory, and it prints a bin
 *   location ONLY when that SKU has stock. Printing the bin of a SKU sitting at
 *   zero sends a picker to an empty shelf.
 * - deliveryNote is the only one that filters `hide` lines. The other two show
 *   them, which is right — the floor packs what the customer does not pay for —
 *   but it means a hidden line reaching a delivery note is a real leak.
 * - shipLabel is a separate early return with its own layout, its own zero
 *   padded job number, and its own totals.
 *
 * The heading is built from a `titles` lookup with no fallback, so an
 * unrecognised type prints an untitled document. That is exercised below,
 * because the app really does dispatch one — see the summary.
 *
 * `renderWithQuery` is used even though this component makes no request: it is
 * the project default, it costs nothing, and it re-raises a query failure if
 * this surface ever gains one.
 */
import { screen, fireEvent } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import DocumentPrint from '../DocumentPrint';

const items = () => [
  { stockCode: 'PL-NVY', description: 'Polo shirt, navy', sizes: 'S/M/L', order: 10 },
  { stockCode: 'CAP-BLK', description: 'Cap, black', qty: 4 },
  { stockCode: 'FRT-01', description: 'Freight and handling', hide: true, order: 1 },
];

const job = (over = {}) => ({
  id: 4102,
  invoice: 'INV-8817',
  customer: 'Respondek Logistics',
  shippingAddress: '3 Kembla St, Botany NSW 2019',
  shipTo: 'Botany Depot, gate 4',
  status: 'WIP',
  priority: 'High',
  type: 'Embroidery',
  assignedTo: 'Mira Osei',
  dateIn: '2026-08-01',
  due: '2026-08-31',
  custRef: 'PO-55',
  ourRef: 'TIG-9',
  notes: 'Fold and bag per set',
  items: items(),
  ...over,
});

// CAP-BLK is stocked in the ledger but sitting at zero: its bin must not print.
const inventory = [
  { sku: 'PL-NVY', stock: 12, location: 'A3-04' },
  { sku: 'CAP-BLK', stock: 0, location: 'B1-01' },
  { sku: 'FRT-01', stock: 5, location: 'C9-12' },
];

// getByText matches an element against its OWN text nodes, so a labelled line
// built as `<p>Status: <strong>{value}</strong></p>` or
// `<p><span>Invoice #:</span> {value}</p>` never matches as one string. These
// assert the whole line as the reader sees it — a label with the wrong value
// beside it still fails.
const wholeLine = (expected) => (_content, el) =>
  el?.tagName === 'P' && el.textContent.replace(/\s+/g, ' ').trim() === expected;
const line = (expected) => screen.getByText(wholeLine(expected));

const setup = (over = {}) => {
  const props = {
    documentPrint: { type: 'pickingSlip', job: job() },
    inventory,
    setDocumentPrint: vi.fn(),
    ...over,
  };
  const view = renderWithQuery(<DocumentPrint {...props} />);
  return { ...view, ...props };
};

// window.print is not implemented in jsdom; stub it so the wiring is assertable.
const printSpy = vi.fn();
beforeEach(() => {
  printSpy.mockClear();
  vi.stubGlobal('print', printSpy);
});
afterEach(() => vi.unstubAllGlobals());

test('renders nothing when no document is selected', () => {
  const { container } = renderWithQuery(
    <DocumentPrint documentPrint={null} inventory={inventory} setDocumentPrint={vi.fn()} />
  );
  expect(container).toBeEmptyDOMElement();
});

test('the picking slip prints a bin only for a SKU that has stock', () => {
  setup();

  expect(screen.getByRole('heading', { name: 'PICKING SLIP Preview — Job #4102' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'PICKING SLIP' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Bin Location' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: /Picked/ })).toBeInTheDocument();

  expect(screen.getByText('A3-04')).toBeInTheDocument();
  expect(screen.getByText('C9-12')).toBeInTheDocument();
  // The cap is stocked at zero. Its bin exists in the ledger and must not print.
  expect(screen.getByText('OUT OF STOCK')).toBeInTheDocument();
  expect(screen.queryByText('B1-01')).toBeNull();

  // Quantities: `order` wins, `qty` is the fallback.
  expect(screen.getByRole('cell', { name: '10' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: '4' })).toBeInTheDocument();

  // A hidden line is still picked — only the delivery note drops it.
  expect(screen.getByText('Freight and handling')).toBeInTheDocument();

  expect(screen.getByText('Customer')).toBeInTheDocument();
  expect(screen.queryByText('Deliver To')).toBeNull();
  expect(screen.getByText('Picked by:')).toBeInTheDocument();
  expect(screen.getByText('QC Checked by:')).toBeInTheDocument();
});

test('the picking slip carries the job context a picker needs', () => {
  setup();
  expect(screen.getByText('Respondek Logistics')).toBeInTheDocument();
  expect(line('Status: WIP')).toBeInTheDocument();
  expect(line('Priority: High')).toBeInTheDocument();
  expect(line('Type: Embroidery')).toBeInTheDocument();
  expect(line('Assigned To: Mira Osei')).toBeInTheDocument();
  expect(line('Date In: 2026-08-01')).toBeInTheDocument();
  expect(line('Due: 2026-08-31')).toBeInTheDocument();
  expect(line('Invoice #: INV-8817')).toBeInTheDocument();
});

test('a SKU missing from inventory reads as out of stock, not as a blank bin', () => {
  setup({ documentPrint: { type: 'pickingSlip', job: job({ items: [{ stockCode: 'GONE-01', description: 'Discontinued tee', order: 2 }] }) } });
  expect(screen.getByText('OUT OF STOCK')).toBeInTheDocument();
});

test('the delivery note drops hidden lines and the picking columns', () => {
  setup({ documentPrint: { type: 'deliveryNote', job: job() } });

  expect(screen.getByRole('heading', { name: 'DELIVERY NOTE Preview — Job #4102' })).toBeInTheDocument();
  expect(screen.getByText('Deliver To')).toBeInTheDocument();
  expect(screen.queryByText('Customer')).toBeNull();

  // The leak this guards: a line hidden from the customer reaching their copy.
  expect(screen.queryByText('Freight and handling')).toBeNull();
  expect(screen.getByText('Polo shirt, navy')).toBeInTheDocument();

  expect(screen.queryByRole('columnheader', { name: 'Bin Location' })).toBeNull();
  expect(screen.queryByRole('columnheader', { name: /Picked/ })).toBeNull();
  expect(screen.queryByText('OUT OF STOCK')).toBeNull();

  expect(screen.getByText('Driver / Despatcher Signature:')).toBeInTheDocument();
  expect(screen.getByText('Received by (Customer):')).toBeInTheDocument();
  expect(screen.queryByText('Picked by:')).toBeNull();
});

test('the job sheet carries the notes and the production sign-offs', () => {
  setup({ documentPrint: { type: 'jobSheet', job: job() } });

  expect(screen.getByRole('heading', { name: 'JOB SHEET Preview — Job #4102' })).toBeInTheDocument();
  expect(screen.getByText('Special Instructions / Notes')).toBeInTheDocument();
  expect(screen.getByText('Fold and bag per set')).toBeInTheDocument();
  expect(screen.getByText('Production Start:')).toBeInTheDocument();
  expect(screen.getByText('QC Pass / Fail:')).toBeInTheDocument();

  // The floor packs hidden lines too.
  expect(screen.getByText('Freight and handling')).toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Bin Location' })).toBeNull();
  expect(screen.queryByText('Received by (Customer):')).toBeNull();
});

test('a job sheet with no notes omits the notes block entirely', () => {
  setup({ documentPrint: { type: 'jobSheet', job: job({ notes: '' }) } });
  expect(screen.queryByText('Special Instructions / Notes')).toBeNull();
  expect(screen.getByText('Production Start:')).toBeInTheDocument();
});

test('a job with no lines says so instead of printing an empty table', () => {
  setup({ documentPrint: { type: 'pickingSlip', job: job({ items: [] }) } });
  expect(screen.getByText('No line items on this job.')).toBeInTheDocument();
});

test('a delivery note whose only lines are hidden reads as empty', () => {
  const hiddenOnly = [{ stockCode: 'FRT-01', description: 'Freight and handling', hide: true, order: 1 }];
  setup({ documentPrint: { type: 'deliveryNote', job: job({ items: hiddenOnly }) } });
  expect(screen.getByText('No line items on this job.')).toBeInTheDocument();
});

test('an unrecognised type prints an untitled document', () => {
  // Documents a defect on the caller's side, not this component's: two toolbar
  // buttons in TotalImageERP.jsx dispatch `{ type: 'job' }`, which is not a key
  // in `titles`, so the operator gets a preview with no document name on it.
  // Left as-is deliberately — see the summary.
  setup({ documentPrint: { type: 'job', job: job() } });
  expect(screen.getByRole('heading', { name: 'Preview — Job #4102' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /PICKING SLIP|DELIVERY NOTE|JOB SHEET|SHIP LABEL/ })).toBeNull();
  // It still renders the body, so it reads as a document rather than as a fault.
  expect(screen.getByText('Polo shirt, navy')).toBeInTheDocument();
});

test('print and close reach their handlers', () => {
  const { setDocumentPrint } = setup();

  const buttons = screen.getAllByRole('button');
  expect(buttons).toHaveLength(2);
  const [printButton, closeButton] = buttons;
  expect(printButton).toHaveAccessibleName(/print/i);
  // closeButton is icon-only and has no accessible name — see the summary.
  expect(closeButton).toHaveAccessibleName('');

  fireEvent.click(printButton);
  expect(printSpy).toHaveBeenCalledTimes(1);

  fireEvent.click(closeButton);
  expect(setDocumentPrint).toHaveBeenCalledWith(null);
});

describe('ship label', () => {
  const label = (over = {}) => ({ type: 'shipLabel', job: job(over) });

  test('addresses the label and counts what is in the box', () => {
    setup({ documentPrint: label() });

    expect(screen.getByRole('heading', { name: 'Ship Label Preview — Job #4102' })).toBeInTheDocument();
    // The job number is zero-padded for the carrier, in the strip and under the barcode.
    expect(screen.getAllByText('004102')).toHaveLength(2);

    expect(screen.getByText('Respondek Logistics')).toBeInTheDocument();
    // shipTo wins over the billing address — the box goes to the depot.
    expect(screen.getByText('Botany Depot, gate 4')).toBeInTheDocument();
    expect(screen.queryByText('3 Kembla St, Botany NSW 2019')).toBeNull();

    expect(screen.getByText('2026-08-31')).toBeInTheDocument();
    // Three lines including the hidden one; 10 + 4 + 1 pieces.
    expect(screen.getByText('3 lines')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();

    expect(line('Invoice #: INV-8817')).toBeInTheDocument();
    expect(line('Cust Ref #: PO-55')).toBeInTheDocument();
    expect(line('Our Ref #: TIG-9')).toBeInTheDocument();
  });

  test('falls back to the shipping address when there is no ship-to', () => {
    setup({ documentPrint: label({ shipTo: '' }) });
    expect(screen.getByText('3 Kembla St, Botany NSW 2019')).toBeInTheDocument();
  });

  test('counts one line in the singular and shows a dash for no due date', () => {
    setup({ documentPrint: label({ due: '', items: [{ stockCode: 'PL-NVY', description: 'Polo shirt, navy', order: 6 }] }) });
    expect(screen.getByText('1 line')).toBeInTheDocument();
    expect(screen.queryByText('1 lines')).toBeNull();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  test('omits the reference block when the job has no references', () => {
    setup({ documentPrint: label({ invoice: '', custRef: '', ourRef: '' }) });
    expect(screen.queryByText(/Invoice #:/)).toBeNull();
    expect(screen.queryByText(/Cust Ref #:/)).toBeNull();
    expect(screen.queryByText(/Our Ref #:/)).toBeNull();
  });

  test('print and close reach their handlers', () => {
    const { setDocumentPrint } = setup({ documentPrint: label() });

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    const [printButton, closeButton] = buttons;
    expect(printButton).toHaveAccessibleName(/print/i);

    fireEvent.click(printButton);
    expect(printSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(closeButton);
    expect(setDocumentPrint).toHaveBeenCalledWith(null);
  });
});
