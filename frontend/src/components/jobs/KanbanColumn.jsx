import JobCard from './JobCard';
import { T, statusColor } from '../../ui/tokens';

// A column is a quiet tray: the phase colour lives in one dot by the title,
// not in a stripe on every card, so a full board reads by its counts first.
export default function KanbanColumn({ status, jobs, onJobClick }) {
  return (
    <section
      aria-label={`${status}, ${jobs.length} job${jobs.length === 1 ? '' : 's'}`}
      style={{
        minWidth: 248, maxWidth: 248, display: 'flex', flexDirection: 'column',
        background: T.panelAlt, border: `1px solid ${T.hairlineSoft}`, borderRadius: T.radiusLg,
        fontFamily: T.font,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 8px' }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(status), flexShrink: 0 }} />
        <h3 style={{ margin: 0, flex: 1, minWidth: 0, fontSize: T.fsSmall, fontWeight: 600, color: T.text, letterSpacing: '0.01em', textTransform: 'uppercase' }}>{status}</h3>
        <span style={{ fontSize: T.fsSmall, fontWeight: 500, color: T.textMuted, fontVariantNumeric: 'tabular-nums', background: T.hairlineSoft, padding: '0 7px', borderRadius: 10, lineHeight: '18px' }}>{jobs.length}</span>
      </header>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, padding: '0 6px 6px', overflowY: 'auto', maxHeight: 'calc(100vh - 240px)' }}>
        {jobs.map(job => (
          <JobCard key={job.id} job={job} onClick={() => onJobClick(job)} />
        ))}
        {jobs.length === 0 && (
          <div style={{ fontSize: T.fsSmall, color: T.textFaint, textAlign: 'center', padding: '18px 0', border: `1px dashed ${T.hairline}`, borderRadius: T.radius }}>No jobs</div>
        )}
      </div>
    </section>
  );
}
