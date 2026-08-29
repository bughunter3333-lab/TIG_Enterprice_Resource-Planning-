import { Download, Printer, X } from 'lucide-react';
import DraggableModal from '../../ui/DraggableModal';

export default function InvoiceDocument({ customers, invoiceJob, invoiceVariant, setInvoiceJob }) {
  if (!invoiceJob) return null;
  const j = invoiceJob;
  const custData = customers.find(c => c.id === j.customerId) || {};
  const visibleItems = (j.items || []).filter(i => !i.hide && i.displayType !== 'note');
  const subtotal = visibleItems.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
  const gst = parseFloat((subtotal * 0.1).toFixed(2));
  const grandTotal = parseFloat((subtotal + gst).toFixed(2));
  const paid = parseFloat(j.deposit || j.invoicePaid || 0);
  const balance = parseFloat((grandTotal - paid).toFixed(2));
  const isQuote = j.status === 'QUOTE';
  // Named variants rather than "anything that is not standard". The old test
  // meant a missing invoiceVariant printed a real tax invoice as a proforma
  // stamped "Not a Tax Invoice" - safe today only because the single caller
  // defaults the prop, which is not something a tax document should rest on.
  const isProforma = !isQuote && (invoiceVariant === 'proforma' || invoiceVariant === 'proformaBalance');
  const balanceOnly = invoiceVariant === 'proformaBalance';
  const docTitle = isQuote ? 'TAX QUOTE' : isProforma ? 'TAX PROFORMA INVOICE' : 'TAX INVOICE';

  return (
    <DraggableModal onClose={() => setInvoiceJob(null)} cardClass="w-full max-w-3xl max-h-[95vh] overflow-y-auto print:shadow-none print:rounded-none print:max-h-none print:overflow-visible" overlayClass="print:hidden">

        {/* Screen-only toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b bg-gray-50 print:hidden rounded-t-lg">
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold px-2 py-1 rounded ${isQuote ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-800'}`}>{docTitle}</span>
            <span className="text-sm text-gray-600 font-mono">#{j.invoice || j.id}</span>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${balance <= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{balance <= 0 ? 'PAID' : `Balance $${balance.toFixed(2)}`}</span>
          </div>
          <div className="flex gap-2">
            <a
              href={`/api/jobs/${j.id}/pdf?type=${j.status === 'QUOTE' ? 'quote' : 'invoice'}`}
              target="_blank"
              rel="noreferrer"
              className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700 flex items-center gap-1 no-underline"
            >
              <Download className="w-3.5 h-3.5" />Download PDF
            </a>
            <button onClick={() => window.print()} className="bg-blue-700 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-800 flex items-center gap-1">
              <Printer className="w-3.5 h-3.5" />Print
            </button>
            <button onClick={() => setInvoiceJob(null)} className="p-1.5 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Document body */}
        <div className="px-10 py-8 print:px-8 print:py-6" id="invoice-content" style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#1a1a1a' }}>

          {/* Header: Company + Document Title */}
          <div className="flex justify-between items-start mb-7">
            <div>
              <div style={{ width: 56, height: 56, background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <span style={{ color: '#fff', fontWeight: 900, fontSize: 20, letterSpacing: -1 }}>TIG</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>Total Image</div>
              <div style={{ color: '#555', fontSize: 12, marginTop: 4 }}>123 Example Street, Melbourne VIC 3000</div>
              <div style={{ color: '#555', fontSize: 12 }}>Phone: (03) 9000 0000 · info@totalimagegroup.com.au</div>
              <div style={{ color: '#555', fontSize: 12, marginTop: 2 }}><strong>ABN:</strong> 12 345 678 901</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 1, color: isQuote ? '#6d28d9' : '#1d4ed8', marginBottom: 6 }}>{docTitle}</div>
              <table style={{ marginLeft: 'auto', fontSize: 12 }}>
                <tbody>
                  <tr><td style={{ color: '#555', paddingRight: 16, paddingBottom: 2 }}>{isQuote ? 'Quote No:' : 'Invoice No:'}</td><td style={{ fontWeight: 700 }}>{j.invoice || j.id}</td></tr>
                  <tr><td style={{ color: '#555', paddingRight: 16, paddingBottom: 2 }}>Job Ref:</td><td style={{ fontFamily: 'monospace' }}>{j.id}</td></tr>
                  <tr><td style={{ color: '#555', paddingRight: 16, paddingBottom: 2 }}>Date:</td><td>{j.dateIn}</td></tr>
                  {j.due && <tr><td style={{ color: '#555', paddingRight: 16, paddingBottom: 2 }}>{isQuote ? 'Valid Until:' : 'Due Date:'}</td><td style={{ fontWeight: 600, color: '#dc2626' }}>{j.due}</td></tr>}
                  {custData.paymentTerms && !isQuote && <tr><td style={{ color: '#555', paddingRight: 16 }}>Terms:</td><td>{custData.paymentTerms}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Horizontal rule */}
          <div style={{ borderTop: '3px solid #1d4ed8', marginBottom: 20 }} />

          {/* Bill To / Ship To / Our Ref */}
          <div className="grid grid-cols-3 gap-6 mb-7" style={{ fontSize: 12 }}>
            <div>
              <div style={{ fontWeight: 700, textTransform: 'uppercase', color: '#888', fontSize: 10, letterSpacing: 1, marginBottom: 5 }}>Bill To</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{j.customer}</div>
              {custData.abn && <div style={{ color: '#555', marginTop: 2 }}>ABN: {custData.abn}</div>}
              {j.shippingAddress && <div style={{ color: '#555', marginTop: 4, whiteSpace: 'pre-line' }}>{j.shippingAddress}</div>}
              {custData.phone && <div style={{ color: '#555', marginTop: 2 }}>Ph: {custData.phone}</div>}
              {custData.email && <div style={{ color: '#555' }}>{custData.email}</div>}
            </div>
            {j.shipTo && (
              <div>
                <div style={{ fontWeight: 700, textTransform: 'uppercase', color: '#888', fontSize: 10, letterSpacing: 1, marginBottom: 5 }}>Ship To</div>
                <div style={{ fontWeight: 600 }}>{j.shipTo}</div>
              </div>
            )}
            <div>
              <div style={{ fontWeight: 700, textTransform: 'uppercase', color: '#888', fontSize: 10, letterSpacing: 1, marginBottom: 5 }}>References</div>
              {j.custRef && <div style={{ color: '#333' }}>Cust Ref: <strong>{j.custRef}</strong></div>}
              {j.ourRef && <div style={{ color: '#333' }}>Our Ref: <strong>{j.ourRef}</strong></div>}
              {j.assignedTo && <div style={{ color: '#555', marginTop: 2 }}>Sales Rep: {j.assignedTo}</div>}
              {j.nameContact && <div style={{ color: '#555' }}>Attn: {j.nameContact}</div>}
            </div>
          </div>

          {/* Line Items Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 16 }}>
            <thead>
              <tr style={{ background: '#1d4ed8', color: '#fff' }}>
                <th style={{ textAlign: 'left', padding: '7px 10px', fontWeight: 600 }}>Description</th>
                <th style={{ textAlign: 'left', padding: '7px 8px', fontWeight: 600, width: 80 }}>Decoration</th>
                <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600, width: 52 }}>Qty</th>
                {!balanceOnly && <>
                  <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600, width: 75 }}>Unit (ex)</th>
                  <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600, width: 50 }}>Disc%</th>
                  <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600, width: 80 }}>Amount</th>
                  <th style={{ textAlign: 'center', padding: '7px 8px', fontWeight: 600, width: 40 }}>GST</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item, i) => {
                const isSec = item.displayType === 'section';
                if (isSec) return (
                  <tr key={i} style={{ background: '#eff6ff' }}>
                    <td colSpan={balanceOnly ? 3 : 7} style={{ padding: '5px 10px', fontWeight: 700, color: '#1d4ed8', fontSize: 12 }}>{item.description}</td>
                  </tr>
                );
                const gstType = item.taxType || 'GST';
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '6px 10px' }}>
                      <div style={{ fontWeight: 500 }}>{item.description}</div>
                      {item.stockCode && <div style={{ color: '#888', fontSize: 10 }}>SKU: {item.stockCode}</div>}
                      {item.sizes && <div style={{ color: '#666', fontSize: 11 }}>{item.sizes}</div>}
                      {item.embCode && <div style={{ color: '#7c3aed', fontSize: 10, fontFamily: 'monospace' }}>🧵 EMB: {item.embCode}</div>}
                      {item.trsCode && <div style={{ color: '#4f46e5', fontSize: 10, fontFamily: 'monospace' }}>♨️ TRS: {item.trsCode}</div>}
                    </td>
                    <td style={{ padding: '6px 8px', color: '#555' }}>{item.decorationType !== 'None' ? item.decorationType : ''}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{item.orderQty || item.order || item.qty || 0}</td>
                    {!balanceOnly && <>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>${(parseFloat(item.priceEx) || 0).toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: item.discount > 0 ? '#dc2626' : '#ccc' }}>{item.discount > 0 ? `${item.discount}%` : '—'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>${(parseFloat(item.total) || 0).toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', color: '#16a34a', fontSize: 10 }}>{gstType}</td>
                    </>}
                  </tr>
                );
              })}
              {visibleItems.length === 0 && (
                <tr><td colSpan={balanceOnly ? 3 : 7} style={{ padding: '20px', textAlign: 'center', color: '#aaa' }}>No line items</td></tr>
              )}
            </tbody>
          </table>

          {/* Totals + Payment Details */}
          <div className="flex justify-between items-start gap-8">
            {/* Payment details / bank */}
            <div style={{ fontSize: 11, color: '#555', flex: 1 }}>
              {!isQuote && (
                <>
                  <div style={{ fontWeight: 700, marginBottom: 4, color: '#333' }}>Payment Details</div>
                  <div>Bank: Commonwealth Bank of Australia</div>
                  <div>BSB: 063-000 · Account: 1234 5678</div>
                  <div>Account Name: Total Image Group Pty Ltd</div>
                  <div style={{ marginTop: 4 }}>Reference: <strong>{j.invoice || j.id}</strong></div>
                  <div style={{ marginTop: 8, color: '#888' }}>Payment methods accepted: EFT, Credit Card, Cheque</div>
                </>
              )}
              {isQuote && (
                <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 6, padding: '8px 12px' }}>
                  <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 2 }}>This is a Quote — Not a Tax Invoice</div>
                  <div style={{ color: '#78350f', fontSize: 10 }}>Prices valid until {j.due || j.validityDate || '30 days from issue'}. GST will apply upon invoicing.</div>
                </div>
              )}
              {isProforma && (
                <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 6, padding: '8px 12px', marginTop: 8 }}>
                  <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 2 }}>Proforma — Not a Tax Invoice</div>
                  <div style={{ color: '#78350f', fontSize: 10 }}>Issued for payment prior to supply. A tax invoice will follow once goods are invoiced.</div>
                </div>
              )}
            </div>

            {/* Totals box — Balance ONLY variant shows just what's owed */}
            <div style={{ minWidth: 240 }}>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <tbody>
                  {!balanceOnly && <>
                    <tr><td style={{ padding: '4px 12px 4px 0', color: '#555' }}>Subtotal (ex GST)</td><td style={{ textAlign: 'right', padding: '4px 0', fontFamily: 'monospace' }}>${subtotal.toFixed(2)}</td></tr>
                    <tr style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '4px 12px 4px 0', color: '#555' }}>GST (10%)</td>
                      <td style={{ textAlign: 'right', padding: '4px 0', fontFamily: 'monospace' }}>${gst.toFixed(2)}</td>
                    </tr>
                    <tr style={{ borderTop: '2px solid #1d4ed8', background: '#eff6ff' }}>
                      <td style={{ padding: '7px 12px 7px 6px', fontWeight: 700, fontSize: 14 }}>TOTAL (inc GST)</td>
                      <td style={{ textAlign: 'right', padding: '7px 6px 7px 0', fontWeight: 700, fontSize: 14, fontFamily: 'monospace' }}>${grandTotal.toFixed(2)}</td>
                    </tr>
                  </>}
                  {(balanceOnly ? paid > 0 : paid > 0) && (
                    <tr><td style={{ padding: '4px 12px 4px 0', color: '#16a34a' }}>Less: Amount Paid</td><td style={{ textAlign: 'right', padding: '4px 0', color: '#16a34a', fontFamily: 'monospace' }}>-${paid.toFixed(2)}</td></tr>
                  )}
                  {(balanceOnly || paid > 0) && (
                    <tr style={{ borderTop: '2px solid #dc2626', background: '#fef2f2' }}>
                      <td style={{ padding: '7px 12px 7px 6px', fontWeight: 700, fontSize: 14, color: '#dc2626' }}>BALANCE DUE</td>
                      <td style={{ textAlign: 'right', padding: '7px 6px 7px 0', fontWeight: 700, fontSize: 14, color: '#dc2626', fontFamily: 'monospace' }}>${balance.toFixed(2)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes */}
          {j.notes && (
            <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid #e5e7eb', fontSize: 11 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: '#333' }}>Notes / Special Instructions</div>
              <div style={{ color: '#555', whiteSpace: 'pre-line' }}>{j.notes}</div>
            </div>
          )}

          {/* Footer */}
          <div style={{ marginTop: 24, paddingTop: 12, borderTop: '2px solid #1d4ed8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#888' }}>
            <div>Total Image Group Pty Ltd · ABN 12 345 678 901 · Registered for GST</div>
            <div>Thank you for your business</div>
            <div>Page 1 of 1</div>
          </div>
        </div>
    </DraggableModal>
  );
}
