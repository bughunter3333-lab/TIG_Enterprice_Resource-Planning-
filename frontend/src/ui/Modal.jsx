import { useEffect, useId } from 'react';
import { X } from 'lucide-react';
import { T } from './tokens';

export default function Modal({ title, onClose, width = 560, children, footer }) {
  const titleId = useId();
  // Known limitation: every open Modal closes on a single Escape press. If Phase 2
  // stacks modals (confirm-on-top-of-form), add a topmost-modal guard here first.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      // Scrim was rgba(24,24,27,..) — the old zinc chrome. Navy keeps the veil
      // in the same family as the elevation tokens.
      style={{ position: 'fixed', inset: 0, background: 'rgba(24,42,66,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '8vh', zIndex: 1000, fontFamily: T.font }}
    >
      {/* The one surface that genuinely floats above everything — it should
          out-elevate the in-flow grids, which already carry shadowSm. */}
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ background: T.panel, borderRadius: T.radiusLg, width, maxWidth: '94vw', maxHeight: '84vh', display: 'flex', flexDirection: 'column', border: `1px solid ${T.hairline}`, boxShadow: T.shadowMd }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${T.hairline}` }}>
          <div id={titleId} style={{ fontSize: T.fsBase, fontWeight: 700, color: T.text }}>{title}</div>
          <div style={{ flex: 1 }} />
          {/* A real <button> — it gets Enter/Space and the global
              :focus-visible ring for free, so the hand-rolled key handler and
              role/tabIndex are no longer needed. */}
          <button type="button" aria-label="Close" onClick={onClose}
            onMouseEnter={e => { e.currentTarget.style.background = T.hairlineSoft; e.currentTarget.style.color = T.text; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMuted; }}
            style={{ cursor: 'pointer', color: T.textMuted, display: 'flex', background: 'transparent', border: 'none', padding: 2, borderRadius: T.radius, transition: `background ${T.transition}, color ${T.transition}` }}>
            <X size={15} />
          </button>
        </div>
        <div style={{ padding: 14, overflowY: 'auto' }}>{children}</div>
        {footer && <div style={{ padding: '10px 14px', borderTop: `1px solid ${T.hairline}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{footer}</div>}
      </div>
    </div>
  );
}
