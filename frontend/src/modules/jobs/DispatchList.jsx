import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Truck, X, Download, Printer, CheckSquare, CheckCircle2 } from 'lucide-react';
import { T } from '../../ui/tokens';
import Button from '../../ui/Button';
import IconButton from '../../ui/IconButton';
import StatusBadge from '../../ui/StatusBadge';
import { fieldChrome } from '../../ui/fieldStyle';
import { dispatchSessions, documents, jobs as jobsApi } from '../../api';
import { notify } from '../../lib/notify';
import { BECOMES_FINISH_ON_DESPATCH, DESPATCHABLE_STATUSES } from './jobStatuses';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const cartonsOf = (s) => s.lines.reduce((n, l) => n + Number(l.cartons || 0), 0);

// Jim2 Dispatch list: all dispatchable jobs (ready + invoiced) in one screen
// with inline-editable Ship Via / Ship Ref / Cartons (Jim2 shows these as
// tinted editable cells). Select rows and dispatch them as a batch.

// Packed and able to go (jobStatuses.js); a packed job becomes FINISH as it goes.
const DISPATCHABLE = DESPATCHABLE_STATUSES;

const ROW = 40;
const headCell = {
  height: 32, padding: '0 12px', textAlign: 'left', whiteSpace: 'nowrap',
  fontSize: T.fsHeader, fontWeight: 500, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em',
  background: T.panelAlt, borderBottom: `1px solid ${T.hairline}`,
};
// The columns you type into keep their tint down the whole table, header
// included, so "these are mine to fill in" reads before any cell is clicked.
const editHead = { ...headCell, color: T.accentStrong, background: T.editable };
const cell = { height: ROW, padding: '0 12px', fontSize: T.fsGrid, color: T.text, borderBottom: `1px solid ${T.hairlineSoft}` };
const editCell = { ...cell, padding: '0 8px', background: T.editable };
const inp = { ...fieldChrome({}), height: 28, width: '100%', padding: '0 8px', boxSizing: 'border-box' };
const jobNo = { fontFamily: T.fontMono, fontWeight: 500, color: T.accent };

