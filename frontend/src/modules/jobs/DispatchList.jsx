import { useState, useEffect } from 'react';
import { Truck, X, Download } from 'lucide-react';
import { T, statusColor } from '../../ui/tokens';
import { dispatchSessions } from '../../api';

// Jim2 Dispatch list: all dispatchable jobs (ready + invoiced) in one screen
// with inline-editable Ship Via / Ship Ref / Cartons (Jim2 shows these as
// yellow editable cells). Select rows and dispatch them as a batch.

const DISPATCHABLE = ['FINISH', 'INVOICE'];

const cell = { padding: '6px 8px', fontSize: T.fsGrid, borderBottom: `1px solid ${T.hairlineSoft}` };
const editCell = {
  ...cell,
  background: '#fefce8', // Jim2's editable-column yellow
};
const inp = { width: '100%', border: `1px solid ${T.hairline}`, borderRadius: 4, padding: '3px 6px', fontSize: T.fsGrid, fontFamily: T.font, color: T.text, background: '#fff', outline: 'none', boxSizing: 'border-box' };

export default function DispatchList({ jobs = [], onDispatch, onClose, busy = false }) {
  const rows = jobs.filter(j => DISPATCHABLE.includes(j.status));
  const [selected, setSelected] = useState(() => new Set());
  const [edits, setEdits] = useState({}); // jobId -> { shipVia, shipRef, cartons }
  const [advance, setAdvance] = useState(true);
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
  const exportSession = () => {
    if (!viewSession) return;
    const rows = viewSession.lines.map(l => `${l.job_id},${JSON.stringify(l.customer_name || '')},${JSON.stringify(l.ship_via || '')},${JSON.stringify(l.ship_ref || '')},${l.cartons}`);
    const csv = ['job_id,customer,ship_via,ship_ref,cartons', ...rows].join('\n');
    const url = window.URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `dispatch-session-${viewSession.id}.csv`;
    a.click();
  };

  const editOf = (j) => edits[j.id] || {};
  const valOf = (j, key, fallback) => (editOf(j)[key] !== undefined ? editOf(j)[key] : fallback);
  const setEdit = (jobId, key, val) => setEdits(prev => ({ ...prev, [jobId]: { ...(prev[jobId] || {}), [key]: val } }));
  const toggle = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)));

  const dispatchSelected = () => {
    const batch = rows
      .filter(r => selected.has(r.id))
      .map(r => ({
        id: r.id,
        shipVia: valOf(r, 'shipVia', r.shipTo || ''),
        shipRef: valOf(r, 'shipRef', ''),
        cartons: Math.max(1, parseInt(valOf(r, 'cartons', 1), 10) || 1),
        advanceStatus: advance && r.status === 'FINISH',
      }));
    if (batch.length) onDispatch(batch);
  };

  return (
    <div style={{ fontFamily: T.font, display: 'flex', flexDirection: 'column', background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${T.hairline}` }}>
        <Truck size={16} style={{ color: T.accentStrong }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Dispatch</div>
          <div style={{ fontSize: 10.5, color: T.textFaint }}>Ready + invoiced jobs — edit Ship Via / Ref / Cartons inline, select and dispatch</div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: T.fsSmall, color: T.textMuted }}>
          Dispatch #
          <select value={viewSessionId} onChange={e => setViewSessionId(e.target.value)}
            style={{ border: `1px solid ${T.hairline}`, borderRadius: 4, padding: '3px 6px', fontSize: T.fsSmall, fontFamily: T.font, background: T.panel, color: T.text }}>
            <option value="">New dispatch</option>
            {sessions.map(s => <option key={s.id} value={s.id}>#{s.id} — {s.line_count} job{s.line_count === 1 ? '' : 's'}</option>)}
          </select>
        </label>
        {viewSession && (
          <button onClick={exportSession} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: T.fsSmall, fontWeight: 600, color: T.accentStrong, background: T.accentTint, border: `1px solid ${T.accentStrong}`, borderRadius: 6, cursor: 'pointer' }}>
            <Download size={12} /> Export CSV
          </button>
        )}
        <button onClick={onClose} aria-label="Close" style={{ display: 'flex', padding: 4, borderRadius: 5, border: 'none', background: 'transparent', color: T.textFaint, cursor: 'pointer' }}><X size={16} /></button>
      </div>

      {viewSession && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead style={{ background: T.hairlineSoft }}>
              <tr>
                {['Job#', 'Customer', 'Ship Via', 'Ship Ref', 'Cartons'].map(h => (
                  <th key={h} style={{ ...cell, textAlign: 'left', fontSize: T.fsHeader, fontWeight: 700, color: T.headerText, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {viewSession.lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ ...cell, fontWeight: 700, fontFamily: T.mono ?? 'monospace' }}>{l.job_id}</td>
                  <td style={cell}>{l.customer_name}</td>
                  <td style={cell}>{l.ship_via}</td>
                  <td style={cell}>{l.ship_ref}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{l.cartons}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '8px 14px', fontSize: 10.5, color: T.textFaint }}>
            Dispatched {viewSession.created_at ? new Date(viewSession.created_at).toLocaleString() : ''} — {viewSession.lines.length} job{viewSession.lines.length === 1 ? '' : 's'}
          </div>
        </div>
      )}

      {!viewSession && (<>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead style={{ background: T.hairlineSoft }}>
            <tr>
              <th style={{ ...cell, width: 34, textAlign: 'center' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ accentColor: T.accentStrong }} aria-label="Select all" />
              </th>
              {['Job#', 'Customer', 'Status', 'Desp’d'].map(h => (
                <th key={h} style={{ ...cell, textAlign: 'left', fontSize: T.fsHeader, fontWeight: 700, color: T.headerText, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
              ))}
              {['Ship Via', 'Ship Ref', 'Cartons'].map(h => (
                <th key={h} style={{ ...cell, textAlign: 'left', fontSize: T.fsHeader, fontWeight: 700, color: T.accentStrong, textTransform: 'uppercase', letterSpacing: '0.03em', background: '#fefce8' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} style={{ ...cell, textAlign: 'center', color: T.textFaint, padding: 24 }}>No jobs ready to dispatch (FINISH or INVOICE)</td></tr>
            )}
            {rows.map(j => (
              <tr key={j.id} style={{ background: selected.has(j.id) ? T.accentTint : 'transparent' }}>
                <td style={{ ...cell, textAlign: 'center' }}>
                  <input type="checkbox" checked={selected.has(j.id)} onChange={() => toggle(j.id)} style={{ accentColor: T.accentStrong }} aria-label={`Select ${j.id}`} />
                </td>
                <td style={{ ...cell, fontWeight: 700, fontFamily: T.mono ?? 'monospace' }}>{j.id}</td>
                <td style={cell}>{j.customer}</td>
                <td style={{ ...cell }}>
                  <span style={{ color: statusColor(j.status), fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>{j.status}</span>
                </td>
                <td style={{ ...cell, fontSize: 11, color: j.dispatchedAt ? T.ok : T.textFaint }}>{j.dispatchedAt || '—'}</td>
                <td style={editCell}>
                  <input style={inp} value={valOf(j, 'shipVia', j.shipTo || '')} onChange={e => setEdit(j.id, 'shipVia', e.target.value)} placeholder="carrier / method" />
                </td>
                <td style={editCell}>
                  <input style={inp} value={valOf(j, 'shipRef', '')} onChange={e => setEdit(j.id, 'shipRef', e.target.value)} placeholder="con note / ref" />
                </td>
                <td style={{ ...editCell, width: 80 }}>
                  <input style={{ ...inp, textAlign: 'right' }} type="number" min={1} value={valOf(j, 'cartons', 1)} onChange={e => setEdit(j.id, 'cartons', e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ padding: '10px 14px', borderTop: `1px solid ${T.hairline}`, display: 'flex', alignItems: 'center', gap: 10, background: T.hairlineSoft }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: T.fsSmall, color: T.textMuted, cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={advance} onChange={() => setAdvance(a => !a)} style={{ accentColor: T.accentStrong }} />
          Advance FINISH → INVOICE on dispatch
        </label>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: T.fsSmall, color: T.textMuted }}>{selected.size} of {rows.length} selected</span>
        <button
          onClick={dispatchSelected}
          disabled={selected.size === 0 || busy}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 18px', fontSize: T.fsSmall, fontWeight: 700, color: '#fff', background: T.accentStrong, border: 'none', borderRadius: 6, cursor: selected.size && !busy ? 'pointer' : 'not-allowed', opacity: selected.size && !busy ? 1 : 0.5 }}
        >
          <Truck size={13} /> {busy ? 'Dispatching…' : `Dispatch Selected (${selected.size})`}
        </button>
      </div>
      </>)}
    </div>
  );
}
