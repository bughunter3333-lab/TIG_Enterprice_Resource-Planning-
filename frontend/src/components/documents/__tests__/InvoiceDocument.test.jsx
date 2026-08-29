/**
 * The customer-facing tax document. Everything here is arithmetic or a legal
 * label, and both are wrong in ways nobody notices on screen.
 *
 * Three things carry the weight:
 *
 * 1. The subtotal is summed from `visibleItems`, which drops `hide` lines and
 *    `displayType: 'note'` lines. A line that is on the job but not on the
 *    invoice must not reach the GST figure — this is what gets remitted.
 * 2. `docTitle` decides between TAX QUOTE, TAX PROFORMA INVOICE and TAX
 *    INVOICE. A proforma that prints as a tax invoice is a GST document the
 *    supply has not happened for, and a quote that prints as one is worse.
 * 3. `proformaBalance` hides every price column and every total except what is
 *    owed. If a pricing column survived that variant the customer sees the
 *    margin on a document that exists precisely to not show it.
 *
 * Fixture money is chosen so no two figures share a string: unit prices 20.00
 * and 12.50, amounts 200.00 and 50.00, subtotal 250.00, GST 25.00, total
 * 275.00, deposit 100.00, balance 175.00. An assertion that passes because it
 * matched the wrong cell is not an assertion.
 *
 * `renderWithQuery` is used even though this component makes no request: it is
 * the project default, it costs nothing, and it re-raises a query failure if
 * this surface ever gains one.
 */
import { screen, fireEvent } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import InvoiceDocument from '../InvoiceDocument';

const items = () => [
  { displayType: 'section', description: 'Embroidered polos' },
  {
    description: 'Polo shirt, navy',
    stockCode: 'PL-NVY',
    sizes: 'S/M/L',
    decorationType: 'Embroidery',
    orderQty: 10,
    priceEx: '20.00',
    discount: 0,
    total: '200.00',
  },
  {
    description: 'Cap, black',
    decorationType: 'None',
    qty: 4,
    priceEx: '12.50',
    discount: 10,
    taxType: 'FRE',
    total: '50.00',
  },
  // Neither of these may reach the table or the subtotal.
  { description: 'Freight and handling', hide: true, total: '500.00' },
  { description: 'Internal packing note', displayType: 'note', total: '999.00' },
];

const job = (over = {}) => ({
  id: 'J-4102',
  invoice: 'INV-8817',
  customerId: 7,
  customer: 'Respondek Logistics',
  status: 'ORDER',
  dateIn: '2026-08-01',
  due: '2026-08-31',
  custRef: 'PO-55',
  ourRef: 'TIG-9',
  assignedTo: 'Mira Osei',
  nameContact: 'Dock Supervisor',
  shipTo: 'Botany Depot',
  shippingAddress: '3 Kembla St\nBotany NSW 2019',
  notes: 'Fold and bag per set',
  items: items(),
  ...over,
});

// A distinct ABN from the hardcoded company one in the letterhead, so an
// assertion on the customer's ABN cannot pass by matching Total Image's.
const customers = [
  {
    id: 7,
    abn: '99 888 777 666',
    phone: '02 8000 4321',
    email: 'dock@respondek.example',
    paymentTerms: '30 days',
  },
];

const setup = (over = {}) => {
  const props = {
    customers,
    invoiceJob: job(),
    invoiceVariant: 'standard',
    setInvoiceJob: vi.fn(),
    ...over,
  };
  const view = renderWithQuery(<InvoiceDocument {...props} />);
  return { ...view, ...props };
};

// window.print is not implemented in jsdom; stub it so the wiring is assertable.
const printSpy = vi.fn();
beforeEach(() => {
  printSpy.mockClear();
  vi.stubGlobal('print', printSpy);
});
afterEach(() => vi.unstubAllGlobals());

test('renders nothing when there is no job', () => {
  const { container } = renderWithQuery(
    <InvoiceDocument customers={customers} invoiceJob={null} invoiceVariant="standard" setInvoiceJob={vi.fn()} />
  );
  expect(container).toBeEmptyDOMElement();
});

test('a standard invoice is titled and numbered', () => {
  setup();
  // Once in the toolbar badge, once as the document heading.
  expect(screen.getAllByText('TAX INVOICE')).toHaveLength(2);
  expect(screen.getByText('Invoice No:')).toBeInTheDocument();
  expect(screen.getAllByText('INV-8817').length).toBeGreaterThan(0);
  expect(screen.getByText('Due Date:')).toBeInTheDocument();
  expect(screen.getByText('2026-08-31')).toBeInTheDocument();
  expect(screen.getByText('2026-08-01')).toBeInTheDocument();
});

