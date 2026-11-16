import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Undo2 } from 'lucide-react';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import { T } from '../../ui/tokens';
import { creditNotes as creditNotesApi } from '../../api';
import { notify } from '../../lib/notify';
import { useOffer } from '../../lib/useMyAccess';
import { formatDay } from '../../lib/dates';
import { money } from '../jobs/record/recordFormat';
import CreditNoteDialog from './CreditNoteDialog';
import { isCreditable } from './creditNotes';

const INSPECTION = { waiting: 'at RET, to be inspected', restocked: 'restocked', scrapped: 'written off' };

function lineSays(line) {
  const what = `${line.qty} × ${line.stock_code || 'line'}`;
  if (!line.goods_back) return what;
  if (!line.restockable) return `${what} · back, not restocked`;
  return `${what} · ${INSPECTION[line.inspection] || 'back'}`;
}

/**
 * An invoice's credit notes, and the way to raise one (managers and admins).
 * `onChanged` reloads the open job: its balance, money and trail change.
 * docs/superpowers/specs/2026-11-09-returns-credit-notes.md
 */
export default function CreditNotesCard({ job, onChanged }) {
  const offer = useOffer();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const shown = isCreditable(job) && offer('GET', '/jobs/{job_id}/credit-notes');
  const mayRaise = offer('POST', '/jobs/{job_id}/credit-notes');
  const { data: notes = [] } = useQuery({
    queryKey: ['credit-notes', job.id],
    queryFn: () => creditNotesApi.forJob(job.id),
    enabled: !!shown,
  });
  const raising = useMutation({
    mutationFn: (body) => creditNotesApi.raise(job.id, body),
    onSuccess: (note) => {
      setOpen(false);
      for (const key of [['credit-notes'], ['jobs'], ['customers'], ['returns'], ['customer-statement']]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      onChanged?.();
      notify(
        note.unapplied > 0
          ? `Credit note ${note.id} raised: ${money(note.total_inc)}, ${money(note.unapplied)} of it credit on the account.`
          : `Credit note ${note.id} raised: ${money(note.total_inc)} off the invoice.`,
        { type: 'success' },
      );
    },
  });

  if (!shown) return null;
  if (!notes.length && !mayRaise) return null;
  return (
    <Card
      title="Credit notes"
      info={notes.length ? `${notes.length}` : undefined}
      actions={mayRaise && (
        <Button size="sm" onClick={() => { raising.reset(); setOpen(true); }}>
          <Undo2 size={14} aria-hidden /> Credit / return…
        </Button>
      )}
    >
      {!notes.length && (
        <p style={{ margin: 0, fontSize: T.fsSmall, color: T.textMuted }}>
          None. Credit lines of this invoice, and take goods back, with Credit / return.
        </p>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
        {notes.map((note) => (
          <li key={note.id} style={{ display: 'grid', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <a
                href={creditNotesApi.pdfUrl(note.id)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Adjustment note ${note.id} (PDF)`}
                style={{ fontFamily: T.fontMono, fontWeight: 600, color: T.accentStrong, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <FileText size={13} aria-hidden /> {note.id}
              </a>
              <span style={{ fontSize: T.fsSmall, color: T.textMuted }}>{formatDay(note.credit_date)}</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(note.total_inc)}</span>
              <span style={{ fontSize: T.fsSmall, color: T.textMuted }}>
                {note.unapplied > 0 ? `${money(note.unapplied)} credit on the account` : 'applied in full'}
              </span>
            </div>
            <div style={{ fontSize: T.fsSmall, color: T.textMuted }}>{note.reason}</div>
            <div style={{ fontSize: T.fsSmall, color: T.text }}>{note.lines.map(lineSays).join(' · ')}</div>
          </li>
        ))}
      </ul>
      {open && (
        <CreditNoteDialog
          job={job}
          notes={notes}
          busy={raising.isPending}
          error={raising.error?.message}
          onRaise={(body) => raising.mutate(body)}
          onClose={() => setOpen(false)}
        />
      )}
    </Card>
  );
}
