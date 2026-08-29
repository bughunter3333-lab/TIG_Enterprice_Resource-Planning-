import { useState } from 'react';
import { CheckSquare, Send, X } from 'lucide-react';

export default function ProofPanel({ job, onUpdate }) {
  const PROOF_STYLES = {
    none:     'bg-gray-100 text-gray-500',
    sent:     'bg-blue-100 text-blue-800',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-red-100 text-red-700',
  };
  const [proofNotes, setProofNotes] = useState(job.proofNotes || '');
  const [saving, setSaving] = useState(false);

  const update = async (status, notes) => {
    setSaving(true);
    try { await onUpdate(status, notes ?? proofNotes); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-2.5">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Proof Approval</h4>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${PROOF_STYLES[job.proofStatus] || PROOF_STYLES.none}`}>
          {job.proofStatus === 'none' ? 'No proof' : job.proofStatus}
        </span>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1">
          <button onClick={() => update('sent')} disabled={saving}
            className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${job.proofStatus === 'sent' ? 'bg-blue-700 text-white' : 'bg-blue-50 hover:bg-blue-100 text-blue-800'}`}>
            <Send className="w-3 h-3" />Sent to Client
          </button>
          <button onClick={() => update('approved')} disabled={saving}
            className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${job.proofStatus === 'approved' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'}`}>
            <CheckSquare className="w-3 h-3" />Approved
          </button>
          <button onClick={() => update('rejected')} disabled={saving}
            className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${job.proofStatus === 'rejected' ? 'bg-red-600 text-white' : 'bg-red-50 hover:bg-red-100 text-red-700'}`}>
            <X className="w-3 h-3" />Rejected
          </button>
          <button onClick={() => update('none', '')} disabled={saving}
            className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium bg-gray-50 hover:bg-gray-100 text-gray-500 transition-colors">
            Clear
          </button>
        </div>
        <textarea
          value={proofNotes}
          onChange={e => setProofNotes(e.target.value)}
          onBlur={() => { if (proofNotes !== job.proofNotes) update(job.proofStatus || 'none', proofNotes); }}
          rows={2}
          placeholder="Proof notes (revision requests, approval notes…)"
          className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none text-gray-600"
        />
      </div>
    </div>
  );
}
