import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, X } from 'lucide-react';
import * as api from '../../api';
import DraggableModal from '../../ui/DraggableModal';
import { T } from '../../ui/tokens';

/**
 * Send one job's order to many of the customer's sites.
 *
 * A job carries one ship-to address and that is not going to change — it is how
 * Jim2 models it too. So an order going to sixty-eight residences is
 * sixty-eight jobs, and the only question is whether somebody types them.
 * Jim2's answer is Create Similar, once per site. This is that, done in one
 * pass: tick the sites, get one job each.
 *
 * Each copy is created by the server, which strips the source job's own
 * fulfilment and works out supply and back-order against stock as it is now —
 * so the tenth copy sees what the first nine reserved.
 */
export default function DuplicateToSites({ job, onClose, onCreated }) {
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const { data: sites = [], isLoading } = useQuery({
    queryKey: ['shipTos', job?.customerId],
    queryFn: () => api.customers.shipTos(job.customerId),
    enabled: !!job?.customerId,
  });

  if (!job) return null;

  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const run = async () => {
    setBusy(true);
    const created = [];
    const failed = [];
    // Sequential on purpose: each copy reserves stock, and the next one has to
    // see that. Fired in parallel they would all price against the same
    // availability and over-commit.
    for (const site of sites.filter((s) => picked.has(s.id))) {
      try {
        const made = await api.jobs.duplicate(job.id, {
          ship_to: site.code,
          ship_to_id: site.id,
          shipping_address: [site.address, site.city, site.state, site.postcode]
            .filter(Boolean)
            .join(', '),
        });
        created.push({ code: site.code, id: made.id });
      } catch (e) {
        failed.push({ code: site.code, message: e?.message || 'refused' });
      }
    }
    setBusy(false);
    setResult({ created, failed });
    if (created.length) onCreated?.(created);
  };

  const label = { fontSize: T.fsSmall, color: T.textMuted };

  return (
    <DraggableModal onClose={onClose} cardClass="w-full max-w-lg max-h-[90vh] overflow-auto">
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: T.hairline }}
      >
        <h2 style={{ margin: 0, fontSize: T.fsBase, fontWeight: 800 }}>
          Duplicate job #{job.id} to sites
        </h2>
        <button
          type="button" onClick={onClose} aria-label="Close"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 4 }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-5 py-4">
        {result ? (
          <div>
            <p style={{ margin: 0, fontWeight: 700 }}>
              {result.created.length} job{result.created.length === 1 ? '' : 's'} created
            </p>
            <ul className="mt-2" style={{ ...label, listStyle: 'none', padding: 0 }}>
              {result.created.map((c) => (
                <li key={c.id}>
                  <span style={{ fontFamily: T.fontMono }}>{c.code}</span> → #{c.id}
                </li>
              ))}
            </ul>
            {result.failed.length > 0 && (
              <div className="mt-3" style={{ color: T.danger, fontSize: T.fsSmall }}>
                {result.failed.map((f) => (
                  <div key={f.code}>
                    <span style={{ fontFamily: T.fontMono }}>{f.code}</span> — {f.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : isLoading ? (
          <p style={label}>Loading sites…</p>
        ) : sites.length === 0 ? (
          <p style={label}>
            This customer has no ship-to sites on file. Add them on the customer record first.
          </p>
        ) : (
          <>
            <p style={{ ...label, marginTop: 0 }}>
              One job per site, carrying this order. Supply and back-order are worked out
              against stock for each copy in turn.
            </p>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {sites.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 py-1.5 px-1 cursor-pointer"
                  style={{ borderBottom: `1px solid ${T.hairlineSoft}` }}
                >
                  <input
                    type="checkbox"
                    checked={picked.has(s.id)}
                    onChange={() => toggle(s.id)}
                    className="w-3.5 h-3.5"
                  />
                  <span style={{ fontFamily: T.fontMono, fontSize: T.fsSmall, color: T.accentStrong, minWidth: 92 }}>
                    {s.code}
                  </span>
                  <span style={{ fontSize: T.fsSmall, color: T.text }}>{s.name || s.city}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      <div
        className="flex items-center justify-end gap-2 px-5 py-3 border-t"
        style={{ borderColor: T.hairline }}
      >
        <button
          type="button" onClick={onClose}
          style={{
            background: 'none', border: `1px solid ${T.hairline}`, borderRadius: T.radius,
            padding: '6px 12px', fontSize: T.fsSmall, cursor: 'pointer', color: T.text,
          }}
        >
          {result ? 'Close' : 'Cancel'}
        </button>
        {!result && (
          <button
            type="button"
            onClick={run}
            disabled={busy || picked.size === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: picked.size === 0 || busy ? T.hairline : T.chrome,
              color: picked.size === 0 || busy ? T.textFaint : T.chromeText,
              border: 'none', borderRadius: T.radius, padding: '6px 12px',
              fontSize: T.fsSmall, fontWeight: 700,
              cursor: picked.size === 0 || busy ? 'default' : 'pointer',
            }}
          >
            <Copy className="w-3.5 h-3.5" />
            {busy ? 'Creating…' : `Create ${picked.size} job${picked.size === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
    </DraggableModal>
  );
}
