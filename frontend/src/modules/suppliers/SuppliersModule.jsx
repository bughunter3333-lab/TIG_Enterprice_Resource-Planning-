import { useState } from 'react';
import { CheckSquare, DollarSign, Download, Edit, Package, Plus, Search, Trash2, Truck } from 'lucide-react';
import SupplierPriceListPanel from '../../modules/suppliers/SupplierPriceListPanel';
import { T } from '../../ui/tokens';

export default function SuppliersModule({ deleteSupplier, exportToCSV, inventory, openModal, purchaseOrders, searchTerm, setActiveModule, setSearchTerm, suppliers }) {
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [suppTab, setSuppTab] = useState('details');

  const filtered = suppliers.filter(s => {
    const q = searchTerm.toLowerCase();
    return !q || (s.name||'').toLowerCase().includes(q) || (s.code||'').toLowerCase().includes(q) || (s.contact||'').toLowerCase().includes(q) || (s.email||'').toLowerCase().includes(q);
  });
  const suppPOs = (s) => purchaseOrders.filter(p => p.supplierCode === s.code || p.supplier === s.name);
  const suppItems = (s) => inventory.filter(i => (i.supplier||'').toLowerCase() === (s.name||'').toLowerCase());
  const suppSpend = (s) => suppPOs(s).reduce((t,p) => t + (p.total||0), 0);
  const suppActive = suppliers.filter(s => s.status === 'Active').length;
  const totalSpend = purchaseOrders.reduce((t,p) => t + (p.total||0), 0);
  const sel = selectedSupplier;
  return (
    <div className="space-y-4">
      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Suppliers', value: suppliers.length, sub: `${suppActive} active`, icon: Truck, color: 'text-accent-strong', bg: 'bg-accent-tint' },
          { label: 'Active', value: suppActive, sub: `${suppliers.length - suppActive} inactive`, icon: CheckSquare, color: 'text-ok', bg: 'bg-ok-tint' },
          { label: 'Total PO Spend', value: `$${totalSpend.toLocaleString('en-AU',{maximumFractionDigits:0})}`, sub: 'All purchase orders', icon: DollarSign, color: 'text-accent-strong', bg: 'bg-accent-tint' },
          { label: 'Linked SKUs', value: inventory.filter(i=>i.supplier).length, sub: 'Items with supplier', icon: Package, color: 'text-accent-strong', bg: 'bg-accent-tint' },
        ].map(k => (
          <div key={k.label} className="rounded-lg p-4 flex items-start gap-3" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
            <div className={`w-9 h-9 rounded-lg ${k.bg} flex items-center justify-center shrink-0`}>
              <k.icon style={{width:18,height:18}} className={k.color} />
            </div>
            <div>
              <p className="text-xs" style={{ color: T.textMuted }}>{k.label}</p>
              <p className={`text-xl font-bold mt-0.5 ${k.color}`}>{k.value}</p>
              <p className="text-[11px] mt-0.5" style={{ color: T.textFaint }}>{k.sub}</p>
            </div>
          </div>
        ))}
      </div>
      {/* Toolbar */}
      <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute left-3 top-2.5" style={{ color: T.textFaint }} />
          <input type="text" placeholder="Search by name, code, contact…"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-focus"
            style={{ border: `1px solid ${T.hairline}`, color: T.text }}
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)} autoComplete="off" />
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => exportToCSV(suppliers,'suppliers')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium" style={{ border: `1px solid ${T.hairline}`, color: T.text }}><Download className="w-3.5 h-3.5"/>Export</button>
          <button onClick={() => openModal('supplier')} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium" style={{ background: T.accentStrong, color: '#fff' }}><Plus className="w-3.5 h-3.5"/>Add Supplier</button>
        </div>
      </div>
      {/* Split layout */}
      <div className="grid grid-cols-5 gap-4">
        {/* List */}
        <div className="col-span-2 rounded-xl overflow-hidden" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${T.hairline}` }}>
            <span className="text-xs font-medium" style={{ color: T.textMuted }}>{filtered.length} supplier{filtered.length!==1?'s':''}</span>
          </div>
          <div className="max-h-[580px] overflow-y-auto" style={{ borderTop: 'none' }}>
            {filtered.length===0 && <div className="py-12 text-center" style={{ color: T.textFaint }}><Truck className="w-8 h-8 mx-auto mb-2 opacity-30"/><p className="text-sm">No suppliers found</p></div>}
            {filtered.map(sup => {
              const spend = suppSpend(sup);
              const poCount = suppPOs(sup).length;
              const isSel = sel?.code === sup.code;
              return (
                <div key={sup.code} onClick={() => { setSelectedSupplier(sup); setSuppTab('details'); }}
                  className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors border-l-4"
                  style={{ background: isSel ? T.hairlineSoft : T.panel, borderLeftColor: isSel ? T.accentStrong : 'transparent', borderBottom: `1px solid ${T.hairline}` }}>
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-accent-strong text-white font-black text-sm flex items-center justify-center shrink-0">
                    {(sup.name||'?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate" style={{ color: T.text }}>{sup.name}</p>
                      <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${sup.status==='Active'?'bg-ok-tint text-ok':'bg-hairline-soft text-muted'}`}>{sup.status}</span>
                    </div>
                    <p className="text-[11px] font-mono mt-0.5" style={{ color: T.textFaint }}>{sup.code}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[11px]" style={{ color: T.textMuted }}>{poCount} PO{poCount!==1?'s':''}</span>
                      {spend>0 && <span className="text-[11px] font-semibold text-accent-strong">${spend.toLocaleString('en-AU',{maximumFractionDigits:0})}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Detail */}
        <div className="col-span-3">
          {!sel ? (
            <div className="rounded-xl h-full flex flex-col items-center justify-center py-20" style={{ background: T.panel, border: `1px solid ${T.hairline}`, color: T.textFaint }}>
              <Truck className="w-12 h-12 mb-3 opacity-20"/>
              <p className="font-medium">Select a supplier to view details</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
              <div className="px-6 py-4 flex items-start gap-4" style={{ borderBottom: `1px solid ${T.hairline}` }}>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-accent-strong text-white font-black text-lg flex items-center justify-center shrink-0">
                  {(sel.name||'?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold leading-tight" style={{ color: T.text }}>{sel.name}</h2>
                  <p className="text-xs font-mono mt-0.5" style={{ color: T.textFaint }}>{sel.code} · {sel.currency||'AUD'}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => { setActiveModule('purchase-orders'); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-tint text-accent-strong text-xs font-semibold hover:bg-accent-tint border border-accent">
                    <Plus className="w-3 h-3"/>New PO
                  </button>
                  <button onClick={() => openModal('supplier',sel)} className="p-1.5 rounded-lg" style={{ color: T.accentStrong }}><Edit className="w-4 h-4"/></button>
                  <button onClick={() => deleteSupplier(sel.code)} className="p-1.5 rounded-lg"><Trash2 className="w-4 h-4 text-danger"/></button>
                </div>
              </div>
              <div className="grid grid-cols-3" style={{ borderBottom: `1px solid ${T.hairline}` }}>
                {[
                  {label:'Total Spend', value:`$${suppSpend(sel).toLocaleString('en-AU',{maximumFractionDigits:0})}`},
                  {label:'Purchase Orders', value:suppPOs(sel).length},
                  {label:'Stocked Items', value:suppItems(sel).length},
                ].map((k, idx) => (
                  <div key={k.label} className="px-5 py-3 text-center" style={idx > 0 ? { borderLeft: `1px solid ${T.hairline}` } : {}}>
                    <p className="text-lg font-bold" style={{ color: T.text }}>{k.value}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: T.textFaint }}>{k.label}</p>
                  </div>
                ))}
              </div>
              <div className="flex px-4" style={{ borderBottom: `1px solid ${T.hairline}` }}>
                {[['details','Details'],['pos','Purchase Orders'],['items','Stock Items'],['pricelist','Price List']].map(([id,label]) => (
                  <button key={id} onClick={() => setSuppTab(id)}
                    className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors"
                    style={{ borderBottomColor: suppTab===id ? T.accentStrong : 'transparent', color: suppTab===id ? T.accentStrong : T.textMuted }}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="p-5">
                {suppTab==='details' && (
                  <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                    {[['Contact',sel.contact||'—'],['Email',sel.email||'—'],['Phone',sel.phone||'—'],['Payment Terms',sel.paymentTerms||'—'],['Currency',sel.currency||'AUD'],['Status',sel.status||'Active']].map(([label,val]) => (
                      <div key={label}>
                        <p className="text-[11px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: T.textFaint }}>{label}</p>
                        <p className="font-medium" style={{ color: T.text }}>{val}</p>
                      </div>
                    ))}
                    {sel.address && <div className="col-span-2"><p className="text-[11px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: T.textFaint }}>Address</p><p className="whitespace-pre-line" style={{ color: T.text }}>{sel.address}</p></div>}
                  </div>
                )}
                {suppTab==='pos' && (
                  <div className="space-y-2">
                    {suppPOs(sel).length===0 ? <p className="text-sm text-center py-8" style={{ color: T.textFaint }}>No purchase orders for this supplier</p>
                    : suppPOs(sel).map(po => {
                      const cls = {Draft:'bg-hairline-soft text-muted',Sent:'bg-warn-tint text-warn',Partial:'bg-warn-tint text-warn',Received:'bg-ok-tint text-ok',Cancelled:'bg-danger-tint text-danger'}[po.status]||'bg-hairline-soft text-muted';
                      return (
                        <div key={po.id} className="flex items-center gap-3 p-3 rounded-lg transition-colors" style={{ border: `1px solid ${T.hairline}` }}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold" style={{ color: T.accentStrong }}>{po.id}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cls}`}>{po.status}</span>
                            </div>
                            <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>{po.date} · {(po.items||[]).length} line{(po.items||[]).length!==1?'s':''}</p>
                          </div>
                          <span className="font-semibold text-sm" style={{ color: T.text }}>${(po.total||0).toLocaleString('en-AU',{maximumFractionDigits:0})}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {suppTab==='items' && (
                  <div className="space-y-2">
                    {suppItems(sel).length===0 ? <p className="text-sm text-center py-8" style={{ color: T.textFaint }}>No inventory items linked to this supplier</p>
                    : suppItems(sel).map(item => (
                      <div key={item.sku} className="flex items-center gap-3 p-3 rounded-lg" style={{ border: `1px solid ${T.hairline}` }}>
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded w-24 shrink-0" style={{ color: T.accentStrong, background: T.hairlineSoft }}>{item.sku}</span>
                        <span className="flex-1 text-sm truncate" style={{ color: T.text }}>{item.name}</span>
                        <span className={`text-xs font-semibold ${item.stock<=0?'text-danger':item.stock<item.reorderLevel?'text-warn':'text-ok'}`}>{item.stock} on hand</span>
                      </div>
                    ))}
                  </div>
                )}
                {suppTab==='pricelist' && <SupplierPriceListPanel supplierId={sel.code} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
