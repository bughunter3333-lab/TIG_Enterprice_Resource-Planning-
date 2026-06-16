const customerJobs = (c, jobs) => (jobs || []).filter(j => j.customerId === c.id);

export const custOutstanding = (c, jobs) =>
  customerJobs(c, jobs).reduce((s, j) => s + parseFloat(j.balanceDue || 0), 0);

export const custRevenue = (c, jobs) =>
  customerJobs(c, jobs).reduce((s, j) => s + parseFloat(j.total || 0), 0);

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
