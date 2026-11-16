/**
 * A customer's logos (findings F09, F31; owner decision 2026-10-25).
 *
 * A logo used to exist only as text on each job line, so it could not be
 * approved once, costed once, or said to be done in-house or by a named
 * decorator. Here it is a record: a job line carrying its code applies it,
 * takes its price and cost, and is never bought as stock. Its proof is
 * approved once, for every job that applies it.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { logos, suppliers as suppliersApi } from '../../api';
import { useOffer } from '../../lib/useMyAccess';
import { notify } from '../../lib/notify';
import { DEC_OPTIONS } from '../../lib/decoration';

const PROOF_LABELS = {
  none: 'Not proofed',
  sent: 'With the customer',
  approved: 'Approved',
  rejected: 'Rejected',
};
const PROOF_TONE = { approved: 'text-ok', rejected: 'text-danger', sent: 'text-accent-strong', none: 'text-muted' };

const BLANK = { code: '', name: '', decorationType: 'EMB', position: '', stitchCount: '', madeBy: 'in_house', supplierId: '', priceEx: '', costEx: '' };

/** What is wrong with a new logo, by field; empty when it can be saved. */
export function logoProblems(form) {
  const problems = {};
  if (!form.code.trim()) problems.code = 'Give it the code a job line carries, e.g. EMB.CFG.LHC.';
  if (!form.decorationType) problems.decorationType = 'Choose how it is applied.';
  if (form.madeBy === 'subcontract' && !form.supplierId) problems.supplierId = 'A subcontracted logo names its decorator.';
  if (form.stitchCount !== '' && !(Number(form.stitchCount) >= 0)) problems.stitchCount = 'A stitch count is a whole number.';
  for (const key of ['priceEx', 'costEx']) {
    if (form[key] !== '' && !(Number(form[key]) >= 0)) problems[key] = 'An amount of $0 or more.';
  }
  return problems;
}

const inp = 'w-full rounded border px-2 py-1 text-sm';

function AddLogo({ customerId, decorators, onDone }) {
  const [form, setForm] = useState(BLANK);
  const [tried, setTried] = useState(false);
  const qc = useQueryClient();
  const problems = logoProblems(form);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const save = useMutation({
    mutationFn: () => logos.create({ ...form, customerId }),
    onSuccess: (made) => {
      qc.invalidateQueries({ queryKey: ['logos', customerId] });
      notify(`Logo ${made.code} added`, { type: 'success' });
      onDone();
    },
    onError: (e) => notify(e.message, { type: 'error' }),
  });
  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(problems).length === 0) save.mutate();
  };
  const field = (key, label, input) => (
    <label className="block text-xs text-muted">
      {label}
      {input}
      {tried && problems[key] && <span role="alert" className="block text-danger">{problems[key]}</span>}
    </label>
  );
  return (
    <form onSubmit={submit} className="grid grid-cols-3 gap-2 p-3 mb-4 rounded border bg-panel-alt" aria-label="New logo">
      {field('code', 'Code', <input className={inp} value={form.code} onChange={set('code')} placeholder="EMB.CFG.LHC" />)}
      {field('name', 'Name', <input className={inp} value={form.name} onChange={set('name')} placeholder="Left chest" />)}
      {field('decorationType', 'Method', (
        <select className={inp} value={form.decorationType} onChange={set('decorationType')}>
          {DEC_OPTIONS.filter((d) => d.v !== 'None').map((d) => <option key={d.v} value={d.v}>{d.l ?? d.v}</option>)}
        </select>
      ))}
      {field('position', 'Position', <input className={inp} value={form.position} onChange={set('position')} placeholder="L.Chest" />)}
      {field('stitchCount', 'Stitches', <input className={inp} inputMode="numeric" value={form.stitchCount} onChange={set('stitchCount')} />)}
      {field('madeBy', 'Done', (
        <select className={inp} value={form.madeBy} onChange={set('madeBy')}>
          <option value="in_house">In-house</option>
          <option value="subcontract">By a decorator</option>
        </select>
      ))}
      {form.madeBy === 'subcontract' && field('supplierId', 'Decorator', (
        <select className={inp} value={form.supplierId} onChange={set('supplierId')}>
          <option value="">Choose…</option>
          {decorators.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
      ))}
      {field('priceEx', 'Price ex GST', <input className={inp} inputMode="decimal" value={form.priceEx} onChange={set('priceEx')} />)}
      {field('costEx', 'Cost ex GST', <input className={inp} inputMode="decimal" value={form.costEx} onChange={set('costEx')} />)}
      <div className="col-span-3 flex justify-end gap-2">
        <button type="button" onClick={onDone} className="text-xs px-3 py-1.5 rounded border text-muted">Cancel</button>
        <button type="submit" disabled={save.isPending} className="text-xs px-3 py-1.5 rounded bg-accent-strong text-white disabled:opacity-50">
          {save.isPending ? 'Saving…' : 'Add logo'}
        </button>
      </div>
    </form>
  );
}

