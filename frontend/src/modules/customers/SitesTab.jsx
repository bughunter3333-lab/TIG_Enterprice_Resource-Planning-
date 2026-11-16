/**
 * A customer's sites — the delivery addresses its jobs go to (Ship# in Jim2;
 * ORD7, JIM16). The server has kept them since the ship-to work, but nothing
 * on screen could add or change one: a new residence for a multi-site
 * customer meant asking an admin. A site's code is set once; a site jobs
 * deliver to is kept, and the server says how many.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customers as customersApi } from '../../api';
import { useOffer } from '../../lib/useMyAccess';
import { notify } from '../../lib/notify';

const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
const BLANK = { code: '', name: '', address: '', city: '', state: '', postcode: '', is_default: false };

/** What is wrong with a site, by field; empty when it can be saved. */
export function siteProblems(form) {
  const problems = {};
  const code = form.code.trim();
  if (!code) problems.code = 'Give it the code jobs carry, e.g. AR.KNO.';
  else if (code.length > 20) problems.code = 'A site code is 20 characters at most.';
  if (form.postcode && !/^\d{4}$/.test(form.postcode.trim())) problems.postcode = 'An Australian postcode is four digits.';
  if (form.state && !STATES.includes(form.state)) problems.state = 'Choose a state.';
  return problems;
}

const inp = 'w-full rounded border px-2 py-1 text-sm';

function SiteForm({ initial, editing, busy, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const [tried, setTried] = useState(false);
  const problems = siteProblems(form);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const field = (key, label, props = {}) => (
    <label className="block text-xs text-muted">
      {label}
      <input aria-label={label} value={form[key]} onChange={set(key)} className={inp} {...props} />
      {tried && problems[key] && <span className="text-danger">{problems[key]}</span>}
    </label>
  );
  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(problems).length) return;
    const { code, ...rest } = form;
    onSave(editing ? rest : { code: code.trim(), ...rest });
  };
  return (
    <form onSubmit={submit} aria-label={editing ? `Edit site ${initial.code}` : 'New site'} className="grid grid-cols-2 gap-2 p-3 rounded border border-hairline bg-panel-alt">
      {field('code', 'Site code', { disabled: editing, maxLength: 20 })}
      {field('name', 'Site name')}
      <div className="col-span-2">{field('address', 'Street address')}</div>
      {field('city', 'Suburb')}
      <label className="block text-xs text-muted">
        State
        <select aria-label="State" value={form.state} onChange={set('state')} className={inp}>
          <option value="">—</option>
          {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {tried && problems.state && <span className="text-danger">{problems.state}</span>}
      </label>
      {field('postcode', 'Postcode', { inputMode: 'numeric', maxLength: 4 })}
      <label className="flex items-center gap-2 text-xs text-muted self-end">
        <input type="checkbox" checked={form.is_default} onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))} />
        The customer's usual site
      </label>
      <div className="col-span-2 flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1 text-sm rounded border">Cancel</button>
        <button type="submit" disabled={busy} className="px-3 py-1 text-sm rounded bg-accent text-white">{editing ? 'Save site' : 'Add site'}</button>
      </div>
    </form>
  );
}

export default function SitesTab({ customerId }) {
  const qc = useQueryClient();
  const offer = useOffer();
  const canEdit = offer('POST', '/customers/{customer_id}/ship-tos');
  const { data: sites = [], isLoading } = useQuery({
    queryKey: ['ship-tos', customerId],
    queryFn: () => customersApi.shipTos(customerId),
  });
  const [editing, setEditing] = useState(null); // 'new' | site id | null
  const [confirming, setConfirming] = useState(null);

  const done = (message) => {
    qc.invalidateQueries({ queryKey: ['ship-tos', customerId] });
    notify(message, { type: 'success' });
    setEditing(null);
    setConfirming(null);
  };
  const failed = (e) => notify(e.message, { type: 'error' });
  const create = useMutation({
    mutationFn: (site) => customersApi.createShipTo(customerId, site),
    onSuccess: (made) => done(`Site ${made.code} added`),
    onError: failed,
  });
  const update = useMutation({
    mutationFn: ({ id, site }) => customersApi.updateShipTo(customerId, id, site),
    onSuccess: (saved) => done(`Site ${saved.code} saved`),
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: (site) => customersApi.deleteShipTo(customerId, site.id).then(() => site),
    onSuccess: (site) => done(`Site ${site.code} deleted`),
    onError: (e) => { setConfirming(null); failed(e); },
  });

  if (isLoading) return <p className="text-sm text-muted">Loading sites…</p>;
  return (
    <div className="space-y-3">
      {sites.length === 0 && editing !== 'new' && (
        <p className="text-sm text-muted">No sites yet. Jobs go to the customer's own address until one is added.</p>
      )}
      {sites.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1">Code</th><th>Site</th><th>Address</th><th />
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (editing === s.id ? (
              <tr key={s.id}><td colSpan={4}>
                <SiteForm
                  editing
                  initial={{ ...BLANK, ...s, address: s.address || '', city: s.city || '', state: s.state || '', postcode: s.postcode || '', name: s.name || '' }}
                  busy={update.isPending}
                  onSave={(site) => update.mutate({ id: s.id, site })}
                  onCancel={() => setEditing(null)}
                />
              </td></tr>
            ) : (
              <tr key={s.id} className="border-t border-hairline-soft">
                <td className="py-1.5 font-mono">{s.code}{s.is_default && <span className="ml-2 text-xs text-accent-strong">usual</span>}</td>
                <td>{s.name}</td>
                <td className="text-muted">{[s.address, [s.city, s.state, s.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</td>
                <td className="text-right whitespace-nowrap">
                  {canEdit && (confirming === s.id ? (
                    <>
                      <button type="button" onClick={() => remove.mutate(s)} className="text-danger text-xs mr-2" aria-label={`Confirm delete site ${s.code}`}>Delete it</button>
                      <button type="button" onClick={() => setConfirming(null)} className="text-xs">Keep</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => setEditing(s.id)} className="text-accent-strong text-xs mr-2" aria-label={`Edit site ${s.code}`}>Edit</button>
                      <button type="button" onClick={() => setConfirming(s.id)} className="text-muted text-xs" aria-label={`Delete site ${s.code}`}>Delete</button>
                    </>
                  ))}
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      )}
      {canEdit && (editing === 'new' ? (
        <SiteForm initial={BLANK} busy={create.isPending} onSave={(site) => create.mutate(site)} onCancel={() => setEditing(null)} />
      ) : (
        <button type="button" onClick={() => setEditing('new')} className="px-3 py-1 text-sm rounded border">Add a site</button>
      ))}
    </div>
  );
}
