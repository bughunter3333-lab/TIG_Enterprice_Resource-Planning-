import { filterJobs, buildFilterOptions, matchJobList, QUICK_FILTERS, EMPTY_JOBS_FILTERS } from '../jobsFilters';

const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const today = new Date();
const yesterday = new Date(today.getTime() - 86400000);
const tomorrow = new Date(today.getTime() + 86400000);

const jobs = [
  { id: '1001', customer: 'BHP Group', customerId: 'BHP.HQ', status: 'PRINT', priority: 'Urgent', assignedTo: 'Emon', due: fmt(yesterday), invoice: '', custRef: 'PO-9', ourRef: '', shipTo: 'SYD', total: 500, items: [] },
  { id: '1002', customer: 'Onsite Rental', customerId: 'ONSIT', status: 'QUOTE', priority: 'Normal', assignedTo: 'Sam', due: fmt(tomorrow), invoice: '', custRef: '', ourRef: '', shipTo: 'MEL', total: 300, items: [] },
  { id: '1003', customer: 'BHP Group', customerId: 'BHP.WA', status: 'PAID', priority: 'Normal', assignedTo: 'Emon', due: fmt(yesterday), invoice: 'INV-1', custRef: '', ourRef: '', shipTo: 'SYD', total: 900, items: [] },
];

test('no filters returns all jobs', () => {
  expect(filterJobs(jobs, EMPTY_JOBS_FILTERS, null)).toHaveLength(3);
});

test('search matches id, customer, customerId, refs', () => {
  expect(filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, searchTerm: 'bhp' }, null)).toHaveLength(2);
  expect(filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, searchTerm: '1002' }, null)).toHaveLength(1);
  expect(filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, searchTerm: 'po-9' }, null)).toHaveLength(1);
});

test('status, priority, customer, assignee filters', () => {
  expect(filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, status: 'PRINT' }, null)).toHaveLength(1);
  expect(filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, priority: 'Urgent' }, null)).toHaveLength(1);
  expect(filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, customer: 'ONSIT' }, null)).toHaveLength(1);
  expect(filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, assignedTo: 'Emon' }, null)).toHaveLength(2);
});

test('quick filter overdue excludes finished statuses', () => {
  // 1001 PRINT overdue → in; 1003 PAID overdue → out
  const out = filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, quick: 'overdue' }, null);
  expect(out.map(j => j.id)).toEqual(['1001']);
});

test('quick filter myJobs matches assignedTo against current user', () => {
  const out = filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, quick: 'myJobs' }, { username: 'Emon' });
  expect(out.map(j => j.id)).toEqual(['1001', '1003']);
});

test('customerGroup filters on customerId prefix before the dot', () => {
  const out = filterJobs(jobs, { ...EMPTY_JOBS_FILTERS, customerGroup: 'BHP' }, null);
  expect(out).toHaveLength(2);
});

test('buildFilterOptions produces sorted unique lists', () => {
  const o = buildFilterOptions(jobs);
  expect(o.uniqueCustomers.map(c => c.id)).toEqual(['BHP.HQ', 'BHP.WA', 'ONSIT']);
  expect(o.uniqueAssignees).toEqual(['Emon', 'Sam']);
  expect(o.uniqueShipCodes).toEqual(['MEL', 'SYD']);
  expect(o.uniqueGroups).toEqual(['BHP', 'ONSIT']);
});

test('matchJobList: empty/null draft matches everything', () => {
  expect(jobs.every(j => matchJobList(j, null))).toBe(true);
  expect(jobs.every(j => matchJobList(j, {}))).toBe(true);
});

test('matchJobList: text fields are case-insensitive "contains"', () => {
  expect(jobs.filter(j => matchJobList(j, { custRef: 'po' })).map(j => j.id)).toEqual(['1001']);
  expect(jobs.filter(j => matchJobList(j, { jobNo: '100' }))).toHaveLength(3);
  expect(jobs.filter(j => matchJobList(j, { invoice: 'inv-1' })).map(j => j.id)).toEqual(['1003']);
});

test('matchJobList: exact selects (customerId, status, group, accMgr)', () => {
  expect(jobs.filter(j => matchJobList(j, { customerId: 'BHP.HQ' })).map(j => j.id)).toEqual(['1001']);
  expect(jobs.filter(j => matchJobList(j, { status: 'QUOTE' })).map(j => j.id)).toEqual(['1002']);
  expect(jobs.filter(j => matchJobList(j, { group: 'BHP' }))).toHaveLength(2);
});

test('matchJobList: status-class checkboxes OR within the checked set', () => {
  // active = working statuses (PRINT); quote = QUOTE; invoiced = PAID/INVOICE
  expect(jobs.filter(j => matchJobList(j, { active: true })).map(j => j.id)).toEqual(['1001']);
  expect(jobs.filter(j => matchJobList(j, { quote: true })).map(j => j.id)).toEqual(['1002']);
  expect(jobs.filter(j => matchJobList(j, { invoiced: true })).map(j => j.id)).toEqual(['1003']);
  // two classes ticked → union
  expect(jobs.filter(j => matchJobList(j, { active: true, quote: true })).map(j => j.id)).toEqual(['1001', '1002']);
});

test('matchJobList: due-date range excludes jobs outside the window', () => {
  // local Y-M-D so it lines up with parseD's reconstruction (TZ-robust)
  const localYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // only jobs due on/after today → 1002 (due tomorrow); 1001/1003 due yesterday
  const out = jobs.filter(j => matchJobList(j, { dueFrom: localYmd(today) }));
  expect(out.map(j => j.id)).toEqual(['1002']);
});

test('QUICK_FILTERS exposes the seven quick filter ids', () => {
  expect(QUICK_FILTERS.map(q => q.id)).toEqual(['overdue', 'dueToday', 'thisWeek', 'inProduction', 'needsInvoice', 'myJobs', 'urgent']);
});

test('time-sensitive quick filters are deterministic with injected now', () => {
  const FIXED = new Date('2026-06-12T03:00:00Z'); // a stable reference instant
  const d = (date) => `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
  const dayBefore = new Date(FIXED.getTime() - 86400000);
  const dayAfter = new Date(FIXED.getTime() + 86400000);
  const within = new Date(FIXED.getTime() + 3 * 86400000);

  const tjobs = [
    { id: 'A', status: 'PRINT', due: d(dayBefore) },   // overdue
    { id: 'B', status: 'ORDER', due: d(within) },       // this week
    { id: 'C', status: 'In Progress', due: d(dayAfter) }, // in production
    { id: 'D', status: 'FINISH', due: d(dayBefore) },   // needs invoice (and overdue, but finished)
    { id: 'E', status: 'PAID', due: d(dayBefore) },     // finished — excluded from overdue
  ];

  const ids = (quick) => filterJobs(tjobs, { ...EMPTY_JOBS_FILTERS, quick }, null, FIXED).map(j => j.id);

  expect(ids('overdue')).toEqual(['A']);                 // D and E finished, excluded
  expect(ids('thisWeek')).toEqual(['B', 'C']);           // both future within 7 days
  expect(ids('inProduction')).toEqual(['A', 'C']);       // A is PRINT (in production), C is In Progress
  expect(ids('needsInvoice')).toEqual(['D']);            // FINISH status
});
