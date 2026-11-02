import { T } from '../../ui/tokens';
import { appliesToChoices, appliesToValue } from './lineLinks';

/**
 * "Applies to" on a line of the job form (F02, F19): the garment line a
 * decoration or an alteration is done to. A line that names one is a service —
 * never bought, held, picked or shipped.
 */
export default function AppliesToSelect({ items, idx, onChange }) {
  const value = appliesToValue(items[idx]);
  const choices = appliesToChoices(items, idx);
  // A link to a line that is no longer a goods line on this job is shown as
  // none, which is what saving will send.
  const shown = choices.some(c => c.value === value) ? value : '';
  return (
    <label className="flex items-center gap-1 text-[10px] shrink-0" style={{ color: T.textFaint }}>
      Applies to
      <select value={shown} onChange={e => onChange(e.target.value)} aria-label={`Line ${idx + 1} applies to`}
        className="h-5 border border-hairline rounded px-1 text-[11px] text-muted focus:outline-none focus:ring-1 focus:ring-accent-focus bg-white"
        style={{ maxWidth: 220 }}>
        <option value="">— none —</option>
        {choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
    </label>
  );
}
