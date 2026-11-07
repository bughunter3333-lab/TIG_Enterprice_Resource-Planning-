import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Kanban, List } from 'lucide-react';
import FilterBar from '../../ui/FilterBar';
import Button from '../../ui/Button';
import SegmentedControl from '../../ui/SegmentedControl';
import DensityToggle from '../../ui/DensityToggle';
import { fieldChrome } from '../../ui/fieldStyle';
import JobsList from './JobsList';
import BulkActionBar from './BulkActionBar';
import { notify } from '../../lib/notify';
import JobsBoard from '../../components/jobs/JobsBoard';
import { filterJobs, buildFilterOptions, mergeJobs, QUICK_FILTERS } from './jobsFilters';
import { jobs as jobsApi, purchaseOrders as purchaseOrdersApi } from '../../api';
import { useOffer } from '../../lib/useMyAccess';
import { T } from '../../ui/tokens';
import { JOB_STATUSES, statusLabel } from './jobStatuses';

const SERVER_SEARCH_MIN = 2;
const SEARCH_SETTLE_MS = 250;

// The search as it stands once typing pauses, so the server is asked once per
// word rather than once per keystroke.
function useSettled(value) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), SEARCH_SETTLE_MS);
    return () => clearTimeout(t);
  }, [value]);
  return settled;
}

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
  // The loaded list is the newest 500 jobs. With two or more characters typed
  // the server is asked as well, so an older order is still found (F01).
  const term = useSettled((filters.searchTerm || '').trim());
  const { data: found } = useQuery({
    queryKey: ['jobs', 'search', term],
    queryFn: () => jobsApi.list({ search: term }),
    enabled: term.length >= SERVER_SEARCH_MIN,
    staleTime: 30_000,
  });
  const pool = useMemo(
    () => mergeJobs(jobs ?? [], term.length >= SERVER_SEARCH_MIN ? found : undefined),
    [jobs, found, term],
  );
  const filtered = useMemo(() => filterJobs(pool, effectiveFilters, currentUser), [pool, effectiveFilters, currentUser]);
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
          : d.key === 'status'
            ? statusLabel(filters.status)
            : String(filters[d.key]),
    }));

  const available = [
    { key: 'status', label: 'Status', options: JOB_STATUSES.map(s => ({ value: s, label: statusLabel(s) })) },
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

  // The jobs ticked in the list (JIM24). Only those still shown are acted on:
  // a filter changed after ticking must not carry hidden jobs into a batch.
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState([]);
  const chosen = useMemo(() => filtered.filter(j => selected.has(j.id)).map(j => j.id), [filtered, selected]);

  const runBatch = async (send, done) => {
    setBusy(true);
    setProblems([]);
    try {
      const result = await send(chosen);
      const failed = result?.failed ?? [];
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      // What went through is done with; what did not stays ticked, with why.
      setSelected(new Set(failed.map(f => f.job_id)));
      setProblems(failed);
      const said = done(chosen.length, result);
      if (said) notify(said);
    } catch (e) {
      notify(e?.message || 'The selected jobs were not changed', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const plural = (n) => `${n} job${n === 1 ? '' : 's'}`;
  // A message only when every job went through; otherwise the bar names the
  // ones that did not.
  const allWent = (message) => (n, result) => (result?.failed?.length ? null : message(n));
  const changeStatus = (status) => runBatch(ids => jobsApi.bulkStatus(ids, status), allWent(n => `${plural(n)} moved to ${statusLabel(status)}`));
  const moveDue = (due) => runBatch(ids => jobsApi.bulkDue(ids, due), allWent(n => `${plural(n)} now due ${due}`));
  // POs for the selected jobs' short lines, one per supplier (JIM24). What
  // could not be bought — no supplier, not an open order — stays ticked with
  // why, as a refused status change does.
  const offer = useOffer();
  const raisePOs = offer('POST', '/purchase-orders/from-jobs')
    ? () => runBatch(
      async ids => {
        const r = await purchaseOrdersApi.fromJobs(ids);
        return { ...r, failed: r.skipped ?? [] };
      },
      (n, r) => (r.created?.length
        ? `${r.created.length} PO${r.created.length === 1 ? '' : 's'} raised: ${r.created.map(p => `${p.id} (${p.supplier_name})`).join(', ')}`
        : r.failed.length ? null : 'Nothing on the selected jobs is waiting to be bought'),
    )
    : undefined;
  const clearSelection = () => { setSelected(new Set()); setProblems([]); };

  return (
    <div style={{ fontFamily: T.font }}>
      <div style={{ marginBottom: 12 }}>
        <FilterBar
          filters={chips}
          available={availableFiltered}
          onAdd={onFilterChange}
          onRemove={removeFilter}
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {chips.length > 0 && (
                <Button size="sm" variant="ghost" onClick={onClearFilters}>Clear all</Button>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: T.fsSmall, color: T.textMuted }}>
                Group
                <select
                  aria-label="Group by"
                  value={groupBy}
                  onChange={e => setGroupBy(e.target.value)}
                  style={{ ...fieldChrome({}), height: 28, fontSize: T.fsSmall, padding: '0 6px', cursor: 'pointer' }}
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
              <SegmentedControl
                label="View"
                size="sm"
                value={viewMode === 'board' ? 'board' : 'table'}
                onChange={onViewModeChange}
                options={[
                  { value: 'table', label: 'List', ariaLabel: 'Table view', icon: List },
                  { value: 'board', label: 'Board', ariaLabel: 'Board view', icon: Kanban },
                ]}
              />
              {viewMode !== 'board' && <DensityToggle />}
            </div>
          }
        />
      </div>
      {viewMode !== 'board' && chosen.length > 0 && (
        <BulkActionBar
          count={chosen.length}
          busy={busy}
          problems={problems}
          onStatus={changeStatus}
          onDue={moveDue}
          onRaisePOs={raisePOs}
          onClear={clearSelection}
        />
      )}
      {viewMode === 'board'
        ? <JobsBoard jobs={filtered} onJobClick={onJobClick} />
        : (
          <JobsList
            jobs={filtered}
            onJobClick={onJobClick}
            lockedStatus={lockedStatus}
            groupBy={groupBy}
            selected={selected}
            onSelectedChange={setSelected}
          />
        )}
    </div>
  );
}
