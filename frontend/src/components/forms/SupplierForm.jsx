import { Save } from 'lucide-react';
import { T } from '../../ui/tokens';

export default function SupplierForm({ closeModal, editingItem, saveSupplier, setSupplierForm, supplierForm }) {
  return (
    <>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="supplier-code">Supplier Code</label>
                  <input id="supplier-code" type="text" value={supplierForm.code} onChange={e => setSupplierForm({...supplierForm, code: e.target.value})} disabled={!!editingItem} className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" style={{border: `1px solid ${T.hairline}`}} placeholder="e.g. SUP001" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="supplier-name">Supplier Name</label>
                  <input id="supplier-name" type="text" value={supplierForm.name} onChange={e => setSupplierForm({...supplierForm, name: e.target.value})} className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{border: `1px solid ${T.hairline}`}} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="supplier-contact-person">Contact Person</label>
                  <input id="supplier-contact-person" type="text" value={supplierForm.contact} onChange={e => setSupplierForm({...supplierForm, contact: e.target.value})} className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{border: `1px solid ${T.hairline}`}} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="supplier-email">Email</label>
                  <input id="supplier-email" type="email" value={supplierForm.email} onChange={e => setSupplierForm({...supplierForm, email: e.target.value})} className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{border: `1px solid ${T.hairline}`}} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="supplier-phone">Phone</label>
                  <input id="supplier-phone" type="tel" value={supplierForm.phone} onChange={e => setSupplierForm({...supplierForm, phone: e.target.value})} className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{border: `1px solid ${T.hairline}`}} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="supplier-payment-terms">Payment Terms</label>
                  <select id="supplier-payment-terms" value={supplierForm.paymentTerms} onChange={e => setSupplierForm({...supplierForm, paymentTerms: e.target.value})} className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{border: `1px solid ${T.hairline}`}}>
                    {['Net 7','Net 14','Net 30','Net 45','Net 60','COD'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="supplier-currency">Currency</label>
                  <select id="supplier-currency" value={supplierForm.currency} onChange={e => setSupplierForm({...supplierForm, currency: e.target.value})} className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{border: `1px solid ${T.hairline}`}}>
                    {['AUD','USD','EUR','GBP','CNY'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="supplier-status">Status</label>
                  <select id="supplier-status" value={supplierForm.status} onChange={e => setSupplierForm({...supplierForm, status: e.target.value})} className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{border: `1px solid ${T.hairline}`}}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="supplier-address">Address</label>
                  <textarea id="supplier-address" value={supplierForm.address} onChange={e => setSupplierForm({...supplierForm, address: e.target.value})} className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{border: `1px solid ${T.hairline}`}} rows="2" />
                </div>
              </div>
              <div className="flex justify-end space-x-2 pt-4" style={{borderTop: `1px solid ${T.hairline}`}}>
                <button onClick={closeModal} className="px-4 py-2 rounded" style={{border: `1px solid ${T.hairline}`, color: T.textMuted}}>Cancel</button>
                <button onClick={saveSupplier} className="px-4 py-2 text-white rounded flex items-center" style={{background: T.accentStrong}}>
                  <Save className="w-4 h-4 mr-2" />Save Supplier
                </button>
              </div>
            </div>
    </>
  );
}
