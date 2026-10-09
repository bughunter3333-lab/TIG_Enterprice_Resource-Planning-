import { phaseOf } from '../jobs/jobMetrics';

const customerJobs = (c, jobs) => (jobs || []).filter(j => j.customerId === c.id);

/**
 * A customer's invoiced jobs (INVOICE, PAID) — the basis the ledger's
 * receivables, the server's statement and aged receivables all use. These
 * sums used to run over every job, so a quote, an open order or a cancelled
 * job counted as money owed and as revenue, and pushed customers over their
 * credit limit on this screen while the server's credit check disagreed.
 */
export const invoicedJobs = (c, jobs) =>
  customerJobs(c, jobs).filter(j => phaseOf(j.status) === 'billing');

/** What invoiced jobs still owe (inc GST). */
export const custOutstanding = (c, jobs) =>
  invoicedJobs(c, jobs).reduce((s, j) => s + parseFloat(j.balanceDue || 0), 0);

/** Invoiced sales, excluding GST. */
export const custRevenue = (c, jobs) =>
  invoicedJobs(c, jobs).reduce((s, j) => s + parseFloat(j.subtotal || 0), 0);

export function filterCustomers(customers, search) {
  const q = (search || '').toLowerCase();
  if (!q) return customers || [];
  return (customers || []).filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.email || '').toLowerCase().includes(q) ||
    (c.id || '').toLowerCase().includes(q) ||
    (c.contact || '').toLowerCase().includes(q)
  );
}

export function customerKpis(customers, jobs) {
  const list = customers || [];
  return {
    total: list.length,
    active: list.filter(c => c.status === 'Active' || !c.status).length,
    revenue: list.reduce((s, c) => s + custRevenue(c, jobs), 0),
    outstanding: list.reduce((s, c) => s + custOutstanding(c, jobs), 0),
    overCredit: list.filter(c => c.creditLimit > 0 && custOutstanding(c, jobs) > c.creditLimit).length,
  };
}
