import { useState } from 'react';
import { CheckSquare, Send, X } from 'lucide-react';
import Button from '../../ui/Button';
import { T } from '../../ui/tokens';
import { notify } from '../../lib/notify';

export const LOGO_PROOF_LABELS = { none: 'Not proofed', sent: 'With the customer', approved: 'Approved', rejected: 'Rejected' };
const LOGO_PROOF_TONE = { approved: T.ok, rejected: T.danger, sent: T.accentStrong };

/** Each logo the job's lines carry, once, with the proof held on the logo. */
export function logosOf(job) {
  const byId = new Map();
  (job.items || []).forEach((i) => {
    if (i.logoId != null && !byId.has(i.logoId)) {
      byId.set(i.logoId, { id: i.logoId, code: i.logoCode || `Logo ${i.logoId}`, status: i.logoProofStatus || 'none' });
    }
  });
  return [...byId.values()];
}

/**
 * A logo is proofed once for every job that carries it (POST /logos/{id}/proof),
 * so a job with logo lines shows each logo's proof, not one of its own (F31).
 * `onApproveLogo` is passed only where approving a logo is offered.
 */
function LogoProofs({ logos, onApproveLogo }) {
  const [busy, setBusy] = useState(null);
  const approve = async (id) => {
    setBusy(id);
    try { await onApproveLogo(id); }
    catch (e) { notify(e?.message || String(e), { type: 'error' }); }
    finally { setBusy(null); }
  };
  return (
    <div className="bg-white rounded-xl shadow-sm border border-hairline-soft p-4">
      <h4 className="text-xs font-bold text-muted uppercase tracking-wide mb-1">Proof Approval</h4>
      <p style={{ margin: '0 0 8px', fontSize: T.fsSmall, color: T.textMuted }}>Held on each logo, for every job that carries it.</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {logos.map((l) => (
          <li key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderTop: `1px solid ${T.hairlineSoft}` }}>
            <span style={{ fontFamily: T.fontMono, fontSize: T.fsSmall, color: T.text, flex: 1, minWidth: 0 }}>{l.code}</span>
            <span style={{ fontSize: T.fsSmall, fontWeight: 500, color: LOGO_PROOF_TONE[l.status] ?? T.textMuted }}>
              {LOGO_PROOF_LABELS[l.status] ?? l.status}
            </span>
            {onApproveLogo && l.status !== 'approved' && (
              <Button size="sm" aria-label={`Approve ${l.code}`} disabled={busy != null} onClick={() => approve(l.id)}>
                <CheckSquare size={12} aria-hidden /> Approve
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ProofPanel({ job, onUpdate, onApproveLogo }) {
  const logos = logosOf(job);
  // The job's own proof stays for a job with no logo lines.
  if (logos.length) return <LogoProofs logos={logos} onApproveLogo={onApproveLogo} />;
  return <JobProof job={job} onUpdate={onUpdate} />;
}

function JobProof({ job, onUpdate }) {
  const PROOF_STYLES = {
    none:     'bg-hairline-soft text-muted',
    sent:     'bg-accent-tint text-accent-strong',
    approved: 'bg-ok-tint text-ok',
    rejected: 'bg-danger-tint text-danger',
  };
  const [proofNotes, setProofNotes] = useState(job.proofNotes || '');
  const [saving, setSaving] = useState(false);

  const update = async (status, notes) => {
    setSaving(true);
    try { await onUpdate(status, notes ?? proofNotes); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-hairline-soft p-4">
      <div className="flex items-center justify-between mb-2.5">
        <h4 className="text-xs font-bold text-muted uppercase tracking-wide">Proof Approval</h4>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${PROOF_STYLES[job.proofStatus] || PROOF_STYLES.none}`}>
          {job.proofStatus === 'none' ? 'No proof' : job.proofStatus}
        </span>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1">
          <button onClick={() => update('sent')} disabled={saving}
            className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${job.proofStatus === 'sent' ? 'bg-accent-strong text-white' : 'bg-accent-tint hover:bg-accent-tint text-accent-strong'}`}>
            <Send className="w-3 h-3" />Sent to Client
          </button>
          <button onClick={() => update('approved')} disabled={saving}
            className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${job.proofStatus === 'approved' ? 'bg-ok text-white' : 'bg-ok-tint hover:bg-ok-tint text-ok'}`}>
            <CheckSquare className="w-3 h-3" />Approved
          </button>
          <button onClick={() => update('rejected')} disabled={saving}
            className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${job.proofStatus === 'rejected' ? 'bg-danger text-white' : 'bg-danger-tint hover:bg-danger-tint text-danger'}`}>
            <X className="w-3 h-3" />Rejected
          </button>
          <button onClick={() => update('none', '')} disabled={saving}
            className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium bg-panel-alt hover:bg-hairline-soft text-muted transition-colors">
            Clear
          </button>
        </div>
        <textarea
          value={proofNotes}
          onChange={e => setProofNotes(e.target.value)}
          onBlur={() => { if (proofNotes !== job.proofNotes) update(job.proofStatus || 'none', proofNotes); }}
          rows={2}
          placeholder="Proof notes (revision requests, approval notes…)"
          className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent-focus resize-none text-muted"
        />
      </div>
    </div>
  );
}
