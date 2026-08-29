import { Save, X } from 'lucide-react';

/**
 * Create / edit a card file — the ship-to addresses a job can be despatched to.
 *
 * Split out of the card-files surface in TotalImageERP.jsx, which already
 * delegated its list to CardFilesModule and kept this dialog behind. The parent
 * still owns whether it is open, because the same dialog is opened both from
 * the list and from the detail panel.
 */
export default function CardFileFormModal({ cardFileForm, cardFileModal, saveCard, setCardFileForm, setCardFileModal }) {
  return (
    <>
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold">{cardFileModal.editing ? `Edit Card File — ${cardFileModal.editing}` : 'New Card File'}</h3>
              <button onClick={() => setCardFileModal({ open: false, editing: null })}><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Codes */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="card-file-ship-code">
                    Ship Code <span className="text-red-500">*</span>
                    <span className="text-xs font-normal text-gray-400 ml-1">(e.g. RESP.SYD)</span>
                  </label>
                  <input id="card-file-ship-code" type="text" value={cardFileForm.shipCode}
                    onChange={e => {
                      const v = e.target.value.toUpperCase();
                      const prefix = v.split('.')[0];
                      setCardFileForm(f => ({
                        ...f,
                        shipCode: v,
                        customerCode: f.customerCode || prefix,
                      }));
                    }}
                    disabled={!!cardFileModal.editing}
                    className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                    placeholder="RESP.SYD" />
                  {cardFileForm.shipCode && (
                    <p className="text-xs text-gray-400 mt-1">Group: <strong>{cardFileForm.shipCode.split('.')[0]}</strong></p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="card-file-customer-code">
                    Customer Code <span className="text-red-500">*</span>
                    <span className="text-xs font-normal text-gray-400 ml-1">(e.g. RESP.HO)</span>
                  </label>
                  <input id="card-file-customer-code" type="text" value={cardFileForm.customerCode}
                    onChange={e => setCardFileForm(f => ({ ...f, customerCode: e.target.value.toUpperCase() }))}
                    className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="RESP.HO" />
                </div>
              </div>

              {/* Company + Contact */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="card-file-company-name">Company Name</label>
                  <input id="card-file-company-name" type="text" value={cardFileForm.companyName}
                    onChange={e => setCardFileForm(f => ({ ...f, companyName: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Respite Care Sydney" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="card-file-contact-name">Contact Name</label>
                  <input id="card-file-contact-name" type="text" value={cardFileForm.contactName}
                    onChange={e => setCardFileForm(f => ({ ...f, contactName: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="card-file-address-line-1">Address Line 1</label>
                <input id="card-file-address-line-1" type="text" value={cardFileForm.address1}
                  onChange={e => setCardFileForm(f => ({ ...f, address1: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="card-file-address-line-2">Address Line 2</label>
                <input id="card-file-address-line-2" type="text" value={cardFileForm.address2}
                  onChange={e => setCardFileForm(f => ({ ...f, address2: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="card-file-suburb-city">Suburb / City</label>
                  <input id="card-file-suburb-city" type="text" value={cardFileForm.suburb}
                    onChange={e => setCardFileForm(f => ({ ...f, suburb: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="card-file-state">State</label>
                  <select id="card-file-state" value={cardFileForm.state}
                    onChange={e => setCardFileForm(f => ({ ...f, state: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">—</option>
                    {['NSW','VIC','QLD','WA','SA','TAS','ACT','NT'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="card-file-postcode">Postcode</label>
                  <input id="card-file-postcode" type="text" value={cardFileForm.postcode}
                    onChange={e => setCardFileForm(f => ({ ...f, postcode: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="2000" />
                </div>
              </div>

              {/* Phone + Email */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="card-file-phone">Phone</label>
                  <input id="card-file-phone" type="text" value={cardFileForm.phone}
                    onChange={e => setCardFileForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="card-file-email">Email</label>
                  <input id="card-file-email" type="email" value={cardFileForm.email}
                    onChange={e => setCardFileForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="card-file-notes">Notes</label>
                <textarea id="card-file-notes" rows={3} value={cardFileForm.notes}
                  onChange={e => setCardFileForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex justify-end space-x-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setCardFileModal({ open: false, editing: null })}
                className="px-4 py-2 border rounded text-sm hover:bg-gray-100">Cancel</button>
              <button onClick={saveCard}
                className="px-4 py-2 bg-blue-700 text-white rounded text-sm hover:bg-blue-800 flex items-center">
                <Save className="w-4 h-4 mr-1" />{cardFileModal.editing ? 'Save Changes' : 'Create Card File'}
              </button>
            </div>
          </div>
        </div>
    </>
  );
}
