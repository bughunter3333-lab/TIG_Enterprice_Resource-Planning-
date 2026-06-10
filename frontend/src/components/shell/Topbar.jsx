import { Search, Bell, Plus } from 'lucide-react';

export default function Topbar({ title, subtitle, onNewJob, searchValue, onSearchChange, notifCount = 0 }) {
  return (
    <div style={{ height: 50, background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', padding: '0 18px', gap: 10, flexShrink: 0 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: '#94a3b8' }}>{subtitle}</div>}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7, padding: '5px 11px', width: 200 }}>
        <Search size={13} color="#94a3b8" />
        <input
          value={searchValue}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search…"
          style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 11, color: '#334155', width: '100%' }}
        />
      </div>
      <button
        onClick={onNewJob}
        style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
      >
        <Plus size={13} /> New Job
      </button>
      <div style={{ position: 'relative', width: 30, height: 30, borderRadius: 7, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <Bell size={13} color="#64748b" />
        {notifCount > 0 && (
          <div style={{ position: 'absolute', top: 5, right: 5, width: 6, height: 6, background: '#ef4444', borderRadius: '50%', border: '1px solid white' }} />
        )}
      </div>
    </div>
  );
}
