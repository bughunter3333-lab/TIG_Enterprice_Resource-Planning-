import { Save } from 'lucide-react';
import { T } from '../../ui/tokens';

export default function InventoryForm({ categoryDropdown, closeModal, editingItem, inventory, inventoryForm, locationDropdown, saveInventoryItem, setCategoryDropdown, setInventoryForm, setLocationDropdown, suppliers }) {
  return (
    <>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="inventory-sku">SKU</label>
                  <input id="inventory-sku"
                    type="text"
                    value={inventoryForm.sku}
                    onChange={(e) => setInventoryForm({...inventoryForm, sku: e.target.value})}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                    disabled={editingItem !== null}
                    required
                  />
                </div>

                <div className="relative">
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="inventory-category">Category</label>
                  <input id="inventory-category"
                    type="text"
                    value={categoryDropdown.open ? categoryDropdown.query : inventoryForm.category}
                    onChange={(e) => { setCategoryDropdown({ open: true, query: e.target.value, highlighted: 0 }); setInventoryForm({...inventoryForm, category: e.target.value}); }}
                    onFocus={() => setCategoryDropdown({ open: true, query: inventoryForm.category, highlighted: 0 })}
                    onBlur={() => setTimeout(() => setCategoryDropdown(s => ({ ...s, open: false })), 200)}
                    onKeyDown={(e) => {
                      const q = (categoryDropdown.query || '').toLowerCase();
                      const cats = [...new Set(inventory.map(i => i.category).filter(Boolean))];
                      const hits = cats.filter(c => !q || c.toLowerCase().includes(q)).slice(0, 8);
                      if (e.key === 'ArrowDown') { e.preventDefault(); setCategoryDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, hits.length - 1) })); }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setCategoryDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                      if (e.key === 'Enter' && hits[categoryDropdown.highlighted]) { e.preventDefault(); setInventoryForm({...inventoryForm, category: hits[categoryDropdown.highlighted]}); setCategoryDropdown({ open: false, query: '', highlighted: 0 }); }
                      if (e.key === 'Escape') setCategoryDropdown({ open: false, query: '', highlighted: 0 });
                    }}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                    placeholder="e.g. Apparel, Accessories…"
                    autoComplete="off"
                  />
                  {categoryDropdown.open && (() => {
                    const q = (categoryDropdown.query || '').toLowerCase();
                    const cats = [...new Set(inventory.map(i => i.category).filter(Boolean))];
                    const hits = cats.filter(c => !q || c.toLowerCase().includes(q)).slice(0, 8);
                    if (!hits.length) return null;
                    return (
                      <div className="absolute left-0 top-full mt-1 w-full rounded-xl shadow-2xl z-50 overflow-hidden" style={{ fontSize: '13px', background: T.panel, border: `1px solid ${T.hairline}` }}>
                        <div className="px-3 py-1.5 text-xs border-b" style={{color: T.textFaint, background: T.hairlineSoft, borderColor: T.hairline}}>Existing categories</div>
                        {hits.map((cat, i) => {
                          const count = inventory.filter(inv => inv.category === cat).length;
                          return (
                            <div key={cat}
                              onMouseDown={() => { setInventoryForm({...inventoryForm, category: cat}); setCategoryDropdown({ open: false, query: '', highlighted: 0 }); }}
                              onMouseEnter={() => setCategoryDropdown(s => ({ ...s, highlighted: i }))}
                              className={`flex items-center justify-between px-3 py-2.5 cursor-pointer border-b last:border-0 ${i === categoryDropdown.highlighted ? 'bg-accent-tint' : 'hover:bg-panel-alt'}`}>
                              <span className="font-medium" style={{color: T.text}}>{cat}</span>
                              <span className="text-xs" style={{color: T.textFaint}}>{count} item{count !== 1 ? 's' : ''}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="inventory-item-name">Item Name</label>
                  <input id="inventory-item-name"
                    type="text"
                    value={inventoryForm.name}
                    onChange={(e) => setInventoryForm({...inventoryForm, name: e.target.value})}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="inventory-stock-quantity">Stock Quantity</label>
                  <input id="inventory-stock-quantity"
                    type="number"
                    value={inventoryForm.stock}
                    onChange={(e) => setInventoryForm({...inventoryForm, stock: parseInt(e.target.value) || 0})}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="inventory-reorder-level">Reorder Level</label>
                  <input id="inventory-reorder-level"
                    type="number"
                    value={inventoryForm.reorderLevel}
                    onChange={(e) => setInventoryForm({...inventoryForm, reorderLevel: parseInt(e.target.value) || 0})}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                    min="0"
                  />
                </div>

                <div className="relative">
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="inventory-location">Location</label>
                  <input id="inventory-location"
                    type="text"
                    value={locationDropdown.open ? locationDropdown.query : inventoryForm.location}
                    onChange={(e) => { setLocationDropdown({ open: true, query: e.target.value, highlighted: 0 }); setInventoryForm({...inventoryForm, location: e.target.value}); }}
                    onFocus={() => setLocationDropdown({ open: true, query: inventoryForm.location, highlighted: 0 })}
                    onBlur={() => setTimeout(() => setLocationDropdown(s => ({ ...s, open: false })), 200)}
                    onKeyDown={(e) => {
                      const q = (locationDropdown.query || '').toLowerCase();
                      const locs = [...new Set(inventory.map(i => i.location).filter(Boolean))].sort();
                      const hits = locs.filter(l => !q || l.toLowerCase().includes(q)).slice(0, 8);
                      if (e.key === 'ArrowDown') { e.preventDefault(); setLocationDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, hits.length - 1) })); }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setLocationDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                      if (e.key === 'Enter' && hits[locationDropdown.highlighted]) { e.preventDefault(); setInventoryForm({...inventoryForm, location: hits[locationDropdown.highlighted]}); setLocationDropdown({ open: false, query: '', highlighted: 0 }); }
                      if (e.key === 'Escape') setLocationDropdown({ open: false, query: '', highlighted: 0 });
                    }}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                    placeholder="e.g., A-15-3"
                    autoComplete="off"
                  />
                  {locationDropdown.open && (() => {
                    const q = (locationDropdown.query || '').toLowerCase();
                    const locs = [...new Set(inventory.map(i => i.location).filter(Boolean))].sort();
                    const hits = locs.filter(l => !q || l.toLowerCase().includes(q)).slice(0, 8);
                    if (!hits.length) return null;
                    return (
                      <div className="absolute left-0 top-full mt-1 w-full rounded-xl shadow-2xl z-50 overflow-hidden" style={{ fontSize: '13px', background: T.panel, border: `1px solid ${T.hairline}` }}>
                        <div className="px-3 py-1.5 text-xs border-b" style={{color: T.textFaint, background: T.hairlineSoft, borderColor: T.hairline}}>Existing bin locations</div>
                        {hits.map((loc, i) => {
                          const occupant = inventory.find(inv => inv.location === loc);
                          return (
                            <div key={loc}
                              onMouseDown={() => { setInventoryForm({...inventoryForm, location: loc}); setLocationDropdown({ open: false, query: '', highlighted: 0 }); }}
                              onMouseEnter={() => setLocationDropdown(s => ({ ...s, highlighted: i }))}
                              className={`flex items-center justify-between px-3 py-2.5 cursor-pointer border-b last:border-0 ${i === locationDropdown.highlighted ? 'bg-accent-tint' : 'hover:bg-panel-alt'}`}>
                              <span className="font-mono font-bold" style={{color: T.text}}>{loc}</span>
                              {occupant && <span className="text-xs truncate max-w-[140px]" style={{color: T.textFaint}}>{occupant.name}</span>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="inventory-supplier">Supplier</label>
                  <select id="inventory-supplier"
                    value={inventoryForm.supplierCode}
                    onChange={(e) => {
                      const selectedSupplier = suppliers.find(s => s.code === e.target.value);
                      setInventoryForm({
                        ...inventoryForm,
                        supplierCode: e.target.value,
                        supplier: selectedSupplier?.name || ''
                      });
                    }}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map(s => (
                      <option key={s.code} value={s.code}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="inventory-unit-cost">Unit Cost ($)</label>
                  <input id="inventory-unit-cost"
                    type="number"
                    step="0.01"
                    value={inventoryForm.unitCost}
                    onChange={(e) => setInventoryForm({...inventoryForm, unitCost: parseFloat(e.target.value) || 0})}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="inventory-unit-price">Unit Price ($)</label>
                  <input id="inventory-unit-price"
                    type="number"
                    step="0.01"
                    value={inventoryForm.unitPrice}
                    onChange={(e) => setInventoryForm({...inventoryForm, unitPrice: parseFloat(e.target.value) || 0})}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="inventory-minimum-order-qty">Minimum Order Qty</label>
                  <input id="inventory-minimum-order-qty"
                    type="number"
                    value={inventoryForm.minOrder}
                    onChange={(e) => setInventoryForm({...inventoryForm, minOrder: parseInt(e.target.value) || 1})}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                    min="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="inventory-lead-time-days">Lead Time (days)</label>
                  <input id="inventory-lead-time-days"
                    type="number"
                    value={inventoryForm.leadTime}
                    onChange={(e) => setInventoryForm({...inventoryForm, leadTime: parseInt(e.target.value) || 7})}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                    min="1"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4" style={{borderTop: `1px solid ${T.hairline}`}}>
                <button
                  onClick={closeModal}
                  className="px-4 py-2 rounded hover:bg-panel-alt"
                  style={{border: `1px solid ${T.hairline}`, color: T.textMuted}}
                >
                  Cancel
                </button>
                <button
                  onClick={saveInventoryItem}
                  className="px-4 py-2 text-white rounded flex items-center"
                  style={{background: T.accentStrong}}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Item
                </button>
              </div>
            </div>
    </>
  );
}
