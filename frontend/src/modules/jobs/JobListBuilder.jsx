import { Play, RotateCcw, X, Eye, Save } from 'lucide-react';
import { T, statusColor } from '../../ui/tokens';
import DataGrid from '../../ui/DataGrid';

// Jim2-style advanced "Job List" filter builder. Presentational: the parent owns
// the `draft` filter object and the live `results`; this renders the form + grid.

const STATUSES = ['QUOTE', 'New', 'ORDER', 'In Progress', 'PROOF', 'PRINT', 'Pick/Pack', 'FINISH', 'INVOICE', 'PAID', 'CANCEL'];
const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

const lbl = { fontSize: 9.5, fontWeight: 700, color: T.textFaint, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 2, display: 'block' };
const inp = { width: '100%', border: `1px solid ${T.hairline}`, borderRadius: 4, padding: '4px 6px', fontSize: T.fsSmall, fontFamily: T.font, color: T.text, background: T.panel, outline: 'none' };

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
      padding: '3px 9px', borderRadius: 4, userSelect: 'none',
      border: `1px solid ${checked ? T.accent : T.hairline}`,
      background: checked ? T.accentTint : T.panel, color: checked ? T.accentInk ?? T.text : T.textMuted,
      fontWeight: checked ? 700 : 500,
    }}>
      <input type="checkbox" checked={checked} onChange={onToggle} style={{ accentColor: T.accent }} />
      {label}
    </label>
  );
}

