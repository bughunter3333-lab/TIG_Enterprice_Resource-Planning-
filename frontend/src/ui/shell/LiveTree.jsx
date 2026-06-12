import { X } from 'lucide-react';
import { T, statusColor } from '../tokens';
import { parseD } from '../dates';

const ACTIVE = (j) => !['PAID', 'CANCEL'].includes(j.status);

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

function SectionLabel({ children }) {
  return (
    <div style={{ padding: '8px 10px 3px', fontSize: 9.5, fontWeight: 700, color: T.textFaint, letterSpacing: '0.06em' }}>
      {children}
    </div>
  );
}

export default function LiveTree({ jobs = [], pinnedJobs = [], currentUser, onOpenJob, onUnpinJob, onSelectList }) {
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
