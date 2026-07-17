import { parseD } from '../../ui/dates';

// Jim2 "Auto Pick Stock": allocate on-hand stock FIFO down the list order —
// each job claims stock for its product lines before later jobs get any.
// Returns { [jobId]: pct } where pct = % of the job's stock requirement that
// can be picked right now. SKUs not tracked in inventory (services,
// decoration charge lines) count as available so they never block a pick.
export function computeAutoPickAvailability(jobs, inventory) {
  const pool = new Map((inventory || []).map(i => [i.sku, Math.max(0, Number(i.stock) || 0)]));
  const out = {};
  for (const job of jobs || []) {
    const lines = (job.items || []).filter(
      it => (it.displayType || 'product') === 'product' && it.stockCode
    );
    let need = 0;
    let got = 0;
    for (const line of lines) {
      const req = Number(line.supply || line.qty || line.order || 0);
      if (req <= 0) continue;
      need += req;
      if (!pool.has(line.stockCode)) { got += req; continue; } // untracked SKU
      const avail = pool.get(line.stockCode);
      const take = Math.min(req, avail);
      got += take;
      pool.set(line.stockCode, avail - take);
    }
    out[job.id] = need > 0 ? Math.round((got / need) * 100) : 100;
  }
  return out;
}

export const QUICK_FILTERS = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'dueToday', label: 'Due Today' },
  { id: 'thisWeek', label: 'This Week' },
  { id: 'inProduction', label: 'In Production' },
  { id: 'needsInvoice', label: 'Needs Invoice' },
  { id: 'myJobs', label: 'My Jobs' },
  { id: 'urgent', label: 'Urgent' },
];

export const EMPTY_JOBS_FILTERS = {
  searchTerm: '',
  status: 'all',
  priority: 'all',
  customer: 'all',
  assignedTo: 'all',
  dateFrom: '',
  dateTo: '',
  dateField: 'due',
  shipCode: 'all',
  customerGroup: 'all',
  openFreight: false,
  quick: null,
  jobList: null,
};

// Jim2's status-class checkboxes (Active / Ready / Finish / Inv'd / Quote).
// Each maps a job status onto one of our workflow buckets. When several are
// ticked the job only has to match one of them (OR within the checked set).
export const JOB_LIST_CLASSES = {
  quote: (s) => s === 'QUOTE',
  active: (s) => ['New', 'ORDER', 'In Progress', 'PROOF', 'PRINT', 'Pick/Pack'].includes(s),
  ready: (s) => s === 'Pick/Pack',
  finish: (s) => s === 'FINISH',
  invoiced: (s) => ['INVOICE', 'PAID'].includes(s),
};

const _contains = (val, q) => !q || String(val || '').toLowerCase().includes(String(q).toLowerCase());

const _inRange = (raw, from, to) => {
  if (!from && !to) return true;
  const d = parseD(raw);
  if (!d) return false; // a date filter excludes records without that date (Jim2 behaviour)
  if (from && d < new Date(from)) return false;
  if (to && d > new Date(to + 'T23:59:59')) return false;
  return true;
};

const _FINISHED = ['FINISH', 'INVOICE', 'PAID', 'CANCEL'];

// The saved/advanced "Job List" predicate. Every field is optional, so an empty
// object (or null) matches everything; only populated fields constrain results.
// `now` is injectable so the "overdue" toggle stays deterministic in tests.
export function matchJobList(job, jl, now = new Date()) {
  if (!jl) return true;
  if (jl.customerId && job.customerId !== jl.customerId) return false;
  if (jl.status && job.status !== jl.status) return false;
  if (jl.priority && job.priority !== jl.priority) return false;
  if (jl.type && job.type !== jl.type) return false;
  if (jl.accMgr && job.accMgr !== jl.accMgr) return false;
  if (jl.shipTo && job.shipTo !== jl.shipTo) return false;
  if (jl.branch && job.branch !== jl.branch) return false;
  if (jl.group) {
    const g = job.customerId ? job.customerId.split('.')[0] : '';
    if (g !== jl.group) return false;
  }
  if (!_contains(job.id, jl.jobNo)) return false;
  if (!_contains(job.custRef, jl.custRef)) return false;
  if (!_contains(job.ourRef, jl.ourRef)) return false;
  if (!_contains(job.invoice, jl.invoice)) return false;
  if (!_contains(job.projectNo, jl.projectNo)) return false;
  if (!_contains(job.serialNo, jl.serialNo)) return false;
  if (!_contains(job.priceLevel, jl.priceLevel)) return false;
  // Name matches the customer or the on-job contact name
  if (jl.name && !(_contains(job.customer, jl.name) || _contains(job.nameContact, jl.name))) return false;
  // Item# / Stock# matches any line's stock code or description
  if (jl.stockCode) {
    const q = jl.stockCode.toLowerCase();
    const hit = (job.items || []).some(
      (it) => String(it.stockCode || '').toLowerCase().includes(q) || String(it.description || '').toLowerCase().includes(q)
    );
    if (!hit) return false;
  }
  if (!_inRange(job.dateIn, jl.dateInFrom, jl.dateInTo)) return false;
  if (!_inRange(job.due, jl.dueFrom, jl.dueTo)) return false;
  if (!_inRange(job.out, jl.dateOutFrom, jl.dateOutTo)) return false;
  if (jl.overdue) {
    const d = parseD(job.due);
    if (!d || d >= now || _FINISHED.includes(job.status)) return false;
  }
  if (jl.tax && !(Number(job.tax) > 0)) return false;
  const classes = Object.keys(JOB_LIST_CLASSES).filter((k) => jl[k]);
  if (classes.length && !classes.some((k) => JOB_LIST_CLASSES[k](job.status))) return false;
  return true;
}

