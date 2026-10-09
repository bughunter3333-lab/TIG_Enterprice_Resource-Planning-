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

const base = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px',
  borderRadius: T.radius, fontFamily: T.font, fontSize: T.fsBase, fontWeight: 600,
  cursor: 'pointer', whiteSpace: 'nowrap', transition: `background ${T.transition}, color ${T.transition}`,
};
const STYLES = {
  primary: { ...base, background: T.accent, color: T.panel, border: `1px solid ${T.accent}` },
  primaryHover: { background: T.accentStrong, borderColor: T.accentStrong },
  plain: { ...base, background: 'transparent', color: T.accentStrong, border: '1px solid transparent' },
  plainHover: { background: T.hairlineSoft },
};

function ActionButton({ action, onOpenMenu, menuOpen }) {
  const [hover, setHover] = useState(false);
  const Icon = action.icon;
  const kind = action.primary ? 'primary' : 'plain';
  const style = {
    ...STYLES[kind],
    ...(hover && !action.disabled ? STYLES[`${kind}Hover`] : null),
    ...(action.disabled ? { opacity: 0.4, cursor: 'not-allowed' } : null),
  };
  return (
    <button
      type="button"
      style={style}
      disabled={action.disabled}
      title={action.title}
      aria-haspopup={action.items ? 'menu' : undefined}
      aria-expanded={action.items ? menuOpen : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={action.items ? onOpenMenu : action.onClick}
    >
      {Icon && <Icon size={15} aria-hidden />}
      {action.label}
      {action.items && <ChevronDown size={14} aria-hidden />}
    </button>
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
      position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 60, minWidth: 240, padding: '4px 0',
      background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, boxShadow: T.shadowMd,
    }}>
      {items.map((item, i) => (item === null
        ? <div key={`sep-${i}`} role="separator" style={{ borderTop: `1px solid ${T.hairline}`, margin: '4px 0' }} />
        : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={() => { onClose(); item.onClick(); }}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '7px 14px', border: 'none',
              background: 'transparent', fontFamily: T.font, fontSize: T.fsBase, color: T.text, cursor: 'pointer',
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
    <header style={{
      display: 'flex', alignItems: 'center', gap: 16, minHeight: 52, padding: '8px 20px',
      background: T.panel, borderBottom: `1px solid ${T.hairline}`, flexShrink: 0, fontFamily: T.font,
    }}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.text, whiteSpace: 'nowrap' }}>{title}</h1>
      <div style={{ flex: 1 }} />
      <div role="toolbar" aria-label={`${title} actions`} style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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
