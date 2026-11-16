import { ClipboardList, FileSpreadsheet, FileText, Tag, Truck } from 'lucide-react';
import { T } from '../../../ui/tokens';
import { offeredPrintItems } from './printItems';

const DOCUMENTS = [
  { key: 'invoice', label: 'TIG TAX Invoice', desc: 'Standard tax invoice with totals and payment details', icon: FileText, color: 'bg-accent-tint hover:bg-accent-tint border-accent text-accent-strong' },
  { key: 'pickingSlip', label: 'TIG Picking Slip', desc: 'Warehouse pick list with bin locations and checkboxes', icon: ClipboardList, color: 'bg-accent-tint hover:bg-accent-tint border-accent text-accent-strong' },
  { key: 'deliveryNote', label: 'TIG Delivery Note', desc: 'Customer delivery confirmation with signature fields', icon: Truck, color: 'bg-ok-tint hover:bg-ok-tint border-ok text-ok' },
  { key: 'jobSheet', label: 'TIG Job Sheet', desc: 'Production order with job details and instructions', icon: FileSpreadsheet, color: 'bg-emphasis-tint hover:bg-emphasis-tint border-emphasis text-emphasis' },
  { key: 'shipLabel', label: 'Ship Label', desc: 'Large-format shipping label with recipient address and job number', icon: Tag, color: 'bg-danger-tint hover:bg-danger-tint border-danger text-danger' },
];

/**
 * The job record's Documents tab. The tax invoice is built in the browser
 * from job data every role can read, so it is offered only where the Print
 * menu offers it — where the sales register may be read (F23). `offer` is
 * useOffer's (lib/access.js).
 */
export default function JobDocumentsTab({ job, offer, onInvoice, onDocument }) {
  return (
    <div>
      <p className="text-sm mb-4" style={{ color: T.textMuted }}>Generate and print documents for Job #{job.id}.</p>
      <div className="grid grid-cols-2 gap-3">
        {offeredPrintItems(DOCUMENTS, offer).map(doc => {
          const Icon = doc.icon;
          return (
            <button
              key={doc.key}
              onClick={() => (doc.key === 'invoice' ? onInvoice(job) : onDocument(doc.key, job))}
              className={`p-4 rounded-lg border text-left transition-colors ${doc.color}`}
            >
              <Icon className="w-5 h-5 mb-2" />
              <p className="font-semibold text-sm">{doc.label}</p>
              <p className="text-xs opacity-70 mt-0.5">{doc.desc}</p>
            </button>
          );
        })}
      </div>
      <div className="mt-4 pt-4 text-xs" style={{ borderTop: `1px solid ${T.hairline}`, color: T.textFaint }}>
        <p>All documents open a print-ready preview. Use your browser's print function (Ctrl+P) to print or save as PDF.</p>
      </div>
    </div>
  );
}
