import { useId, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import { T } from '../../ui/tokens';
import { NOT_IN_SCREENSHOT, imageToDataUrl } from './screenshot';

const TITLES = {
  crash: 'Report this crash',
  server_error: 'Report this error',
  error: 'Report this error',
  report: 'Report a problem',
};

/**
 * What the person says about it, and the picture: taken automatically as the
 * dialog opened (`shot`: a data URL, null for none, 'pending' while it is
 * taken), or pasted (Ctrl+V) or attached instead. Nothing else is asked —
 * the steps, the browser and the build go with it on their own.
 */
export default function ReportDialog({ kind, message, shot, busy, error, onSend, onClose }) {
  const [words, setWords] = useState('');
  const [picture, setPicture] = useState(undefined); // undefined: the automatic one
  const [pictureError, setPictureError] = useState(null);
  const fileRef = useRef(null);
  const wordsId = useId();
  const current = picture === undefined ? shot : picture;
  // A problem with no crash behind it says nothing on its own: it needs words.
  const needsWords = kind === 'report' && !words.trim();

  const takeFile = async (file) => {
    setPictureError(null);
    try {
      setPicture(await imageToDataUrl(file));
    } catch (e) {
      setPictureError(e.message);
    }
  };

  const onPaste = (e) => {
    const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      takeFile(file);
    }
  };

  return (
    <div {...{ [NOT_IN_SCREENSHOT]: '' }} onPaste={onPaste}>
      <Modal
        title={TITLES[kind] ?? TITLES.report}
        onClose={onClose}
        width={600}
        footer={(
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              disabled={busy || needsWords || current === 'pending'}
              onClick={() => onSend({ description: words.trim(), screenshot: current === 'pending' ? null : current })}
            >
              {busy ? 'Sending…' : 'Send report'}
            </Button>
          </>
        )}
      >
        {message && (
          <p style={{ margin: '0 0 12px', padding: '8px 10px', background: T.panelAlt, borderRadius: T.radius, fontFamily: T.fontMono, fontSize: T.fsSmall, color: T.textMuted, overflowWrap: 'anywhere' }}>
            {message}
          </p>
        )}
        <label htmlFor={wordsId} style={{ display: 'block', fontSize: T.fsSmall, color: T.textMuted, marginBottom: 4 }}>
          What were you doing{kind === 'report' ? ', and what went wrong?' : '? (optional)'}
        </label>
        <textarea
          id={wordsId}
          value={words}
          maxLength={4000}
          rows={4}
          onChange={(e) => setWords(e.target.value)}
          placeholder="e.g. I changed the quantity on line 2 and pressed Save"
          style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '8px 10px', fontFamily: T.font, fontSize: T.fsBase, color: T.text, border: `1px solid ${T.hairline}`, borderRadius: T.radiusField }}
        />

        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: T.fsSmall, color: T.textMuted, flex: 1 }}>
              Screenshot {current && current !== 'pending' ? '' : '— paste one with Ctrl+V, or attach it'}
            </span>
            <Button size="sm" onClick={() => fileRef.current?.click()}><ImagePlus size={14} aria-hidden />{current && current !== 'pending' ? 'Replace' : 'Attach'}</Button>
            {current && current !== 'pending' && (
              <Button size="sm" variant="ghost" onClick={() => setPicture(null)}><Trash2 size={14} aria-hidden />Remove</Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              aria-label="Attach a screenshot"
              onChange={(e) => { if (e.target.files?.[0]) takeFile(e.target.files[0]); e.target.value = ''; }}
            />
          </div>
          {current === 'pending' && (
            <p role="status" style={{ margin: 0, fontSize: T.fsSmall, color: T.textMuted }}>Taking a picture of the screen…</p>
          )}
          {current && current !== 'pending' && (
            <img
              src={current}
              alt="The screenshot that will be sent"
              style={{ display: 'block', maxWidth: '100%', maxHeight: 260, objectFit: 'contain', border: `1px solid ${T.hairline}`, borderRadius: T.radius }}
            />
          )}
          {pictureError && <p role="alert" style={{ margin: '6px 0 0', fontSize: T.fsSmall, color: T.danger }}>{pictureError}</p>}
        </div>

        <p style={{ margin: '14px 0 0', fontSize: T.fsSmall, color: T.textMuted, lineHeight: 1.5 }}>
          Sent with it: the last steps you took in the app, the screen you were on, your browser and the app’s version. Only admins read reports.
        </p>
        {error && <p role="alert" style={{ margin: '10px 0 0', fontSize: T.fsSmall, color: T.danger }}>{error}</p>}
      </Modal>
    </div>
  );
}
