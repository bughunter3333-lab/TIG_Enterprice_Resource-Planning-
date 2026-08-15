import { useEffect, useRef, useState } from 'react';
import { T } from './tokens';

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
        <span key={f.key} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: T.hairlineSoft, border: `1px solid ${T.hairline}`,
          borderRadius: T.radius, padding: '2px 7px', fontSize: T.fsSmall, color: T.text,
        }}>
          {f.label}: {f.display ?? String(f.value)}
          <span
            role="button"
            tabIndex={0}
            aria-label={`Remove ${f.label} filter`}
            onClick={() => onRemove(f.key)}
            onKeyDown={e => { if (e.key === 'Enter') onRemove(f.key); }}
            style={{ cursor: 'pointer', color: T.textMuted, fontWeight: 700 }}
          >
            ✕
          </span>
        </span>
      ))}

      <div ref={wrapRef} style={{ position: 'relative' }}>
        <span
          role="button"
          tabIndex={0}
          onClick={() => { setMenuOpen(o => !o); setPickedKey(null); }}
          onKeyDown={e => { if (e.key === 'Enter') { setMenuOpen(o => !o); setPickedKey(null); } }}
          style={{ fontSize: T.fsSmall, color: T.accentStrong, fontWeight: 700, cursor: 'pointer', padding: '2px 4px' }}
        >
          + Filter
        </span>
        {menuOpen && (
          <div style={{
            position: 'absolute', top: '110%', left: 0, zIndex: 50,
            background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radiusLg,
            minWidth: 140, boxShadow: T.shadowMd,
          }}>
            {!picked && available.filter(a => !filters.some(f => f.key === a.key)).map(a => (
              <div key={a.key} role="button" tabIndex={0}
                onClick={() => setPickedKey(a.key)}
                onKeyDown={e => { if (e.key === 'Enter') setPickedKey(a.key); }}
                style={{ padding: '6px 10px', fontSize: T.fsGrid, color: T.text, cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = T.hairlineSoft}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {a.label}
              </div>
            ))}
            {picked && (picked.options ?? []).map(o => (
              <div key={o.value} role="button" tabIndex={0}
                onClick={() => { onAdd(picked.key, o.value); setMenuOpen(false); setPickedKey(null); }}
                onKeyDown={e => { if (e.key === 'Enter') { onAdd(picked.key, o.value); setMenuOpen(false); setPickedKey(null); } }}
                style={{ padding: '6px 10px', fontSize: T.fsGrid, color: T.text, cursor: 'pointer' }}
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
