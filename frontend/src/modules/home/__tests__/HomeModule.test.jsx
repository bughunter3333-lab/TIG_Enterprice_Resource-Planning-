/**
 * Home as a person sees it: their tiles, under To-dos and Insights, each one
 * button that opens the list it counts — and nothing they may not read.
 */
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { accounting, jobs as jobsApi, reports, supplierBills, users } from '../../../api';
import { addDays, todayKey } from '../../../lib/dates';
import { basQuarter } from '../../accounting/accountingFormat';
import HomeModule from '../HomeModule';

vi.mock('../../../api', () => ({
  users: { myAccess: vi.fn(), list: vi.fn() },
  reports: { agedReceivables: vi.fn() },
  supplierBills: { summary: vi.fn() },
  accounting: { health: vi.fn(), bas: vi.fn() },
  jobs: { orderRequirements: vi.fn() },
}));

const today = todayKey();
const STAFF = { id: 2, username: 'j.smith', full_name: 'Jo Smith', role: 'staff' };
const ACCESS = { role: 'staff', areas: [], allowed: ['GET /jobs', 'POST /jobs'] };

const JOBS = [
  { id: 1, status: 'PRINT', due: addDays(today, -3), assignedTo: 'j.smith' },
  { id: 2, status: 'ORDER', due: today },
  { id: 3, status: 'QUOTE', due: '', validityDate: addDays(today, 2) },
];
const loaded = (data) => ({ jobs: { data, isPending: false, isError: false } });

const open = async (props = {}, options) => {
  const onOpenQuickList = vi.fn();
  const onOpenLink = vi.fn();
  renderWithQuery(
    <HomeModule currentUser={STAFF} sources={loaded(JOBS)} onOpenQuickList={onOpenQuickList} onOpenLink={onOpenLink} {...props} />,
    options,
  );
  return { onOpenQuickList, onOpenLink };
};
const section = (name) => within(screen.getByRole('region', { name }));

beforeEach(() => {
  vi.clearAllMocks();
  users.myAccess.mockResolvedValue(ACCESS);
});

test('the header names the page, the person and today', async () => {
  await open();
  expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
  expect(screen.getByText('Jo Smith')).toBeInTheDocument();
  expect(screen.getByText(new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()))).toBeInTheDocument();
});

test('a staff member’s tiles, under To-dos and Insights, in their order', async () => {
  await open();
  await screen.findByRole('heading', { name: 'To-dos' });
  expect(section('To-dos').getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
    'Due today, 1 job, to deliver today',
    'Overdue, 1 job, past due date',
    'Finished not despatched, 0 jobs, not yet despatched',
    'Quotes expiring this week, 1 quote, lapse within 7 days',
  ]);
  expect(section('Insights').getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
    'My jobs, 1 job, yours to deliver',
    'Pick/Pack, 0 jobs, ready to pick',
  ]);
});

test('a tile opens the list it counts', async () => {
  const { onOpenQuickList } = await open();
  fireEvent.click(await screen.findByRole('button', { name: /^Overdue/ }));
  expect(onOpenQuickList).toHaveBeenCalledWith('overdue');
  fireEvent.click(screen.getByRole('button', { name: /^Quotes expiring/ }));
  expect(onOpenQuickList).toHaveBeenCalledWith('quoteExpiring');
  fireEvent.click(screen.getByRole('button', { name: /^My jobs/ }));
  expect(onOpenQuickList).toHaveBeenCalledWith('myJobs');
});

test('a tile whose data failed says so, never 0, and still opens its list', async () => {
  const { onOpenQuickList } = await open({ sources: { jobs: { data: [], isPending: false, isError: true } } });
  const tile = await screen.findByRole('button', { name: "Overdue, couldn't load" });
  expect(within(tile).getByText("Couldn't load")).toBeInTheDocument();
  expect(within(tile).queryByText('0')).not.toBeInTheDocument();
  fireEvent.click(tile);
  expect(onOpenQuickList).toHaveBeenCalledWith('overdue');
});

test('a tile still loading is busy', async () => {
  await open({ sources: { jobs: { data: undefined, isPending: true, isError: false } } });
  expect(await screen.findByRole('button', { name: 'Overdue, loading' })).toHaveAttribute('aria-busy', 'true');
});

test('when every queue is empty, To-dos says nothing needs you', async () => {
  await open({ sources: loaded([{ id: 9, status: 'Pick/Pack', due: addDays(today, 4) }]) });
  await screen.findByRole('region', { name: 'To-dos' });
  expect(section('To-dos').getByText('Nothing needs you right now.')).toBeInTheDocument();
  expect(section('To-dos').queryByRole('button')).not.toBeInTheDocument();
  expect(section('Insights').getByRole('button', { name: 'Pick/Pack, 1 job, ready to pick' })).toBeInTheDocument();
});

