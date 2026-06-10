import { useState } from 'react';

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
      <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
        Toggle fields visible on the job form header. Use ↑↓ to reorder.
      </p>
      {fields.map((f, idx) => (
        <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: '#1e293b', borderRadius: 6, marginBottom: 4 }}>
          <input type="checkbox" checked={f.enabled} onChange={() => toggle(f.key)} />
          <span style={{ flex: 1, fontSize: 12, color: f.enabled ? '#e2e8f0' : '#475569' }}>{f.label}</span>
          <button onClick={() => moveUp(idx)} style={{ fontSize: 11, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>↑</button>
          <button onClick={() => moveDown(idx)} style={{ fontSize: 11, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>↓</button>
        </div>
      ))}
    </div>
  );
}
