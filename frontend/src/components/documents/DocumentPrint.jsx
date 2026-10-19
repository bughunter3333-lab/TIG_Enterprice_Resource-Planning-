import { useQuery } from '@tanstack/react-query';
import { Printer, X } from 'lucide-react';
import * as api from '../../api';
import { defaultTemplate } from '../../lib/documentTemplates';
import { printDocument } from '../../modules/documents/printDocument';
import DraggableModal from '../../ui/DraggableModal';
import { T } from '../../ui/tokens';
import TemplateRenderer from './TemplateRenderer';

/**
 * Preview and print a job document.
 *
 * This used to draw each of the four documents itself, in markup that had a
 * second life as 1,109 lines of ReportLab for the PDF. It now renders whatever
 * the template for that document says, which is the same thing the designer
 * previews and the same thing the printer receives — so a layout changed under
 * Admin → Print Templates takes effect here without anyone touching this file.
 *
 * `pickingSlip` is accepted as a name for `pickingList`: the callers in the
 * job toolbar have used it since before templates existed, and renaming a
 * dozen call sites to fix a label is not worth the diff.
 */

const ALIASES = { pickingSlip: 'pickingList' };

export default function DocumentPrint({ documentPrint, inventory, setDocumentPrint }) {
  const docType = documentPrint ? (ALIASES[documentPrint.type] ?? documentPrint.type) : null;

  const { data: saved } = useQuery({
    queryKey: ['documentTemplates'],
    queryFn: api.documentTemplates.list,
    enabled: !!documentPrint,
  });
  const { data: company } = useQuery({
    queryKey: ['settings/company'],
    queryFn: api.settings.getCompany,
    enabled: !!documentPrint,
  });

  if (!documentPrint) return null;
  const job = documentPrint.job;

  // An unsaved document type falls back to its built-in default rather than to
  // a blank page, which is also what makes the templates optional.
  let template;
  try {
    template = saved?.[docType] ?? defaultTemplate(docType);
  } catch {
    template = null;
  }

  const close = () => setDocumentPrint(null);

  return (
    <DraggableModal onClose={close} cardClass="w-full max-w-4xl max-h-[92vh] overflow-auto">
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: T.hairline }}
      >
        <h2 style={{ margin: 0, fontSize: T.fsBase, fontWeight: 800 }}>
          {template?.name || 'Document'} — Job #{job?.id}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => printDocument(template, job, company, inventory)}
            disabled={!template}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: T.chrome, color: T.chromeText, border: 'none',
              borderRadius: T.radius, padding: '6px 12px',
              fontSize: T.fsSmall, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <Printer size={14} /> Print / PDF
          </button>
          <button type="button" onClick={close} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 4 }}>
            <X size={18} />
          </button>
        </div>
      </div>

      <div style={{ background: T.page, padding: 16, display: 'flex', justifyContent: 'center' }}>
        {template ? (
          <div style={{ boxShadow: T.shadowMd }}>
            <TemplateRenderer template={template} job={job} company={company} inventory={inventory} />
          </div>
        ) : (
          <p style={{ color: T.textMuted, fontSize: T.fsGrid, padding: 24 }}>
            There is no template for “{documentPrint.type}”. Add one under Admin → Print Templates.
          </p>
        )}
      </div>
    </DraggableModal>
  );
}
