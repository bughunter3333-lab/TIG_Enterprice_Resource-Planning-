import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { T } from '../tokens';
import { useMyAccess } from '../../lib/useMyAccess';
import { shownGroups, isActive } from './shellModules';

function NavItem({ module, active, collapsed, badge, onNavigate }) {
  const Icon = module.icon;
  return (
    <button
      type="button"
      // A real button: native Enter and Space, the focus ring, and the role a
      // screen reader and a test driver expect from navigation.
      aria-current={active ? 'page' : undefined}
      title={collapsed ? module.label : undefined}
      onClick={() => onNavigate(module.id)}
      style={{
        appearance: 'none', font: 'inherit', cursor: 'pointer', width: '100%',
        display: 'flex', alignItems: 'center', gap: 10, height: 34,
        padding: collapsed ? 0 : '0 10px', justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: T.radius,
        border: `1px solid ${active ? T.hairline : 'transparent'}`,
        background: active ? T.panel : 'transparent',
        boxShadow: active ? T.shadowSm : 'none',
        color: active ? T.text : T.textMuted,
        fontSize: T.fsGrid, fontWeight: active ? 600 : 500,
        transition: `background ${T.transition}, color ${T.transition}`,
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = T.railHover; e.currentTarget.style.color = T.text; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMuted; } }}
    >
      <Icon size={17} aria-hidden style={{ flexShrink: 0, color: active ? T.accent : 'currentColor' }} />
      {!collapsed && <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap' }}>{module.label}</span>}
      {!collapsed && badge != null && badge > 0 && (
        <span style={{
          minWidth: 20, height: 20, padding: '0 6px', borderRadius: T.radiusSm,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: T.panel, border: `1px solid ${T.hairline}`, color: T.textMuted,
          fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}

/**
 * The left of every screen, on the rail neutral: who we are, the modules in
 * their groups (only those this person's role can read in), the open jobs and
 * saved lists, and who is signed in. It folds to an icon rail.
 */
export default function Sidebar({
  activeModule, onNavigate, adminMode, badges = {}, currentUser, collapsed = false, onToggleCollapsed, children,
}) {
  const { data: access, isError: accessFailed } = useMyAccess();
  const groups = shownGroups(access, accessFailed);
  const name = currentUser?.full_name || currentUser?.username || '';
  const initials = (currentUser?.full_name || currentUser?.username || 'U')
    .split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <aside style={{
      width: collapsed ? 64 : 248, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column',
      background: T.rail, borderRight: `1px solid ${T.hairline}`, fontFamily: T.font,
      transition: `width ${T.spring}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 56, padding: collapsed ? '0 14px' : '0 12px 0 16px', flexShrink: 0 }}>
        <span aria-hidden style={{
          width: 30, height: 30, borderRadius: T.radius, background: T.accent, color: '#fff', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, letterSpacing: '0.02em',
          boxShadow: '0 1px 2px rgba(11,99,246,.3), inset 0 1px 0 rgba(255,255,255,.15)',
        }}>
          TIG
        </span>
        {!collapsed && <span style={{ flex: 1, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: T.text, whiteSpace: 'nowrap' }}>Total Image</span>}
        {onToggleCollapsed && !collapsed && (
          <button type="button" aria-label="Collapse sidebar" title="Collapse sidebar" onClick={onToggleCollapsed} style={railButton}>
            <PanelLeftClose size={16} aria-hidden />
          </button>
        )}
      </div>
      {onToggleCollapsed && collapsed && (
        <button type="button" aria-label="Expand sidebar" title="Expand sidebar" onClick={onToggleCollapsed} style={{ ...railButton, margin: '0 auto 8px' }}>
          <PanelLeftOpen size={16} aria-hidden />
        </button>
      )}

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: collapsed ? '4px 10px 12px' : '4px 12px 12px' }}>
        <nav aria-label="Spaces" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {groups.map((group, gi) => (
            <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: gi ? 14 : 0 }}>
              {!collapsed && (
                <span style={{ padding: '0 10px 4px', fontSize: 11, fontWeight: 500, color: T.textFaint }}>{group.label}</span>
              )}
              {collapsed && gi > 0 && <span aria-hidden style={{ height: 1, margin: '0 8px 6px', background: T.hairline }} />}
              {group.modules.map((m) => (
                <NavItem
                  key={m.id}
                  module={m}
                  collapsed={collapsed}
                  active={!adminMode && isActive(m.id, activeModule)}
                  badge={m.badgeKey ? badges[m.badgeKey] : null}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          ))}
        </nav>
        {!collapsed && children}
      </div>

      <div style={{ flexShrink: 0, padding: collapsed ? 10 : 12, borderTop: `1px solid ${T.hairline}` }}>
        <div title={collapsed ? name : undefined} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? 0 : '8px 10px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          background: collapsed ? 'transparent' : T.panel, border: collapsed ? 'none' : `1px solid ${T.hairline}`,
          borderRadius: T.radiusLg,
        }}>
          <span aria-hidden style={{
            width: 30, height: 30, borderRadius: '50%', background: T.emphasisTint, color: T.emphasis, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600,
          }}>
            {initials}
          </span>
          {!collapsed && (
            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: T.fsGrid, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
              <span style={{ fontSize: 11, color: T.textMuted, textTransform: 'capitalize' }}>{(currentUser?.role || '').replace(/_/g, ' ')}</span>
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}

const railButton = {
  appearance: 'none', cursor: 'pointer', width: 30, height: 30, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid transparent', borderRadius: T.radius, background: 'transparent', color: T.textMuted,
};
