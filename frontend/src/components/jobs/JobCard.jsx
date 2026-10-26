import { useState } from 'react';
import { T } from '../../ui/tokens';
import { dueOf } from '../../modules/jobs/record/recordFormat';

export default function JobCard({ job, onClick }) {
  const [hover, setHover] = useState(false);
  const decTypes = [...new Set((job.items ?? []).map(i => i.decorationType).filter(d => d && d !== 'None'))];
  // The record's own reading of the due day, so a card and its record never
  // disagree about whether a job is late.
  const { text: due, overdue } = dueOf(job);

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: T.panel, borderRadius: T.radius, padding: '10px 12px', cursor: 'pointer',
        border: `1px solid ${hover ? T.fieldBorder : T.hairline}`,
        boxShadow: hover ? T.shadowMd : T.shadowSm,
        transition: `border-color ${T.transition}, box-shadow ${T.transition}`,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: T.fontMono, fontSize: T.fsSmall, fontWeight: 500, color: T.accent }}>{job.id}</span>
        {due && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: T.fsSmall, color: overdue ? T.danger : T.textMuted, fontWeight: overdue ? 500 : 400, whiteSpace: 'nowrap' }}>
            {overdue && <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: T.danger }} />}
            {overdue ? `Overdue · ${due}` : due}
          </span>
        )}
      </div>
      <div style={{ fontSize: T.fsGrid, fontWeight: 500, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.customer}</div>
      {job.description && (
        <div style={{ fontSize: T.fsSmall, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.description}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
        {decTypes.slice(0, 2).map(d => (
          <span key={d} style={{ fontSize: T.fsHeader, fontWeight: 500, color: T.textMuted, background: T.hairlineSoft, padding: '1px 6px', borderRadius: T.radiusSm }}>{d}</span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: T.fsGrid, fontWeight: 500, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
          ${(job.total ?? 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })}
        </span>
      </div>
    </div>
  );
}
