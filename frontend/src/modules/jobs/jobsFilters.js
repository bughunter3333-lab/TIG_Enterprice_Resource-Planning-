import { parseD } from '../../ui/dates';

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

export function buildFilterOptions(jobs) {
  const uniqueCustomers = [...new Map(jobs.map(j => [j.customerId, { id: j.customerId, name: j.customer }])).values()]
    .filter(c => c.id).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const uniqueAssignees = [...new Set(jobs.map(j => j.assignedTo).filter(Boolean))].sort();
  const uniqueShipCodes = [...new Set(jobs.map(j => j.shipTo).filter(Boolean))].sort();
  const uniqueGroups = [...new Set(jobs.map(j => (j.customerId ? j.customerId.split('.')[0] : null)).filter(Boolean))].sort();
  return { uniqueCustomers, uniqueAssignees, uniqueShipCodes, uniqueGroups };
}

export function filterJobs(jobs, f, currentUser) {
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

    const matchesJobList = !f.jobList || (
      (!f.jobList.customerId || job.customerId === f.jobList.customerId) &&
      (!f.jobList.status || job.status === f.jobList.status) &&
      (!f.jobList.priority || job.priority === f.jobList.priority)
    );

    let matchesQuick = true;
    if (f.quick) {
      const now = new Date();
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
