/**
 * The page header — SAP Fiori's title plus header toolbar.
 *
 * It replaces the Jim2 ribbon, which carried 135 buttons across the modules
 * and 97 of them did nothing (permanently disabled, or with no handler at
 * all). Only actions that work are passed in here. One is the page's primary
 * action and is emphasized; the rest are Fiori "transparent" buttons; an
 * action with `items` opens a menu.
 *
 * action: { key, label, icon?, onClick?, primary?, disabled?, title?, items? }
 * menu item: { label, onClick } or null for a separator
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { T } from '../tokens';
import Button from '../Button';

// The page's primary action is the one blue button; the rest are quiet white
// buttons, so the eye finds what the page is for.
function ActionButton({ action, onOpenMenu, menuOpen }) {
  const Icon = action.icon;
  return (
    <Button
      variant={action.primary ? 'primary' : 'secondary'}
      disabled={action.disabled}
      title={action.title}
      aria-haspopup={action.items ? 'menu' : undefined}
      aria-expanded={action.items ? menuOpen : undefined}
      onClick={action.items ? onOpenMenu : action.onClick}
    >
      {Icon && <Icon size={14} aria-hidden />}
      {action.label}
      {action.items && <ChevronDown size={13} aria-hidden />}
    </Button>
  );
}

function Menu({ items, onClose, label }) {
  const ref = useRef(null);
  useEffect(() => {
    const first = ref.current?.querySelector('[role="menuitem"]');
    first?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const all = [...ref.current.querySelectorAll('[role="menuitem"]')];
      const i = all.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % all.length : (i - 1 + all.length) % all.length;
      all[next]?.focus();
    };
    const onDown = (e) => { if (!ref.current?.parentElement?.contains(e.target)) onClose(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  return (
    <div ref={ref} role="menu" aria-label={label} style={{
      position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 60, minWidth: 240, padding: 4,
      background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radiusLg, boxShadow: T.shadowPress,
    }}>
      {items.map((item, i) => (item === null
        ? <div key={`sep-${i}`} role="separator" style={{ borderTop: `1px solid ${T.hairlineSoft}`, margin: '4px 0' }} />
        : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={() => { onClose(); item.onClick(); }}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', borderRadius: T.radius - 2,
              background: 'transparent', fontFamily: T.font, fontSize: T.fsGrid, color: T.text, cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.hairlineSoft; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            onFocus={(e) => { e.currentTarget.style.background = T.hairlineSoft; }}
            onBlur={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            {item.label}
          </button>
        )))}
    </div>
  );
}

export default function ActionBar({ title, actions = [] }) {
  const [openKey, setOpenKey] = useState(null);
  return (
    // On the page's own ground, not a white bar: the title belongs to the page,
    // and the cards below are the surfaces.
    <header style={{
      display: 'flex', alignItems: 'center', gap: 16, minHeight: 40, margin: '0 0 16px',
      flexShrink: 0, fontFamily: T.font,
    }}>
      <h1 style={{ margin: 0, fontSize: T.fsTitle + 2, fontWeight: 600, letterSpacing: '-0.02em', color: T.text, whiteSpace: 'nowrap' }}>{title}</h1>
      <div style={{ flex: 1 }} />
      <div role="toolbar" aria-label={`${title} actions`} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {actions.map((a) => (
          <div key={a.key} style={{ position: 'relative' }}>
            <ActionButton action={a} menuOpen={openKey === a.key} onOpenMenu={() => setOpenKey((k) => (k === a.key ? null : a.key))} />
            {a.items && openKey === a.key && <Menu items={a.items} label={a.label} onClose={() => setOpenKey(null)} />}
          </div>
        ))}
      </div>
    </header>
  );
}
