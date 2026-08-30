import { useEffect, useRef } from 'react';
import { Search, Bell, Plus, Lock, PanelLeft } from 'lucide-react';
import { T } from '../tokens';

// Same module ids as the old LabelPanel — navigation behaviour is unchanged.
const MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'jobs', label: 'Jobs', badgeKey: 'jobCount' },
  { id: 'quotes', label: 'Quotes', badgeKey: 'quoteCount' },
  { id: 'purchase-orders', label: 'Purchases' },
  { id: 'inventory', label: 'Stock' },
  { id: 'card-files', label: 'Card Files' },
  { id: 'customers', label: 'Customers' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'reports', label: 'Reports' },
];

export default function ModuleBar({
  activeModule, onNavigate, adminMode, onAdminToggle, currentUser,
  badges = {}, onNewJob, searchValue = '', onSearchChange, notifCount = 0,
  treeOpen, onToggleTree,
}) {
  const initials = (currentUser?.username ?? 'U').slice(0, 2).toUpperCase();
  const searchRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div style={{
      height: 40, display: 'flex', alignItems: 'center',
      padding: '0 10px', gap: 2, flexShrink: 0, fontFamily: T.font,
      // Faint top-down sheen + a cast shadow so the chrome reads as a solid
      // bar the app sits under, rather than a flat block of colour.
      background: `linear-gradient(180deg, ${T.chromeRaised} 0%, ${T.chrome} 55%)`,
      boxShadow: T.shadowChrome,
      position: 'relative', zIndex: 20,
    }}>
      {onToggleTree && (
        <div
          role="button"
          tabIndex={0}
          aria-label={treeOpen ? 'Collapse tree' : 'Expand tree'}
          title={treeOpen ? 'Collapse tree' : 'Expand tree'}
          onClick={onToggleTree}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleTree(); } }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 4, cursor: 'pointer',
            color: treeOpen ? T.chromeText : T.chromeTextMuted, marginRight: 6, flexShrink: 0,
          }}
        >
          <PanelLeft size={14} />
        </div>
      )}

      <div style={{
        width: 22, height: 22, background: T.panel, borderRadius: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 8.5, fontWeight: 800, color: T.chrome, marginRight: 10, flexShrink: 0,
      }}>
        TIG
      </div>

      {MODULES.map(m => {
        const active = !adminMode && activeModule === m.id;
        const badge = m.badgeKey ? badges[m.badgeKey] : null;
        return (
          <button
            key={m.id}
            type="button"
            // A real button rather than div+role+tabIndex+onKeyDown. The hand
            // rolled version worked, but native gets Enter and Space, the focus
            // ring, and the right role for free — and it is what a screen reader
            // and a test driver both expect from primary navigation.
            aria-current={active ? 'page' : undefined}
            onClick={() => onNavigate(m.id)}
            style={{
              appearance: 'none', border: 'none', font: 'inherit',
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 9px', borderRadius: 4, cursor: 'pointer', userSelect: 'none',
              fontSize: T.fsGrid, fontWeight: active ? 700 : 500,
              background: active ? T.chromeRaised : 'transparent',
              color: active ? T.chromeText : T.chromeTextMuted,
              boxShadow: active ? `inset 0 -2px 0 ${T.accent}` : 'none',
              whiteSpace: 'nowrap',
              // The hover handlers below change colour directly, and without
              // this they snapped. T.transition existed and was not applied to
              // any of the chrome.
              transition: `color ${T.transition}, background ${T.transition}, box-shadow ${T.transition}`,
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.color = T.chromeText; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.color = T.chromeTextMuted; }}
          >
            {m.label}
            {badge != null && badge > 0 && (
              <span style={{
                fontSize: 9.5, fontWeight: 700, background: T.chromeHover, color: T.chromeText,
                borderRadius: 8, padding: '0 5px', lineHeight: '14px',
              }}>
                {badge}
              </span>
            )}
          </button>
        );
      })}

      <div style={{ flex: 1 }} />

      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, background: T.chromeRaised,
        borderRadius: 4, padding: '4px 8px', width: 180, marginRight: 6,
      }}>
        <Search size={12} color={T.chromeTextMuted} />
        <input
          ref={searchRef}
          value={searchValue}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search…"
          style={{
            border: 'none', background: 'transparent', outline: 'none',
            fontSize: T.fsSmall, color: T.chromeText, width: '100%', fontFamily: T.font,
          }}
        />
      </div>

      <div
        role="status"
        aria-label={notifCount > 0 ? `${notifCount} overdue jobs` : 'No notifications'}
        title={notifCount > 0 ? `${notifCount} overdue jobs` : 'No notifications'}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: 5, marginRight: 2 }}
      >
        <Bell size={14} color={T.chromeTextMuted} />
        {notifCount > 0 && (
          <span style={{ position: 'absolute', top: 3, right: 2, width: 7, height: 7, background: T.danger, borderRadius: '50%', border: `1px solid ${T.chrome}` }} />
        )}
      </div>

      {/* The primary action in the application, and it had no hover state and no
          pressed state at all — it looked the same before, during and after a
          click. It lifts on hover and presses in on mousedown now, which is
          also the one bit of the sign-in screen's press language that belongs
          on a control this size. */}
      <button
        type="button"
        onClick={onNewJob}
        style={{
          background: T.accentStrong, color: '#fff', border: 'none', borderRadius: 4,
          padding: '5px 11px', fontSize: T.fsSmall, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4, fontFamily: T.font, marginRight: 6,
          transition: `background ${T.transition}, transform ${T.transition}`,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = T.accent; }}
        onMouseLeave={e => {
          e.currentTarget.style.background = T.accentStrong;
          e.currentTarget.style.transform = 'none';
        }}
        onMouseDown={e => { e.currentTarget.style.transform = 'translateY(1px)'; }}
        onMouseUp={e => { e.currentTarget.style.transform = 'none'; }}
      >
        <Plus size={12} /> New Job
      </button>

      {currentUser?.role === 'admin' && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Admin Tools"
          title={adminMode ? 'Exit Admin' : 'Admin Tools'}
          onClick={onAdminToggle}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdminToggle(); } }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 4, cursor: 'pointer',
            background: adminMode ? '#451a03' : 'transparent',
            color: adminMode ? T.accent : T.chromeTextMuted, marginRight: 4,
          }}
        >
          <Lock size={13} />
        </div>
      )}

      <div style={{
        width: 24, height: 24, borderRadius: '50%', background: T.chromeHover,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700, color: T.chromeText, flexShrink: 0,
      }}>
        {initials}
      </div>
    </div>
  );
}