test('a role that may not read jobs sees no job tiles', async () => {
  users.myAccess.mockResolvedValue({ ...ACCESS, allowed: ['POST /jobs'] });
  await open();
  expect(await screen.findByText('Nothing to show here for your role.')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('the tiles follow the role the server reports', async () => {
  users.myAccess.mockResolvedValue({ ...ACCESS, role: 'admin' });
  await open();
  expect(await screen.findByRole('button', { name: /^To invoice/ })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'To-dos' })).not.toBeInTheDocument();
});

describe('the admin’s money and accounts tiles', () => {
  const ADMIN = { id: 1, username: 'emon', full_name: 'Emon Miah', role: 'admin' };
  const ADMIN_ACCESS = {
    role: 'admin', areas: [],
    allowed: [
      'GET /jobs', 'GET /reports/aged-receivables', 'GET /ap/summary', 'GET /ap/bills',
      'GET /accounting/health', 'GET /accounting/reports/bas', 'GET /users',
    ],
  };
  const REPORT = {
    rows: [{ customer_id: 'C1', lines: [{ days_overdue: 0 }, { days_overdue: 45 }] }],
    totals: { current: 1000, days_1_30: 0, days_31_60: 2500, days_61_90: 0, over_90: 0, total: 3500 },
  };
  const HEALTHY = {
    in_agreement: true, receivables: { difference: 0 }, payables: { difference: 0 },
    unposted_invoices: [], mismatched_jobs: [], paid_with_balance_owing: [], invoiced_without_date: [],
  };
  const tile = (name) => screen.findByRole('button', { name: new RegExp(`^${name}`) });

  beforeEach(() => {
    users.myAccess.mockResolvedValue(ADMIN_ACCESS);
    reports.agedReceivables.mockResolvedValue(REPORT);
    supplierBills.summary.mockResolvedValue({ overdue_count: 2, overdue_amount: 880 });
    accounting.health.mockResolvedValue(HEALTHY);
    accounting.bas.mockResolvedValue({ net_gst: 1500 });
    users.list.mockResolvedValue([
      { id: 1, is_active: true, totp_enabled: true },
      { id: 2, is_active: true, totp_enabled: false },
    ]);
  });

  test('each reads its report and says what it counts', async () => {
    await open({ currentUser: ADMIN });
    expect(await tile('Owed to us, \\$3.5K')).toHaveAccessibleName('Owed to us, $3.5K, 1 customer, invoiced, not yet paid');
    expect(await tile('Overdue receivables, \\$2.5K')).toHaveAccessibleName('Overdue receivables, $2.5K, 1 invoice, past the customer’s terms');
    expect(await tile('Supplier bills overdue, \\$880')).toHaveAccessibleName('Supplier bills overdue, $880, 2 bills, past their due date');
    expect(await tile('Ledger health, 0')).toHaveAccessibleName('Ledger health, 0 in agreement, ledger against jobs and bills');
    const { label, from, to } = basQuarter(todayKey());
    expect(await tile('GST this quarter, \\$1.5K')).toHaveAccessibleName(`GST this quarter, $1.5K, payable for ${label}, net GST on the BAS`);
    expect(accounting.bas).toHaveBeenCalledWith(from, to);
    expect(await tile('Accounts needing attention, 1')).toBeInTheDocument();
  });

  test('each opens the screen that shows what it counted', async () => {
    const { onOpenLink } = await open({ currentUser: ADMIN });
    fireEvent.click(await tile('Owed to us, \\$'));
    expect(onOpenLink).toHaveBeenLastCalledWith({ module: 'reports', tab: 'aged' });
    fireEvent.click(await tile('Supplier bills overdue, \\$'));
    expect(onOpenLink).toHaveBeenLastCalledWith({ module: 'accounts', tab: 'payables' });
    fireEvent.click(await tile('Ledger health, 0'));
    expect(onOpenLink).toHaveBeenLastCalledWith({ module: 'accounts', tab: 'setup' });
    fireEvent.click(await tile('GST this quarter, \\$'));
    const { from, to } = basQuarter(todayKey());
    expect(onOpenLink).toHaveBeenLastCalledWith({ module: 'accounts', tab: 'reports', report: { report: 'bas', from, to } });
    fireEvent.click(await tile('Accounts needing attention, 1'));
    expect(onOpenLink).toHaveBeenLastCalledWith({ admin: true, usersFilter: 'attention' });
  });

  test('a report that failed says "Couldn\'t load", never $0', async () => {
    reports.agedReceivables.mockRejectedValue(new Error('Request failed: 500'));
    await open({ currentUser: ADMIN }, { allowQueryErrors: true });
    const owed = await screen.findByRole('button', { name: "Owed to us, couldn't load" });
    expect(within(owed).getByText("Couldn't load")).toBeInTheDocument();
    expect(within(owed).queryByText('$0')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: "Overdue receivables, couldn't load" })).toBeInTheDocument();
    // The other tiles read their own reports and are unaffected.
    expect(await tile('Supplier bills overdue, \\$880')).toBeInTheDocument();
  });

  test('a role that may not read them is never sent to fetch them', async () => {
    // Staff: jobs only.
    users.myAccess.mockResolvedValue(ACCESS);
    await open();
    await screen.findByRole('heading', { name: 'To-dos' });
    expect(screen.queryByRole('button', { name: /^Owed to us/ })).not.toBeInTheDocument();
    expect(reports.agedReceivables).not.toHaveBeenCalled();
    expect(supplierBills.summary).not.toHaveBeenCalled();
    expect(accounting.health).not.toHaveBeenCalled();
    expect(accounting.bas).not.toHaveBeenCalled();
    expect(users.list).not.toHaveBeenCalled();
    expect(jobsApi.orderRequirements).not.toHaveBeenCalled();
  });
});

