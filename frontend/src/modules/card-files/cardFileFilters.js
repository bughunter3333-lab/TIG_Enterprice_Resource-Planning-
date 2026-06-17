export function cardFileGroups(cards) {
  return [...new Set((cards || []).map(c => c.group).filter(Boolean))].sort();
}

export function filterCardFiles(cards, search, group) {
  const term = (search || '').toLowerCase();
  return (cards || []).filter(c => {
    const matchesSearch = !term ||
      (c.shipCode || '').toLowerCase().includes(term) ||
      (c.customerCode || '').toLowerCase().includes(term) ||
      (c.companyName || '').toLowerCase().includes(term) ||
      (c.suburb || '').toLowerCase().includes(term);
    const matchesGroup = !group || group === 'all' || c.group === group;
    return matchesSearch && matchesGroup;
  });
}
