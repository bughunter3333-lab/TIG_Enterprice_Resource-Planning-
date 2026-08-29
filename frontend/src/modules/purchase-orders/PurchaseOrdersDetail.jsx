import { CheckSquare, X } from 'lucide-react';
import POGoodsReceiptsPanel from '../../modules/purchase-orders/POGoodsReceiptsPanel';
import POModule from '../../modules/purchase-orders/POModule';

export default function PurchaseOrdersDetail({ exportToCSV, openModal, poStatusFilter, purchaseOrders, receivePO, receiveQtys, searchTerm, selectedPO, setPoStatusFilter, setReceiveQtys, setSearchTerm, setSelectedPO, updatePOStatus }) {
  const statusMeta = {
    Draft:     { cls:'bg-gray-100 text-gray-700',     dot:'bg-gray-400'     },
    Sent:      { cls:'bg-blue-100 text-blue-800',     dot:'bg-blue-600'     },
    Partial:   { cls:'bg-blue-100 text-blue-800',   dot:'bg-blue-500'    },
    Received:  { cls:'bg-emerald-100 text-emerald-700', dot:'bg-emerald-500' },
    Cancelled: { cls:'bg-red-100 text-red-600',       dot:'bg-red-400'      },
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
            <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-indigo-700">{selectedPO.id}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusMeta[selectedPO.status]?.cls}`}>{selectedPO.status}</span>
                  {isOverdue(selectedPO) && <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">OVERDUE</span>}
                </div>
                <p className="text-sm text-gray-600 mt-0.5">{selectedPO.supplier}</p>
                <p className="text-xs text-gray-400 mt-0.5">Ordered: {selectedPO.date||'—'} · Expected: {selectedPO.expectedDate||'—'}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select value={selectedPO.status} onChange={e=>{ updatePOStatus(selectedPO.id,e.target.value); setSelectedPO(p=>({...p,status:e.target.value})); }}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  {['Draft','Sent','Partial','Received','Cancelled'].map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={()=>setSelectedPO(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-400"/></button>
              </div>
            </div>

            {/* Line items with receive inputs */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">SKU</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Description</th>
                    <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Ordered</th>
                    <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Received</th>
                    <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Receive Now</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(selectedPO.items||[]).map(item => {
                    const pct = item.qtyOrdered>0 ? Math.min(100,Math.round((item.qtyReceived/item.qtyOrdered)*100)) : 0;
                    const remaining = item.qtyOrdered - item.qtyReceived;
                    const key = `${selectedPO.id}-${item.id}`;
                    const isDone = item.qtyReceived >= item.qtyOrdered;
                    return (
                      <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${isDone?'opacity-60':''}`}>
                        <td className="px-4 py-3"><span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{item.sku||'—'}</span></td>
                        <td className="px-4 py-3 text-sm text-gray-700 max-w-[140px] truncate">{item.description||'—'}</td>
                        <td className="px-3 py-3 text-center font-semibold text-sm">{item.qtyOrdered}</td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`font-semibold text-sm ${isDone?'text-emerald-600':item.qtyReceived>0?'text-blue-700':'text-gray-400'}`}>{item.qtyReceived}</span>
                            <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${isDone?'bg-emerald-400':item.qtyReceived>0?'bg-blue-500':'bg-gray-200'}`} style={{width:`${pct}%`}}/>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {!isDone ? (
                            <input type="number" min="0" max={remaining}
                              value={receiveQtys[key]||''}
                              onChange={e=>setReceiveQtys(prev=>({...prev,[key]:e.target.value}))}
                              placeholder={`0–${remaining}`}
                              className="w-20 text-center border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                          ) : <span className="text-emerald-500 text-xs font-bold">✓ Complete</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">${(item.total||0).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer: total + receive button */}
            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <p className="text-xs text-gray-500">PO Total</p>
                <p className="text-xl font-bold text-gray-800">${(selectedPO.total||0).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2})}</p>
              </div>
              {!['Received','Cancelled'].includes(selectedPO.status) && (
                <button onClick={()=>receivePO(selectedPO)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition-colors shadow-sm">
                  <CheckSquare className="w-4 h-4"/>Confirm Receipt
                </button>
              )}
            </div>
            {selectedPO.notes && (
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                <p className="text-xs text-gray-500 font-semibold uppercase mb-1">Notes</p>
                <p className="text-sm text-gray-700">{selectedPO.notes}</p>
              </div>
            )}
            <POGoodsReceiptsPanel po={selectedPO} />
          </div>
        )}
    </>
  );
}
