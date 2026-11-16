import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { T } from './tokens';

const menuItem = { padding: '7px 10px', fontSize: T.fsGrid, color: T.text, cursor: 'pointer', borderRadius: T.radius - 2 };

export default function FilterBar({ filters = [], available = [], onAdd, onRemove, right }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickedKey, setPickedKey] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setMenuOpen(false);
        setPickedKey(null);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setPickedKey(null);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const picked = available.find(a => a.key === pickedKey);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: T.font, flexWrap: 'wrap' }}>
      {filters.map(f => (
        // An applied filter is a pill: what it is, what it is set to, and a
        // way to take it off.
        <span key={f.key} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, height: 28,
          background: T.accentTint, border: `1px solid ${T.emphasisTint}`,
          borderRadius: 14, padding: '0 4px 0 10px', fontSize: T.fsSmall, color: T.text,
        }}>
          <span style={{ color: T.textMuted }}>{f.label}</span>
          <span style={{ fontWeight: 600 }}>{f.display ?? String(f.value)}</span>
          <span
            role="button"
            tabIndex={0}
            aria-label={`Remove ${f.label} filter`}
            onClick={() => onRemove(f.key)}
            onKeyDown={e => { if (e.key === 'Enter') onRemove(f.key); }}
            style={{ cursor: 'pointer', color: T.textMuted, display: 'inline-flex', padding: 3, borderRadius: 10 }}
            onMouseEnter={e => { e.currentTarget.style.color = T.danger; }}
            onMouseLeave={e => { e.currentTarget.style.color = T.textMuted; }}
          >
            <X size={12} aria-hidden />
          </span>
        </span>
      ))}

      <div ref={wrapRef} style={{ position: 'relative' }}>
        <span
          role="button"
          tabIndex={0}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => { setMenuOpen(o => !o); setPickedKey(null); }}
          onKeyDown={e => { if (e.key === 'Enter') { setMenuOpen(o => !o); setPickedKey(null); } }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, height: 28, padding: '0 10px',
            fontSize: T.fsSmall, color: T.textMuted, fontWeight: 500, cursor: 'pointer',
            border: `1px dashed ${T.fieldBorder}`, borderRadius: 14,
            transition: `color ${T.transition}, border-color ${T.transition}`,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.fieldBorderHover; }}
          onMouseLeave={e => { e.currentTarget.style.color = T.textMuted; e.currentTarget.style.borderColor = T.fieldBorder; }}
        >
          <Plus size={12} aria-hidden /> Filter
        </span>
        {menuOpen && (
          <div role="menu" style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50, padding: 4,
            background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radiusLg,
            minWidth: 160, boxShadow: T.shadowPress,
          }}>
            {!picked && available.filter(a => !filters.some(f => f.key === a.key)).map(a => (
              <div key={a.key} role="menuitem" tabIndex={0}
                onClick={() => setPickedKey(a.key)}
                onKeyDown={e => { if (e.key === 'Enter') setPickedKey(a.key); }}
                style={menuItem}
                onMouseEnter={e => e.currentTarget.style.background = T.hairlineSoft}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {a.label}
              </div>
            ))}
            {picked && (picked.options ?? []).map(o => (
              <div key={o.value} role="menuitem" tabIndex={0}
                onClick={() => { onAdd(picked.key, o.value); setMenuOpen(false); setPickedKey(null); }}
                onKeyDown={e => { if (e.key === 'Enter') { onAdd(picked.key, o.value); setMenuOpen(false); setPickedKey(null); } }}
                style={menuItem}
                onMouseEnter={e => e.currentTarget.style.background = T.hairlineSoft}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {o.label}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}
