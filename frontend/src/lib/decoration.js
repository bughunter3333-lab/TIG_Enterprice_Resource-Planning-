// Decoration methods and placements. Shared: the job editor offers them, the
// order-requirements surface groups by them, and the dashboard counts by them.
export const DEC_OPTIONS = [
  { v: 'None',   l: 'None',          emoji: '',    dot: 'bg-gray-300',    pill: 'bg-gray-100 text-gray-500 border-gray-200' },
  { v: 'EMB',    l: 'Embroidery',    emoji: '🧵', dot: 'bg-purple-500',  pill: 'bg-purple-50 text-purple-700 border-purple-200', codeKey: 'embCode', codeHolder: 'EMB code…', codeRing: 'focus:ring-blue-500 text-purple-700 border-purple-300', hasStitch: true },
  { v: 'TRS',    l: 'Transfer',      emoji: '♨️',  dot: 'bg-indigo-500',  pill: 'bg-indigo-50 text-indigo-700 border-indigo-200', codeKey: 'trsCode', codeHolder: 'TRS code…', codeRing: 'focus:ring-blue-500 text-indigo-700 border-indigo-300' },
  { v: 'Screen', l: 'Screen Print',  emoji: '🖨️',  dot: 'bg-blue-600',    pill: 'bg-blue-50 text-blue-800 border-blue-200', hasColors: true },
  { v: 'DTF',    l: 'DTF Print',     emoji: '🎨', dot: 'bg-teal-500',    pill: 'bg-teal-50 text-teal-700 border-teal-200', hasColors: true },
  { v: 'DTG',    l: 'DTG Print',     emoji: '👕', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', hasColors: true },
  { v: 'Sub',    l: 'Sublimation',   emoji: '🌈', dot: 'bg-pink-500',    pill: 'bg-pink-50 text-pink-700 border-pink-200', hasColors: true },
  { v: 'Pad',    l: 'Pad Print',     emoji: '🔵', dot: 'bg-blue-700',    pill: 'bg-blue-50 text-blue-800 border-blue-200', hasColors: true },
  { v: 'Laser',  l: 'Laser Engrave', emoji: '⚡',  dot: 'bg-red-500',     pill: 'bg-red-50 text-red-700 border-red-200' },
  { v: 'Vinyl',  l: 'Vinyl Cut',     emoji: '✂️',  dot: 'bg-green-500',   pill: 'bg-green-50 text-green-700 border-green-200' },
];

export const DEC_POSITIONS = ['Chest', 'Back', 'L.Sleeve', 'R.Sleeve', 'Cap Front', 'Cap Back', 'Hood', 'Pocket', 'Other'];
