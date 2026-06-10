import { useState } from 'react';

const DEFAULT_STATUSES = [
  { name: 'QUOTE',       color: '#f59e0b' },
  { name: 'ORDER',       color: '#3b82f6' },
  { name: 'In Progress', color: '#8b5cf6' },
  { name: 'Pick/Pack',   color: '#0ea5e9' },
  { name: 'PROOF',       color: '#06b6d4' },
  { name: 'PRINT',       color: '#ec4899' },
  { name: 'FINISH',      color: '#10b981' },
  { name: 'INVOICE',     color: '#a855f7' },
  { name: 'PAID',        color: '#64748b' },
];

export default function StatusWorkflow({ config, onChange }) {
  const [statuses, setStatuses] = useState(config ?? DEFAULT_STATUSES);
  const [newName, setNewName] = useState('');

  function remove(name) {
    const updated = statuses.filter(s => s.name !== name);
    setStatuses(updated);
    onChange(updated);
  }

  function add() {
    if (!newName.trim()) return;
    const updated = [...statuses, { name: newName.trim(), color: '#94a3b8' }];
    setStatuses(updated);
    onChange(updated);
    setNewName('');
  }

  return (
    <div>
      <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>Production workflow statuses in order.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {statuses.map(s => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#1e293b', border: `1px solid ${s.color}40`, borderRadius: 20, padding: '4px 10px' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
            <span style={{ fontSize: 11, color: '#e2e8f0' }}>{s.name}</span>
            <button onClick={() => remove(s.name)} style={{ fontSize: 11, background: 'none', border: 'none', color: '#475569', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Add status…"
          style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '5px 10px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
        <button onClick={add} style={{ background: '#f59e0b', color: '#1c1404', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Add</button>
      </div>
    </div>
  );
}
