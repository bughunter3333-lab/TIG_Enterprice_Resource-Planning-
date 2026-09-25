/**
 * The accounting screens.
 *
 * The ledger's rules live on the server and are tested there. What is tested
 * here is what a person relies on the screen to do: never let an unbalanced
 * journal be posted, show a statement's headline figures, tell automatic
 * entries (corrected at their source) from manual ones (reversed here), say
 * plainly when the ledger and the documents disagree, and show each role only
 * what the server will let it use.
 */
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { accounting, supplierBills } from '../../../api';
import AccountingModule from '../AccountingModule';
import NewJournalModal, { journalProblems } from '../NewJournalModal';
import ReportsTab from '../ReportsTab';
import SetupTab from '../SetupTab';
import JournalsTab from '../JournalsTab';
import AccountsPayableModule from '../../AccountsPayableModule';

vi.mock('../../../api', () => ({
  accounting: {
    accounts: vi.fn(),
    accountOptions: vi.fn(),
    journals: vi.fn(),
    postJournal: vi.fn(),
    reverseJournal: vi.fn(),
    profitLoss: vi.fn(),
    balanceSheet: vi.fn(),
    trialBalance: vi.fn(),
    bas: vi.fn(),
    health: vi.fn(),
    lockDate: vi.fn(),
    setLockDate: vi.fn(),
    backfill: vi.fn(),
    generalLedger: vi.fn(),
  },
  supplierBills: {
    list: vi.fn(),
    summary: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

const ACCOUNTS = [
  { id: 1, code: '1000', name: 'Business Bank Account', category: 'asset', role: 'bank', is_active: true, balance: 500 },
  { id: 2, code: '6100', name: 'Rent', category: 'expense', role: null, is_active: true, balance: 0 },
  { id: 3, code: '6300', name: 'Bank Fees', category: 'expense', role: null, is_active: true, balance: 0 },
];

const HEALTHY = {
  in_agreement: true,
  receivables: { ledger: 110, documents: 110, difference: 0 },
  payables: { ledger: 0, documents: 0, difference: 0 },
  unposted_invoices: [], mismatched_jobs: [], paid_with_balance_owing: [], invoiced_without_date: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  accounting.accounts.mockResolvedValue(ACCOUNTS);
  accounting.accountOptions.mockResolvedValue(ACCOUNTS.filter((a) => a.category === 'expense'));
  accounting.postJournal.mockResolvedValue({ id: 9 });
  accounting.health.mockResolvedValue(HEALTHY);
  accounting.lockDate.mockResolvedValue({ lock_date: null });
  accounting.profitLoss.mockResolvedValue({
    date_from: '2026-07-01', date_to: '2026-09-25',
    income: [{ account_id: 10, code: '4000', name: 'Sales', category: 'income', amount: 1500 }],
    total_income: 1500,
    cost_of_sales: [{ account_id: 11, code: '5000', name: 'Purchases', category: 'cost_of_sales', amount: 400 }],
    total_cost_of_sales: 400, gross_profit: 1100,
    expenses: [{ account_id: 2, code: '6100', name: 'Rent', category: 'expense', amount: 1300 }],
    total_expenses: 1300, net_profit: -200,
  });
  supplierBills.list.mockResolvedValue([]);
  supplierBills.summary.mockResolvedValue({});
  supplierBills.create.mockResolvedValue({});
});

describe('journalProblems', () => {
  const line = (accountId, debit, credit) => ({ key: Math.random(), accountId, debit, credit, description: '' });

  test('a balanced journal has no problems', () => {
    expect(journalProblems([line('2', '100', ''), line('1', '', '100')]).problems).toEqual([]);
  });

  test('an unbalanced one says by how much', () => {
    expect(journalProblems([line('2', '100', ''), line('1', '', '99.99')]).problems).toEqual(['Out by 0.01']);
  });

  test('a line with both sides is caught, even when the totals balance', () => {
    const { problems } = journalProblems([line('2', '50', '50'), line('1', '', '0')]);
    expect(problems.some((p) => p.includes('both a debit and a credit'))).toBe(true);
  });

  test('cents do not drift', () => {
    // 0.1 + 0.2 in floating point is 0.30000000000000004.
    expect(journalProblems([line('2', '0.1', ''), line('3', '0.2', ''), line('1', '', '0.3')]).problems).toEqual([]);
  });
});

describe('NewJournalModal', () => {
  const pick = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

  test('cannot post until it balances, then posts exactly what was typed', async () => {
    renderWithQuery(<NewJournalModal onClose={() => {}} />);
    await screen.findAllByRole('option', { name: /Rent/ });
    fireEvent.change(screen.getByPlaceholderText('September rent'), { target: { value: 'Rent' } });
    pick('Line 1 account', '2');
    pick('Line 1 debit', '1000');
    pick('Line 2 account', '1');
    pick('Line 2 credit', '999');

    const post = screen.getByRole('button', { name: 'Post journal' });
    expect(post).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Out by 1.00');

    pick('Line 2 credit', '1000');
    expect(screen.getByRole('status')).toHaveTextContent('Balanced');
    fireEvent.click(post);

    await waitFor(() => expect(accounting.postJournal).toHaveBeenCalled());
    const body = accounting.postJournal.mock.calls[0][0];
    expect(body.memo).toBe('Rent');
    expect(body.lines).toEqual([
      { account_id: 2, debit: 1000, credit: 0, description: null },
      { account_id: 1, debit: 0, credit: 1000, description: null },
    ]);
  });
});

describe('ReportsTab', () => {
  test('the profit and loss sets gross and net profit apart, a loss in brackets', async () => {
    renderWithQuery(<ReportsTab />);
    expect(await screen.findByText('Gross Profit')).toBeInTheDocument();
    expect(screen.getByText('1,100.00')).toBeInTheDocument();
    expect(screen.getByText('(200.00)')).toBeInTheDocument();
  });

  test('the balance sheet says whether it balances', async () => {
    accounting.balanceSheet.mockResolvedValue({
      as_at: '2026-09-25', financial_year_start: '2026-07-01',
      assets: [], total_assets: 0, liabilities: [], total_liabilities: 0, equity: [],
      retained_earnings_prior_years: 0, current_year_earnings: 0, total_equity: 0, balanced: false,
    });
    renderWithQuery(<ReportsTab />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Balance Sheet' }));
    expect(await screen.findByText(/Does not balance/)).toBeInTheDocument();
  });
});

describe('SetupTab', () => {
  test('a disagreement is listed by job, with what to do about it', async () => {
    accounting.health.mockResolvedValue({
      ...HEALTHY,
      in_agreement: false,
      paid_with_balance_owing: [{ job_id: '1207509', customer: 'Outback Mining', unpaid: 1980 }],
    });
    renderWithQuery(<SetupTab currentUser={{ role: 'manager' }} />);
    expect(await screen.findByText(/does not agree/)).toBeInTheDocument();
    expect(screen.getByText('1207509')).toBeInTheDocument();
    expect(screen.getByText(/Record the payment on the job/)).toBeInTheDocument();
  });

  test('a manager sees the health check but not the controls', async () => {
    renderWithQuery(<SetupTab currentUser={{ role: 'manager' }} />);
    expect(await screen.findByText(/agrees with the jobs and bills/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bring history into the ledger' })).not.toBeInTheDocument();
  });

  test('an admin can bring history in', async () => {
    accounting.backfill.mockResolvedValue({ entries_posted: 4, health: HEALTHY });
    renderWithQuery(<SetupTab currentUser={{ role: 'admin' }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bring history into the ledger' }));
    expect(await screen.findByText('4 entries posted')).toBeInTheDocument();
  });
});

describe('JournalsTab', () => {
  const entry = (over) => ({
    id: 1, number: 'JE-000001', date: '2026-09-25', memo: 'Invoice J-1 — Acme', total: 110,
    source_type: 'invoice', source_id: 'J-1', reverses_id: null, reversed_by_id: null, created_by: 'System',
    lines: [
      { id: 1, account_id: 5, account_code: '1100', account_name: 'Accounts Receivable', debit: 110, credit: 0, description: 'Invoice J-1', job_id: 'J-1' },
      { id: 2, account_id: 6, account_code: '4000', account_name: 'Sales', debit: 0, credit: 110, description: 'Invoice J-1', job_id: 'J-1' },
    ],
    ...over,
  });

  test('an automatic entry points at its document and cannot be reversed here', async () => {
    accounting.journals.mockResolvedValue({ total: 1, entries: [entry()] });
    renderWithQuery(<JournalsTab currentUser={{ role: 'admin' }} />);
    fireEvent.click(await screen.findByText('JE-000001'));
    expect(screen.getByText(/change that document/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reverse journal' })).not.toBeInTheDocument();
  });

  test('a manual journal can be reversed by an admin, not by a manager', async () => {
    accounting.journals.mockResolvedValue({ total: 1, entries: [entry({ source_type: 'manual', source_id: null, memo: 'Rent' })] });
    const { unmount } = renderWithQuery(<JournalsTab currentUser={{ role: 'admin' }} />);
    fireEvent.click(await screen.findByText('JE-000001'));
    expect(screen.getByRole('button', { name: 'Reverse journal' })).toBeInTheDocument();
    unmount();

    renderWithQuery(<JournalsTab currentUser={{ role: 'manager' }} />);
    fireEvent.click(await screen.findByText('JE-000001'));
    expect(screen.queryByRole('button', { name: 'Reverse journal' })).not.toBeInTheDocument();
  });
});

describe('AccountingModule', () => {
  test('staff see payables and nothing of the ledger', async () => {
    renderWithQuery(<AccountingModule currentUser={{ role: 'staff' }} />);
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Payables']);
  });

  test('a manager lands on the reports', async () => {
    renderWithQuery(<AccountingModule currentUser={{ role: 'manager' }} />);
    // The first tablist is the module's; the Reports tab has its own inside it.
    const moduleTabs = within(screen.getAllByRole('tablist')[0]).getAllByRole('tab');
    expect(moduleTabs.map((t) => t.textContent)).toEqual(
      ['Payables', 'Reports', 'Journals', 'Chart of Accounts', 'Ledger Health'],
    );
    expect(await screen.findByText('Net Profit')).toBeInTheDocument();
  });
});

describe('a bill is coded to an account', () => {
  test('the chosen account is sent with the bill', async () => {
    renderWithQuery(<AccountsPayableModule suppliers={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: /New Bill/i }));
    fireEvent.change(screen.getByPlaceholderText('Supplier name'), { target: { value: 'Landlord' } });
    const account = await screen.findByLabelText('Account');
    await within(account).findByRole('option', { name: /Rent/ });
    fireEvent.change(account, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }));
    await waitFor(() => expect(supplierBills.create).toHaveBeenCalled());
    expect(supplierBills.create.mock.calls[0][0].accountId).toBe(2);
  });
});
