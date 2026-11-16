import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crashReports } from '../../api';
import { notify } from '../../lib/notify';
import Button from '../../ui/Button';
import DataGrid from '../../ui/DataGrid';
import SegmentedControl from '../../ui/SegmentedControl';
import { T } from '../../ui/tokens';
import { KIND_LABELS, STATUS_OPTIONS, reportSummary, whenText } from './crashReportFormat';

/**
 * Admin → Crash reports (docs/superpowers/specs/2026-11-08-crash-reports.md):
 * newest first, each with how many of its kind there are; open one for the
 * picture, the person's words, the error and the steps before it, and mark it
 * New, Looking or Fixed.
 */
export default function CrashReportsModule() {
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);
  const { data: rows, isError, error, refetch } = useQuery({
    queryKey: ['crash-reports', status],
    queryFn: () => crashReports.list({ status: status || undefined }),
  });

  const columns = [
    { key: 'created_at', label: 'When', width: 132, render: (r) => whenText(r.created_at), sortValue: (r) => r.created_at },
    { key: 'kind', label: 'Kind', width: 108, render: (r) => KIND_LABELS[r.kind] ?? r.kind },
    { key: 'what', label: 'What', render: (r) => <span style={{ color: T.text }}>{reportSummary(r)}</span> },
    { key: 'module', label: 'Screen', width: 110, render: (r) => [r.module, r.job_id && `job ${r.job_id}`].filter(Boolean).join(' · ') || '—' },
    { key: 'username', label: 'Who', width: 120, render: (r) => r.username || '—' },
    { key: 'occurrences', label: 'Times', width: 64, align: 'right' },
    { key: 'status', label: 'Status', width: 84, render: (r) => STATUS_OPTIONS.find((o) => o.value === r.status)?.label ?? r.status },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <SegmentedControl
          label="Show"
          options={[{ value: '', label: 'All' }, ...STATUS_OPTIONS]}
          value={status}
          onChange={setStatus}
        />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: T.fsSmall, color: T.textMuted }}>
          Pull them to this PC: <code>cd backend &amp;&amp; python pull_crash_reports.py</code>
        </span>
      </div>
      {isError && (
        <p role="alert" style={{ margin: 0, color: T.danger, fontSize: T.fsBase }}>
          The reports did not load: {error?.message} <Button size="sm" onClick={() => refetch()}>Try again</Button>
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: selected ? 'minmax(0, 1fr) minmax(360px, 46%)' : '1fr', gap: 12, alignItems: 'start' }}>
        <DataGrid
          columns={columns}
          rows={rows}
          rowKey="id"
          selectedKey={selected}
          onRowClick={(r) => setSelected(r.id)}
          emptyText="No crash reports"
          emptyHint="Nothing has broken — or nobody has reported it yet."
        />
        {/* Keyed by report: an unsaved note never carries over to the next one. */}
        {selected && <ReportDetail key={selected} id={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}

function ReportDetail({ id, onClose }) {
  const queryClient = useQueryClient();
  const { data: report } = useQuery({ queryKey: ['crash-report', id], queryFn: () => crashReports.get(id) });
  const [note, setNote] = useState(null);
  const review = useMutation({
    mutationFn: (body) => crashReports.review(id, body),
    onSuccess: (saved) => {
      queryClient.setQueryData(['crash-report', id], saved);
      queryClient.invalidateQueries({ queryKey: ['crash-reports'] });
      setNote(null);
    },
    onError: (e) => notify(e.message, { type: 'error' }),
  });

  const remove = useMutation({
    mutationFn: () => crashReports.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crash-reports'] });
      notify(`Report #${id} deleted.`, { type: 'success' });
      onClose();
    },
    onError: (e) => notify(e.message, { type: 'error' }),
  });

  if (!report) return <p style={{ color: T.textMuted }}>Loading the report…</p>;
  const noteValue = note ?? report.admin_note ?? '';
  const section = { margin: '14px 0 6px', fontSize: T.fsSmall, fontWeight: 600, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' };
  const mono = { margin: 0, padding: '8px 10px', background: T.panelAlt, borderRadius: T.radius, fontFamily: T.fontMono, fontSize: T.fsSmall, color: T.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 220, overflowY: 'auto' };

  return (
    <section aria-label={`Crash report ${id}`} style={{ background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radiusLg, padding: 16, boxShadow: T.shadowSm }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: T.fsSection, fontWeight: 600, color: T.text }}>
          #{report.id} · {KIND_LABELS[report.kind] ?? report.kind}{report.auto && !report.details_added_at ? ' (recorded automatically)' : ''}
        </h3>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      <p style={{ margin: '4px 0 0', fontSize: T.fsSmall, color: T.textMuted }}>
        {whenText(report.created_at)} · {report.username || 'someone'} ({report.role || '—'}) · seen {report.occurrences} time{report.occurrences === 1 ? '' : 's'}
      </p>

      <div style={{ marginTop: 12 }}>
        <SegmentedControl
          label="Status"
          options={STATUS_OPTIONS}
          value={report.status}
          onChange={(value) => review.mutate({ status: value })}
        />
      </div>

      {report.description && (<><h4 style={section}>Their words</h4><p style={{ margin: 0, fontSize: T.fsBase, color: T.text, whiteSpace: 'pre-wrap' }}>{report.description}</p></>)}

      {report.has_screenshot && (
        <>
          <h4 style={section}>What they saw</h4>
          <a href={crashReports.screenshotUrl(id)} target="_blank" rel="noreferrer">
            <img src={crashReports.screenshotUrl(id)} alt={`Screenshot sent with report ${id}`} style={{ display: 'block', maxWidth: '100%', border: `1px solid ${T.hairline}`, borderRadius: T.radius }} />
          </a>
        </>
      )}

      {report.message && (<><h4 style={section}>Error</h4><pre style={mono}>{report.message}</pre></>)}
      {report.stack && (<details><summary style={{ ...section, cursor: 'pointer' }}>Stack</summary><pre style={mono}>{report.stack}{report.component_stack ? `\n\nComponents:${report.component_stack}` : ''}</pre></details>)}

      <h4 style={section}>The steps before it</h4>
      {report.breadcrumbs.length ? (
        <ol style={{ ...mono, listStyle: 'none' }}>
          {report.breadcrumbs.map((s, n) => (
            <li key={n}><span style={{ color: T.textMuted }}>{(s.at || '').slice(11, 19)} {s.kind}</span> {s.text}</li>
          ))}
        </ol>
      ) : <p style={{ margin: 0, fontSize: T.fsSmall, color: T.textMuted }}>None recorded.</p>}

      <h4 style={section}>Where</h4>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '2px 12px', fontSize: T.fsSmall }}>
        {[
          ['Screen', [report.module, report.job_id && `job ${report.job_id}`].filter(Boolean).join(' · ')],
          ['Page', report.url],
          ['Build', report.app_build],
          ['Request', report.request_id],
          ['Browser', report.user_agent],
          ['Window', report.viewport],
        ].filter(([, v]) => v).map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt style={{ color: T.textMuted }}>{k}</dt>
            <dd style={{ margin: 0, color: T.text, overflowWrap: 'anywhere' }}>{v}</dd>
          </div>
        ))}
      </dl>

      <h4 style={section}>Note</h4>
      <textarea
        aria-label="Note on this report"
        value={noteValue}
        maxLength={2000}
        rows={3}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What was found, what fixed it"
        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontFamily: T.font, fontSize: T.fsBase, border: `1px solid ${T.hairline}`, borderRadius: T.radiusField }}
      />
      <div style={{ marginTop: 8 }}>
        <Button size="sm" disabled={note === null || review.isPending} onClick={() => review.mutate({ admin_note: noteValue })}>Save note</Button>
        {/* For a report holding something it should not, or one no longer worth keeping. */}
        <Button
          size="sm"
          variant="ghost"
          style={{ marginLeft: 8, color: T.danger }}
          disabled={remove.isPending}
          onClick={() => { if (window.confirm(`Delete report #${id} and its picture for good?`)) remove.mutate(); }}
        >
          Delete report
        </Button>
      </div>
    </section>
  );
}
