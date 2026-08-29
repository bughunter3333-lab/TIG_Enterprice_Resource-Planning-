import { Printer, X } from 'lucide-react';
import DraggableModal from '../../ui/DraggableModal';

export default function DocumentPrint({ documentPrint, inventory, setDocumentPrint }) {
  if (!documentPrint) return null;
  const { type, job: j } = documentPrint;
  const titles = { pickingSlip: 'PICKING SLIP', deliveryNote: 'DELIVERY NOTE', jobSheet: 'JOB SHEET', shipLabel: 'SHIP LABEL' };

  if (type === 'shipLabel') {
    const totalQty = (j.items || []).reduce((s, it) => s + (it.order || it.qty || 0), 0);
    const itemCount = (j.items || []).length;
    return (
      <DraggableModal onClose={() => setDocumentPrint(null)} cardClass="w-full max-w-lg">
          <div className="flex items-center justify-between px-6 pt-5 pb-3 print:hidden border-b">
            <h2 className="text-lg font-bold">Ship Label Preview — Job #{j.id}</h2>
            <div className="flex space-x-2">
              <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 flex items-center">
                <Printer className="w-4 h-4 mr-1" />Print
              </button>
              <button onClick={() => setDocumentPrint(null)} className="p-2 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
          </div>

          {/* Label body — 4×6 inch print */}
          <div className="m-5 border-4 border-gray-900 rounded-lg overflow-hidden print:m-0 print:border-0">
            {/* FROM strip */}
            <div className="bg-gray-900 text-white px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-400">From</p>
                <p className="font-bold text-sm">Total Image Group</p>
                <p className="text-xs text-gray-300">info@totalimage.com.au</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Job #</p>
                <p className="font-mono font-black text-2xl tracking-widest">{String(j.id).padStart(6, '0')}</p>
              </div>
            </div>

            {/* TO block */}
            <div className="px-6 py-5 bg-white">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Ship To</p>
              <p className="text-2xl font-black text-gray-900 leading-tight">{j.customer}</p>
              {(j.shipTo || j.shippingAddress) && (
                <p className="text-base text-gray-700 mt-2 whitespace-pre-line leading-snug">
                  {j.shipTo || j.shippingAddress}
                </p>
              )}
            </div>

            {/* Divider */}
            <div className="border-t-2 border-dashed border-gray-400 mx-4" />

            {/* Job meta row */}
            <div className="grid grid-cols-3 divide-x divide-gray-200 bg-gray-50">
              <div className="px-4 py-3 text-center">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Due Date</p>
                <p className="font-bold text-sm mt-0.5">{j.due || '—'}</p>
              </div>
              <div className="px-4 py-3 text-center">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Items</p>
                <p className="font-bold text-sm mt-0.5">{itemCount} line{itemCount !== 1 ? 's' : ''}</p>
              </div>
              <div className="px-4 py-3 text-center">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Total Qty</p>
                <p className="font-bold text-sm mt-0.5">{totalQty}</p>
              </div>
            </div>

            {/* Extra refs */}
            {(j.custRef || j.ourRef || j.invoice) && (
              <div className="px-5 py-3 bg-white border-t text-xs text-gray-500 space-y-0.5">
                {j.invoice && <p><span className="font-semibold">Invoice #:</span> {j.invoice}</p>}
                {j.custRef && <p><span className="font-semibold">Cust Ref #:</span> {j.custRef}</p>}
                {j.ourRef && <p><span className="font-semibold">Our Ref #:</span> {j.ourRef}</p>}
              </div>
            )}

            {/* Barcode placeholder */}
            <div className="bg-white px-5 pb-4 pt-2 border-t flex flex-col items-center">
              <div className="flex space-x-px">
                {[3,1,4,1,5,2,3,1,4,2,1,3,5,1,2,4,1,3,2,5,1,4,1,2,3,1,5,2,1,4,3,1,2,5,1].map((w, i) => (
                  <div key={i} style={{ width: w * 2, height: 32 }} className="bg-gray-900" />
                ))}
              </div>
              <p className="font-mono text-xs text-gray-600 mt-1 tracking-widest">{String(j.id).padStart(6, '0')}</p>
            </div>
          </div>

          <style>{`@media print { @page { size: 4in 6in; margin: 4mm; } }`}</style>
          <div className="px-6 pb-4 text-xs text-gray-400 text-center print:hidden">
            Print on 4×6 inch label paper.
          </div>
      </DraggableModal>
    );
  }
  return (
    <DraggableModal onClose={() => setDocumentPrint(null)} cardClass="w-full max-w-2xl max-h-[95vh] overflow-y-auto">
        <style>{`@media print { @page { size: A4 portrait; margin: 15mm; } }`}</style>
        <div className="flex items-center justify-between px-6 pt-6 pb-2 print:hidden">
          <h2 className="text-lg font-bold">{titles[type]} Preview — Job #{j.id}</h2>
          <div className="flex space-x-2">
            <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 flex items-center">
              <Printer className="w-4 h-4 mr-1" />Print
            </button>
            <button onClick={() => setDocumentPrint(null)} className="p-2 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="px-8 pb-8 pt-4">
          {/* Header */}
          <div className="flex justify-between items-start mb-5">
            <div>
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded flex items-center justify-center text-white font-bold text-sm mb-1">TIG</div>
              <h1 className="text-base font-bold text-gray-800">Total Image Group</h1>
              <p className="text-xs text-gray-500">info@totalimage.com.au</p>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold text-gray-800 tracking-wide">{titles[type]}</h2>
              <p className="text-sm text-gray-600">Job #: <strong>{j.id}</strong></p>
              {j.invoice && <p className="text-sm text-gray-500">Invoice #: {j.invoice}</p>}
              <p className="text-sm text-gray-500">Date In: {j.dateIn}</p>
              <p className="text-sm text-gray-500">Due: {j.due}</p>
            </div>
          </div>

          {/* Customer / delivery info */}
          <div className="grid grid-cols-2 gap-6 mb-5 border-t border-b py-4">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">{type === 'deliveryNote' ? 'Deliver To' : 'Customer'}</p>
              <p className="font-semibold text-gray-800">{j.customer}</p>
              {j.shippingAddress && <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{j.shippingAddress}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Job Details</p>
              <div className="text-sm text-gray-600 space-y-0.5">
                <p>Status: <strong>{j.status}</strong></p>
                <p>Priority: <strong>{j.priority}</strong></p>
                <p>Type: {j.type}</p>
                {j.assignedTo && <p>Assigned To: {j.assignedTo}</p>}
              </div>
            </div>
          </div>

          {/* Items table */}
          <table className="w-full text-sm mb-5">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Stock Code</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Description</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Sizes</th>
                {type === 'pickingSlip' && <th className="text-left px-3 py-2 font-medium text-gray-600">Bin Location</th>}
                <th className="text-right px-3 py-2 font-medium text-gray-600">Qty</th>
                {type === 'pickingSlip' && <th className="text-center px-3 py-2 font-medium text-gray-600">Picked ✓</th>}
              </tr>
            </thead>
            <tbody>
              {(j.items || []).filter(item => type !== 'deliveryNote' || !item.hide).map((item, i) => (
                <tr key={i} className="border-b">
                  <td className="px-3 py-2 font-mono text-xs">{item.stockCode || '—'}</td>
                  <td className="px-3 py-2">{item.description}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{item.sizes || '—'}</td>
                  {type === 'pickingSlip' && (() => {
                    const inv = inventory.find(i => i.sku === item.stockCode);
                    const inStock = inv && inv.stock > 0;
                    return (
                      <td className="px-3 py-2 font-mono text-xs">
                        {inStock
                          ? <span className="text-blue-700 font-medium">{inv.location || '—'}</span>
                          : <span className="text-red-500 font-medium">OUT OF STOCK</span>}
                      </td>
                    );
                  })()}
                  <td className="px-3 py-2 text-right font-medium">{item.order || item.qty || 0}</td>
                  {type === 'pickingSlip' && (
                    <td className="px-3 py-2 text-center">
                      <div className="w-5 h-5 border-2 border-gray-400 rounded inline-block"></div>
                    </td>
                  )}
                </tr>
              ))}
              {(j.items || []).filter(item => type !== 'deliveryNote' || !item.hide).length === 0 && (
                <tr><td colSpan="6" className="px-3 py-4 text-center text-gray-400 text-sm">No line items on this job.</td></tr>
              )}
            </tbody>
          </table>

          {/* Picking slip signature */}
          {type === 'pickingSlip' && (
            <div className="grid grid-cols-3 gap-6 text-sm border-t pt-4">
              <div><p className="text-xs text-gray-500 mb-1">Picked by:</p><div className="border-b border-gray-400 h-8"></div></div>
              <div><p className="text-xs text-gray-500 mb-1">Date / Time:</p><div className="border-b border-gray-400 h-8"></div></div>
              <div><p className="text-xs text-gray-500 mb-1">QC Checked by:</p><div className="border-b border-gray-400 h-8"></div></div>
            </div>
          )}

          {/* Delivery note signatures */}
          {type === 'deliveryNote' && (
            <div className="grid grid-cols-2 gap-6 text-sm border-t pt-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Driver / Despatcher Signature:</p>
                <div className="border-b border-gray-400 h-12 mb-1"></div>
                <p className="text-xs text-gray-400">Name: _____________________ Date: __________</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Received by (Customer):</p>
                <div className="border-b border-gray-400 h-12 mb-1"></div>
                <p className="text-xs text-gray-400">Name: _____________________ Date: __________</p>
              </div>
            </div>
          )}

          {/* Job sheet extras */}
          {type === 'jobSheet' && (
            <div className="border-t pt-4 space-y-4">
              {j.notes && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Special Instructions / Notes</p>
                  <div className="border rounded p-3 text-sm text-gray-700 min-h-12">{j.notes}</div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><p className="text-xs text-gray-500 mb-1">Production Start:</p><div className="border-b border-gray-400 h-8"></div></div>
                <div><p className="text-xs text-gray-500 mb-1">Production End:</p><div className="border-b border-gray-400 h-8"></div></div>
                <div><p className="text-xs text-gray-500 mb-1">QC Pass / Fail:</p><div className="border-b border-gray-400 h-8"></div></div>
              </div>
            </div>
          )}

          <div className="mt-6 pt-3 border-t text-xs text-gray-400 text-center">
            Total Image Group — {titles[type]} — Printed {new Date().toLocaleString()}
          </div>
        </div>
    </DraggableModal>
  );
}
