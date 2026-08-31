import { useQuery } from '@tanstack/react-query';
import { Printer, X } from 'lucide-react';
import * as api from '../../api';
import { defaultTemplate } from '../../lib/documentTemplates';
import { printDocument } from '../../modules/documents/printDocument';
import DraggableModal from '../../ui/DraggableModal';
import { T } from '../../ui/tokens';
import TemplateRenderer from './TemplateRenderer';

/**
 * Preview and print an invoice, proforma or quote.
 *
 * Like the job documents, this no longer draws anything: it picks the template
 * for the document being asked for and hands it to the shared renderer, so
 * these are designed under Admin → Print Templates alongside the rest.
 *
 * The three variants used to be one component threaded with `isQuote`,
 * `isProforma` and `balanceOnly` ternaries. They are four templates now, which
 * is what they always were — a quote, a tax invoice, a proforma, and a proforma
 * that shows only the balance are four pieces of paper, not one with flags.
 *
 * That also retires the hardcoded ABN and bank details. The old markup printed
 * "ABN: 12 345 678 901", "BSB: 063-000" and "Account: 1234 5678" as literals,
 * so the fields on the Settings screen were decorative and the invoice told
 * customers to pay into an account nobody had configured.
 */

function templateFor(job, variant) {
  if (job?.status === 'QUOTE') return 'quote';
  if (variant === 'proformaBalance') return 'proformaBalance';
  if (variant === 'proforma') return 'proformaInvoice';
  return 'invoice';
}

export default function InvoiceDocument({ invoiceJob, invoiceVariant, setInvoiceJob }) {
  const docType = invoiceJob ? templateFor(invoiceJob, invoiceVariant) : null;

  const { data: saved } = useQuery({
    queryKey: ['documentTemplates'],
    queryFn: api.documentTemplates.list,
    enabled: !!invoiceJob,
  });
  const { data: company } = useQuery({
    queryKey: ['settings/company'],
    queryFn: api.settings.getCompany,
    enabled: !!invoiceJob,
  });

  if (!invoiceJob) return null;

  const template = saved?.[docType] ?? defaultTemplate(docType);
  const close = () => setInvoiceJob(null);

  return (
    <DraggableModal onClose={close} cardClass="w-full max-w-4xl max-h-[95vh] overflow-auto">
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: T.hairline }}
      >
        <h2 style={{ margin: 0, fontSize: T.fsBase, fontWeight: 800 }}>
          {template.name} — Job #{invoiceJob.id}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => printDocument(template, invoiceJob, company)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: T.chrome, color: T.chromeText, border: 'none',
              borderRadius: T.radius, padding: '6px 12px',
              fontSize: T.fsSmall, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <Printer size={14} /> Print / PDF
          </button>
          <button
            type="button" onClick={close} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div style={{ background: T.page, padding: 16, display: 'flex', justifyContent: 'center' }}>
        <div style={{ boxShadow: T.shadowMd }}>
          <TemplateRenderer template={template} job={invoiceJob} company={company} />
        </div>
      </div>
    </DraggableModal>
  );
}
