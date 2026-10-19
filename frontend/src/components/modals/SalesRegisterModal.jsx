import { DollarSign, FileSpreadsheet, X } from 'lucide-react';
import * as api from '../../api';
import DraggableModal from '../../ui/DraggableModal';
import { T } from '../../ui/tokens';

export default function SalesRegisterModal({ salesRegModal, setSalesRegModal }) {
  if (!salesRegModal.open) return null;
  const close = () => setSalesRegModal(m => ({ ...m, open: false }));
  const load = async () => {
    setSalesRegModal(m => ({ ...m, loading: true, error: '' }));
    try {
      const params = {};
      if (salesRegModal.dateFrom) params.date_from = salesRegModal.dateFrom;
      if (salesRegModal.dateTo) params.date_to = salesRegModal.dateTo;
      const result = await api.jobs.salesRegister(params);
      setSalesRegModal(m => ({ ...m, loading: false, data: result }));
    } catch (e) { setSalesRegModal(m => ({ ...m, loading: false, error: e.message })); }
  };
  const exportCSV = () => {
    if (!salesRegModal.data) return;
    const rows = [['Job ID','Customer','Status','Date In','Invoice','Total Ex','Tax','Total Inc','Balance Due']];
    salesRegModal.data.jobs.forEach(j => rows.push([j.id, j.customer, j.status, j.dateIn, j.invoice || '', (j.subtotal||0).toFixed(2), (j.tax||0).toFixed(2), (j.total||0).toFixed(2), (j.balanceDue||0).toFixed(2)]));
    // RFC 4180: a quote inside a quoted field is escaped by doubling it.
    // Every cell was wrapped in quotes and nothing escaped it, so a customer
    // name containing one broke the row - silently, in the bookkeeper spreadsheet
    // this file is made for rather than here.
    const esc = (c) => String(c == null ? '' : c).replace(/"/g, '""');
    const csv = rows.map(r => r.map(c => `"${esc(c)}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-register-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <DraggableModal onClose={close} cardClass="w-[900px] p-6" cardStyle={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
      <div className="flex items-center justify-between mb-4 cursor-move select-none">
        <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: T.text }}><DollarSign className="w-5 h-5 text-ok" />Sales Register</h3>
        <button onClick={close}><X className="w-5 h-5" style={{ color: T.textMuted }} /></button>
      </div>
      <div className="flex items-end gap-3 mb-4">
        <div><label className="block text-xs font-medium mb-1" style={{ color: T.text }}>Date From</label><input type="date" value={salesRegModal.dateFrom} onChange={e => setSalesRegModal(m => ({ ...m, dateFrom: e.target.value, data: null }))} className="rounded px-3 py-1.5 text-sm" style={{ border: `1px solid ${T.hairline}` }} /></div>
        <div><label className="block text-xs font-medium mb-1" style={{ color: T.text }}>Date To</label><input type="date" value={salesRegModal.dateTo} onChange={e => setSalesRegModal(m => ({ ...m, dateTo: e.target.value, data: null }))} className="rounded px-3 py-1.5 text-sm" style={{ border: `1px solid ${T.hairline}` }} /></div>
        <button onClick={load} disabled={salesRegModal.loading} className="px-4 py-2 text-white rounded text-sm disabled:opacity-50" style={{ background: T.accentStrong }}>{salesRegModal.loading ? 'Loading...' : 'Load'}</button>
        {salesRegModal.data && <button onClick={exportCSV} className="px-4 py-2 rounded text-sm flex items-center gap-1" style={{ border: `1px solid ${T.hairline}`, color: T.textMuted }}><FileSpreadsheet className="w-4 h-4" />Export CSV</button>}
      </div>
      {salesRegModal.error && <p className="text-sm mb-3" style={{ color: T.danger }}>{salesRegModal.error}</p>}
      {salesRegModal.data && (
        <>
          <div className="flex gap-4 mb-3 text-sm" style={{ color: T.text }}>
            <span className="font-medium">{salesRegModal.data.summary.count} jobs</span>
            <span>Ex: <span className="font-semibold" style={{ color: T.text }}>${salesRegModal.data.summary.total_ex.toFixed(2)}</span></span>
            <span>Tax: <span className="font-semibold" style={{ color: T.text }}>${salesRegModal.data.summary.total_tax.toFixed(2)}</span></span>
            <span>Inc: <span className="font-semibold text-base" style={{ color: T.ok }}>${salesRegModal.data.summary.total_inc.toFixed(2)}</span></span>
          </div>
          <div className="overflow-auto flex-1 rounded" style={{ border: `1px solid ${T.hairline}` }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0" style={{ background: T.hairlineSoft }}>
                <tr>{['Job','Customer','Status','Date In','Invoice','Ex GST','GST','Inc GST','Balance'].map(h => <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: T.textMuted }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {salesRegModal.data.jobs.map(j => (
                  <tr key={j.id} style={{ borderTop: `1px solid ${T.hairline}` }}>
                    <td className="px-3 py-1.5 font-mono font-medium" style={{ color: T.accentStrong }}>{j.id}</td>
                    <td className="px-3 py-1.5" style={{ color: T.text }}>{j.customer}</td>
                    <td className="px-3 py-1.5"><span className={`px-2 py-0.5 rounded text-[10px] font-medium ${j.status === 'PAID' ? 'bg-ok-tint text-ok' : 'bg-warn-tint text-warn'}`}>{j.status}</span></td>
                    <td className="px-3 py-1.5" style={{ color: T.textMuted }}>{j.dateIn}</td>
                    <td className="px-3 py-1.5" style={{ color: T.textMuted }}>{j.invoice || '—'}</td>
                    <td className="px-3 py-1.5 text-right" style={{ color: T.text }}>${(j.subtotal||0).toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right" style={{ color: T.textMuted }}>${(j.tax||0).toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right font-medium" style={{ color: T.text }}>${(j.total||0).toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right" style={{ color: (j.balanceDue||0) > 0 ? T.danger : T.textFaint, fontWeight: (j.balanceDue||0) > 0 ? 600 : 400 }}>${(j.balanceDue||0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!salesRegModal.data && !salesRegModal.loading && <p className="text-sm text-center py-12" style={{ color: T.textFaint }}>Select a date range and click Load to view the Sales Register.</p>}
    </DraggableModal>
  );
}
