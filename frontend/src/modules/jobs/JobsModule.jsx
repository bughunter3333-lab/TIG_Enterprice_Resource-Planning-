import { useMemo, useState } from 'react';
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
  viewMode, onViewModeChange, currentUser, onJobClick, lockedStatus,
}) {
  const effectiveFilters = useMemo(
    () => (lockedStatus ? { ...filters, status: lockedStatus } : filters),
    [filters, lockedStatus],
  );
  const filtered = useMemo(() => filterJobs(jobs ?? [], effectiveFilters, currentUser), [jobs, effectiveFilters, currentUser]);
  const options = useMemo(() => buildFilterOptions(jobs ?? []), [jobs]);

  const chips = CHIP_DEFS
    .filter(d => !(lockedStatus && d.key === 'status'))
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

  const availableFiltered = lockedStatus ? available.filter(a => a.key !== 'status') : available;

  // Grouping is a view concern, not a filter — it changes how the same rows
  // read, not which rows they are. Jim2's despatch screen is this list grouped
  // by Ship#: fifteen jobs become four consignments.
  const [groupBy, setGroupBy] = useState('');

  const removeFilter = (key) => {
    const def = CHIP_DEFS.find(d => d.key === key);
    onFilterChange(key, def ? def.inactive : 'all');
  };

  return (
    <div style={{ fontFamily: T.font }}>
      <div style={{ marginBottom: 10 }}>
        <FilterBar
          filters={chips}
          available={availableFiltered}
          onAdd={onFilterChange}
          onRemove={removeFilter}
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {chips.length > 0 && (
                <Button size="sm" variant="ghost" onClick={onClearFilters}>Clear all</Button>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: T.fsSmall, color: T.textMuted }}>
                Group
                <select
                  aria-label="Group by"
                  value={groupBy}
                  onChange={e => setGroupBy(e.target.value)}
                  style={{
                    height: T.inputHeight, fontSize: T.fsSmall, color: T.text,
                    background: T.panel, border: `1px solid ${T.hairline}`,
                    borderRadius: T.radius, padding: '0 6px',
                  }}
                >
                  <option value="">None</option>
                  <option value="shipTo">Ship#</option>
                  {/* Meaningless where the module pins the status — every row
                      would land in one band. */}
                  {!lockedStatus && <option value="status">Status</option>}
                  <option value="customer">Customer</option>
                  <option value="accMgr">Acc Mgr</option>
                </select>
              </label>
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
        : <JobsList jobs={filtered} onJobClick={onJobClick} lockedStatus={lockedStatus} groupBy={groupBy} />}
    </div>
  );
}
