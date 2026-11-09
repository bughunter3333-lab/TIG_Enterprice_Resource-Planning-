import { useState } from 'react';
import Modal from '../../../ui/Modal';
import Button from '../../../ui/Button';
import StatusBadge from '../../../ui/StatusBadge';
import { T } from '../../../ui/tokens';
import { formatDay } from '../../../lib/dates';

/**
 * Where the ticked lines go: one of the customer's other open jobs. The stock
 * they reserve goes with them; a garment takes its decoration.
 */
export default function MoveLinesDialog({ count, targets, busy, error, onMove, onClose }) {
  const [to, setTo] = useState(targets[0]?.id ?? null);
  return (
    <Modal
      title={`Move ${count} line${count === 1 ? '' : 's'} to another job`}
      onClose={onClose}
      width={520}
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!to || busy} onClick={() => onMove(to)}>
            {busy ? 'Moving…' : `Move to job ${to ?? ''}`}
          </Button>
        </>
      )}
    >
      <p style={{ margin: '0 0 12px', fontSize: T.fsSmall, color: T.textMuted }}>
        The stock they hold goes with them, and a garment takes its decoration.
      </p>
      <div role="radiogroup" aria-label="Move to job" style={{ display: 'grid', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
        {targets.map((job) => {
          const chosen = job.id === to;
          return (
            <button
              key={job.id}
              type="button"
              role="radio"
              aria-checked={chosen}
              onClick={() => setTo(job.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', minHeight: 44, cursor: 'pointer',
                textAlign: 'left', fontFamily: T.font, fontSize: T.fsBase, borderRadius: T.radius,
                background: chosen ? T.accentTint : T.panel, border: `1px solid ${chosen ? T.accent : T.hairline}`, color: T.text,
              }}
            >
              <span style={{ fontFamily: T.fontMono, fontWeight: 600 }}>{job.id}</span>
              <StatusBadge status={job.status} size="sm" />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.textMuted }}>
                {job.custRef || job.description || ''}
              </span>
              {job.due && <span style={{ fontSize: T.fsSmall, color: T.textMuted }}>due {formatDay(job.due)}</span>}
            </button>
          );
        })}
      </div>
      {error && <p role="alert" style={{ margin: '10px 0 0', fontSize: T.fsSmall, color: T.danger }}>{error}</p>}
    </Modal>
  );
}
