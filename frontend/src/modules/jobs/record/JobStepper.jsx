import { Check } from 'lucide-react';
import { T, statusColor } from '../../../ui/tokens';
import { lifecycleFor, stepIndex } from './lifecycle';

/**
 * Where the job is on its road: steps behind it are done, the current one is
 * ringed in its phase's colour, the rest are still ahead. A cancelled job has
 * left the road, and says so instead of drawing a stepper that means nothing.
 * An ordered list, so a screen reader hears "step 4 of 10, current".
 */
export default function JobStepper({ status }) {
  if (status === 'CANCEL') {
    return (
      <p style={{ margin: 0, fontSize: T.fsGrid, color: T.textMuted }}>
        Cancelled — this job is off the production road.
      </p>
    );
  }
  const steps = lifecycleFor(status);
  const at = stepIndex(status);
  const tone = statusColor(status);
  return (
    <ol aria-label="Job progress" style={{ display: 'flex', alignItems: 'center', margin: 0, padding: 0, listStyle: 'none', overflowX: 'auto', fontFamily: T.font }}>
      {steps.map((s, i) => {
        const done = i < at;
        const current = i === at;
        return (
          <li
            key={s.status}
            aria-current={current ? 'step' : undefined}
            style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? '1 1 0' : '0 0 auto', minWidth: 0 }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span aria-hidden style={{
                width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: done ? T.accent : T.panel,
                border: `1.5px solid ${done ? T.accent : current ? tone : T.fieldBorder}`,
                boxShadow: current ? `0 0 0 3px ${tone}22` : 'none',
              }}>
                {done && <Check size={10} color="#fff" strokeWidth={3} />}
                {current && <span style={{ width: 6, height: 6, borderRadius: '50%', background: tone }} />}
              </span>
              <span style={{
                fontSize: T.fsSmall, whiteSpace: 'nowrap',
                fontWeight: current ? 600 : 400,
                color: current ? T.text : done ? T.textMuted : T.textFaint,
              }}>
                {s.label}
              </span>
            </span>
            {i < steps.length - 1 && (
              <span aria-hidden style={{ flex: 1, minWidth: 12, height: 1.5, margin: '0 8px', background: done ? T.accent : T.hairline, borderRadius: 1 }} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
