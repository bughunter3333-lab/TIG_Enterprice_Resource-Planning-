import { useState } from 'react';
import { T } from '../../ui/tokens';

const ALL_FIELDS = [
  { key: 'price_level',  label: 'Price Level' },
  { key: 'acc_mgr',      label: 'Acc Mgr' },
  { key: 'ex_job_ref',   label: 'Ex Job Ref' },
  { key: 'requested_by', label: 'Requested By' },
  { key: 'invoice_desc', label: 'Invoice Desc' },
  { key: 'contract',     label: 'Contract' },
];

export default function FieldConfig({ config, onChange }) {
  const [fields, setFields] = useState(
    config ?? ALL_FIELDS.map(f => ({ ...f, enabled: true }))
  );

  function toggle(key) {
    const updated = fields.map(f => f.key === key ? { ...f, enabled: !f.enabled } : f);
    setFields(updated);
    onChange(updated);
  }

  function moveUp(idx) {
    if (idx === 0) return;
    const updated = [...fields];
    [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
    setFields(updated);
    onChange(updated);
  }

  function moveDown(idx) {
    if (idx === fields.length - 1) return;
    const updated = [...fields];
    [updated[idx + 1], updated[idx]] = [updated[idx], updated[idx + 1]];
    setFields(updated);
    onChange(updated);
  }

  return (
    <div>
      <p style={{ fontSize: 11, color: T.chromeTextMuted, marginBottom: 12 }}>
        Toggle fields visible on the job form header. Use ↑↓ to reorder.
      </p>
      {fields.map((f, idx) => (
        <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: T.chromeRaised, borderRadius: 6, marginBottom: 4 }}>
          <input type="checkbox" checked={f.enabled} onChange={() => toggle(f.key)} />
          <span style={{ flex: 1, fontSize: 12, color: f.enabled ? T.chromeText : T.chromeTextMuted }}>{f.label}</span>
          <button onClick={() => moveUp(idx)} style={{ fontSize: 11, background: 'none', border: 'none', color: T.chromeTextMuted, cursor: 'pointer' }}>↑</button>
          <button onClick={() => moveDown(idx)} style={{ fontSize: 11, background: 'none', border: 'none', color: T.chromeTextMuted, cursor: 'pointer' }}>↓</button>
        </div>
      ))}
    </div>
  );
}
