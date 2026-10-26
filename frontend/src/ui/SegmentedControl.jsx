import { T } from './tokens';

/**
 * A small set of mutually exclusive views — List / Board, Day / Week / Month —
 * as one control: a grey track with the chosen option raised in white. A
 * radiogroup, so arrow keys move the choice the way a screen reader expects.
 */
export default function SegmentedControl({ options, value, onChange, label, size = 'md' }) {
  const height = size === 'sm' ? 28 : 32;
  const move = (e, index) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = options[(index + step + options.length) % options.length];
    onChange(next.value);
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2, padding: 2, height,
        background: T.hairlineSoft, border: `1px solid ${T.hairline}`, borderRadius: T.radius,
        fontFamily: T.font, boxSizing: 'border-box',
      }}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.ariaLabel}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => move(e, i)}
            style={{
              appearance: 'none', font: 'inherit', cursor: 'pointer',
              height: '100%', padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 5,
              border: on ? `1px solid ${T.hairline}` : '1px solid transparent',
              borderRadius: T.radius - 2,
              background: on ? T.panel : 'transparent',
              boxShadow: on ? T.shadowSm : 'none',
              color: on ? T.text : T.textMuted,
              fontSize: T.fsSmall, fontWeight: on ? 600 : 500,
              transition: `background ${T.transition}, color ${T.transition}`,
            }}
          >
            {Icon && <Icon size={13} aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
