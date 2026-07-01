import { useState } from 'react';
import { Play, X, Eye, Plus, Pencil, ClipboardList } from 'lucide-react';
import { T, statusColor } from '../../ui/tokens';
import DataGrid from '../../ui/DataGrid';

// Jim2-style advanced "Job List" builder. Presentational: the parent owns the
// `draft` filter object and the live `results`. Filters are organised into
// labelled groups (research: grouping + dividers is what keeps a dense ERP
// filter panel readable rather than "messy").

const STATUSES = ['QUOTE', 'New', 'ORDER', 'In Progress', 'PROOF', 'PRINT', 'Pick/Pack', 'FINISH', 'INVOICE', 'PAID', 'CANCEL'];
const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

const lbl = { fontSize: 9, fontWeight: 700, color: T.textFaint, letterSpacing: '0.03em', textTransform: 'uppercase', marginBottom: 2, display: 'block' };
const inp = { width: '100%', border: `1px solid ${T.hairline}`, borderRadius: 4, padding: '4px 6px', fontSize: T.fsSmall, fontFamily: T.font, color: T.text, background: T.panel, outline: 'none', height: 28, boxSizing: 'border-box' };

function Group({ title, children }) {
  return (
    <section style={{ border: `1px solid ${T.hairline}`, borderRadius: 7, background: T.panel, overflow: 'hidden', alignSelf: 'start' }}>
      <div style={{ padding: '5px 10px', background: T.hairlineSoft, borderBottom: `1px solid ${T.hairline}`, fontSize: 9, fontWeight: 800, letterSpacing: '0.07em', color: T.textMuted, textTransform: 'uppercase' }}>
        {title}
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </section>
  );
}