// What can be changed on a logo once made (F09). Its code and method are what
// job lines carry and how the proof was made, so they stay.
const editable = (g) => ({
  position: g.position || '', stitchCount: g.stitchCount ?? '', priceEx: String(g.priceEx), costEx: String(g.costEx),
  madeBy: g.madeBy, supplierId: g.supplierId || '', isActive: g.isActive !== false,
});

/** The fields of `form` that differ from the logo; a logo brought in-house loses its decorator. */
export function logoChanges(logo, form) {
  const was = editable(logo);
  const out = {};
  for (const key of Object.keys(form)) {
    if (String(form[key]) !== String(was[key])) out[key] = form[key];
  }
  if (out.madeBy === 'in_house') out.supplierId = '';
  return out;
}

function EditLogo({ logo, customerId, decorators, onDone }) {
  const [form, setForm] = useState(() => editable(logo));
  const [tried, setTried] = useState(false);
  const qc = useQueryClient();
  const problems = logoProblems({ ...form, code: logo.code, decorationType: logo.decorationType });
  const changes = logoChanges(logo, form);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const save = useMutation({
    mutationFn: () => logos.update(logo.id, changes),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['logos', customerId] });
      notify(`Logo ${saved.code} saved`, { type: 'success' });
      onDone();
    },
    onError: (e) => notify(e.message, { type: 'error' }),
  });
  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(problems).length === 0 && Object.keys(changes).length > 0) save.mutate();
  };
  const field = (key, label, input) => (
    <label className="block text-xs text-muted">
      {label}
      {input}
      {tried && problems[key] && <span role="alert" className="block text-danger">{problems[key]}</span>}
    </label>
  );
  return (
    <form onSubmit={submit} className="grid grid-cols-3 gap-2 p-3 mb-4 rounded border bg-panel-alt" aria-label={`Edit ${logo.code}`}>
      <p className="col-span-3 text-sm font-mono font-bold">{logo.code} <span className="font-sans font-normal text-muted">{logo.decorationType}</span></p>
      {field('position', 'Position', <input className={inp} value={form.position} onChange={set('position')} />)}
      {field('stitchCount', 'Stitches', <input className={inp} inputMode="numeric" value={form.stitchCount} onChange={set('stitchCount')} />)}
      {field('madeBy', 'Done', (
        <select className={inp} value={form.madeBy} onChange={set('madeBy')}>
          <option value="in_house">In-house</option>
          <option value="subcontract">By a decorator</option>
        </select>
      ))}
      {form.madeBy === 'subcontract' && field('supplierId', 'Decorator', (
        <select className={inp} value={form.supplierId} onChange={set('supplierId')}>
          <option value="">Choose…</option>
          {decorators.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
      ))}
      {field('priceEx', 'Price ex GST', <input className={inp} inputMode="decimal" value={form.priceEx} onChange={set('priceEx')} />)}
      {field('costEx', 'Cost ex GST', <input className={inp} inputMode="decimal" value={form.costEx} onChange={set('costEx')} />)}
      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
        Active
      </label>
      <div className="col-span-3 flex justify-end gap-2">
        <button type="button" onClick={onDone} className="text-xs px-3 py-1.5 rounded border text-muted">Cancel</button>
        <button type="submit" disabled={save.isPending || Object.keys(changes).length === 0} className="text-xs px-3 py-1.5 rounded bg-accent-strong text-white disabled:opacity-50">
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

export default function LogosTab({ customerId }) {
  const offer = useOffer();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  // Inactive logos too: one made inactive is listed, so it can be brought back.
  const { data: list, isPending, isError } = useQuery({
    queryKey: ['logos', customerId, 'all'],
    queryFn: () => logos.list(customerId, { includeInactive: true }),
  });
  // Decorators are suppliers: named in the list, chosen in the form.
  const { data: decorators = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: suppliersApi.list,
  });
  const proof = useMutation({
    mutationFn: ({ id, status }) => logos.proof(id, status),
    onSuccess: (logo) => {
      qc.invalidateQueries({ queryKey: ['logos', customerId] });
      notify(`${logo.code}: ${PROOF_LABELS[logo.proofStatus]}${logo.jobs.length ? ` — for ${logo.jobs.length} job${logo.jobs.length === 1 ? '' : 's'}` : ''}`, { type: 'success' });
    },
    onError: (e) => notify(e.message, { type: 'error' }),
  });
  const canAdd = offer('POST', '/logos');
  const canProof = offer('POST', '/logos/{logo_id}/proof');
  const canEdit = offer('PATCH', '/logos/{logo_id}');
  const decoratorName = (id) => decorators.find((s) => s.code === id)?.name ?? id;

  if (isError) return <p className="text-sm text-danger">Couldn't load this customer's logos.</p>;
  if (isPending) return <p className="text-sm text-muted">Loading logos…</p>;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted">A job line carrying a logo's code applies it — at its price, never bought as stock.</p>
        {canAdd && !adding && (
          <button onClick={() => setAdding(true)} className="text-xs px-3 py-1.5 rounded bg-accent-strong text-white">New logo</button>
        )}
      </div>
      {adding && <AddLogo customerId={customerId} decorators={decorators} onDone={() => setAdding(false)} />}
      {editing && <EditLogo key={editing.id} logo={editing} customerId={customerId} decorators={decorators} onDone={() => setEditing(null)} />}
      {list.length === 0 ? (
        <p className="text-sm text-faint py-6 text-center">No logos yet.</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="bg-panel-alt">
            <tr>
              {['Code', 'Method', 'Position', 'Stitches', 'Done', 'Price / cost', 'Proof', ''].map((h) => (
                <th key={h} className="text-left px-2 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {list.map((g) => (
              <tr key={g.id} className={g.isActive === false ? 'text-faint' : undefined}>
                <td className="px-2 py-2 font-mono font-bold">
                  {g.code}
                  <div className="font-sans font-normal text-muted">{g.name}</div>
                  {g.isActive === false && <div className="font-sans font-semibold text-warn">Inactive</div>}
                </td>
                <td className="px-2 py-2">{g.decorationType}</td>
                <td className="px-2 py-2">{g.position || '—'}</td>
                <td className="px-2 py-2">{g.stitchCount ?? '—'}</td>
                <td className="px-2 py-2">{g.madeBy === 'subcontract' ? decoratorName(g.supplierId) : 'In-house'}</td>
                <td className="px-2 py-2">${g.priceEx.toFixed(2)} / ${g.costEx.toFixed(2)}</td>
                <td className={`px-2 py-2 font-semibold ${PROOF_TONE[g.proofStatus] ?? 'text-muted'}`}>
                  {PROOF_LABELS[g.proofStatus] ?? g.proofStatus}
                  {g.approvedBy && <div className="font-normal text-muted">{g.approvedBy}</div>}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {canEdit && (
                    <button onClick={() => setEditing(g)} className="ml-1 underline text-accent-strong" aria-label={`Edit ${g.code}`}>Edit</button>
                  )}
                  {canProof &&['sent', 'approved', 'rejected'].filter((s) => s !== g.proofStatus).map((s) => (
                    <button key={s} onClick={() => proof.mutate({ id: g.id, status: s })} disabled={proof.isPending}
                      className="ml-1 underline text-accent-strong disabled:opacity-50"
                      aria-label={`Mark ${g.code} ${PROOF_LABELS[s].toLowerCase()}`}>
                      {s === 'sent' ? 'Sent' : s === 'approved' ? 'Approve' : 'Reject'}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
