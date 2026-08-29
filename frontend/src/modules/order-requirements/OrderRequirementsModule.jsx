import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckSquare, RefreshCw, ShoppingCart, X } from 'lucide-react';
import { DEC_OPTIONS } from '../../lib/decoration';
import { T } from '../../ui/tokens';
import * as api from '../../api';
import DraggableModal from '../../ui/DraggableModal';

export default function OrderRequirementsModule({ decorationReqs, garmentReqs, jobs, pinJob, refetchDecorationReqs, refetchGarmentReqs, setActiveModule, suppliers }) {
  const queryClient = useQueryClient();
  const [orderReqTab, setOrderReqTab] = useState('garment');
  const [orderReqSelected, setOrderReqSelected] = useState(new Set());
  const [orderReqPoModal, setOrderReqPoModal] = useState({ open: false, poId: '', supplierId: '', supplierName: '', expectedDate: '', notes: '', saving: false, error: '' });

  const reqs = orderReqTab === 'garment' ? garmentReqs : decorationReqs;
  const refetch = orderReqTab === 'garment' ? refetchGarmentReqs : refetchDecorationReqs;

  const groupKey = (req) => orderReqTab === 'garment' ? req.sku : `${req.decoration_type}:${req.sku}`;

  const toggleGroup = (key) => {
    setOrderReqSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    const allKeys = reqs.map(groupKey);
    if (orderReqSelected.size === allKeys.length && allKeys.length > 0) {
      setOrderReqSelected(new Set());
    } else {
      setOrderReqSelected(new Set(allKeys));
    }
  };

  const selectedReqs = reqs.filter(r => orderReqSelected.has(groupKey(r)));
  const selectedItemCount = selectedReqs.reduce((t, r) => t + r.jobs.length, 0);
  const selectedTotalQty = selectedReqs.reduce((t, r) => t + (r.total_b_ord || r.total_qty || 0), 0);
  const selectedEstCost = selectedReqs.reduce((t, r) => t + ((r.total_b_ord || 0) * (r.unit_cost || 0)), 0);

  const today = new Date();
  const defaultPoId = `PO-${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;

  const openPoCreation = () => {
    const firstSelected = selectedReqs[0];
    setOrderReqPoModal({ open: true, poId: defaultPoId, supplierId: '', supplierName: firstSelected?.supplier || '', expectedDate: '', notes: '', saving: false, error: '' });
  };

  const submitPO = async () => {
    if (!orderReqPoModal.poId.trim()) {
      setOrderReqPoModal(m => ({ ...m, error: 'PO # is required' }));
      return;
    }
    const requirements = selectedReqs.flatMap(r =>
      r.jobs.map(j => ({ item_id: j.item_id, qty: j.b_ord || j.qty || 0 }))
    ).filter(r => r.qty > 0);
    if (!requirements.length) return;

    setOrderReqPoModal(m => ({ ...m, saving: true, error: '' }));
    try {
      await api.purchaseOrders.createFromRequirements({ id: orderReqPoModal.poId, supplierCode: orderReqPoModal.supplierId, supplier: orderReqPoModal.supplierName, expectedDate: orderReqPoModal.expectedDate, notes: orderReqPoModal.notes, requirements });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['orderRequirements'] });
      setOrderReqSelected(new Set());
      setOrderReqPoModal({ open: false, poId: '', supplierId: '', supplierName: '', expectedDate: '', notes: '', saving: false, error: '' });
    } catch (err) {
      setOrderReqPoModal(m => ({ ...m, saving: false, error: err.message }));
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg p-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold" style={{ color: T.text }}>Order Requirements</h2>
            <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>Items needed to fulfil active jobs — create purchase orders directly from here</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => refetch()} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ border: `1px solid ${T.hairline}`, color: T.textMuted }}>
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            {orderReqSelected.size > 0 && (
              <button onClick={openPoCreation} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold shadow-sm" style={{ background: T.accentStrong, color: '#fff' }}>
                <ShoppingCart className="w-3.5 h-3.5" />
                Create PO ({selectedTotalQty} units{selectedEstCost > 0 ? ` · $${selectedEstCost.toLocaleString('en-AU', { maximumFractionDigits: 0 })}` : ''})
              </button>
            )}
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 mt-3" style={{ borderBottom: `1px solid ${T.hairline}` }}>
          {[
            { key: 'garment', label: 'Garment Requirements', count: garmentReqs.reduce((t, r) => t + r.total_b_ord, 0) },
            { key: 'decoration', label: 'Decoration Work', count: decorationReqs.length },
          ].map(tab => (
            <button key={tab.key} onClick={() => { setOrderReqTab(tab.key); setOrderReqSelected(new Set()); }}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors"
              style={{ borderBottomColor: orderReqTab === tab.key ? T.accentStrong : 'transparent', color: orderReqTab === tab.key ? T.accentStrong : T.textMuted }}>
              {tab.label}
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: orderReqTab === tab.key ? T.accentTint : T.hairlineSoft, color: orderReqTab === tab.key ? T.accentStrong : T.textMuted }}>{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
        {reqs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16" style={{ color: T.textFaint }}>
            <CheckSquare className="w-10 h-10 mb-3" style={{ color: T.hairline }} />
            <p className="text-sm font-medium" style={{ color: T.textMuted }}>No outstanding {orderReqTab === 'garment' ? 'garment' : 'decoration'} requirements</p>
            <p className="text-xs mt-1">All active jobs are {orderReqTab === 'garment' ? 'fully stocked' : 'decorated or have linked POs'}</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead style={{ background: T.hairlineSoft, borderBottom: `1px solid ${T.hairline}` }}>
              <tr>
                <th className="w-8 px-3 py-2.5">
                  <input type="checkbox" className="rounded" checked={orderReqSelected.size === reqs.length && reqs.length > 0} onChange={toggleAll} />
                </th>
                {orderReqTab === 'garment' ? (
                  <>
                    <th className="px-3 py-2.5 text-left font-semibold" style={{ color: T.textMuted }}>Stock Code</th>
                    <th className="px-3 py-2.5 text-left font-semibold" style={{ color: T.textMuted }}>Description</th>
                    <th className="px-3 py-2.5 text-left font-semibold" style={{ color: T.textMuted }}>Supplier</th>
                    <th className="px-3 py-2.5 text-right font-semibold" style={{ color: T.textMuted }}>B. Ord</th>
                    <th className="px-3 py-2.5 text-right font-semibold" style={{ color: T.textMuted }}>Unit Cost</th>
                    <th className="px-3 py-2.5 text-right font-semibold" style={{ color: T.textMuted }}>Est. Total</th>
                    <th className="px-3 py-2.5 text-left font-semibold" style={{ color: T.textMuted }}>Affected Jobs</th>
                  </>
                ) : (
                  <>
                    <th className="px-3 py-2.5 text-left font-semibold" style={{ color: T.textMuted }}>Type</th>
                    <th className="px-3 py-2.5 text-left font-semibold" style={{ color: T.textMuted }}>Code</th>
                    <th className="px-3 py-2.5 text-left font-semibold" style={{ color: T.textMuted }}>Description</th>
                    <th className="px-3 py-2.5 text-right font-semibold" style={{ color: T.textMuted }}>Total Qty</th>
                    <th className="px-3 py-2.5 text-left font-semibold" style={{ color: T.textMuted }}>Affected Jobs</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {reqs.map(req => {
                const key = groupKey(req);
                const checked = orderReqSelected.has(key);
                return (
                  <tr key={key} className="cursor-pointer transition-colors"
                    style={{ background: checked ? T.hairlineSoft : T.panel, borderBottom: `1px solid ${T.hairline}` }}
                    onClick={() => toggleGroup(key)}>
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" className="rounded" checked={checked} onChange={() => toggleGroup(key)} />
                    </td>
                    {orderReqTab === 'garment' ? (
                      <>
                        <td className="px-3 py-2.5 font-mono font-semibold" style={{ color: T.accentStrong }}>{req.sku || <span style={{ color: T.textFaint }}>—</span>}</td>
                        <td className="px-3 py-2.5" style={{ color: T.text }}>{req.description}</td>
                        <td className="px-3 py-2.5" style={{ color: T.textMuted }}>{req.supplier || <span style={{ color: T.textFaint }}>—</span>}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-indigo-600">{req.total_b_ord}</td>
                        <td className="px-3 py-2.5 text-right" style={{ color: T.textMuted }}>{req.unit_cost > 0 ? `$${req.unit_cost.toFixed(2)}` : <span style={{ color: T.textFaint }}>—</span>}</td>
                        <td className="px-3 py-2.5 text-right font-semibold" style={{ color: T.text }}>{req.unit_cost > 0 ? `$${(req.total_b_ord * req.unit_cost).toLocaleString('en-AU', { maximumFractionDigits: 2 })}` : <span style={{ color: T.textFaint }}>—</span>}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {req.jobs.map(j => (
                              <button key={j.item_id} onClick={e => { e.stopPropagation(); const job = jobs.find(jb => jb.id === j.job_id); if (job) { pinJob(job); setActiveModule('jobs'); } }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] transition-colors"
                                style={{ background: T.hairlineSoft, color: T.textMuted }}
                                title={`${j.customer_name} — ${j.b_ord} units`}>
                                #{j.job_id} <span className="text-indigo-500 font-bold">×{j.b_ord}</span>
                              </button>
                            ))}
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5">
                          {(() => { const d = DEC_OPTIONS.find(o => o.v === req.decoration_type); return d ? <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${d.pill}`}>{d.emoji} {d.l}</span> : req.decoration_type; })()}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-semibold" style={{ color: T.accentStrong }}>{req.sku || <span style={{ color: T.textFaint }}>—</span>}</td>
                        <td className="px-3 py-2.5" style={{ color: T.text }}>{req.description}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-indigo-600">{req.total_qty}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {req.jobs.map(j => (
                              <button key={j.item_id} onClick={e => { e.stopPropagation(); const job = jobs.find(jb => jb.id === j.job_id); if (job) { pinJob(job); setActiveModule('jobs'); } }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] transition-colors"
                                style={{ background: T.hairlineSoft, color: T.textMuted }}
                                title={`${j.customer_name} — ${j.qty} units`}>
                                #{j.job_id} <span className="text-indigo-500 font-bold">×{j.qty}</span>
                              </button>
                            ))}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot style={{ background: T.hairlineSoft, borderTop: `1px solid ${T.hairline}` }}>
              <tr>
                <td colSpan={orderReqTab === 'garment' ? 4 : 4} className="px-3 py-2 text-xs font-semibold" style={{ color: T.textMuted }}>
                  {orderReqSelected.size > 0 ? `${orderReqSelected.size} of ${reqs.length} groups selected` : `${reqs.length} group${reqs.length !== 1 ? 's' : ''} total`}
                </td>
                {orderReqTab === 'garment' ? (
                  <>
                    <td className="px-3 py-2 text-right text-xs font-bold text-indigo-600">{reqs.reduce((t, r) => t + r.total_b_ord, 0)}</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right text-xs font-bold" style={{ color: T.text }}>${reqs.reduce((t, r) => t + r.total_b_ord * (r.unit_cost || 0), 0).toLocaleString('en-AU', { maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2" />
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 text-right text-xs font-bold text-indigo-600">{reqs.reduce((t, r) => t + r.total_qty, 0)}</td>
                    <td className="px-3 py-2" />
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* PO creation modal */}
      {orderReqPoModal.open && (
        <DraggableModal onClose={() => setOrderReqPoModal(m => ({ ...m, open: false }))} cardClass="w-full max-w-lg">
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.hairline}` }}>
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" style={{ color: T.accentStrong }} />
              <h3 className="text-sm font-semibold" style={{ color: T.text }}>Create Purchase Order</h3>
            </div>
            <button onClick={() => setOrderReqPoModal(m => ({ ...m, open: false }))} className="p-1 rounded-lg" style={{ color: T.textFaint }}><X className="w-4 h-4" /></button>
          </div>
          <div className="px-6 py-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: T.textMuted }}>PO Number *</label>
                <input value={orderReqPoModal.poId} onChange={e => setOrderReqPoModal(m => ({ ...m, poId: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ border: `1px solid ${T.hairline}`, color: T.text }} placeholder="PO-20260429" />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: T.textMuted }}>Expected Date</label>
                <input type="date"
                  value={orderReqPoModal.expectedDate ? (() => { const p = orderReqPoModal.expectedDate.split('/'); return p.length===3 ? `${p[2]}-${p[1]}-${p[0]}` : orderReqPoModal.expectedDate; })() : ''}
                  onChange={e => {
                    if (!e.target.value) { setOrderReqPoModal(m => ({ ...m, expectedDate: '' })); return; }
                    const d = new Date(e.target.value + 'T00:00:00');
                    setOrderReqPoModal(m => ({ ...m, expectedDate: `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` }));
                  }}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ border: `1px solid ${T.hairline}`, color: T.text }} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: T.textMuted }}>Supplier</label>
              <input value={orderReqPoModal.supplierName} onChange={e => setOrderReqPoModal(m => ({ ...m, supplierName: e.target.value, supplierId: '' }))}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ border: `1px solid ${T.hairline}`, color: T.text }} placeholder="Supplier name…" list="req-supp-list" />
              <datalist id="req-supp-list">{suppliers.map(s => <option key={s.code} value={s.name} />)}</datalist>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: T.textMuted }}>Notes</label>
              <textarea value={orderReqPoModal.notes} onChange={e => setOrderReqPoModal(m => ({ ...m, notes: e.target.value }))} rows={2}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                style={{ border: `1px solid ${T.hairline}`, color: T.text }} placeholder="Optional notes…" />
            </div>
            {/* Preview */}
            <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${T.hairline}` }}>
              <div className="px-3 py-2 text-xs font-semibold" style={{ background: T.hairlineSoft, borderBottom: `1px solid ${T.hairline}`, color: T.textMuted }}>
                {selectedReqs.length} group{selectedReqs.length !== 1 ? 's' : ''} · {selectedItemCount} job item{selectedItemCount !== 1 ? 's' : ''} will be linked
              </div>
              <div className="max-h-44 overflow-y-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {selectedReqs.map(req => {
                      const key = groupKey(req);
                      return (
                        <tr key={key} style={{ borderBottom: `1px solid ${T.hairline}` }}>
                          <td className="px-3 py-1.5 font-mono font-semibold" style={{ color: T.accentStrong }}>{req.sku || req.decoration_type}</td>
                          <td className="px-3 py-1.5 truncate max-w-[160px]" style={{ color: T.textMuted }}>{req.description}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-indigo-600">×{req.total_b_ord || req.total_qty}</td>
                          {orderReqTab === 'garment' && <td className="px-3 py-1.5 text-right" style={{ color: T.textMuted }}>{req.unit_cost > 0 ? `$${(req.total_b_ord * req.unit_cost).toFixed(2)}` : ''}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                  {orderReqTab === 'garment' && selectedEstCost > 0 && (
                    <tfoot>
                      <tr style={{ background: T.hairlineSoft }}>
                        <td colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-right" style={{ color: T.textMuted }}>Estimated Total:</td>
                        <td className="px-3 py-1.5 text-right font-bold" style={{ color: T.text }}>${selectedEstCost.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
            {orderReqPoModal.error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{orderReqPoModal.error}</p>}
          </div>
          <div className="px-6 py-4 flex justify-end gap-2" style={{ borderTop: `1px solid ${T.hairline}` }}>
            <button onClick={() => setOrderReqPoModal(m => ({ ...m, open: false }))} className="px-4 py-2 text-xs rounded-lg" style={{ color: T.textMuted, background: T.hairlineSoft }}>Cancel</button>
            <button onClick={submitPO} disabled={orderReqPoModal.saving}
              className="px-5 py-2 text-xs font-semibold rounded-lg disabled:opacity-50 flex items-center gap-1.5"
              style={{ background: T.accentStrong, color: '#fff' }}>
              {orderReqPoModal.saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
              {orderReqPoModal.saving ? 'Creating…' : 'Create PO & Link Jobs'}
            </button>
          </div>
        </DraggableModal>
      )}
    </div>
  );
}
