import { useState } from 'react';

const DEFAULTS = [
  { name: 'Retail',     discount: 0,  isDefault: true },
  { name: 'Trade',      discount: 10, isDefault: false },
  { name: 'Wholesale',  discount: 20, isDefault: false },
  { name: 'VIP',        discount: 25, isDefault: false },
  { name: 'Cost',       discount: 50, isDefault: false },
];

export default function PriceLevels({ config, onChange }) {
  const [levels, setLevels] = useState(config ?? DEFAULTS);
  const [newName, setNewName] = useState('');
  const [newDiscount, setNewDiscount] = useState('');

  function setDefault(name) {
    const updated = levels.map(l => ({ ...l, isDefault: l.name === name }));
    setLevels(updated);
    onChange(updated);
  }

  function remove(name) {
    const updated = levels.filter(l => l.name !== name);
    setLevels(updated);
    onChange(updated);
  }

  function add() {
    if (!newName.trim()) return;
    const updated = [...levels, { name: newName.trim(), discount: parseFloat(newDiscount) || 0, isDefault: false }];
    setLevels(updated);
    onChange(updated);
    setNewName(''); setNewDiscount('');
  }

  return (
    <div>
      <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>Set customer price tiers and their discount from Retail.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #334155' }}>
            {['Level', 'Discount %', 'Default', ''].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 10, color: '#64748b', fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {levels.map(l => (
            <tr key={l.name} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '7px 8px', color: '#e2e8f0' }}>{l.name}</td>
              <td style={{ padding: '7px 8px', color: '#94a3b8' }}>{l.discount}%</td>
              <td style={{ padding: '7px 8px' }}>
                <input type="radio" checked={l.isDefault} onChange={() => setDefault(l.name)} />
              </td>
              <td style={{ padding: '7px 8px' }}>
                <button onClick={() => remove(l.name)} style={{ fontSize: 10, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Level name" style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '5px 10px', color: '#e2e8f0', fontSize: 11, outline: 'none' }} />
        <input value={newDiscount} onChange={e => setNewDiscount(e.target.value)} placeholder="%" style={{ width: 60, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '5px 10px', color: '#e2e8f0', fontSize: 11, outline: 'none' }} />
        <button onClick={add} style={{ background: '#f59e0b', color: '#1c1404', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Add</button>
      </div>
    </div>
  );
}
