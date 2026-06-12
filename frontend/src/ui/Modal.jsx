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
      style={{ position: 'fixed', inset: 0, background: 'rgba(24,24,27,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '8vh', zIndex: 1000, fontFamily: T.font }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ background: T.panel, borderRadius: T.radius + 2, width, maxWidth: '94vw', maxHeight: '84vh', display: 'flex', flexDirection: 'column', border: `1px solid ${T.hairline}` }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${T.hairline}` }}>
          <div id={titleId} style={{ fontSize: T.fsBase, fontWeight: 700, color: T.text }}>{title}</div>
          <div style={{ flex: 1 }} />
          <div role="button" tabIndex={0} aria-label="Close" onClick={onClose}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClose(); } }}
            style={{ cursor: 'pointer', color: T.textMuted, display: 'flex' }}>
            <X size={15} />
          </div>
        </div>
        <div style={{ padding: 14, overflowY: 'auto' }}>{children}</div>
        {footer && <div style={{ padding: '10px 14px', borderTop: `1px solid ${T.hairline}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{footer}</div>}
      </div>
    </div>
  );
}
