import { filterJobs, buildFilterOptions, matchJobList, computeAutoPickAvailability, QUICK_FILTERS, EMPTY_JOBS_FILTERS } from '../jobsFilters';

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

test('matchJobList: name matches customer or on-job contact; branch is exact', () => {
  const js = [
    { id: '1', customer: 'BHP Group', nameContact: 'Jane', branch: 'HQ' },
    { id: '2', customer: 'Onsite', nameContact: 'Bob Jones', branch: 'MELB' },
  ];
  expect(js.filter(j => matchJobList(j, { name: 'jane' })).map(j => j.id)).toEqual(['1']);
  expect(js.filter(j => matchJobList(j, { name: 'jones' })).map(j => j.id)).toEqual(['2']);
  expect(js.filter(j => matchJobList(j, { branch: 'MELB' })).map(j => j.id)).toEqual(['2']);
});

test('matchJobList: Item#/Stock# matches any line stock code or description', () => {
  const js = [
    { id: '1', items: [{ stockCode: 'AS5026', description: 'Staple Tee' }] },
    { id: '2', items: [{ stockCode: 'TW1823', description: 'Hi Vis Polo' }] },
    { id: '3', items: [] },
  ];
  expect(js.filter(j => matchJobList(j, { stockCode: 'as50' })).map(j => j.id)).toEqual(['1']);
  expect(js.filter(j => matchJobList(j, { stockCode: 'polo' })).map(j => j.id)).toEqual(['2']);
  expect(js.filter(j => matchJobList(j, { stockCode: 'zzz' }))).toHaveLength(0);
});

test('matchJobList: overdue toggle uses injected now and excludes finished', () => {
  const NOW = new Date('2026-06-12T00:00:00');
  const js = [
    { id: '1', status: 'PRINT', due: '01/06/2026' },   // past + active → overdue
    { id: '2', status: 'PRINT', due: '20/06/2026' },    // future → not overdue
    { id: '3', status: 'PAID', due: '01/06/2026' },     // past but finished → excluded
  ];
  expect(js.filter(j => matchJobList(j, { overdue: true }, NOW)).map(j => j.id)).toEqual(['1']);
});

test('matchJobList: tax toggle keeps only jobs with tax > 0', () => {
  const js = [{ id: '1', tax: 18 }, { id: '2', tax: 0 }];
  expect(js.filter(j => matchJobList(j, { tax: true })).map(j => j.id)).toEqual(['1']);
});

test('matchJobList: due-date range excludes jobs outside the window', () => {
  // local Y-M-D so it lines up with parseD's reconstruction (TZ-robust)
  const localYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // only jobs due on/after today → 1002 (due tomorrow); 1001/1003 due yesterday
  const out = jobs.filter(j => matchJobList(j, { dueFrom: localYmd(today) }));
  expect(out.map(j => j.id)).toEqual(['1002']);
});

test('computeAutoPickAvailability allocates stock FIFO down the list order', () => {
  const inv = [{ sku: 'TEE', stock: 15 }];
  const js = [
    { id: 'A', items: [{ displayType: 'product', stockCode: 'TEE', supply: 10 }] },
    { id: 'B', items: [{ displayType: 'product', stockCode: 'TEE', supply: 10 }] },
  ];
  // A takes 10 of 15 → 100%; B gets the remaining 5 of 10 → 50%
  expect(computeAutoPickAvailability(js, inv)).toEqual({ A: 100, B: 50 });
  // reversed order flips who gets the stock
  expect(computeAutoPickAvailability([js[1], js[0]], inv)).toEqual({ B: 100, A: 50 });
});

test('computeAutoPickAvailability: untracked SKUs and no-line jobs never block', () => {
  const inv = [{ sku: 'TEE', stock: 0 }];
  const js = [
    { id: 'SVC', items: [{ displayType: 'product', stockCode: 'DEC-EMB', supply: 5 }] }, // not in inventory
    { id: 'EMPTY', items: [] },
    { id: 'OUT', items: [{ displayType: 'product', stockCode: 'TEE', supply: 4 }] },     // tracked, none on hand
  ];
  expect(computeAutoPickAvailability(js, inv)).toEqual({ SVC: 100, EMPTY: 100, OUT: 0 });
});

test('computeAutoPickAvailability mixes tracked + untracked lines proportionally', () => {
  const inv = [{ sku: 'TEE', stock: 5 }];
  const js = [{ id: 'M', items: [
    { displayType: 'product', stockCode: 'TEE', supply: 10 },     // 5 of 10 pickable
    { displayType: 'product', stockCode: 'DEC-EMB', supply: 10 }, // untracked → all 10
  ] }];
  // (5 + 10) / 20 = 75%
  expect(computeAutoPickAvailability(js, inv)).toEqual({ M: 75 });
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
