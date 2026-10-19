/**
 * Admin: describe the racking. Saved per branch as the admin setting
 * `warehouse_layout:<branch>`, so every screen draws the same building.
 */
import { useState } from 'react';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import { T } from '../../ui/tokens';
import { LEVEL_LETTERS, levelCount, validateLayout } from './layout';

const field = {
  height: 28, padding: '0 8px', fontFamily: T.font, fontSize: T.fsBase, width: '100%',
  border: `1px solid ${T.textMuted}`, borderRadius: T.radiusField, background: T.panel, color: T.text,
};
const labelStyle = { fontSize: T.fsSmall, color: T.textMuted, display: 'block', marginBottom: 4 };

export default function LayoutDialog({ layout, branch, onSave, onClose }) {
  const [draft, setDraft] = useState({
    aisles: layout.aisles.join(', '),
    baysPerAisle: String(layout.baysPerAisle),
    beams: layout.beams.join(', '),
    positions: String(layout.positions),
    excessShelf: layout.excessShelf,
    oddSide: layout.oddSide,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const candidate = {
    aisles: draft.aisles.split(/[\s,]+/).filter(Boolean),
    baysPerAisle: Number(draft.baysPerAisle),
    beams: draft.beams.split(/[\s,]+/).filter(Boolean).map(Number),
    positions: Number(draft.positions),
    excessShelf: draft.excessShelf,
    oddSide: draft.oddSide,
  };
  const { errors } = validateLayout(candidate);
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    setError('');
    try {
      await onSave(validateLayout(candidate).layout);
      onClose();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  const levels = errors.length ? 0 : levelCount(candidate);
  const levelWords = levels ? `levels A–${LEVEL_LETTERS[levels - 1]}` : 'check the numbers';

  return (
    <Modal
      title={`Racking layout — ${branch}`}
      onClose={onClose}
      width={520}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving || errors.length > 0}>
            {saving ? 'Saving…' : 'Save layout'}
          </Button>
        </>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="ly-aisles" style={labelStyle}>Aisles, left to right standing at receiving</label>
          <input id="ly-aisles" style={field} value={draft.aisles} onChange={set('aisles')} />
        </div>
        <div>
          <label htmlFor="ly-bays" style={labelStyle}>Bays per aisle</label>
          <input id="ly-bays" type="number" min={1} style={field} value={draft.baysPerAisle} onChange={set('baysPerAisle')} />
        </div>
        <div>
          <label htmlFor="ly-odd" style={labelStyle}>Odd bays are on the</label>
          <select id="ly-odd" style={field} value={draft.oddSide} onChange={set('oddSide')}>
            <option value="right">Right, walking up from receiving</option>
            <option value="left">Left, walking up from receiving</option>
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="ly-beams" style={labelStyle}>Rows of boxes on each beam, floor to top ({levelWords})</label>
          <input id="ly-beams" style={field} value={draft.beams} onChange={set('beams')} placeholder="3, 3, 3, 4" />
        </div>
        <div>
          <label htmlFor="ly-pos" style={labelStyle}>Boxes across each level</label>
          <input id="ly-pos" type="number" min={1} style={field} value={draft.positions} onChange={set('positions')} />
        </div>
        <label style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', fontSize: T.fsBase, color: T.text }}>
          <input type="checkbox" checked={draft.excessShelf} onChange={(e) => setDraft((d) => ({ ...d, excessShelf: e.target.checked }))} />
          Orange beam closes the top row, with an open shelf above it for excess boxes
        </label>
      </div>
      {errors.length > 0 && (
        <ul role="alert" style={{ margin: '12px 0 0', paddingLeft: 18, color: T.danger, fontSize: T.fsSmall }}>
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      {error && <p role="alert" style={{ color: T.danger, fontSize: T.fsSmall, marginTop: 12 }}>Couldn't save: {error}</p>}
    </Modal>
  );
}
