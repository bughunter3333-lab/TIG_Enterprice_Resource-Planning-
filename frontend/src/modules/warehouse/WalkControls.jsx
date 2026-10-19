/**
 * The controls for walking an aisle, laid over the 3D view. Everything the
 * mouse does on the canvas — step on to a line, walk it, turn, go up and down
 * the levels, leave — is a button here, so it can be done from the keyboard
 * and on a touch screen.
 */
import { useEffect, useRef } from 'react';
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, CornerUpLeft, CornerUpRight, X } from 'lucide-react';
import { T } from '../../ui/tokens';
import Button from '../../ui/Button';
import { bayside } from './layout';
import { companiesAtBay } from './sections';

/** Where the walk has got to, in the words on the racking — and whose racking it is passing. */
export function walkWords(layout, aisleIndex, bays, sections) {
  const letter = layout.aisles[aisleIndex];
  if (!bays) return `Aisle ${letter}`;
  const beside = [bays.odd, bays.even].filter((bay) => bay != null).map((bay) => {
    const whose = companiesAtBay(sections, letter, bay);
    return `bay ${bay} on the ${bayside(layout, bay)}${whose.length ? ` (${whose.join(', ')})` : ''}`;
  });
  return `Aisle ${letter} · ${beside.join(', ')}`;
}

const PAD = [
  { kind: 'left', label: 'Turn left', Icon: CornerUpLeft },
  { kind: 'forward', label: 'Forward', Icon: ArrowUp },
  { kind: 'back', label: 'Back', Icon: ArrowDown },
  { kind: 'right', label: 'Turn right', Icon: CornerUpRight },
  { kind: 'up', label: 'Higher', Icon: ChevronsUp },
  { kind: 'down', label: 'Lower', Icon: ChevronsDown },
];

const aisleButton = (on) => ({
  minWidth: 28, height: 26, padding: '0 6px', cursor: 'pointer', fontFamily: T.font, fontSize: T.fsSmall, fontWeight: 700,
  borderRadius: T.radius, border: `1px solid ${on ? T.accentStrong : T.hairline}`,
  background: on ? T.accentStrong : T.panel, color: on ? '#fff' : T.text,
});

/** `walking` while an aisle is being walked; `aisleIndex` the aisle the eye is in, `bays` the bays it is level with. */
export default function WalkControls({ layout, walking, aisleIndex, bays, sections, onWalk, onNudge, onLeave }) {
  const aisles = useRef(null);
  const walked = useRef(null);
  // Leaving takes the Leave button (and the rest of the pad) away. If the
  // keyboard was on one of them, it goes to the button of the aisle just left.
  useEffect(() => {
    if (walking) { walked.current = aisleIndex; return; }
    const lost = !document.activeElement || document.activeElement === document.body;
    if (walked.current != null && lost) aisles.current?.querySelectorAll('button[aria-pressed]')[walked.current]?.focus();
    walked.current = null;
  }, [walking, aisleIndex]);

  return (
    <div style={{
      position: 'absolute', left: 12, top: 12, zIndex: 30, maxWidth: 'calc(100% - 24px)', padding: '6px 8px',
      display: 'grid', gap: 6, fontFamily: T.font, fontSize: T.fsSmall, color: T.text,
      background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, boxShadow: T.shadowSm,
    }}>
      <div ref={aisles} role="group" aria-label="Walk an aisle" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ color: T.textMuted, marginRight: 2 }}>Walk an aisle</span>
        {layout.aisles.map((aisle, i) => {
          const on = walking && aisleIndex === i;
          return (
            <button key={aisle} type="button" aria-label={`Aisle ${aisle}`} aria-pressed={on} onClick={() => onWalk(i)} style={aisleButton(on)}>
              {aisle}
            </button>
          );
        })}
        {walking && (
          <Button size="sm" variant="ghost" onClick={onLeave} style={{ marginLeft: 4 }}>
            <X size={13} aria-hidden />Leave aisle
          </Button>
        )}
      </div>
      {walking && (
        <>
          <p aria-live="polite" style={{ margin: 0, fontWeight: 700 }}>{walkWords(layout, aisleIndex, bays, sections)}</p>
          <div role="group" aria-label="Move along the aisle" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {PAD.map(({ kind, label, Icon }) => (
              <Button key={kind} size="sm" onClick={() => onNudge(kind)}>
                <Icon size={13} aria-hidden />{label}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
