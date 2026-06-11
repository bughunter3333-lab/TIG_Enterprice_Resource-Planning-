// Design tokens — single source of visual truth.
// Spec: docs/superpowers/specs/2026-06-11-ui-redesign-dense-jim2-design.md

export const T = {
  // Surfaces (zinc)
  chrome: '#18181b',
  chromeRaised: '#27272a',
  chromeHover: '#3f3f46',
  page: '#fafafa',
  panel: '#ffffff',
  hairline: '#e4e4e7',
  hairlineSoft: '#f4f4f5',

  // Text
  text: '#18181b',
  textMuted: '#71717a',
  textFaint: '#a1a1aa',
  headerText: '#52525b',
  chromeText: '#fafafa',
  chromeTextMuted: '#a1a1aa',

  // Accent (amber identity)
  accent: '#eab308',
  accentStrong: '#ca8a04',
  accentTint: '#fef9c3',
  accentFocus: '#fef08a',

  // Feedback
  danger: '#b91c1c',
  dangerTint: '#fef2f2',
  ok: '#15803d',
  okTint: '#dcfce7',

  // Type
  font: "'Segoe UI', system-ui, sans-serif",
  fsBase: 13,
  fsGrid: 12,
  fsHeader: 11,
  fsSmall: 11,

  // Density
  rowHeight: 30,
  inputHeight: 26,
  radius: 4,
};

// Real workflow statuses (verified against TotalImageERP.jsx).
export const STATUS_COLORS = {
  QUOTE: '#7c3aed',
  New: '#1d4ed8',
  ORDER: '#4f46e5',
  'In Progress': '#b45309',
  PROOF: '#9333ea',
  PRINT: '#c2410c',
  'Pick/Pack': '#0e7490',
  FINISH: '#15803d',
  INVOICE: '#0f766e',
  PAID: '#047857',
  CANCEL: T.textMuted,
};

export function statusColor(status) {
  return STATUS_COLORS[status] ?? T.textMuted;
}