const RESULT_COLUMNS = (onOpen) => [
  { key: 'id', label: 'Job#', width: 78, render: r => <span style={{ fontWeight: 700 }}>{r.id}</span> },
  { key: 'status', label: 'Status', width: 84, render: r => <span style={{ color: statusColor(r.status), fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>{r.status}</span> },
  { key: 'projectNo', label: 'Project#', width: 96, render: r => r.projectNo || '' },
  { key: 'customerId', label: 'Cust#', width: 90 },
  { key: 'customer', label: 'Customer Name' },
  { key: 'custRef', label: 'Cust Ref#', width: 110 },
  { key: 'due', label: 'Date Due', width: 96 },
  { key: 'accMgr', label: 'Acc Mgr', width: 84 },
  { key: 'total', label: 'Total $', width: 84, align: 'right', render: r => Number(r.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) },
  {
    key: '_open', label: '', width: 34, render: r => (
      <span role="button" tabIndex={0} aria-label={`View ${r.id}`} title="View job"
        onClick={e => { e.stopPropagation(); onOpen?.(r); }}
        style={{ color: T.textFaint, display: 'flex' }}>
        <Eye size={13} />
      </span>
    ),
  },
];

export default function JobListBuilder({ draft, onChange, options, results, onRun, onCancel, onReset, onOpenJob, onSaveAsList }) {
  const set = (patch) => onChange(patch);
  const o = options || {};

  return (
    <div style={{ fontFamily: T.font, display: 'flex', flexDirection: 'column', maxHeight: '82vh' }}>
      {/* Filter grid */}
      <div style={{ padding: 14, overflowY: 'auto', borderBottom: `1px solid ${T.hairline}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 14px' }}>
          <Txt label="Job#" value={draft.jobNo} onChange={v => set({ jobNo: v })} placeholder="e.g. 1199" />
          <Sel label="Status" value={draft.status} onChange={v => set({ status: v })} options={STATUSES} />
          <Sel label="Cust Grp" value={draft.group} onChange={v => set({ group: v })} options={o.groups || []} />

          <Sel label="Cust#" value={draft.customerId} onChange={v => set({ customerId: v })}
            options={(o.customers || []).map(c => ({ value: c.id, label: `${c.id} — ${c.name}` }))} allLabel="All customers" />
          <Sel label="Priority" value={draft.priority} onChange={v => set({ priority: v })} options={PRIORITIES} />
          <Sel label="Acc Mgr" value={draft.accMgr} onChange={v => set({ accMgr: v })} options={o.accMgrs || []} />

          <Txt label="Cust Ref#" value={draft.custRef} onChange={v => set({ custRef: v })} />
          <Sel label="Type" value={draft.type} onChange={v => set({ type: v })} options={o.types || []} />
          <Sel label="Ship#" value={draft.shipTo} onChange={v => set({ shipTo: v })} options={o.shipCodes || []} />

          <Txt label="Our Ref#" value={draft.ourRef} onChange={v => set({ ourRef: v })} />
          <Txt label="Inv#" value={draft.invoice} onChange={v => set({ invoice: v })} />
          <Txt label="Project#" value={draft.projectNo} onChange={v => set({ projectNo: v })} />

          <Txt label="Name" value={draft.name} onChange={v => set({ name: v })} placeholder="customer / contact" />
          <Sel label="Branch" value={draft.branch} onChange={v => set({ branch: v })} options={o.branches || []} />
          <Sel label="Price Lev." value={draft.priceLevel} onChange={v => set({ priceLevel: v })} options={o.priceLevels || []} />

          <Txt label="Item# / Stock#" value={draft.stockCode} onChange={v => set({ stockCode: v })} placeholder="stock code / desc" />
          <Txt label="Serial#" value={draft.serialNo} onChange={v => set({ serialNo: v })} />
          <div />

          <DateRange label="Date In" fromVal={draft.dateInFrom} toVal={draft.dateInTo} onFrom={v => set({ dateInFrom: v })} onTo={v => set({ dateInTo: v })} />
          <DateRange label="Due" fromVal={draft.dueFrom} toVal={draft.dueTo} onFrom={v => set({ dueFrom: v })} onTo={v => set({ dueTo: v })} />
          <DateRange label="Date Out" fromVal={draft.dateOutFrom} toVal={draft.dateOutTo} onFrom={v => set({ dateOutFrom: v })} onTo={v => set({ dateOutTo: v })} />
        </div>

        {/* Status-class toggles (Jim2 Active / Ready / Finish / Inv'd / Quote) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12, alignItems: 'center' }}>
          <span style={{ ...lbl, marginBottom: 0, marginRight: 2 }}>Show</span>
          <ClassChk label="Active" checked={!!draft.active} onToggle={() => set({ active: !draft.active })} />
          <ClassChk label="Ready" checked={!!draft.ready} onToggle={() => set({ ready: !draft.ready })} />
          <ClassChk label="Finish" checked={!!draft.finish} onToggle={() => set({ finish: !draft.finish })} />
          <ClassChk label="Inv'd" checked={!!draft.invoiced} onToggle={() => set({ invoiced: !draft.invoiced })} />
          <ClassChk label="Quote" checked={!!draft.quote} onToggle={() => set({ quote: !draft.quote })} />
          <ClassChk label="Overdue" checked={!!draft.overdue} onToggle={() => set({ overdue: !draft.overdue })} />
          <ClassChk label="Tax" checked={!!draft.tax} onToggle={() => set({ tax: !draft.tax })} />
        </div>
      </div>

      {/* Live results */}
      <div style={{ padding: 14, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <DataGrid
          columns={RESULT_COLUMNS(onOpenJob)}
          rows={results}
          rowKey="id"
          onRowClick={onOpenJob}
          emptyText="No jobs match these filters"
          maxHeight="34vh"
          initialSort={{ key: 'id', dir: 'desc' }}
        />
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 14px', borderTop: `1px solid ${T.hairline}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: T.fsSmall, color: T.textMuted, fontWeight: 600 }}>
          {results ? `${results.length} job${results.length === 1 ? '' : 's'}` : '…'}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={onReset} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: T.fsSmall, color: T.textMuted, background: T.hairlineSoft, border: `1px solid ${T.hairline}`, borderRadius: 6, cursor: 'pointer' }}>
          <RotateCcw size={13} /> Reset
        </button>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: T.fsSmall, color: T.textMuted, background: T.hairlineSoft, border: `1px solid ${T.hairline}`, borderRadius: 6, cursor: 'pointer' }}>
          <X size={13} /> Cancel
        </button>
        {onSaveAsList && (
          <button onClick={onSaveAsList} title="Save these filters as a named list in the nav tree" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: T.fsSmall, fontWeight: 600, color: T.accentStrong, background: T.accentTint, border: `1px solid ${T.accentStrong}`, borderRadius: 6, cursor: 'pointer' }}>
            <Save size={13} /> Save as List
          </button>
        )}
        <button onClick={onRun} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', fontSize: T.fsSmall, fontWeight: 700, color: '#fff', background: T.accentStrong ?? T.accent, border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          <Play size={13} /> Run List
        </button>
      </div>
    </div>
  );
}
