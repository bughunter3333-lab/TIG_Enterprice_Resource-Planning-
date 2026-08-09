import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Save, Check } from 'lucide-react';
import { stock } from '../../../api';
import { T } from '../../../ui/tokens';

// Jim2 Stock "Descriptions" tab: long-form text slots per SKU, editable.
// Saved via PATCH /inventory/{sku}; the inventory query is invalidated so the
// master list + detail reflect the change.

const FIELDS = [
  { key: 'desc_extended', label: 'Extended Description', hint: 'Full internal / catalogue description', rows: 4 },
  { key: 'desc_web', label: 'Web / Online Description', hint: 'Shown on the online store / eBusiness', rows: 4 },
  { key: 'desc_care', label: 'Care Instructions', hint: 'Wash & care guidance for garments', rows: 3 },
];

const empty = { desc_extended: '', desc_web: '', desc_care: '' };

export default function StockDescriptionsTab({ item }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(empty);
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error
  const [err, setErr] = useState('');

  // Re-seed from the item whenever the selected SKU changes.
  useEffect(() => {
    setDraft({
      desc_extended: item.desc_extended || '',
      desc_web: item.desc_web || '',
      desc_care: item.desc_care || '',
    });
    setStatus('idle');
    setErr('');
  }, [item.sku]);

  const dirty = FIELDS.some(f => (draft[f.key] || '') !== (item[f.key] || ''));

  const save = async () => {
    setStatus('saving');
    setErr('');
    try {
      await stock.update(item.sku, {
        desc_extended: draft.desc_extended,
        desc_web: draft.desc_web,
        desc_care: draft.desc_care,
      });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setStatus('saved');
      setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 2000);
    } catch (e) {
      setStatus('error');
      setErr(e.message || 'Save failed');
    }
  };

  const ta = {
    width: '100%', border: `1px solid ${T.hairline}`, borderRadius: 6, padding: '7px 9px',
    fontSize: T.fsBase, fontFamily: T.font, color: T.text, background: T.panel, outline: 'none',
    resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.4,
  };

  return (
    <div style={{ fontFamily: T.font, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {FIELDS.map(f => (
        <div key={f.key}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
            <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.textMuted }}>{f.label}</label>
            <span style={{ fontSize: 10.5, color: T.textFaint }}>{f.hint}</span>
          </div>
          <textarea
            rows={f.rows}
            style={ta}
            value={draft[f.key]}
            placeholder={`Add ${f.label.toLowerCase()}…`}
            onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
          />
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={save}
          disabled={!dirty || status === 'saving'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', fontSize: T.fsSmall,
            fontWeight: 700, color: '#fff', background: T.accentStrong, border: 'none', borderRadius: 6,
            cursor: dirty && status !== 'saving' ? 'pointer' : 'not-allowed', opacity: dirty && status !== 'saving' ? 1 : 0.5,
          }}
        >
          <Save size={13} /> {status === 'saving' ? 'Saving…' : 'Save Descriptions'}
        </button>
        {status === 'saved' && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: T.fsSmall, color: T.ok, fontWeight: 600 }}><Check size={13} /> Saved</span>}
        {status === 'error' && <span style={{ fontSize: T.fsSmall, color: T.danger }}>{err}</span>}
        {dirty && status !== 'saving' && <span style={{ fontSize: 10.5, color: T.textFaint }}>Unsaved changes</span>}
      </div>
    </div>
  );
}
