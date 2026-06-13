import { useMemo } from 'react';
import FilterBar from '../../ui/FilterBar';
import Button from '../../ui/Button';
import JobsList from './JobsList';
import JobsBoard from '../../components/jobs/JobsBoard';
import { filterJobs, buildFilterOptions, QUICK_FILTERS } from './jobsFilters';
import { STATUS_COLORS, T } from '../../ui/tokens';

// Maps controlled-filter keys → FilterBar chip defs. 'all'/empty/null = inactive.
const CHIP_DEFS = [
  { key: 'status', label: 'Status', inactive: 'all' },
  { key: 'priority', label: 'Priority', inactive: 'all' },
  { key: 'customer', label: 'Customer', inactive: 'all' },
  { key: 'assignedTo', label: 'Assignee', inactive: 'all' },
  { key: 'shipCode', label: 'Ship To', inactive: 'all' },
  { key: 'customerGroup', label: 'Group', inactive: 'all' },
  { key: 'quick', label: 'Quick', inactive: null },
];

export default function JobsModule({
  jobs, filters, onFilterChange, onClearFilters,
  viewMode, onViewModeChange, currentUser, onJobClick,
}) {
  const filtered = useMemo(() => filterJobs(jobs ?? [], filters, currentUser), [jobs, filters, currentUser]);
  const options = useMemo(() => buildFilterOptions(jobs ?? []), [jobs]);

  const chips = CHIP_DEFS
    .filter(d => filters[d.key] !== d.inactive && filters[d.key] != null && filters[d.key] !== '')
    .map(d => ({
      key: d.key,
      label: d.label,
      value: filters[d.key],
      display: d.key === 'quick'
        ? (QUICK_FILTERS.find(q => q.id === filters.quick)?.label ?? String(filters.quick))
        : d.key === 'customer'
          ? (options.uniqueCustomers.find(c => c.id === filters.customer)?.name ?? String(filters.customer))
          : String(filters[d.key]),
    }));

  const available = [
    { key: 'status', label: 'Status', options: Object.keys(STATUS_COLORS).map(s => ({ value: s, label: s })) },
    { key: 'priority', label: 'Priority', options: ['Urgent', 'High', 'Normal', 'Low'].map(p => ({ value: p, label: p })) },
    { key: 'customer', label: 'Customer', options: options.uniqueCustomers.map(c => ({ value: c.id, label: c.name })) },
    { key: 'assignedTo', label: 'Assignee', options: options.uniqueAssignees.map(a => ({ value: a, label: a })) },
    { key: 'shipCode', label: 'Ship To', options: options.uniqueShipCodes.map(s => ({ value: s, label: s })) },
    { key: 'customerGroup', label: 'Group', options: options.uniqueGroups.map(g => ({ value: g, label: g })) },
    { key: 'quick', label: 'Quick', options: QUICK_FILTERS.map(q => ({ value: q.id, label: q.label })) },
  ];

  const removeFilter = (key) => {
    const def = CHIP_DEFS.find(d => d.key === key);
    onFilterChange(key, def ? def.inactive : 'all');
  };

  return (
    <div style={{ fontFamily: T.font }}>
      <div style={{ marginBottom: 10 }}>
        <FilterBar
          filters={chips}
          available={available}
          onAdd={onFilterChange}
          onRemove={removeFilter}
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {chips.length > 0 && (
                <Button size="sm" variant="ghost" onClick={onClearFilters}>Clear all</Button>
              )}
              <Button
                size="sm"
                variant={viewMode === 'table' ? 'primary' : 'secondary'}
                aria-label="Table view"
                onClick={() => onViewModeChange('table')}
              >
                ☰ List
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'board' ? 'primary' : 'secondary'}
                aria-label="Board view"
                onClick={() => onViewModeChange('board')}
              >
                ⊞ Board
              </Button>
            </div>
          }
        />
      </div>
      {viewMode === 'board'
        ? <JobsBoard jobs={filtered} onJobClick={onJobClick} />
        : <JobsList jobs={filtered} onJobClick={onJobClick} />}
    </div>
  );
}
