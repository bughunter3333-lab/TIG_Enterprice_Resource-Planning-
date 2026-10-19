/**
 * Invoices, proformas and quotes.
 *
 * This component no longer draws them; it picks one of four templates and
 * hands it to the shared renderer. So what is asserted here is the choice —
 * which document for which job and variant — and the money, because that is
 * the part where being wrong costs somebody something.
 *
 * The four were previously one component threaded with isQuote, isProforma
 * and balanceOnly. A quote, a tax invoice, a proforma and a proforma showing
 * only the balance are four pieces of paper, and they are four templates now.
 */
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { renderWithQuery } from '../../../test/renderWithQuery';
import InvoiceDocument from '../InvoiceDocument';
import { deriveTotals } from '../TemplateRenderer';
import { documentTemplates, settings } from '../../../api';

const company = {
  company_name: 'Total Image',
  abn: '12 345 678 901',
  bank_name: 'Westpac',
  bank_bsb: '032-000',
  bank_account: '123456',
  bank_account_name: 'Total Image Group Pty Ltd',
};

const job = (over = {}) => ({
  id: '1207512',
  customer: 'Zephyr Apparel',
  status: 'INVOICE',
  invoice: 'INV-4471',
  dateIn: '02/08/2026',
  due: '30/08/2026',
  totalEx: 1200,
  tax: 120,
  totalInc: 1320,
  items: [
    { id: 1, stockCode: 'TEE-BLK-M', description: 'Heavy Tee', qty: 40, priceEx: 12, total: 480 },
    { id: 2, stockCode: 'CAP-NVY', description: 'Cap', qty: 20, priceEx: 18, total: 360 },
    { id: 3, displayType: 'note', description: 'Thread to match' },
    { id: 4, stockCode: 'HID', description: 'Hidden', qty: 99, hide: true },
  ],
  ...over,
});

beforeEach(() => {
  vi.spyOn(documentTemplates, 'list').mockResolvedValue({});
  vi.spyOn(settings, 'getCompany').mockResolvedValue(company);
});
afterEach(() => vi.restoreAllMocks());

const open = (j, variant) =>
  renderWithQuery(
    <InvoiceDocument invoiceJob={j} invoiceVariant={variant} setInvoiceJob={vi.fn()} />,
  );

describe('choosing the document', () => {
  test('renders nothing when nothing is open', () => {
    const { container } = renderWithQuery(
      <InvoiceDocument invoiceJob={null} setInvoiceJob={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('a standard invoice is titled and numbered', async () => {
    open(job(), 'standard');
    await waitFor(() => expect(screen.getByText('TAX INVOICE')).toBeInTheDocument());
    expect(screen.getByText('#1207512')).toBeInTheDocument();
  });

  test('a job in QUOTE status is a quote whatever variant is asked for', async () => {
    // Status wins. Printing a tax invoice for something that has not been
    // agreed is worse than printing a quote for something that has.
    open(job({ status: 'QUOTE' }), 'standard');
    await waitFor(() => expect(screen.getByText('TAX QUOTE')).toBeInTheDocument());
  });

  test('an omitted variant prints a tax invoice, not a proforma', async () => {
    // This used to be the other way round: isProforma was "anything that is not
    // standard", so a missing prop downgraded a real tax invoice to a document
    // stamped "Not a Tax Invoice".
    open(job(), undefined);
    await waitFor(() => expect(screen.getByText('TAX INVOICE')).toBeInTheDocument());
    expect(screen.queryByText(/Not a Tax Invoice/)).toBeNull();
  });

  test('a proforma says it is not a tax invoice and still shows how to pay', async () => {
    open(job(), 'proforma');
    await waitFor(() =>
      expect(screen.getByText('Proforma — Not a Tax Invoice')).toBeInTheDocument(),
    );
    // Awaited separately: the notice comes straight off the template, but the
    // bank line waits on the company query, so asserting it in the same tick
    // reads the placeholder dashes.
    await waitFor(() => expect(screen.getByText(/BSB 032-000/)).toBeInTheDocument());
  });

  test('a quote carries no bank details, because there is nothing to pay yet', async () => {
    open(job({ status: 'QUOTE' }), 'standard');
    await waitFor(() => expect(screen.getByText('TAX QUOTE')).toBeInTheDocument());
    expect(screen.queryByText(/BSB/)).toBeNull();
  });

  test('the balance-only proforma shows what is owed and no prices', async () => {
    const { container } = open(job({ deposit: 1000 }), 'proformaBalance');
    await waitFor(() => expect(screen.getByText('TAX PROFORMA INVOICE')).toBeInTheDocument());
    const heads = [...container.querySelectorAll('th')].map(th => th.textContent);
    expect(heads).toEqual(['SKU', 'Description', 'Qty']);
    expect(within(container).getByText('Balance due')).toBeInTheDocument();
  });
});

describe('company details come from Settings', () => {
  test('the ABN is the configured one', async () => {
    // It was the literal "ABN: 12 345 678 901" in the markup, so the Settings
    // field was decorative.
    vi.mocked(settings.getCompany).mockResolvedValue({ ...company, abn: '99 999 999 999' });
    open(job(), 'standard');
    await waitFor(() => expect(screen.getByText('ABN: 99 999 999 999')).toBeInTheDocument());
  });

  test('the bank details are the configured ones', async () => {
    // These were hardcoded too, which meant the invoice told customers to pay
    // into an account nobody had configured.
    vi.mocked(settings.getCompany).mockResolvedValue({
      ...company, bank_bsb: '062-111', bank_account: '99887766', bank_account_name: 'Someone Else',
    });
    open(job(), 'standard');
    await waitFor(() =>
      expect(screen.getByText(/BSB 062-111 · Account 99887766/)).toBeInTheDocument(),
    );
    expect(screen.getByText('Someone Else')).toBeInTheDocument();
  });
});

describe('the money', () => {
  test('totals sum only the visible lines', () => {
    // The note and the hidden line are not goods.
    expect(deriveTotals(job()).lineCount).toBe(2);
  });

  test('a deposit is deducted and the balance is what remains', () => {
    expect(deriveTotals(job({ deposit: 500 })).balance).toBe('$820.00');
  });

  test('invoicePaid stands in when there is no deposit', () => {
    expect(deriveTotals(job({ invoicePaid: 320 })).balance).toBe('$1000.00');
  });

  test('nothing paid leaves the whole amount owing', () => {
    const t = deriveTotals(job());
    expect(t.paid).toBe('$0.00');
    expect(t.balance).toBe('$1320.00');
  });
});
