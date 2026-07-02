import { useState } from 'react';
import { X, ChevronRight, ChevronDown, ListFilter, Trash2, Boxes } from 'lucide-react';
import { T, statusColor } from '../tokens';
import { parseD } from '../dates';

// Matches the monolith's dominant active-job semantics (e.g. TotalImageERP.jsx:1637,1734):
// FINISH jobs are done-awaiting-invoice and don't need workflow attention here.
const ACTIVE = (j) => !['FINISH', 'PAID', 'CANCEL'].includes(j.status);

// Local-time comparison (deliberate divergence from the monolith's UTC string compare):
// a job due 12/06 counts as "due today" from local midnight, not from 10:00 AEST.
const isToday = (d) => {
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

const isOverdue = (d) => {
  if (!d) return false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return d < startOfToday;
};

// Built-in "quick" lists — convenience filters that ship with the app, alongside
// the user's own saved lists (Jim2 lets users build their own; these are presets).
export const SAVED_LISTS = [
  { id: 'mine', label: 'My Jobs', test: (j, user) => ACTIVE(j) && j.accMgr === user?.username },
  { id: 'due-today', label: 'Due Today', test: (j) => ACTIVE(j) && isToday(parseD(j.due)) },
  { id: 'overdue', label: 'Overdue', test: (j) => ACTIVE(j) && isOverdue(parseD(j.due)) },
  { id: 'pickpack', label: 'Pick/Pack', test: (j) => j.status === 'Pick/Pack' },
];

function SectionLabel({ children }) {
  return (
    <div style={{ padding: '8px 10px 3px', fontSize: 9.5, fontWeight: 700, color: T.textFaint, letterSpacing: '0.06em' }}>
      {children}
    </div>
  );
}

// One tree row. `caret` shows an expand chevron for parent nodes; when `onCaretClick`
// is given the caret toggles expansion independently of the row's primary click.
function TreeRow({ depth = 0, caret = null, onCaretClick, icon = null, label, count, countColor, bold, onClick, title, children: trailing }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter') onClick?.(); }}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: `3px 10px 3px ${10 + depth * 12}px`,
        fontSize: T.fsSmall, cursor: 'pointer', color: T.text,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = T.hairlineSoft)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span
        onClick={onCaretClick ? (e) => { e.stopPropagation(); onCaretClick(); } : undefined}
        style={{ width: 12, display: 'flex', flexShrink: 0, color: T.textFaint }}
      >
        {caret}
      </span>
      {icon && <span style={{ display: 'flex', flexShrink: 0, color: T.accentStrong }}>{icon}</span>}
      <span style={{ flex: 1, fontWeight: bold ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {trailing}
      {count != null && (
        <span style={{ fontSize: 9.5, fontWeight: 700, color: countColor ?? T.textMuted, fontVariantNumeric: 'tabular-nums' }}>
          {count}
        </span>
      )}
    </div>
  );
}

// A single open job shown flat under Jobs (Jim2 "blue" individual job nodes).
function OpenJobRow({ job, onOpen, onUnpin }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(job)}
      onKeyDown={e => { if (e.key === 'Enter') onOpen(job); }}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px 3px 22px', fontSize: T.fsSmall, cursor: 'pointer', color: T.text }}
      onMouseEnter={e => (e.currentTarget.style.background = T.hairlineSoft)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ fontWeight: 700 }}>{job.id}</span>
      <span style={{ color: statusColor(job.status), fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {job.status}
      </span>
      {onUnpin && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Close ${job.id}`}
          onClick={e => { e.stopPropagation(); onUnpin(job.id); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onUnpin(job.id); } }}
          style={{ color: T.textFaint, display: 'flex' }}
        >
          <X size={11} />
        </span>
      )}
    </div>
  );
}

export default function LiveTree({
  jobs = [], pinnedJobs = [], currentUser, onOpenJob, onUnpinJob, onSelectList,
  savedLists = [], onRunList, onDeleteList,
  savedStockLists = [], onRunStockList, onDeleteStockList, onOpenStock,
}) {
  const [jobsOpen, setJobsOpen] = useState(true);
  const [stockOpen, setStockOpen] = useState(true);
  const [openLists, setOpenLists] = useState(() => new Set());

  const toggleList = (id) => setOpenLists(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const jobsCount = pinnedJobs.length + savedLists.length;

  return (
    <div style={{
      width: 190, background: T.panel, borderRight: `1px solid ${T.hairline}`,
      overflowY: 'auto', flexShrink: 0, fontFamily: T.font, paddingBottom: 8,
    }}>
      <SectionLabel>NAV TREE</SectionLabel>

      {/* Jobs parent → individual open jobs (blue) + saved Lists (yellow) */}
      <TreeRow
        depth={0}
        bold
        caret={jobsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        label="Jobs"
        count={jobsCount || undefined}
        onClick={() => setJobsOpen(o => !o)}
      />
      {jobsOpen && (
        <>
          {pinnedJobs.length === 0 && savedLists.length === 0 && (
            <div style={{ padding: '2px 10px 2px 22px', fontSize: T.fsSmall, color: T.textFaint }}>No open jobs or lists</div>
          )}

          {/* Individual open jobs — singular, not a batch */}
          {pinnedJobs.map(job => (
            <OpenJobRow key={job.id} job={job} onOpen={onOpenJob} onUnpin={onUnpinJob} />
          ))}

          {/* Saved Lists — named, live count, expand to members */}
          {savedLists.map(list => {
            const isOpen = openLists.has(list.id);
            return (
              <div key={list.id}>
                <TreeRow
                  depth={1}
                  caret={isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  onCaretClick={() => toggleList(list.id)}
                  icon={<ListFilter size={11} />}
                  label={list.name}
                  count={list.jobs.length}
                  onClick={() => onRunList && onRunList(list.id)}
                  title={`Run list "${list.name}" (${list.jobs.length})`}
                >
                  {onDeleteList && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Delete list ${list.name}`}
                      onClick={e => { e.stopPropagation(); onDeleteList(list.id); }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onDeleteList(list.id); } }}
                      style={{ color: T.textFaint, display: 'flex' }}
                    >
                      <Trash2 size={11} />
                    </span>
                  )}
                </TreeRow>
                {isOpen && list.jobs.length === 0 && (
                  <div style={{ padding: '2px 10px 2px 34px', fontSize: T.fsSmall, color: T.textFaint }}>No matching jobs</div>
                )}
                {isOpen && list.jobs.map(job => (
                  <TreeRow
                    key={job.id}
                    depth={2}
                    label={job.id}
                    onClick={() => onOpenJob(job)}
                  >
                    <span style={{ color: statusColor(job.status), fontSize: 9, fontWeight: 600, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 64 }}>
                      {job.status}
                    </span>
                  </TreeRow>
                ))}
              </div>
            );
          })}
        </>
      )}

      {/* Stock parent → saved Stock Lists (appears once you create one) */}
      {savedStockLists.length > 0 && (
        <>
          <TreeRow
            depth={0}
            bold
            caret={stockOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            icon={<Boxes size={12} />}
            label="Stock"
            count={savedStockLists.length}
            onClick={() => setStockOpen(o => !o)}
          />
          {stockOpen && savedStockLists.map(list => {
            const isOpen = openLists.has(list.id);
            return (
              <div key={list.id}>
                <TreeRow
                  depth={1}
                  caret={isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  onCaretClick={() => toggleList(list.id)}
                  icon={<ListFilter size={11} />}
                  label={list.name}
                  count={list.items.length}
                  onClick={() => onRunStockList && onRunStockList(list.id)}
                  title={`Open stock list "${list.name}" (${list.items.length})`}
                >
                  {onDeleteStockList && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Delete list ${list.name}`}
                      onClick={e => { e.stopPropagation(); onDeleteStockList(list.id); }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onDeleteStockList(list.id); } }}
                      style={{ color: T.textFaint, display: 'flex' }}
                    >
                      <Trash2 size={11} />
                    </span>
                  )}
                </TreeRow>
                {isOpen && list.items.length === 0 && (
                  <div style={{ padding: '2px 10px 2px 34px', fontSize: T.fsSmall, color: T.textFaint }}>No matching items</div>
                )}
                {isOpen && list.items.map(item => (
                  <TreeRow key={item.sku} depth={2} label={item.sku} onClick={() => onOpenStock && onOpenStock(item.sku)}>
                    <span style={{ color: T.textMuted, fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 72 }}>{item.name}</span>
                  </TreeRow>
                ))}
              </div>
            );
          })}
        </>
      )}

      {/* Built-in quick lists */}
      <SectionLabel>QUICK LISTS</SectionLabel>
      {SAVED_LISTS.map(list => {
        const count = jobs.filter(j => list.test(j, currentUser)).length;
        return (
          <div
            key={list.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectList(list.id)}
            onKeyDown={e => { if (e.key === 'Enter') onSelectList(list.id); }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '3px 10px', fontSize: T.fsSmall, cursor: 'pointer', color: T.headerText,
            }}
            onMouseEnter={e => e.currentTarget.style.background = T.hairlineSoft}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span>{list.label}</span>
            <span style={{
              fontSize: 9.5, fontWeight: 700, color: list.id === 'overdue' && count > 0 ? T.danger : T.textMuted,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