test('line items print their own columns and drop hidden and note lines', () => {
  setup();

  expect(screen.getByRole('cell', { name: /Polo shirt, navy/ })).toBeInTheDocument();
  expect(screen.getByText('SKU: PL-NVY')).toBeInTheDocument();
  expect(screen.getByText('S/M/L')).toBeInTheDocument();
  expect(screen.getByText('Embroidered polos')).toBeInTheDocument();

  // A decoration of 'None' prints as an empty cell, not as the word.
  expect(screen.getByRole('cell', { name: 'Embroidery' })).toBeInTheDocument();
  expect(screen.queryByText('None')).toBeNull();

  // orderQty wins for the polo; the cap falls back to qty.
  expect(screen.getByRole('cell', { name: '10' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: '4' })).toBeInTheDocument();

  expect(screen.getByRole('cell', { name: '$20.00' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: '$12.50' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: '10%' })).toBeInTheDocument();

  // taxType overrides the GST default per line.
  expect(screen.getByRole('cell', { name: 'FRE' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'GST' })).toBeInTheDocument();

  expect(screen.queryByText('Freight and handling')).toBeNull();
  expect(screen.queryByText('Internal packing note')).toBeNull();
});

test('the totals sum only the visible lines', () => {
  setup();
  // 200.00 + 50.00. The hidden 500.00 and the note's 999.00 are not GST-able.
  expect(screen.getByText('$250.00')).toBeInTheDocument();
  expect(screen.getByText('GST (10%)')).toBeInTheDocument();
  expect(screen.getByText('$25.00')).toBeInTheDocument();
  expect(screen.getByText('TOTAL (inc GST)')).toBeInTheDocument();
  expect(screen.getByText('$275.00')).toBeInTheDocument();

  // Nothing paid, so there is no balance block at all — only the badge.
  expect(screen.queryByText('BALANCE DUE')).toBeNull();
  expect(screen.getByText('Balance $275.00')).toBeInTheDocument();
});

test('a deposit is deducted and the balance is what remains', () => {
  setup({ invoiceJob: job({ deposit: 100 }) });
  expect(screen.getByText('Less: Amount Paid')).toBeInTheDocument();
  expect(screen.getByText('-$100.00')).toBeInTheDocument();
  expect(screen.getByText('BALANCE DUE')).toBeInTheDocument();
  expect(screen.getByText('$175.00')).toBeInTheDocument();
  expect(screen.getByText('Balance $175.00')).toBeInTheDocument();
});

test('invoicePaid stands in when there is no deposit', () => {
  setup({ invoiceJob: job({ deposit: 0, invoicePaid: 275 }) });
  expect(screen.getByText('-$275.00')).toBeInTheDocument();
  // Nothing left owing: the badge says so instead of quoting a balance.
  expect(screen.getByText('PAID')).toBeInTheDocument();
  expect(screen.queryByText(/^Balance \$/)).toBeNull();
});

test('a quote is labelled as one and carries no payment details', () => {
  setup({ invoiceJob: job({ status: 'QUOTE' }), invoiceVariant: 'standard' });
  expect(screen.getAllByText('TAX QUOTE')).toHaveLength(2);
  expect(screen.getByText('Quote No:')).toBeInTheDocument();
  expect(screen.getByText('Valid Until:')).toBeInTheDocument();
  expect(screen.getByText(/This is a Quote/)).toBeInTheDocument();

  // Bank details on a quote invite payment against a supply not yet agreed.
  expect(screen.queryByText('Payment Details')).toBeNull();
  // Payment terms belong to an invoice, not a quote.
  expect(screen.queryByText('Terms:')).toBeNull();

  expect(screen.getByRole('link', { name: /download pdf/i })).toHaveAttribute(
    'href',
    '/api/jobs/J-4102/pdf?type=quote'
  );
});

test('a proforma says it is not a tax invoice but still shows how to pay', () => {
  setup({ invoiceVariant: 'proforma' });
  expect(screen.getAllByText('TAX PROFORMA INVOICE')).toHaveLength(2);
  expect(screen.getByText(/Proforma . Not a Tax Invoice/)).toBeInTheDocument();
  expect(screen.getByText('Payment Details')).toBeInTheDocument();
  // Still priced in full — only proformaBalance strips the pricing.
  expect(screen.getByText('$275.00')).toBeInTheDocument();
});

