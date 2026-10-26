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
      // A neutral veil in the ink's own hue, light enough that the page behind
      // still says where you are.
      style={{ position: 'fixed', inset: 0, background: 'rgba(17,17,20,0.32)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '8vh', zIndex: 1000, fontFamily: T.font }}
    >
      {/* The one surface that genuinely floats above everything — it takes the
          deepest elevation the system has. */}
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ background: T.panel, borderRadius: T.radiusLg + 2, width, maxWidth: '94vw', maxHeight: '84vh', display: 'flex', flexDirection: 'column', border: `1px solid ${T.hairline}`, boxShadow: T.shadowPress }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${T.hairlineSoft}` }}>
          <div id={titleId} style={{ fontSize: T.fsSection, fontWeight: 600, letterSpacing: '-0.01em', color: T.text }}>{title}</div>
          <div style={{ flex: 1 }} />
          {/* A real <button> — it gets Enter/Space and the global
              :focus-visible ring for free, so the hand-rolled key handler and
              role/tabIndex are no longer needed. */}
          <button type="button" aria-label="Close" onClick={onClose}
            onMouseEnter={e => { e.currentTarget.style.background = T.hairlineSoft; e.currentTarget.style.color = T.text; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMuted; }}
            style={{ cursor: 'pointer', color: T.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'transparent', border: 'none', borderRadius: T.radius, transition: `background ${T.transition}, color ${T.transition}` }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto' }}>{children}</div>
        {footer && <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.hairlineSoft}`, background: T.panelAlt, borderRadius: `0 0 ${T.radiusLg + 2}px ${T.radiusLg + 2}px`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{footer}</div>}
      </div>
    </div>
  );
}
