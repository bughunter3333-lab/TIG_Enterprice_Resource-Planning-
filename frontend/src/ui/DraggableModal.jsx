/**
 * A modal the user can drag by its body.
 *
 * Lifted out of TotalImageERP.jsx unchanged: eleven modals rendered through it,
 * which made it the one piece none of them could be extracted without.
 *
 * The mousedown handler ignores anything interactive so a click on a control
 * inside the card does not start a drag; `data-no-drag` opts anything else out.
 */
import { useState, useRef } from 'react';

export default function DraggableModal({ onClose, children, cardClass = '', cardStyle = {}, overlayClass = '' }) {
  const [pos, setPos] = useState(null);
  const cardRef = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button,input,select,textarea,a,[role="option"],[data-no-drag]')) return;
    e.preventDefault();
    const rect = cardRef.current.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const onMove = (mv) => setPos({ x: mv.clientX - dragOffset.current.x, y: mv.clientY - dragOffset.current.y });
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  return (
    <div className={`fixed inset-0 bg-black/50 z-50 ${overlayClass}`} onClick={onClose}>
      <div
        ref={cardRef}
        className={`absolute bg-white rounded-xl shadow-2xl ${cardClass}`}
        style={pos
          ? { left: pos.x, top: pos.y, cursor: 'default', ...cardStyle }
          : { left: '50%', top: '50%', transform: 'translate(-50%,-50%)', cursor: 'default', ...cardStyle }
        }
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
      >
        {children}
      </div>
    </div>
  );
}
