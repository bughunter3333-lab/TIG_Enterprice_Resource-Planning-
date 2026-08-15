// Design tokens — single source of visual truth.
// Spec: docs/superpowers/specs/2026-06-11-ui-redesign-dense-jim2-design.md

export const T = {
  // Surfaces — Jim2 business-standard: steel-blue chrome, neutral grey page,
  // white data panels. chrome sampled from the Jim2 title bar (#355172).
  chrome: '#2c4a6e',
  chromeRaised: '#375a83',
  chromeHover: '#42699a',
  page: '#f0f0f0',
  panel: '#ffffff',
  hairline: '#d0d7de',
  hairlineSoft: '#eef1f4',

  // Text
  text: '#1a1a1a',
  textMuted: '#5a6570',
  textFaint: '#8a949e',
  headerText: '#3d4753',
  chromeText: '#ffffff',
  chromeTextMuted: '#b8c7da',

  // Accent (Jim2 blue — selection, links, active tab)
  accent: '#2b7bd4',
  accentStrong: '#1c5fa8',
  accentTint: '#d6e7f7',
  accentFocus: '#9dc7ee',

  // Editable grid cell (Jim2 shows editable columns in yellow)
  editable: '#fefce8',

  // Feedback
  danger: '#b91c1c',
  dangerTint: '#fef2f2',
  ok: '#15803d',
  okTint: '#dcfce7',

  // Type — IBM Plex Sans for UI, IBM Plex Mono for IDs/SKUs/figures
  font: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
  fontMono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace",
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