// Jim2 "Print" of a dispatch session — a clean A4 despatch manifest opened
// in its own window so the app chrome/CSS never bleeds into the printout.
function printManifest(s) {
  const totalCartons = cartonsOf(s);
  const when = s.created_at ? new Date(s.created_at).toLocaleString() : '';
  const bodyRows = s.lines.map(l => `
      <tr>
        <td class="mono">${esc(l.job_id)}</td>
        <td>${esc(l.customer_name)}</td>
        <td>${esc(l.ship_via)}</td>
        <td>${esc(l.ship_ref)}</td>
        <td class="num">${esc(l.cartons)}</td>
        <td class="sig"></td>
      </tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Dispatch #${s.id}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 0; padding: 24px; font-size: 12px; }
        .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 16px; }
        .co { font-size: 18px; font-weight: 800; }
        .co small { display: block; font-size: 11px; font-weight: 400; color: #555; margin-top: 3px; }
        .doc { text-align: right; }
        .doc .title { font-size: 22px; font-weight: 900; letter-spacing: 1px; color: #1d4ed8; }
        .doc .meta { font-size: 11px; color: #555; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 4px; }
        th { background: #1d4ed8; color: #fff; text-align: left; padding: 7px 8px; font-size: 11px; }
        th.num, td.num { text-align: right; }
        td { padding: 7px 8px; border-bottom: 1px solid #e2e8f0; }
        tr:nth-child(even) td { background: #f8fafc; }
        .mono { font-family: monospace; font-weight: 700; }
        .sig { width: 130px; border-bottom: 1px solid #1a1a1a; }
        th.sig { border-bottom: none; }
        .totals { margin-top: 14px; display: flex; justify-content: flex-end; gap: 26px; font-weight: 700; }
        .foot { margin-top: 34px; display: flex; justify-content: space-between; font-size: 11px; color: #555; }
        .foot .line { border-top: 1px solid #1a1a1a; padding-top: 4px; width: 240px; text-align: center; }
        @media print { @page { size: A4 portrait; margin: 14mm; } body { padding: 0; } }
      </style></head><body>
      <div class="head">
        <div class="co">Total Image<small>Despatch Manifest &middot; info@totalimagegroup.com.au</small></div>
        <div class="doc"><div class="title">DISPATCH #${s.id}</div><div class="meta">${esc(when)}<br>${s.lines.length} job${s.lines.length === 1 ? '' : 's'} &middot; ${totalCartons} carton${totalCartons === 1 ? '' : 's'}</div></div>
      </div>
      <table>
        <thead><tr><th>Job#</th><th>Customer</th><th>Ship Via</th><th>Ship Ref</th><th class="num">Cartons</th><th class="sig">Received</th></tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <div class="totals"><span>Jobs: ${s.lines.length}</span><span>Total Cartons: ${totalCartons}</span></div>
      <div class="foot"><div class="line">Despatched by</div><div class="line">Carrier / Driver signature</div></div>
      <script>window.onload = function(){ window.print(); }</script>
      </body></html>`;
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function exportCsv(s) {
  const rows = s.lines.map(l => `${l.job_id},${JSON.stringify(l.customer_name || '')},${JSON.stringify(l.ship_via || '')},${JSON.stringify(l.ship_ref || '')},${l.cartons}`);
  const csv = ['job_id,customer,ship_via,ship_ref,cartons', ...rows].join('\n');
  const url = window.URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `dispatch-session-${s.id}.csv`;
  a.click();
}

/** The lines of a recorded session, as the server holds them. */
function SessionLines({ session }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
        <thead>
          <tr>
            {['Job#', 'Customer', 'Ship Via', 'Ship Ref'].map(h => <th key={h} style={headCell}>{h}</th>)}
            <th style={{ ...headCell, textAlign: 'right' }}>Cartons</th>
          </tr>
        </thead>
        <tbody>
          {session.lines.map((l, i) => (
            <tr key={i}>
              <td style={{ ...cell, ...jobNo }}>{l.job_id}</td>
              <td style={{ ...cell, fontWeight: 500 }}>{l.customer_name}</td>
              <td style={cell}>{l.ship_via || <span style={{ color: T.textFaint }}>—</span>}</td>
              <td style={{ ...cell, fontFamily: T.fontMono, fontSize: T.fsSmall }}>{l.ship_ref || <span style={{ color: T.textFaint }}>—</span>}</td>
              <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{l.cartons}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The end of a despatch: what the server recorded, said once, plainly. Every
 * figure here comes from the session it returned — the jobs it took, their
 * cartons, the time it stamped — never from the batch as it was sent.
 */
function Dispatched({ session, onMore, onDone }) {
  const when = session.created_at
    ? new Date(session.created_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
    : null;
  return (
    <div className="tig-arrive" role="status">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '24px 20px 20px' }}>
        <span aria-hidden style={{ width: 40, height: 40, borderRadius: '50%', background: T.okTint, color: T.ok, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <CheckCircle2 size={22} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: T.fsTitle, fontWeight: 600, color: T.text, letterSpacing: '-0.015em' }}>Dispatched</h2>
          <p style={{ margin: '4px 0 0', fontSize: T.fsGrid, color: T.textMuted }}>
            <span style={{ fontWeight: 500, color: T.text }}>Dispatch #{session.id}</span>
            {' · '}{plural(session.lines.length, 'job')}{' · '}{plural(cartonsOf(session), 'carton')}
            {when && <>{' · recorded at '}{when}</>}
          </p>
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${T.hairline}` }}>
        <SessionLines session={session} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '12px 16px', borderTop: `1px solid ${T.hairline}`, background: T.panelAlt }}>
        <Button size="sm" onClick={() => printManifest(session)}><Printer size={13} aria-hidden /> Print manifest</Button>
        <Button size="sm" onClick={() => exportCsv(session)}><Download size={13} aria-hidden /> Export CSV</Button>
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" onClick={onMore}>Dispatch more</Button>
        <Button variant="primary" onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

export default function DispatchList({ jobs = [], onDispatch, onClose, busy = false }) {
  const rows = jobs.filter(j => DISPATCHABLE.includes(j.status));
  const [selected, setSelected] = useState(() => new Set());
  const [edits, setEdits] = useState({}); // jobId -> { shipVia, shipRef, cartons }
  // Off until ticked: invoicing posts to the accounts, so it is chosen, not
  // the default side effect of sending goods out.
  const [advance, setAdvance] = useState(false);
  // The session the last batch recorded, shown as the finish until dismissed.
  const [finished, setFinished] = useState(null);
  // Past sessions (Jim2 "Dispatch #"): pick one to review/export its lines.
  const [sessions, setSessions] = useState([]);
  const [viewSessionId, setViewSessionId] = useState('');
  const [viewSession, setViewSession] = useState(null);
  useEffect(() => {
    dispatchSessions.list().then(setSessions).catch(() => setSessions([]));
  }, [busy]); // refresh after a batch completes
  useEffect(() => {
    if (!viewSessionId) { setViewSession(null); return; }
    dispatchSessions.get(viewSessionId).then(setViewSession).catch(() => setViewSession(null));
  }, [viewSessionId]);

  const editOf = (j) => edits[j.id] || {};
  const valOf = (j, key, fallback) => (editOf(j)[key] !== undefined ? editOf(j)[key] : fallback);
  const setEdit = (jobId, key, val) => setEdits(prev => ({ ...prev, [jobId]: { ...(prev[jobId] || {}), [key]: val } }));
  const toggle = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)));

  // Jim2's Auto Pick across the list: each selected job's goods picked to what
  // it supplies, in one request (F20). A job still waiting on stock reads
  // Partial and is said to be.
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);
  const autoPick = async () => {
    setPicking(true);
    try {
      const r = await jobsApi.autoPick([...selected]);
      const full = r.jobs.filter((j) => j.all_picked).length;
      const part = r.jobs.length - full;
      notify(
        `Picked ${full} job${full === 1 ? '' : 's'} in full` +
          (part ? `, ${part} as far as stock allows` : '') +
          (r.failed.length ? ` — not picked: ${r.failed.map((f) => f.job_id).join(', ')}` : ''),
        { type: r.failed.length ? 'error' : 'success' },
      );
      qc.invalidateQueries({ queryKey: ['jobs'] });
    } catch (e) {
      notify(e.message || 'Auto Pick failed', { type: 'error' });
    } finally {
      setPicking(false);
    }
  };
  // The server prints across the list: one PDF, a page or a label per job (F21).
  const printSelected = (type) => window.open(documents.jobsUrl(type, [...selected]), '_blank', 'noopener');

  const dispatchSelected = async () => {
    const batch = rows
      .filter(r => selected.has(r.id))
      .map(r => ({
        id: r.id,
        shipVia: valOf(r, 'shipVia', r.shipTo || ''),
        shipRef: valOf(r, 'shipRef', ''),
        cartons: Math.max(1, parseInt(valOf(r, 'cartons', 1), 10) || 1),
        advanceStatus: advance && BECOMES_FINISH_ON_DESPATCH.includes(r.status),
      }));
    if (!batch.length) return;
    // A refused batch resolves to nothing (the caller has said why); only a
    // recorded session ends the screen.
    const session = await onDispatch(batch);
    if (session?.lines) {
      setFinished(session);
      setSelected(new Set());
      setEdits({});
    }
  };

  const none = selected.size === 0;

  return (
    <section style={{ fontFamily: T.font, display: 'flex', flexDirection: 'column', background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radiusLg, boxShadow: T.shadowSm, overflow: 'hidden' }}>
      {finished ? (
        <Dispatched session={finished} onMore={() => setFinished(null)} onDone={onClose} />
      ) : (<>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${T.hairline}`, flexWrap: 'wrap' }}>
        <span aria-hidden style={{ width: 32, height: 32, borderRadius: T.radius, background: T.accentTint, color: T.accentStrong, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Truck size={16} />
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0, fontSize: T.fsSection, fontWeight: 600, color: T.text, letterSpacing: '-0.01em' }}>Dispatch</h2>
          <div style={{ fontSize: T.fsSmall, color: T.textMuted, marginTop: 2 }}>Packed jobs ready to go. Set the carrier, reference and cartons, then send the batch.</div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: T.fsSmall, color: T.textMuted }}>
          Dispatch #
          <select value={viewSessionId} onChange={e => setViewSessionId(e.target.value)}
            style={{ ...fieldChrome({}), height: 28, fontSize: T.fsSmall, padding: '0 6px', cursor: 'pointer' }}>
            <option value="">New dispatch</option>
            {sessions.map(s => <option key={s.id} value={s.id}>#{s.id} — {plural(s.line_count, 'job')}</option>)}
          </select>
        </label>
        {viewSession && (
          <>
            <Button size="sm" onClick={() => printManifest(viewSession)}><Printer size={13} aria-hidden /> Print</Button>
            <Button size="sm" onClick={() => exportCsv(viewSession)}><Download size={13} aria-hidden /> Export CSV</Button>
          </>
        )}
        <IconButton icon={X} label="Close" onClick={onClose} />
      </header>

      {viewSession && (
        <>
          <SessionLines session={viewSession} />
          <div style={{ padding: '10px 16px', fontSize: T.fsSmall, color: T.textMuted, background: T.panelAlt }}>
            Dispatched {viewSession.created_at ? new Date(viewSession.created_at).toLocaleString() : ''} — {plural(viewSession.lines.length, 'job')} · {plural(cartonsOf(viewSession), 'carton')}
          </div>
        </>
      )}

      {!viewSession && (<>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead>
            <tr>
              <th style={{ ...headCell, width: 40, padding: 0, textAlign: 'center' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ accentColor: T.accent }} aria-label="Select all" />
              </th>
              {['Job#', 'Customer', 'Status', 'Desp’d'].map(h => <th key={h} style={headCell}>{h}</th>)}
              {['Ship Via', 'Ship Ref'].map(h => <th key={h} style={editHead}>{h}</th>)}
              <th style={{ ...editHead, width: 92, textAlign: 'right' }}>Cartons</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '40px 16px', textAlign: 'center', borderBottom: `1px solid ${T.hairlineSoft}` }}>
                  <Truck size={20} aria-hidden style={{ color: T.textFaint }} />
                  <div style={{ marginTop: 8, fontSize: T.fsGrid, fontWeight: 500, color: T.text }}>Nothing is packed and waiting</div>
                  <div style={{ marginTop: 2, fontSize: T.fsSmall, color: T.textMuted }}>A job lands here once it reaches Pick/Pack.</div>
                </td>
              </tr>
            )}
            {rows.map(j => {
              const on = selected.has(j.id);
              return (
                <tr key={j.id} style={{ background: on ? T.accentTint : 'transparent', transition: `background ${T.transition}` }}>
                  <td style={{ ...cell, padding: 0, textAlign: 'center' }}>
                    <input type="checkbox" checked={on} onChange={() => toggle(j.id)} style={{ accentColor: T.accent }} aria-label={`Select ${j.id}`} />
                  </td>
                  <td style={{ ...cell, ...jobNo }}>{j.id}</td>
                  <td style={{ ...cell, fontWeight: 500 }}>{j.customer}</td>
                  <td style={cell}><StatusBadge status={j.status} size="sm" /></td>
                  <td style={{ ...cell, fontSize: T.fsSmall, color: j.dispatchedAt ? T.ok : T.textFaint }}>
                    {j.dispatchedAt ? `${j.dispatchedAt}${j.connote ? ` · ${j.connote}` : ''}` : '—'}
                  </td>
                  <td style={editCell}>
                    <input style={inp} aria-label={`Ship via for ${j.id}`} value={valOf(j, 'shipVia', j.shipTo || '')} onChange={e => setEdit(j.id, 'shipVia', e.target.value)} placeholder="Carrier or method" />
                  </td>
                  <td style={editCell}>
                    <input style={{ ...inp, fontFamily: T.fontMono, fontSize: T.fsSmall }} aria-label={`Ship ref for ${j.id}`} value={valOf(j, 'shipRef', '')} onChange={e => setEdit(j.id, 'shipRef', e.target.value)} placeholder="Con note or ref" />
                  </td>
                  <td style={{ ...editCell, width: 92 }}>
                    <input style={{ ...inp, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} aria-label={`Cartons for ${j.id}`} type="number" min={1} value={valOf(j, 'cartons', 1)} onChange={e => setEdit(j.id, 'cartons', e.target.value)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.hairline}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: T.panelAlt }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: T.fsSmall, color: T.textMuted, cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={advance} onChange={() => setAdvance(a => !a)} style={{ accentColor: T.accent }} />
          Advance FINISH → INVOICE on dispatch
        </label>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={autoPick} disabled={none || picking}>
          <CheckSquare size={13} aria-hidden /> {picking ? 'Picking…' : 'Auto Pick'}
        </Button>
        {[['delivery-note', 'Delivery notes'], ['ship-label', 'Ship labels'], ['job-label', 'Job labels']].map(([type, label]) => (
          <Button key={type} size="sm" onClick={() => printSelected(type)} disabled={none}>
            <Printer size={13} aria-hidden /> {label}
          </Button>
        ))}
        <span style={{ fontSize: T.fsSmall, color: T.textMuted, fontVariantNumeric: 'tabular-nums', padding: '0 4px' }}>{selected.size} of {rows.length} selected</span>
        <Button variant="primary" onClick={dispatchSelected} disabled={none || busy}>
          <Truck size={14} aria-hidden /> {busy ? 'Dispatching…' : `Dispatch selected (${selected.size})`}
        </Button>
      </div>
      </>)}
      </>)}
    </section>
  );
}
