import { useEffect, useRef, useState } from 'react';
import Button from '../../ui/Button';
import { T } from '../../ui/tokens';

// The codes on TIG's labels (Code 128) and on garment swing tags (EAN, UPC).
const FORMATS = ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'];
const LOOK_EVERY_MS = 250;
// The same code held in front of the camera is one scan, not five.
const SAME_CODE_MS = 1500;

/** Whether this browser reads barcodes from the camera itself (Chrome on Android does). */
export const cameraScanAvailable = () =>
  typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

/**
 * The phone's camera as a scanner: no app to install, no library — the
 * browser's own barcode reader. Each code read is handed to `onCode`; the
 * camera stops the moment this closes.
 */
export default function CameraScanner({ onCode, onClose }) {
  const video = useRef(null);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    let stream;
    let timer;
    let last = { code: null, at: 0 };
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return;
        video.current.srcObject = stream;
        await video.current.play();
        const detector = new window.BarcodeDetector({ formats: FORMATS });
        timer = setInterval(async () => {
          try {
            const [found] = await detector.detect(video.current);
            if (!found?.rawValue) return;
            const now = Date.now();
            if (found.rawValue === last.code && now - last.at < SAME_CODE_MS) return;
            last = { code: found.rawValue, at: now };
            navigator.vibrate?.(60);
            onCode(found.rawValue);
          } catch { /* a frame it could not read; the next one may */ }
        }, LOOK_EVERY_MS);
      } catch (e) {
        setProblem(e?.name === 'NotAllowedError'
          ? 'The camera was not allowed. Allow it in the browser, or use a scanner or type the code.'
          : 'The camera could not be started. Use a scanner or type the code.');
      }
    })();
    return () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onCode]);

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {problem
        ? <p role="alert" style={{ margin: 0, color: T.danger, fontSize: T.fsBase }}>{problem}</p>
        : (
          // A muted, inline video: the camera's picture to aim with, nothing to hear.
          <video ref={video} muted playsInline aria-label="Camera — point it at a barcode" style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: T.radius, background: '#000' }} />
        )}
      <Button onClick={onClose} style={{ height: 44 }}>Stop the camera</Button>
    </div>
  );
}
