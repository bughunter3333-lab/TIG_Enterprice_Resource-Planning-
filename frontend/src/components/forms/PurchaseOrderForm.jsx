import { Plus, Save, Search, X } from 'lucide-react';
import { T } from '../../ui/tokens';

export default function PurchaseOrderForm({ closeModal, inventory, poForm, poSkuDropdown, savePO, setPoForm, setPoSkuDropdown, setSupplierDropdown, supplierDropdown, suppliers }) {
  return (
    <>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="po-supplier">Supplier</label>
                  <input id="po-supplier"
                    type="text"
                    value={supplierDropdown.open ? supplierDropdown.query : (poForm.supplier || '')}
                    onChange={(e) => { setSupplierDropdown({ open: true, query: e.target.value, highlighted: 0 }); setPoForm({...poForm, supplier: e.target.value, supplierCode: ''}); }}
                    onFocus={() => setSupplierDropdown({ open: true, query: poForm.supplier || '', highlighted: 0 })}
                    onBlur={() => setTimeout(() => setSupplierDropdown(s => ({ ...s, open: false })), 200)}
                    onKeyDown={(e) => {
                      const q = supplierDropdown.query.toLowerCase();
                      const hits = suppliers.filter(s => !q || s.name.toLowerCase().includes(q) || (s.code || '').toLowerCase().includes(q)).slice(0, 8);
                      if (e.key === 'ArrowDown') { e.preventDefault(); setSupplierDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, hits.length - 1) })); }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setSupplierDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                      if (e.key === 'Enter' && hits[supplierDropdown.highlighted]) {
                        e.preventDefault();
                        const s = hits[supplierDropdown.highlighted];
                        setPoForm({...poForm, supplierCode: s.code, supplier: s.name});
                        setSupplierDropdown({ open: false, query: '', highlighted: 0 });
                      }
                      if (e.key === 'Escape') setSupplierDropdown({ open: false, query: '', highlighted: 0 });
                    }}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{border: `1px solid ${T.hairline}`}}
                    placeholder="Type to search suppliers…"
                    autoComplete="off"
                  />
                  {supplierDropdown.open && (() => {
                    const q = supplierDropdown.query.toLowerCase();
                    const hits = suppliers.filter(s => !q || s.name.toLowerCase().includes(q) || (s.code || '').toLowerCase().includes(q)).slice(0, 8);
                    if (!hits.length) return null;
                    return (
                      <div className="absolute left-0 top-full mt-1 w-full rounded-xl shadow-2xl z-50 overflow-hidden" style={{ fontSize: '13px', minWidth: 300, background: T.panel, border: `1px solid ${T.hairline}` }}>
                        <div className="px-3 py-1.5 text-xs flex items-center gap-1" style={{color: T.textFaint, borderBottom: `1px solid ${T.hairline}`, background: T.hairlineSoft}}>
                          <Search className="w-3 h-3" />{q ? `Matching "${supplierDropdown.query}"` : 'All suppliers'}
                        </div>
                        {hits.map((s, i) => (
                          <div
                            key={s.code}
                            onMouseDown={() => { setPoForm({...poForm, supplierCode: s.code, supplier: s.name}); setSupplierDropdown({ open: false, query: '', highlighted: 0 }); }}
                            onMouseEnter={() => setSupplierDropdown(st => ({ ...st, highlighted: i }))}
                            className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                            style={{borderBottom: `1px solid ${T.hairline}`, background: i === supplierDropdown.highlighted ? T.hairlineSoft : T.panel}}
                          >
                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
                              {s.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate" style={{color: T.text}}>{s.name}</div>
                              {s.code && <div className="text-xs font-mono" style={{color: T.textFaint}}>{s.code}</div>}
                            </div>
                            {s.contactName && <div className="text-xs truncate max-w-[100px]" style={{color: T.textMuted}}>{s.contactName}</div>}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="po-order-date">Order Date</label>
                  <input id="po-order-date" type="date" value={poForm.date} onChange={e => setPoForm({...poForm, date: e.target.value})} className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{border: `1px solid ${T.hairline}`}} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="po-expected-delivery">Expected Delivery</label>
                  <input id="po-expected-delivery" type="date" value={poForm.expectedDate} onChange={e => setPoForm({...poForm, expectedDate: e.target.value})} className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{border: `1px solid ${T.hairline}`}} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="po-notes">Notes</label>
                  <textarea id="po-notes" value={poForm.notes} onChange={e => setPoForm({...poForm, notes: e.target.value})} className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{border: `1px solid ${T.hairline}`}} rows="2" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium" style={{color: T.text}}>Line Items</h3>
                  <button type="button" onClick={() => setPoForm({...poForm, items: [...poForm.items, {sku:'',description:'',quantity:1,unitCost:0,total:0}]})} className="text-sm hover:underline flex items-center" style={{color: T.accentStrong}}>
                    <Plus className="w-3 h-3 mr-1" />Add Item
                  </button>
                </div>
                {poForm.items.length === 0 && <p className="text-sm text-center py-4 rounded" style={{color: T.textFaint, border: `1px solid ${T.hairline}`}}>No items added yet.</p>}
                {poForm.items.map((item, idx) => {
                  const poIsOpen = poSkuDropdown.idx === idx;
                  const poQ = poIsOpen ? poSkuDropdown.query : (item.sku || '');
                  const poScored = inventory.map(inv => {
                    const sku = inv.sku.toLowerCase(); const name = (inv.name||'').toLowerCase(); const term = poQ.toLowerCase();
                    if (!term) return { inv, score: 1 };
                    if (sku === term) return { inv, score: 100 };
                    if (sku.startsWith(term)) return { inv, score: 80 };
                    if (sku.includes(term)) return { inv, score: 60 };
                    if (name.startsWith(term)) return { inv, score: 50 };
                    if (name.includes(term)) return { inv, score: 30 };
                    return { inv, score: 0 };
                  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
                  const selectPoItem = (inv) => {
                    const items = [...poForm.items];
                    items[idx] = { ...items[idx], sku: inv.sku, description: inv.name, unitCost: inv.unitCost || 0, total: (items[idx].quantity || 1) * (inv.unitCost || 0) };
                    setPoForm({ ...poForm, items });
                    setPoSkuDropdown({ idx: -1, query: '', highlighted: 0 });
                  };
                  return (
                  <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-center">
                    <div className="col-span-2 relative">
                      <input type="text" placeholder="SKU" value={poQ}
                        onChange={e => { setPoSkuDropdown({ idx, query: e.target.value, highlighted: 0 }); const items=[...poForm.items]; items[idx]={...items[idx],sku:e.target.value}; setPoForm({...poForm,items}); }}
                        onFocus={() => setPoSkuDropdown({ idx, query: item.sku || '', highlighted: 0 })}
                        onBlur={() => setTimeout(() => setPoSkuDropdown({ idx: -1, query: '', highlighted: 0 }), 200)}
                        onKeyDown={e => {
                          if (!poIsOpen) return;
                          if (e.key === 'ArrowDown') { e.preventDefault(); setPoSkuDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, poScored.length - 1) })); }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setPoSkuDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                          if (e.key === 'Enter' && poScored[poSkuDropdown.highlighted]) { e.preventDefault(); selectPoItem(poScored[poSkuDropdown.highlighted].inv); }
                          if (e.key === 'Escape') setPoSkuDropdown({ idx: -1, query: '', highlighted: 0 });
                        }}
                        className="w-full rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                        style={{border: `1px solid ${T.hairline}`}}
                        autoComplete="off"
                      />
                      {poIsOpen && poScored.length > 0 && (
                        <div className="absolute left-0 top-full mt-1 w-80 rounded-xl shadow-2xl z-50 overflow-hidden" style={{ fontSize: '12px', background: T.panel, border: `1px solid ${T.hairline}` }}>
                          {poScored.map(({ inv }, i) => (
                            <div key={inv.sku} onMouseDown={() => selectPoItem(inv)} onMouseEnter={() => setPoSkuDropdown(s => ({ ...s, highlighted: i }))}
                              className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                              style={{borderBottom: `1px solid ${T.hairline}`, background: i === poSkuDropdown.highlighted ? T.hairlineSoft : T.panel}}>
                              <span className="font-mono font-bold w-20 flex-shrink-0 truncate" style={{color: T.accentStrong}}>{inv.sku}</span>
                              <span className="flex-1 truncate" style={{color: T.textMuted}}>{inv.name}</span>
                              {inv.unitCost > 0 && <span className="flex-shrink-0" style={{color: T.textFaint}}>${inv.unitCost.toFixed(2)}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <input type="text" placeholder="Description" value={item.description} onChange={e => { const items=[...poForm.items]; items[idx]={...items[idx],description:e.target.value}; setPoForm({...poForm,items}); }} className="col-span-4 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" style={{border: `1px solid ${T.hairline}`}} />
                    <input type="number" placeholder="Qty" value={item.quantity} min="1" onChange={e => { const items=[...poForm.items]; const qty=parseInt(e.target.value)||0; items[idx]={...items[idx],quantity:qty,total:qty*items[idx].unitCost}; setPoForm({...poForm,items}); }} className="col-span-2 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" style={{border: `1px solid ${T.hairline}`}} />
                    <input type="number" placeholder="Unit Cost" step="0.01" value={item.unitCost} min="0" onChange={e => { const items=[...poForm.items]; const cost=parseFloat(e.target.value)||0; items[idx]={...items[idx],unitCost:cost,total:items[idx].quantity*cost}; setPoForm({...poForm,items}); }} className="col-span-2 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" style={{border: `1px solid ${T.hairline}`}} />
                    <span className="col-span-1 text-sm text-right font-medium" style={{color: T.text}}>${(item.total||0).toFixed(2)}</span>
                    <button type="button" onClick={() => { const items=poForm.items.filter((_,i)=>i!==idx); setPoForm({...poForm,items}); }} className="col-span-1 flex justify-center" style={{color: T.danger}}><X className="w-4 h-4" /></button>
                  </div>
                  );
                })}
                {poForm.items.length > 0 && (
                  <div className="text-right text-sm font-semibold pt-2" style={{borderTop: `1px solid ${T.hairline}`, color: T.text}}>
                    Total: ${poForm.items.reduce((s,i)=>s+(i.total||0),0).toFixed(2)}
                  </div>
                )}
              </div>
              <div className="flex justify-end space-x-2 pt-4" style={{borderTop: `1px solid ${T.hairline}`}}>
                <button onClick={closeModal} className="px-4 py-2 rounded" style={{border: `1px solid ${T.hairline}`, color: T.textMuted}}>Cancel</button>
                <button onClick={savePO} disabled={!poForm.supplierCode} className="px-4 py-2 text-white rounded disabled:opacity-50 flex items-center" style={{background: T.accentStrong}}>
                  <Save className="w-4 h-4 mr-2" />Create PO
                </button>
              </div>
            </div>
    </>
  );
}
