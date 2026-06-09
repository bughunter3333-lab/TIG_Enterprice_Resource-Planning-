import React, { useEffect, useState } from 'react';
import { subscribe } from './notify';

function Toast({ toast, onClose }) {
  const { id, message, type = 'info' } = toast;
  return (
    <div className={`ti-toast ti-toast-${type}`} role="alert">
      <div className="ti-toast-message">{message}</div>
      <button className="ti-toast-close" onClick={() => onClose(id)}>✕</button>
    </div>
  );
}

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsub = subscribe(({ message, type = 'info', timeout = 6000 }) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, type }]);
      if (timeout > 0) {
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), timeout);
      }
    });
    return unsub;
  }, []);

  const handleClose = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <>
      {children}
      <div className="ti-toaster" aria-live="polite" style={containerStyle}>
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onClose={handleClose} />
        ))}
      </div>
      <style>{toastStyles}</style>
    </>
  );
}

const containerStyle = {
  position: 'fixed',
  right: 12,
  top: 12,
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const toastStyles = `
.ti-toaster { pointer-events: none; }
.ti-toast { pointer-events: auto; background: #111827; color: white; padding: 10px 14px; border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.2); min-width: 220px; display:flex; align-items:center; justify-content:space-between; }
.ti-toast .ti-toast-message { margin-right: 8px; }
.ti-toast.ti-toast-error { background: #b91c1c; }
.ti-toast.ti-toast-success { background: #065f46; }
.ti-toast-close { background: transparent; border: none; color: rgba(255,255,255,0.9); cursor: pointer; font-size: 12px; }
`;

export default NotificationProvider;
