import { React } from 'react';
import { Plus, RefreshCw, Save, X } from 'lucide-react';
import { BRANCHES, DEFAULT_BRANCH } from '../../branches';
import { notify } from '../../lib/notify';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../../api';

export default function POGoodsReceiptsPanel({ po }) {
  const queryClient = useQueryClient();
  const { data: receipts = [], isFetching, refetch } = useQuery({
    queryKey: ['goods-receipts', po.id],
    queryFn: () => api.goodsReceipts.list({ po_id: po.id }),
    staleTime: 30000,
    onError: (e) => { const m = e?.message || String(e); setErr(m); notify(m, { type: 'error' }); },
  });

  const [showForm, setShowForm] = React.useState(false);
  const [formLines, setFormLines] = React.useState([]);
  // Landed costs entered with the shipment (Jim2 does these as a separate
  // after-the-fact stock adjustment; capturing them here is fewer steps and
  // lets us show the COG impact before saving).
  const [charges, setCharges] = React.useState([]);
  const [grRef, setGrRef] = React.useState('');
  // Which branch the delivery landed at. Without it every receipt took the
  // server default, so a Melbourne delivery shelved itself at HQ.
  const [grBranch, setGrBranch] = React.useState(DEFAULT_BRANCH);
  const [grNotes, setGrNotes] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');
  const today = new Date().toISOString().slice(0, 10);

  function openForm() {
    setFormLines((po.items || []).map(item => ({
      sku: item.sku,
      description: item.description,
      qtyExpected: item.qtyOrdered - item.qtyReceived,
      qtyReceived: item.qtyOrdered - item.qtyReceived,
      unitCost: item.unitCost,
      condition: 'Good',
    })));
    setCharges([]);
    setGrRef('');
    setGrNotes('');
    setGrBranch(DEFAULT_BRANCH);
    setErr('');
    setShowForm(true);
  }

  async function submitGR() {
    const lines = formLines.filter(l => l.qtyReceived > 0);
    if (!lines.length) { setErr('Enter at least one received quantity > 0'); return; }
    setSaving(true); setErr('');
    try {
      await api.goodsReceipts.create({
        poId: po.id,
        supplierName: po.supplier,
        supplierId: po.supplierCode,
        receivedDate: today,
        branch: grBranch,
        reference: grRef || null,
        notes: grNotes || null,
        lines: formLines.map(l => ({ ...l })),
        charges,
      });
      queryClient.invalidateQueries(['goods-receipts', po.id]);
      queryClient.invalidateQueries(['purchaseOrders']);
      queryClient.invalidateQueries(['inventory']);
      setShowForm(false);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  async function accept(id) {
    await api.goodsReceipts.accept(id);
    queryClient.invalidateQueries(['goods-receipts', po.id]);
    queryClient.invalidateQueries(['purchaseOrders']);
    queryClient.invalidateQueries(['inventory']);
  }

  async function reject(id) {
    if (!window.confirm('Reject this goods receipt?')) return;
    await api.goodsReceipts.reject(id);
    queryClient.invalidateQueries(['goods-receipts', po.id]);
  }

  const statusCls = { Pending: 'bg-amber-100 text-amber-700', Accepted: 'bg-emerald-100 text-emerald-700', Rejected: 'bg-red-100 text-red-600', Inspecting: 'bg-amber-100 text-amber-700' };

  return (
    <div className="px-5 py-4 border-t border-gray-100 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Goods Receipts</h4>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="text-xs text-blue-800 hover:text-blue-900 flex items-center gap-1">
            <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          {!['Received', 'Cancelled'].includes(po.status) && !showForm && (
            <button onClick={openForm}
              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700">
              <Plus className="w-3 h-3" />New Receipt
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-[10px] font-medium text-gray-500 block mb-0.5">Landed at</label>
              <select className="w-full border rounded px-2 py-1 text-xs" value={grBranch} onChange={e => setGrBranch(e.target.value)}>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select></div>
            <div><label className="text-[10px] font-medium text-gray-500 block mb-0.5">Delivery Reference</label>
              <input className="w-full border rounded px-2 py-1 text-xs" value={grRef} onChange={e => setGrRef(e.target.value)} placeholder="e.g. DEL-001234" /></div>
            <div><label className="text-[10px] font-medium text-gray-500 block mb-0.5">Notes</label>
              <input className="w-full border rounded px-2 py-1 text-xs" value={grNotes} onChange={e => setGrNotes(e.target.value)} /></div>
          </div>
          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{err}</p>}
          <table className="w-full text-xs border rounded overflow-hidden">
            <thead className="bg-gray-100 border-b">
              <tr>
                {['SKU','Expected','Received','Condition'].map(h => <th key={h} className="text-left px-2 py-1.5 font-semibold text-gray-600">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {formLines.map((ln, idx) => (
                <tr key={ln.sku} className="border-b last:border-0">
                  <td className="px-2 py-1.5 font-mono font-bold text-indigo-700">{ln.sku}</td>
                  <td className="px-2 py-1.5 text-center text-gray-500">{ln.qtyExpected}</td>
                  <td className="px-2 py-1.5">
                    <input type="number" min="0" max={ln.qtyExpected}
                      value={formLines[idx].qtyReceived}
                      onChange={e => setFormLines(lines => lines.map((l, i) => i === idx ? { ...l, qtyReceived: parseInt(e.target.value) || 0 } : l))}
                      className="w-16 border rounded px-1.5 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-emerald-700" />
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={formLines[idx].condition}
                      onChange={e => setFormLines(lines => lines.map((l, i) => i === idx ? { ...l, condition: e.target.value } : l))}
                      className="border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                      {['Good','Damaged','Short','Surplus'].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Landed costs — folded into COG when the receipt is accepted */}
          {(() => {
            const totalLanded = charges.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
            const totalUnits = formLines.reduce((s, l) => s + (parseInt(l.qtyReceived, 10) || 0), 0);
            const perUnit = totalUnits > 0 ? totalLanded / totalUnits : 0;
            const setCharge = (idx, patch) => setCharges(cs => cs.map((c, i) => i === idx ? { ...c, ...patch } : c));
            return (
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                <div className="flex items-center justify-between bg-gray-50 px-2 py-1.5 border-b">
                  <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Landed Costs — freight, duty, customs</span>
                  <button type="button"
                    onClick={() => setCharges(cs => [...cs, { description: '', amount: '', basis: 'value' }])}
                    className="text-[10px] font-semibold text-blue-800 hover:text-blue-900">+ Add charge</button>
                </div>
                {charges.length === 0 ? (
                  <p className="text-[11px] text-gray-400 px-2 py-2">None — cost of goods will equal the supplier price.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="border-b">
                      <tr>
                        {['Description', 'Amount', 'Spread by', ''].map(h => (
                          <th key={h} className="text-left px-2 py-1 font-semibold text-gray-500 text-[10px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {charges.map((c, idx) => (
                        <tr key={idx} className="border-b last:border-0">
                          <td className="px-2 py-1">
                            <input value={c.description} placeholder="e.g. Sea freight"
                              onChange={e => setCharge(idx, { description: e.target.value })}
                              className="w-full border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </td>
                          <td className="px-2 py-1">
                            <input type="number" min="0" step="0.01" value={c.amount} placeholder="0.00"
                              onChange={e => setCharge(idx, { amount: e.target.value })}
                              className="w-24 border rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </td>
                          <td className="px-2 py-1">
                            <select value={c.basis} onChange={e => setCharge(idx, { basis: e.target.value })}
                              className="border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              title="Value spreads by line value (duty, insurance). Qty spreads per unit (freight).">
                              <option value="value">Line value</option>
                              <option value="qty">Units</option>
                            </select>
                          </td>
                          <td className="px-2 py-1 text-right">
                            <button type="button" onClick={() => setCharges(cs => cs.filter((_, i) => i !== idx))}
                              className="text-gray-400 hover:text-red-600" title="Remove charge">
                              <X className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {totalLanded > 0 && (
                  <div className="px-2 py-1.5 bg-blue-50 border-t text-[11px] text-blue-900 flex items-center justify-between">
                    <span>Total landed <strong>${totalLanded.toFixed(2)}</strong> across {totalUnits} unit{totalUnits === 1 ? '' : 's'}</span>
                    <span>adds <strong>~${perUnit.toFixed(2)}</strong>/unit to cost of goods</span>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800">Cancel</button>
            <button onClick={submitGR} disabled={saving}
              className="px-3 py-1 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1">
              {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}Save Receipt
            </button>
          </div>
        </div>
      )}

      {receipts.length === 0 && !showForm ? (
        <p className="text-xs text-gray-400 text-center py-4">No goods receipts yet.</p>
      ) : (
        receipts.map(gr => (
          <div key={gr.id} className="border border-gray-100 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-gray-700">GR-{gr.id}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusCls[gr.status] || 'bg-gray-100 text-gray-600'}`}>{gr.status}</span>
              <span className="text-xs text-gray-400">{gr.receivedDate}</span>
              {gr.reference && <span className="text-xs text-gray-500">· {gr.reference}</span>}
              {gr.landedTotal > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800"
                  title={(gr.charges || []).map(c => `${c.description}: $${c.amount.toFixed(2)} (${c.basis})`).join('\n')}>
                  +${gr.landedTotal.toFixed(2)} landed
                </span>
              )}
              <div className="ml-auto flex gap-1">
                {gr.status === 'Pending' && (
                  <>
                    <button onClick={() => accept(gr.id)}
                      className="px-2 py-0.5 text-[10px] bg-emerald-600 text-white rounded font-semibold hover:bg-emerald-700">Accept</button>
                    <button onClick={() => reject(gr.id)}
                      className="px-2 py-0.5 text-[10px] bg-red-100 text-red-600 rounded font-semibold hover:bg-red-200">Reject</button>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(gr.lines || []).map(ln => (
                <div key={ln.id} className="flex items-center gap-1 text-[10px] bg-gray-50 border border-gray-100 rounded px-2 py-1">
                  <span className="font-mono font-bold text-indigo-600">{ln.sku}</span>
                  <span className={ln.condition !== 'Good' ? 'text-blue-700 font-semibold' : 'text-gray-500'}>×{ln.qtyReceived}</span>
                  {ln.condition !== 'Good' && <span className="text-blue-700">({ln.condition})</span>}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