describe('the manager’s stock and purchasing tiles', () => {
  const MANAGER = { id: 3, username: 'm.lee', full_name: 'Mo Lee', role: 'manager' };
  const MANAGER_ACCESS = {
    role: 'manager', areas: [],
    allowed: ['GET /jobs', 'GET /inventory', 'GET /purchase-orders', 'GET /jobs/order-requirements'],
  };
  const sources = {
    jobs: { data: [], isPending: false, isError: false },
    inventory: { data: [{ sku: 'A', stock: 1, min_stock: 10 }, { sku: 'B', stock: 50, min_stock: 10 }], isPending: false, isError: false },
    purchaseOrders: { data: [{ id: 'PO-1', status: 'Sent', expectedDate: addDays(today, -2) }, { id: 'PO-2', status: 'Sent', expectedDate: today }], isPending: false, isError: false },
  };

  beforeEach(() => {
    users.myAccess.mockResolvedValue(MANAGER_ACCESS);
    jobsApi.orderRequirements.mockResolvedValue([{ sku: 'TEE', jobs: [] }, { sku: 'POLO', jobs: [] }, { sku: 'CAP', jobs: [] }]);
  });

  test('count what they open, and open it', async () => {
    const { onOpenLink } = await open({ currentUser: MANAGER, sources });
    const reorder = await screen.findByRole('button', { name: 'Needs reorder, 1 item, at or below minimum, after orders' });
    const late = screen.getByRole('button', { name: 'Supplier POs late, 1 PO, past their expected date' });
    const garments = await screen.findByRole('button', { name: 'Garment lines to order, 3 stock codes, back-ordered, no PO yet' });
    expect(jobsApi.orderRequirements).toHaveBeenCalledWith('garment');
    fireEvent.click(reorder);
    expect(onOpenLink).toHaveBeenLastCalledWith({ module: 'inventory', chip: 'reorder' });
    fireEvent.click(late);
    expect(onOpenLink).toHaveBeenLastCalledWith({ module: 'purchase-orders', poStatus: 'late' });
    fireEvent.click(garments);
    expect(onOpenLink).toHaveBeenLastCalledWith({ module: 'order-requirements' });
    await waitFor(() => expect(reports.agedReceivables).not.toHaveBeenCalled());
  });
});

describe('work in hand', () => {
  const WORK = [
    { id: 1, status: 'QUOTE' }, { id: 2, status: 'ORDER' }, { id: 3, status: 'PROOF' },
    { id: 4, status: 'FINISH' }, { id: 5, status: 'PAID' },
  ];

  test('counts the open jobs by stage, and opens the lists it names', async () => {
    const { onOpenQuickList } = await open({ sources: loaded(WORK) });
    const panel = within(await screen.findByRole('region', { name: 'Work in hand' }));
    expect(panel.getByText('4')).toBeInTheDocument();
    expect(panel.getByRole('img')).toHaveAccessibleName('Quoted 1, In production 1, With the customer 1, To invoice 1');
    fireEvent.click(panel.getByRole('button', { name: /With the customer/ }));
    expect(onOpenQuickList).toHaveBeenCalledWith('proof');
  });

  test('a list the person already has as a tile is not offered twice', async () => {
    users.myAccess.mockResolvedValue({ ...ACCESS, role: 'admin' });
    await open({ sources: loaded(WORK) });
    const panel = within(await screen.findByRole('region', { name: 'Work in hand' }));
    expect(panel.queryByRole('button', { name: /To invoice/ })).not.toBeInTheDocument();
    expect(panel.getByRole('button', { name: /In production/ })).toBeInTheDocument();
  });

  test('is not shown to a role that may not read jobs', async () => {
    users.myAccess.mockResolvedValue({ ...ACCESS, allowed: ['POST /jobs'] });
    await open({ sources: loaded(WORK) });
    await screen.findByText('Nothing to show here for your role.');
    expect(screen.queryByRole('region', { name: 'Work in hand' })).not.toBeInTheDocument();
  });
});

test('when access cannot be loaded, Home says so and offers to try again', async () => {
  users.myAccess.mockRejectedValue(new Error('down'));
  await open({}, { allowQueryErrors: true });
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load what your role can see.");
  users.myAccess.mockResolvedValue(ACCESS);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: 'To-dos' })).toBeInTheDocument();
});
