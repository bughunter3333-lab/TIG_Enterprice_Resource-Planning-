import { CheckSquare, X } from 'lucide-react';
import POGoodsReceiptsPanel from '../../modules/purchase-orders/POGoodsReceiptsPanel';
import POModule from '../../modules/purchase-orders/POModule';

export default function PurchaseOrdersDetail({ exportToCSV, openModal, poStatusFilter, purchaseOrders, receivePO, receiveQtys, searchTerm, selectedPO, setPoStatusFilter, setReceiveQtys, setSearchTerm, setSelectedPO, updatePOStatus }) {
  const statusMeta = {
    Draft:     { cls:'bg-hairline-soft text-header',     dot:'bg-faint'     },
    Sent:      { cls:'bg-accent-tint text-accent-strong',     dot:'bg-accent-strong'     },
    Partial:   { cls:'bg-accent-tint text-accent-strong',   dot:'bg-accent-strong'    },
    Received:  { cls:'bg-ok-tint text-ok', dot:'bg-ok' },
    Cancelled: { cls:'bg-danger-tint text-danger',       dot:'bg-danger'      },
  };
  const today = new Date();
  const isOverdue = (po) => {
    if (['Received','Cancelled'].includes(po.status)) return false;
    if (!po.expectedDate) return false;
    const parts = (po.expectedDate||'').split('/');
    const d = parts.length===3 ? new Date(`${parts[2]}-${parts[1]}-${parts[0]}`) : new Date(po.expectedDate);
    return d < today;
  };

  return (
    <>
      <POModule
        purchaseOrders={purchaseOrders}
        filters={{ search: searchTerm, status: poStatusFilter }}
        onFilterChange={(key, value) => { if (key === 'search') setSearchTerm(value); else setPoStatusFilter(value); }}
        selectedId={selectedPO?.id ?? null}
        onSelectPO={(po) => setSelectedPO(cur => (cur?.id === po.id ? null : po))}
        onNewPO={() => openModal('po')}
        onExport={() => exportToCSV(purchaseOrders, 'purchase-orders')}
      />

      {/* PO Detail + Receive Panel */}
      {selectedPO && (
          <div className="col-span-3 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-5 py-4 border-b border-hairline-soft flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-accent-strong">{selectedPO.id}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusMeta[selectedPO.status]?.cls}`}>{selectedPO.status}</span>
                  {isOverdue(selectedPO) && <span className="text-[10px] font-bold text-danger bg-danger-tint px-1.5 py-0.5 rounded">OVERDUE</span>}
                </div>
                <p className="text-sm text-muted mt-0.5">{selectedPO.supplier}</p>
                <p className="text-xs text-faint mt-0.5">Ordered: {selectedPO.date||'—'} · Expected: {selectedPO.expectedDate||'—'}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select value={selectedPO.status} onChange={e=>{ updatePOStatus(selectedPO.id,e.target.value); setSelectedPO(p=>({...p,status:e.target.value})); }}
                  className="text-xs border border-hairline rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-focus bg-white">
                  {['Draft','Sent','Partial','Received','Cancelled'].map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={()=>setSelectedPO(null)} className="p-1.5 hover:bg-hairline-soft rounded-lg"><X className="w-4 h-4 text-faint"/></button>
              </div>
            </div>

            {/* Line items with receive inputs */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-panel-alt border-b border-hairline-soft sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted uppercase">SKU</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted uppercase">Description</th>
                    <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Ordered</th>
                    <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Received</th>
                    <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Receive Now</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-muted uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline-soft">
                  {(selectedPO.items||[]).map(item => {
                    const pct = item.qtyOrdered>0 ? Math.min(100,Math.round((item.qtyReceived/item.qtyOrdered)*100)) : 0;
                    const remaining = item.qtyOrdered - item.qtyReceived;
                    const key = `${selectedPO.id}-${item.id}`;
                    const isDone = item.qtyReceived >= item.qtyOrdered;
                    return (
                      <tr key={item.id} className={`hover:bg-panel-alt transition-colors ${isDone?'opacity-60':''}`}>
                        <td className="px-4 py-3"><span className="font-mono text-xs font-bold text-accent-strong bg-accent-tint px-2 py-0.5 rounded">{item.sku||'—'}</span></td>
                        <td className="px-4 py-3 text-sm text-header max-w-[140px] truncate">{item.description||'—'}</td>
                        <td className="px-3 py-3 text-center font-semibold text-sm">{item.qtyOrdered}</td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`font-semibold text-sm ${isDone?'text-ok':item.qtyReceived>0?'text-accent-strong':'text-faint'}`}>{item.qtyReceived}</span>
                            <div className="w-16 h-1 bg-hairline-soft rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${isDone?'bg-ok':item.qtyReceived>0?'bg-accent-strong':'bg-hairline'}`} style={{width:`${pct}%`}}/>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {!isDone ? (
                            <input type="number" min="0" max={remaining}
                              value={receiveQtys[key]||''}
                              onChange={e=>setReceiveQtys(prev=>({...prev,[key]:e.target.value}))}
                              placeholder={`0–${remaining}`}
                              className="w-20 text-center border border-hairline rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent-focus"/>
                          ) : <span className="text-ok text-xs font-bold">✓ Complete</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">${(item.total||0).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer: total + receive button */}
            <div className="px-5 py-4 border-t border-hairline-soft flex items-center justify-between bg-panel-alt">
              <div>
                <p className="text-xs text-muted">PO Total</p>
                <p className="text-xl font-bold text-fg">${(selectedPO.total||0).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2})}</p>
              </div>
              {!['Received','Cancelled'].includes(selectedPO.status) && (
                <button onClick={()=>receivePO(selectedPO)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-ok text-white font-semibold text-sm hover:bg-ok transition-colors shadow-sm">
                  <CheckSquare className="w-4 h-4"/>Confirm Receipt
                </button>
              )}
            </div>
            {selectedPO.notes && (
              <div className="px-5 py-3 border-t border-hairline-soft bg-panel-alt">
                <p className="text-xs text-muted font-semibold uppercase mb-1">Notes</p>
                <p className="text-sm text-header">{selectedPO.notes}</p>
              </div>
            )}
            <POGoodsReceiptsPanel po={selectedPO} />
          </div>
        )}
    </>
  );
}
