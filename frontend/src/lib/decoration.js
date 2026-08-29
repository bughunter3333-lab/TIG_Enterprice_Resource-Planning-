// Decoration methods and placements. Shared: the job editor offers them, the
// order-requirements surface groups by them, and the dashboard counts by them.
export const DEC_OPTIONS = [
  { v: 'None',   l: 'None',          emoji: '',    dot: 'bg-hairline',    pill: 'bg-hairline-soft text-muted border-hairline' },
  { v: 'EMB',    l: 'Embroidery',    emoji: '🧵', dot: 'bg-emphasis',  pill: 'bg-emphasis-tint text-emphasis border-emphasis', codeKey: 'embCode', codeHolder: 'EMB code…', codeRing: 'focus:ring-accent-focus text-emphasis border-emphasis', hasStitch: true },
  { v: 'TRS',    l: 'Transfer',      emoji: '♨️',  dot: 'bg-accent-strong',  pill: 'bg-accent-tint text-accent-strong border-accent', codeKey: 'trsCode', codeHolder: 'TRS code…', codeRing: 'focus:ring-accent-focus text-accent-strong border-accent' },
  { v: 'Screen', l: 'Screen Print',  emoji: '🖨️',  dot: 'bg-accent-strong',    pill: 'bg-accent-tint text-accent-strong border-accent', hasColors: true },
  { v: 'DTF',    l: 'DTF Print',     emoji: '🎨', dot: 'bg-accent-strong',    pill: 'bg-accent-tint text-accent-strong border-accent', hasColors: true },
  { v: 'DTG',    l: 'DTG Print',     emoji: '👕', dot: 'bg-ok', pill: 'bg-ok-tint text-ok border-ok', hasColors: true },
  { v: 'Sub',    l: 'Sublimation',   emoji: '🌈', dot: 'bg-emphasis',    pill: 'bg-emphasis-tint text-emphasis border-emphasis', hasColors: true },
  { v: 'Pad',    l: 'Pad Print',     emoji: '🔵', dot: 'bg-accent-strong',    pill: 'bg-accent-tint text-accent-strong border-accent', hasColors: true },
  { v: 'Laser',  l: 'Laser Engrave', emoji: '⚡',  dot: 'bg-danger',     pill: 'bg-danger-tint text-danger border-danger' },
  { v: 'Vinyl',  l: 'Vinyl Cut',     emoji: '✂️',  dot: 'bg-ok',   pill: 'bg-ok-tint text-ok border-ok' },
];

export const DEC_POSITIONS = ['Chest', 'Back', 'L.Sleeve', 'R.Sleeve', 'Cap Front', 'Cap Back', 'Hood', 'Pocket', 'Other'];