export function buildFilterOptions(jobs) {
  const uniqueCustomers = [...new Map(jobs.map(j => [j.customerId, { id: j.customerId, name: j.customer }])).values()]
    .filter(c => c.id).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const uniqueAssignees = [...new Set(jobs.map(j => j.assignedTo).filter(Boolean))].sort();
  const uniqueShipCodes = [...new Set(jobs.map(j => j.shipTo).filter(Boolean))].sort();
  const uniqueGroups = [...new Set(jobs.map(j => (j.customerId ? j.customerId.split('.')[0] : null)).filter(Boolean))].sort();
  return { uniqueCustomers, uniqueAssignees, uniqueShipCodes, uniqueGroups };
}

export function filterJobs(jobs, f, currentUser, now = new Date()) {
  return jobs.filter(job => {
    const term = (f.searchTerm || '').toLowerCase();
    const matchesSearch = !term ||
      String(job.id).toLowerCase().includes(term) ||
      (job.customer || '').toLowerCase().includes(term) ||
      (job.customerId || '').toLowerCase().includes(term) ||
      (job.invoice || '').toLowerCase().includes(term) ||
      (job.custRef || '').toLowerCase().includes(term) ||
      (job.ourRef || '').toLowerCase().includes(term) ||
      (job.shipTo || '').toLowerCase().includes(term);

    const matchesStatus = f.status === 'all' || job.status === f.status;
    const matchesPriority = f.priority === 'all' || job.priority === f.priority;
    const matchesCustomer = f.customer === 'all' || job.customerId === f.customer;
    const matchesAssigned = f.assignedTo === 'all' || job.assignedTo === f.assignedTo;

    let matchesDate = true;
    if (f.dateFrom || f.dateTo) {
      const jobDate = parseD(job[f.dateField]);
      if (jobDate) {
        if (f.dateFrom && jobDate < new Date(f.dateFrom)) matchesDate = false;
        if (f.dateTo && jobDate > new Date(f.dateTo + 'T23:59:59')) matchesDate = false;
      }
    }

    const matchesShipCode = f.shipCode === 'all' || job.shipTo === f.shipCode;
    const jobGroup = job.customerId ? job.customerId.split('.')[0] : '';
    const matchesGroup = f.customerGroup === 'all' || jobGroup === f.customerGroup;
    const matchesOpenFreight = !f.openFreight || (job.shipTo && !['PAID', 'CANCEL'].includes(job.status));

    const matchesJobList = matchJobList(job, f.jobList, now);

    let matchesQuick = true;
    if (f.quick) {
      const todayStr = now.toISOString().split('T')[0];
      const due = parseD(job.due);
      const finished = ['PAID', 'CANCEL', 'FINISH', 'INVOICE'].includes(job.status);
      if (f.quick === 'overdue') matchesQuick = !!due && due < now && !finished;
      if (f.quick === 'dueToday') matchesQuick = !!due && due.toISOString().split('T')[0] === todayStr && !finished;
      if (f.quick === 'thisWeek') {
        const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);
        matchesQuick = !!due && due >= now && due <= weekEnd && !finished;
      }
      if (f.quick === 'inProduction') matchesQuick = ['In Progress', 'PROOF', 'PRINT', 'Pick/Pack'].includes(job.status);
      if (f.quick === 'needsInvoice') matchesQuick = job.invoiceStatus === 'to_invoice' || job.status === 'FINISH';
      if (f.quick === 'myJobs') matchesQuick = job.assignedTo === (currentUser?.full_name || currentUser?.username);
      if (f.quick === 'urgent') matchesQuick = job.priority === 'Urgent';
    }

    return matchesSearch && matchesStatus && matchesPriority && matchesCustomer && matchesAssigned && matchesDate && matchesShipCode && matchesGroup && matchesOpenFreight && matchesJobList && matchesQuick;
  });
}
