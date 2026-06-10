import { useState } from 'react';

const SECTIONS = [
  {
    label: 'WORK',
    items: [
      { id: 'dashboard',  label: 'Dashboard',       dot: '#3b82f6' },
      { id: 'jobs',       label: 'Jobs',             dot: '#8b5cf6', badgeKey: 'jobCount' },
      { id: 'quotes',     label: 'Quotes',           dot: '#f59e0b', badgeKey: 'quoteCount' },
      { id: 'purchases',  label: 'Purchase Orders',  dot: '#14b8a6' },
    ],
  },
  {
    label: 'INVENTORY',
    items: [
      { id: 'inventory',  label: 'Stock',        dot: '#10b981' },
      { id: 'card-files', label: 'Card Files',   dot: '#64748b' },
    ],
  },
  {
    label: 'FINANCIALS',
    items: [
      { id: 'customers',  label: 'Customers',    dot: '#06b6d4' },
      { id: 'accounts',   label: 'Accounts',     dot: '#a855f7' },
      { id: 'reports',    label: 'Reports',      dot: '#ec4899' },
    ],
  },
];

export default function LabelPanel({ activeModule, onNavigate, badges = {}, adminMode, onAdminToggle, currentUser }) {
  const [hoveredId, setHoveredId] = useState(null);
  return (
    <div style={{ width: 196, background: '#1e293b', display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100vh', overflowY: 'auto' }}>
      <div style={{ padding: '14px 14px 6px', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.07em' }}>
        Total Image Group
      </div>
      {SECTIONS.map(section => (
        <div key={section.label}>
          <div style={{ padding: '10px 14px 3px', fontSize: 9, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            {section.label}
          </div>
          {section.items.map(item => {
            const active = activeModule === item.id;
            const badge = item.badgeKey ? badges[item.badgeKey] : null;
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => onNavigate(item.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(item.id); } }}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '7px 14px',
                  fontSize: 13, cursor: 'pointer',
                  background: active ? '#172554' : hoveredId === item.id ? '#334155' : 'transparent',
                  color: active ? '#60a5fa' : hoveredId === item.id ? '#e2e8f0' : '#64748b',
                  borderRight: active ? '2px solid #3b82f6' : '2px solid transparent',
                }}
              >
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.dot, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {badge > 0 && (
                  <span style={{ background: '#1d4ed8', color: '#bfdbfe', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>
                    {badge}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {currentUser?.role === 'admin' && (
        <div>
          <div style={{ padding: '10px 14px 3px', fontSize: 9, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            ADMIN
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={onAdminToggle}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdminToggle(); } }}
            style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '7px 14px',
              color: adminMode ? '#fbbf24' : '#64748b', fontSize: 13, cursor: 'pointer',
              background: adminMode ? '#1c1404' : 'transparent',
              borderRight: adminMode ? '2px solid #f59e0b' : '2px solid transparent',
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
            <span>Admin Tools</span>
          </div>
        </div>
      )}
      <div style={{ marginTop: 'auto', padding: '10px 14px', borderTop: '1px solid #334155', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>
          {(currentUser?.username ?? 'U').slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{currentUser?.username ?? ''}</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>{currentUser?.role ?? 'staff'}</div>
        </div>
      </div>
    </div>
  );
}
