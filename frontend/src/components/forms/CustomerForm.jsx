import { Save } from 'lucide-react';
import { T } from '../../ui/tokens';

export default function CustomerForm({ closeModal, customerForm, saveCustomer, setCustomerForm }) {
  return (
    <>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="customer-name">Customer Name</label>
                  <input id="customer-name"
                    type="text"
                    value={customerForm.name}
                    onChange={(e) => setCustomerForm({...customerForm, name: e.target.value})}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="customer-account-type">Account Type</label>
                  <select id="customer-account-type"
                    value={customerForm.accountType || 'Account'}
                    onChange={(e) => setCustomerForm({...customerForm, accountType: e.target.value})}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                  >
                    <option value="Account">Account</option>
                    <option value="Cash">Cash</option>
                    <option value="Prepaid">Prepaid</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="customer-contact-person">Contact Person</label>
                  <input id="customer-contact-person"
                    type="text"
                    value={customerForm.contact}
                    onChange={(e) => setCustomerForm({...customerForm, contact: e.target.value})}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="customer-email">Email</label>
                  <input id="customer-email"
                    type="email"
                    value={customerForm.email}
                    onChange={(e) => setCustomerForm({...customerForm, email: e.target.value})}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="customer-phone">Phone</label>
                  <input id="customer-phone"
                    type="tel"
                    value={customerForm.phone}
                    onChange={(e) => setCustomerForm({...customerForm, phone: e.target.value})}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="customer-mobile">Mobile</label>
                  <input id="customer-mobile"
                    type="tel"
                    value={customerForm.mobile}
                    onChange={(e) => setCustomerForm({...customerForm, mobile: e.target.value})}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="customer-address">Address</label>
                  <textarea id="customer-address"
                    value={customerForm.address}
                    onChange={(e) => setCustomerForm({...customerForm, address: e.target.value})}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                    rows="2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="customer-abn">ABN</label>
                  <input id="customer-abn"
                    type="text"
                    value={customerForm.abn}
                    onChange={(e) => setCustomerForm({...customerForm, abn: e.target.value})}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="customer-payment-terms">Payment Terms</label>
                  <select id="customer-payment-terms"
                    value={customerForm.paymentTerms}
                    onChange={(e) => setCustomerForm({...customerForm, paymentTerms: e.target.value})}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                  >
                    <option value="Net 7">Net 7</option>
                    <option value="Net 14">Net 14</option>
                    <option value="Net 30">Net 30</option>
                    <option value="Net 45">Net 45</option>
                    <option value="COD">COD</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="customer-credit-limit">Credit Limit ($)</label>
                  <input id="customer-credit-limit"
                    type="number"
                    step="1000"
                    value={customerForm.creditLimit}
                    onChange={(e) => setCustomerForm({...customerForm, creditLimit: parseFloat(e.target.value) || 0})}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: T.textMuted}} htmlFor="customer-account-manager">Account Manager</label>
                  <input id="customer-account-manager"
                    type="text"
                    value={customerForm.accountManager}
                    onChange={(e) => setCustomerForm({...customerForm, accountManager: e.target.value})}
                    className="w-full rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-focus"
                    style={{border: `1px solid ${T.hairline}`}}
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
                  onClick={saveCustomer}
                  className="px-4 py-2 text-white rounded flex items-center"
                  style={{background: T.accentStrong}}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Customer
                </button>
              </div>
            </div>
    </>
  );
}