test('an unpassed variant falls to proforma, not to a tax invoice', () => {
  // isProforma is `!isQuote && invoiceVariant !== 'standard'`, so an omitted
  // prop reads as a proforma. Pinned deliberately: the caller defaults the
  // variant to 'standard', and if that ever stops happening this component
  // downgrades a real tax invoice rather than upgrading a proforma.
  setup({ invoiceVariant: undefined });
  expect(screen.getAllByText('TAX PROFORMA INVOICE')).toHaveLength(2);
});

test('the balance-only proforma hides every price and every total but the balance', () => {
  setup({ invoiceJob: job({ deposit: 100 }), invoiceVariant: 'proformaBalance' });

  // Description / Decoration / Qty survive; the four money columns do not.
  expect(screen.getAllByRole('columnheader')).toHaveLength(3);
  expect(screen.getByRole('columnheader', { name: 'Qty' })).toBeInTheDocument();
  for (const gone of ['Unit (ex)', 'Disc%', 'Amount', 'GST']) {
    expect(screen.queryByRole('columnheader', { name: gone })).toBeNull();
  }

  // No unit price, no line amount, no subtotal, no GST line, no grand total.
  expect(screen.queryByText('$20.00')).toBeNull();
  expect(screen.queryByText('$200.00')).toBeNull();
  expect(screen.queryByText('Subtotal (ex GST)')).toBeNull();
  expect(screen.queryByText('GST (10%)')).toBeNull();
  expect(screen.queryByText('TOTAL (inc GST)')).toBeNull();

  // What is owed is the whole point of the variant.
  expect(screen.getByText('BALANCE DUE')).toBeInTheDocument();
  expect(screen.getByText('$175.00')).toBeInTheDocument();

  // The section row has to span the narrowed table or the header breaks.
  expect(screen.getByText('Embroidered polos')).toHaveAttribute('colspan', '3');
});

test('the matched customer record fills the bill-to block', () => {
  setup();
  expect(screen.getByText('Respondek Logistics')).toBeInTheDocument();
  expect(screen.getByText('ABN: 99 888 777 666')).toBeInTheDocument();
  expect(screen.getByText('Ph: 02 8000 4321')).toBeInTheDocument();
  expect(screen.getByText('dock@respondek.example')).toBeInTheDocument();
  expect(screen.getByText('Terms:')).toBeInTheDocument();
  expect(screen.getByText('30 days')).toBeInTheDocument();
  expect(screen.getByText('Ship To')).toBeInTheDocument();
  expect(screen.getByText('Botany Depot')).toBeInTheDocument();
});

test('a customerId that matches nothing still prints the job it has', () => {
  setup({ invoiceJob: job({ customerId: 999 }) });
  expect(screen.getByText('Respondek Logistics')).toBeInTheDocument();
  expect(screen.queryByText('ABN: 99 888 777 666')).toBeNull();
  expect(screen.queryByText('Ph: 02 8000 4321')).toBeNull();
  expect(screen.queryByText('Terms:')).toBeNull();
  // The company's own ABN is not the customer's and must survive regardless:
  // once in the letterhead, once in the footer.
  expect(screen.getAllByText(/12 345 678 901/)).toHaveLength(2);
});

test('a job with no lines says so instead of printing an empty table', () => {
  setup({ invoiceJob: job({ items: [] }) });
  expect(screen.getByText('No line items')).toBeInTheDocument();
  // Subtotal, GST and total all collapse to zero — and nothing is owed.
  expect(screen.getAllByText('$0.00')).toHaveLength(3);
  expect(screen.getByText('PAID')).toBeInTheDocument();
});

test('the download link points at this job in this document type', () => {
  setup();
  expect(screen.getByRole('link', { name: /download pdf/i })).toHaveAttribute(
    'href',
    '/api/jobs/J-4102/pdf?type=invoice'
  );
});

test('print and close reach their handlers', () => {
  const { setInvoiceJob } = setup();

  const buttons = screen.getAllByRole('button');
  expect(buttons).toHaveLength(2);
  const [printButton, closeButton] = buttons;
  expect(printButton).toHaveAccessibleName(/print/i);
  // closeButton is icon-only and has no accessible name — see the summary.
  expect(closeButton).toHaveAccessibleName('');

  fireEvent.click(printButton);
  expect(printSpy).toHaveBeenCalledTimes(1);

  fireEvent.click(closeButton);
  expect(setInvoiceJob).toHaveBeenCalledWith(null);
});