function Txt({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      <input style={inp} value={value || ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function Sel({ label, value, onChange, options, allLabel = 'Any' }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      <select style={inp} value={value || ''} onChange={e => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map(o => (
          typeof o === 'string'
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function DateRange({ label, fromVal, toVal, onFrom, onTo }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input type="date" style={inp} value={fromVal || ''} onChange={e => onFrom(e.target.value)} />
        <span style={{ color: T.textFaint, fontSize: T.fsSmall }}>→</span>
        <input type="date" style={inp} value={toVal || ''} onChange={e => onTo(e.target.value)} />
      </div>
    </div>
  );
}

function ClassChk({ label, checked, onToggle }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 5, fontSize: T.fsSmall, cursor: 'pointer',
      padding: '4px 10px', borderRadius: 5, userSelect: 'none',
      border: `1px solid ${checked ? T.accentStrong : T.hairline}`,
      background: checked ? T.accentTint : T.panel, color: checked ? T.accentStrong : T.textMuted,
      fontWeight: checked ? 700 : 500,
    }}>
      <input type="checkbox" checked={checked} onChange={onToggle} style={{ accentColor: T.accentStrong }} />
      {label}
    </label>
  );
}

const RESULT_COLUMNS = (onOpen) => [
  { key: 'id', label: 'Job#', width: 78, render: r => <span style={{ fontWeight: 700 }}>{r.id}</span> },
  { key: 'status', label: 'Status', width: 84, render: r => <span style={{ color: statusColor(r.status), fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>{r.status}</span> },
  { key: 'projectNo', label: 'Project#', width: 92, render: r => r.projectNo || '' },
  { key: 'customerId', label: 'Cust#', width: 88 },
  { key: 'customer', label: 'Customer Name' },
  { key: 'custRef', label: 'Cust Ref#', width: 104 },
  { key: 'due', label: 'Date Due', width: 94 },
  { key: 'accMgr', label: 'Acc Mgr', width: 80 },
  { key: 'total', label: 'Total $', width: 84, align: 'right', render: r => Number(r.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) },
  {
    key: '_open', label: '', width: 32, render: r => (
      <span role="button" tabIndex={0} aria-label={`View ${r.id}`} title="View job"
        onClick={e => { e.stopPropagation(); onOpen?.(r); }}
        style={{ color: T.textFaint, display: 'flex' }}>
        <Eye size={13} />
      </span>
    ),
  },
];

const btn = (variant) => {
  const base = { display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', fontSize: T.fsSmall, borderRadius: 6, cursor: 'pointer', fontWeight: 600 };
  if (variant === 'primary') return { ...base, color: '#fff', background: T.accentStrong, border: 'none', fontWeight: 700, padding: '6px 18px' };
  if (variant === 'accent') return { ...base, color: T.accentStrong, background: T.accentTint, border: `1px solid ${T.accentStrong}` };
  return { ...base, color: T.textMuted, background: T.hairlineSoft, border: `1px solid ${T.hairline}` };
};

export default function JobListBuilder({ draft, listName, onChange, options, results, onRun, onCancel, onAddJob, onEditJob, onViewJob }) {
  const set = (patch) => onChange(patch);
  const o = options || {};
  const activeCount = Object.values(draft).filter(v => v !== '' && v !== false).length;
  const [selectedId, setSelectedId] = useState(null);
  const [showTotal, setShowTotal] = useState(false);
  const selected = (results || []).find(r => r.id === selectedId) || null;
  const totalSum = (results || []).reduce((s, r) => s + Number(r.total || 0), 0);

  return (
    <div style={{ fontFamily: T.font, display: 'flex', flexDirection: 'column', background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${T.hairline}` }}>
        <ClipboardList size={16} style={{ color: T.accentStrong }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{listName || 'Job List'}</div>
          <div style={{ fontSize: 10.5, color: T.textFaint }}>Set filters, then Run — empty fields match everything</div>
        </div>
        {activeCount > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: T.accentStrong, background: T.accentTint, border: `1px solid ${T.accentStrong}`, borderRadius: 999, padding: '2px 9px' }}>
            {activeCount} filter{activeCount === 1 ? '' : 's'} on
          </span>
        )}
        <button onClick={onCancel} aria-label="Close" style={{ display: 'flex', padding: 4, borderRadius: 5, border: 'none', background: 'transparent', color: T.textFaint, cursor: 'pointer' }}>
          <X size={16} />
        </button>
      </div>

      {/* Grouped filters */}
      <div style={{ padding: 14, borderBottom: `1px solid ${T.hairline}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, alignItems: 'start' }}>
          <Group title="Job">
            <Txt label="Job#" value={draft.jobNo} onChange={v => set({ jobNo: v })} placeholder="e.g. 1199" />
            <Sel label="Status" value={draft.status} onChange={v => set({ status: v })} options={STATUSES} />
            <Sel label="Priority" value={draft.priority} onChange={v => set({ priority: v })} options={PRIORITIES} />
            <Sel label="Type" value={draft.type} onChange={v => set({ type: v })} options={o.types || []} />
            <Sel label="Branch" value={draft.branch} onChange={v => set({ branch: v })} options={o.branches || []} />
          </Group>

          <Group title="Customer">
            <Sel label="Cust#" value={draft.customerId} onChange={v => set({ customerId: v })}
              options={(o.customers || []).map(c => ({ value: c.id, label: `${c.id} — ${c.name}` }))} allLabel="All customers" />
            <Txt label="Name" value={draft.name} onChange={v => set({ name: v })} placeholder="customer / contact" />
            <Sel label="Cust Grp" value={draft.group} onChange={v => set({ group: v })} options={o.groups || []} />
            <Sel label="Acc Mgr" value={draft.accMgr} onChange={v => set({ accMgr: v })} options={o.accMgrs || []} />
            <Txt label="Cust Ref#" value={draft.custRef} onChange={v => set({ custRef: v })} />
            <Txt label="Our Ref#" value={draft.ourRef} onChange={v => set({ ourRef: v })} />
          </Group>

          <Group title="References & Stock">
            <Txt label="Inv#" value={draft.invoice} onChange={v => set({ invoice: v })} />
            <Txt label="Project#" value={draft.projectNo} onChange={v => set({ projectNo: v })} />
            <Txt label="Serial#" value={draft.serialNo} onChange={v => set({ serialNo: v })} />
            <Txt label="Item# / Stock#" value={draft.stockCode} onChange={v => set({ stockCode: v })} placeholder="stock code / desc" />
            <Sel label="Price Lev." value={draft.priceLevel} onChange={v => set({ priceLevel: v })} options={o.priceLevels || []} />
            <Sel label="Ship#" value={draft.shipTo} onChange={v => set({ shipTo: v })} options={o.shipCodes || []} />
          </Group>

          <Group title="Dates">
            <DateRange label="Date In" fromVal={draft.dateInFrom} toVal={draft.dateInTo} onFrom={v => set({ dateInFrom: v })} onTo={v => set({ dateInTo: v })} />
            <DateRange label="Due" fromVal={draft.dueFrom} toVal={draft.dueTo} onFrom={v => set({ dueFrom: v })} onTo={v => set({ dueTo: v })} />
            <DateRange label="Date Out" fromVal={draft.dateOutFrom} toVal={draft.dateOutTo} onFrom={v => set({ dateOutFrom: v })} onTo={v => set({ dateOutTo: v })} />
          </Group>
        </div>

        {/* Status flags */}
        <div style={{ marginTop: 12, padding: '10px 12px', border: `1px solid ${T.hairline}`, borderRadius: 7, background: T.hairlineSoft }}>
          <span style={{ ...lbl, marginBottom: 8 }}>Show jobs that are</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            <ClassChk label="Active" checked={!!draft.active} onToggle={() => set({ active: !draft.active })} />
            <ClassChk label="Ready" checked={!!draft.ready} onToggle={() => set({ ready: !draft.ready })} />
            <ClassChk label="Finished" checked={!!draft.finish} onToggle={() => set({ finish: !draft.finish })} />
            <ClassChk label="Invoiced" checked={!!draft.invoiced} onToggle={() => set({ invoiced: !draft.invoiced })} />
            <ClassChk label="Quote" checked={!!draft.quote} onToggle={() => set({ quote: !draft.quote })} />
            <ClassChk label="Overdue" checked={!!draft.overdue} onToggle={() => set({ overdue: !draft.overdue })} />
            <ClassChk label="Has Tax" checked={!!draft.tax} onToggle={() => set({ tax: !draft.tax })} />
          </div>
        </div>
      </div>

      {/* Live results */}
      <div style={{ padding: '10px 14px 14px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          <span style={{ ...lbl, marginBottom: 0 }}>Results</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{results ? results.length : '…'}</span>
          <span style={{ fontSize: 10.5, color: T.textFaint }}>match{results && results.length === 1 ? 'es' : ''} — click to select, double-click to view</span>
        </div>
        <DataGrid
          columns={RESULT_COLUMNS(onViewJob)}
          rows={results}
          rowKey="id"
          selectedKey={selectedId}
          onRowClick={(r) => setSelectedId(r.id)}
          onRowDoubleClick={onViewJob}
          emptyText="No jobs match these filters"
          maxHeight="30vh"
          initialSort={{ key: 'id', dir: 'desc' }}
        />
        {showTotal && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 6, fontSize: T.fsSmall, color: T.textMuted }}>
            <span>{(results || []).length} jobs</span>
            <span style={{ fontWeight: 700, color: T.text }}>Total ${totalSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        )}
      </div>

      {/* Footer — Jim2 Job List bar: Add · Edit · View · Run · Cancel · Show Total */}
      <div style={{ padding: '10px 14px', borderTop: `1px solid ${T.hairline}`, display: 'flex', alignItems: 'center', gap: 8, background: T.hairlineSoft }}>
        <button onClick={onAddJob} style={btn()}><Plus size={13} /> Add</button>
        <button onClick={() => selected && onEditJob(selected)} disabled={!selected} style={{ ...btn(), opacity: selected ? 1 : 0.45, cursor: selected ? 'pointer' : 'not-allowed' }}><Pencil size={13} /> Edit</button>
        <button onClick={() => selected && onViewJob(selected)} disabled={!selected} style={{ ...btn(), opacity: selected ? 1 : 0.45, cursor: selected ? 'pointer' : 'not-allowed' }}><Eye size={13} /> View</button>
        <div style={{ flex: 1 }} />
        <button onClick={onRun} style={btn('primary')}><Play size={13} /> Run</button>
        <button onClick={onCancel} style={{ ...btn(), color: T.danger, borderColor: T.danger }}><X size={13} /> Cancel</button>
        <button onClick={() => setShowTotal(s => !s)} style={showTotal ? btn('accent') : btn()}>Show Total</button>
      </div>
    </div>
  );
}
