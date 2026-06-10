import { useState } from 'react';
import { LayoutGrid, Briefcase, FileText, ShoppingCart, Users, Package, BookOpen, Lock } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard',  icon: LayoutGrid,    label: 'Dashboard' },
  { id: 'jobs',       icon: Briefcase,     label: 'Jobs' },
  { id: 'quotes',     icon: FileText,      label: 'Quotes' },
  { id: 'purchases',  icon: ShoppingCart,  label: 'Purchases' },
  { id: 'customers',  icon: Users,         label: 'Customers' },
  { id: 'inventory',  icon: Package,       label: 'Stock' },
  { id: 'accounts',   icon: BookOpen,      label: 'Accounts' },
];

export default function Rail({ activeModule, onNavigate, adminMode, onAdminToggle, currentUser }) {
  const [hoveredId, setHoveredId] = useState(null);
  const initials = (currentUser?.username ?? 'U').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: 52, background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0', gap: 2, flexShrink: 0, height: '100vh' }}>
      <div style={{ width: 32, height: 32, background: '#3b82f6', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'white', marginBottom: 14 }}>
        TIG
      </div>
      {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
        <div
          key={id}
          title={label}
          role="button"
          tabIndex={0}
          onClick={() => onNavigate(id)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(id); } }}
          onMouseEnter={() => setHoveredId(id)}
          onMouseLeave={() => setHoveredId(null)}
          style={{
            width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            background: activeModule === id ? '#1d4ed8' : hoveredId === id ? '#1e293b' : 'transparent',
            color: activeModule === id ? 'white' : hoveredId === id ? '#94a3b8' : '#475569',
          }}
        >
          <Icon size={15} />
        </div>
      ))}
      <div style={{ flex: 1 }} />
      {currentUser?.role === 'admin' && (
        <div
          title={adminMode ? 'Exit Admin' : 'Admin Tools'}
          role="button"
          tabIndex={0}
          onClick={onAdminToggle}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdminToggle(); } }}
          style={{
            width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: adminMode ? '#fbbf24' : '#f59e0b',
            background: adminMode ? '#451a03' : 'transparent',
            marginBottom: 6,
          }}
        >
          <Lock size={15} />
        </div>
      )}
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
        {initials}
      </div>
    </div>
  );
}
