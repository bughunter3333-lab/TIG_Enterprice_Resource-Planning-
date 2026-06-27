import { useState } from 'react';
import { X, ChevronRight, ChevronDown, Folder } from 'lucide-react';
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

export const SAVED_LISTS = [
  { id: 'mine', label: 'My Jobs', test: (j, user) => ACTIVE(j) && j.accMgr === user?.username },
  { id: 'due-today', label: 'Due Today', test: (j) => ACTIVE(j) && isToday(parseD(j.due)) },
  { id: 'overdue', label: 'Overdue', test: (j) => ACTIVE(j) && isOverdue(parseD(j.due)) },
  { id: 'pickpack', label: 'Pick/Pack', test: (j) => j.status === 'Pick/Pack' },
];

// Group active jobs under a parent node like Jim2's tree (e.g. "Zone Bowling · 13").
// Prefer the job's Project; fall back to the customer account when there's no
// project. Sorted by size desc so the busiest groups surface first.
export function groupActiveJobs(jobs) {
  const map = new Map();
  for (const j of jobs) {
    if (!ACTIVE(j)) continue;
    const project = (j.projectNo || '').trim();
    const key = project || j.customer || j.customerId || 'Unassigned';
    if (!map.has(key)) map.set(key, { name: key, isProject: !!project, jobs: [] });
    map.get(key).jobs.push(j);
  }
  return [...map.values()]
    .sort((a, b) => b.jobs.length - a.jobs.length || a.name.localeCompare(b.name));
}

function SectionLabel({ children }) {
  return (
    <div style={{ padding: '8px 10px 3px', fontSize: 9.5, fontWeight: 700, color: T.textFaint, letterSpacing: '0.06em' }}>
      {children}
    </div>
  );
}

// One expandable/clickable tree row. `depth` indents children; `caret` shows a
// chevron for parent nodes (null for leaves).
function TreeRow({ depth = 0, caret = null, icon = null, label, count, countColor, bold, onClick, onKeyDown, children: trailing }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown ?? (e => { if (e.key === 'Enter') onClick?.(); })}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: `3px 10px 3px ${10 + depth * 12}px`,
        fontSize: T.fsSmall, cursor: 'pointer', color: T.text,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = T.hairlineSoft)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ width: 12, display: 'flex', flexShrink: 0, color: T.textFaint }}>{caret}</span>
      {icon && <span style={{ display: 'flex', flexShrink: 0, color: T.accentStrong }}>{icon}</span>}
      <span style={{
        flex: 1, fontWeight: bold ? 700 : 500, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
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

export default function LiveTree({ jobs = [], pinnedJobs = [], currentUser, onOpenJob, onUnpinJob, onSelectList }) {
  // JOBS branch and its customer groups are collapsed by default (Jim2 behaviour:
  // expand a parent to drill into its children).
  const [jobsOpen, setJobsOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => new Set());

  const toggleGroup = (name) => setOpenGroups(prev => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  const groups = groupActiveJobs(jobs);
  const activeCount = groups.reduce((n, g) => n + g.jobs.length, 0);

  return (
    <div style={{
      width: 190, background: T.panel, borderRight: `1px solid ${T.hairline}`,
      overflowY: 'auto', flexShrink: 0, fontFamily: T.font, paddingBottom: 8,
    }}>
      <SectionLabel>OPEN</SectionLabel>
      {pinnedJobs.length === 0 && (
        <div style={{ padding: '2px 10px', fontSize: T.fsSmall, color: T.textFaint }}>No open records</div>
      )}
      {pinnedJobs.map(j => (
        <div
          key={j.id}
          role="button"
          tabIndex={0}
          onClick={() => onOpenJob(j)}
          onKeyDown={e => { if (e.key === 'Enter') onOpenJob(j); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px',
            fontSize: T.fsSmall, cursor: 'pointer', color: T.text,
          }}
          onMouseEnter={e => e.currentTarget.style.background = T.hairlineSoft}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{ fontWeight: 700 }}>{j.id}</span>
          <span style={{ color: statusColor(j.status), fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {j.status}
          </span>
          {onUnpinJob && (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Close ${j.id}`}
              onClick={e => { e.stopPropagation(); onUnpinJob(j.id); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onUnpinJob(j.id); } }}
              style={{ color: T.textFaint, display: 'flex' }}
            >
              <X size={11} />
            </span>
          )}
        </div>
      ))}

      {/* JOBS branch — parent → customer group → child job (Jim2 nav tree) */}
      <SectionLabel>NAV TREE</SectionLabel>
      <TreeRow
        depth={0}
        bold
        caret={jobsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        label="Jobs"
        count={activeCount}
        onClick={() => setJobsOpen(o => !o)}
      />
      {jobsOpen && groups.length === 0 && (
        <div style={{ padding: '2px 10px 2px 32px', fontSize: T.fsSmall, color: T.textFaint }}>No active jobs</div>
      )}
      {jobsOpen && groups.map(group => {
        const isOpen = openGroups.has(group.name);
        return (
          <div key={group.name}>
            <TreeRow
              depth={1}
              caret={isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              icon={group.isProject ? <Folder size={11} /> : null}
              label={group.name}
              count={group.jobs.length}
              onClick={() => toggleGroup(group.name)}
            />
            {isOpen && group.jobs.map(j => (
              <TreeRow
                key={j.id}
                depth={2}
                label={j.id}
                onClick={() => onOpenJob(j)}
                count={undefined}
              >
                <span style={{
                  color: statusColor(j.status), fontSize: 9, fontWeight: 600,
                  textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', maxWidth: 70,
                }}>
                  {j.status}
                </span>
              </TreeRow>
            ))}
          </div>
        );
      })}

      <SectionLabel>LISTS</SectionLabel>
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
