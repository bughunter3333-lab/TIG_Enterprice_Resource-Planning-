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

const iconButton = {
  appearance: 'none', border: 'none', background: 'transparent', cursor: 'pointer',
  width: 34, height: 34, borderRadius: '50%', alignSelf: 'center', flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: `background ${T.transition}`,
};
const hoverOn = (e) => { e.currentTarget.style.background = T.chromeHover; };
const hoverOff = (e) => { e.currentTarget.style.background = 'transparent'; };

/**
 * The SAP Fiori shell bar (Horizon): white, a hairline and a soft shadow
 * beneath, the product title at the left, the spaces as tabs marked by a
 * brand-blue indicator, and search, notifications and the user at the right.
 */
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
      height: 48, display: 'flex', alignItems: 'stretch',
      padding: '0 12px', gap: 2, flexShrink: 0, fontFamily: T.font,
      background: T.chrome, borderBottom: `1px solid ${T.hairline}`,
      boxShadow: T.shadowChrome, position: 'relative', zIndex: 20,
    }}>
      {onToggleTree && (
        <button
          type="button"
          aria-label={treeOpen ? 'Collapse tree' : 'Expand tree'}
          title={treeOpen ? 'Collapse tree' : 'Expand tree'}
          onClick={onToggleTree}
          style={{ ...iconButton, color: treeOpen ? T.chromeText : T.chromeTextMuted, marginRight: 4 }}
          onMouseEnter={hoverOn}
          onMouseLeave={hoverOff}
        >
          <PanelLeft size={16} />
        </button>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 14, flexShrink: 0 }}>
        <div aria-hidden style={{
          width: 26, height: 26, background: T.accent, borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 800, color: T.panel, letterSpacing: '0.02em',
        }}>
          TIG
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, color: T.chromeText, whiteSpace: 'nowrap' }}>Total Image</span>
      </div>

      <nav aria-label="Spaces" style={{ display: 'flex', alignItems: 'stretch', gap: 2, minWidth: 0, overflowX: 'auto' }}>
        {MODULES.map(m => {
          // The 3D warehouse is part of Stock, so Stock stays lit there.
          const active = !adminMode && (activeModule === m.id || (m.id === 'inventory' && activeModule === 'warehouse'));
          const badge = m.badgeKey ? badges[m.badgeKey] : null;
          return (
            <button
              key={m.id}
              type="button"
              // A real button: native Enter and Space, the focus ring, and the
              // role a screen reader and a test driver expect from navigation.
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(m.id)}
              style={{
                appearance: 'none', border: 'none', font: 'inherit',
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 10px', cursor: 'pointer', userSelect: 'none', background: 'transparent',
                fontSize: T.fsBase, fontWeight: active ? 700 : 400,
                color: active ? T.accentStrong : T.chromeText,
                // Horizon marks the selected tab with a brand-blue bar along its
                // bottom edge.
                boxShadow: active ? `inset 0 -3px 0 ${T.accentStrong}` : 'none',
                whiteSpace: 'nowrap',
                transition: `color ${T.transition}, background ${T.transition}`,
              }}
              onMouseEnter={e => { if (!active) hoverOn(e); }}
              onMouseLeave={hoverOff}
            >
              {m.label}
              {badge != null && badge > 0 && (
                <span style={{
                  fontSize: 12, fontWeight: 700, background: T.hairlineSoft, color: T.chromeText,
                  borderRadius: 10, padding: '0 7px', lineHeight: '18px', fontVariantNumeric: 'tabular-nums',
                }}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6, background: T.hairlineSoft,
          borderRadius: 16, padding: '0 12px', height: 32, width: 240, cursor: 'text',
        }}>
          <Search size={14} color={T.chromeTextMuted} aria-hidden />
          <input
            ref={searchRef}
            value={searchValue}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search…"
            aria-label="Search"
            style={{
              border: 'none', background: 'transparent', outline: 'none',
              fontSize: T.fsBase, color: T.chromeText, width: '100%', fontFamily: T.font,
            }}
          />
        </label>

        <div
          role="status"
          aria-label={notifCount > 0 ? `${notifCount} overdue jobs` : 'No notifications'}
          title={notifCount > 0 ? `${notifCount} overdue jobs` : 'No notifications'}
          style={{ ...iconButton, position: 'relative', cursor: 'default' }}
        >
          <Bell size={17} color={T.chromeText} />
          {notifCount > 0 && (
            <span aria-hidden style={{
              position: 'absolute', top: 2, right: 0, minWidth: 16, height: 16, padding: '0 4px',
              background: T.danger, color: T.panel, borderRadius: 8, fontSize: 10, fontWeight: 700,
              lineHeight: '16px', textAlign: 'center', fontVariantNumeric: 'tabular-nums',
            }}>
              {notifCount > 99 ? '99+' : notifCount}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onNewJob}
          style={{
            background: T.accent, color: T.panel, border: `1px solid ${T.accent}`, borderRadius: T.radius,
            height: 30, padding: '0 12px', fontSize: T.fsBase, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5, fontFamily: T.font,
            transition: `background ${T.transition}`,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = T.accentStrong; }}
          onMouseLeave={e => { e.currentTarget.style.background = T.accent; }}
        >
          <Plus size={14} /> New Job
        </button>

        {currentUser?.role === 'admin' && (
          <button
            type="button"
            aria-label="Admin Tools"
            aria-pressed={!!adminMode}
            title={adminMode ? 'Exit Admin' : 'Admin Tools'}
            onClick={onAdminToggle}
            style={{
              ...iconButton,
              background: adminMode ? T.accentTint : 'transparent',
              color: adminMode ? T.accentStrong : T.chromeText,
            }}
            onMouseEnter={e => { if (!adminMode) hoverOn(e); }}
            onMouseLeave={e => { if (!adminMode) hoverOff(e); }}
          >
            <Lock size={16} />
          </button>
        )}

        <div
          title={currentUser?.full_name || currentUser?.username || ''}
          style={{
            width: 32, height: 32, borderRadius: '50%', background: T.emphasis,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: T.panel, flexShrink: 0, marginLeft: 2,
          }}
        >
          {initials}
        </div>
      </div>
    </div>
  );
}
