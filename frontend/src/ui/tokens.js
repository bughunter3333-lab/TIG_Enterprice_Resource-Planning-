// Design tokens — the inline-style face of src/ui/palette.js.
//
// Every value here comes from palette.js, which tailwind.config.js also reads.
// That is the point: before, this object and the Tailwind colour utilities were
// two unrelated palettes, so changing a token moved 58% of the interface.
//
// The key names are unchanged from the steel-blue system on purpose. There are
// ~2,950 `T.*` references across the app and renaming them would have turned a
// palette change into a rename touching every file, which is how a design
// change becomes unreviewable.

import { palette, density, type, elevation, motion } from './palette';

export const T = {
  // Chrome — the top bar: white, with dark text.
  chrome: palette.ink,
  chromeRaised: palette.inkRaised,
  chromeHover: palette.inkHover,
  chromeText: palette.inkText,
  chromeTextMuted: palette.inkTextMuted,

  // The sidebar, a second neutral a step off the page.
  rail: palette.rail,
  railHover: palette.railHover,

  // Surfaces
  page: palette.paper,
  panel: palette.panel,
  panelAlt: palette.panelAlt,
  hairline: palette.hairline,
  hairlineSoft: palette.hairlineSoft,
  fieldBorder: palette.fieldBorder,
  fieldBorderHover: palette.fieldBorderHover,

  // Text
  text: palette.text,
  textMuted: palette.muted,
  textFaint: palette.faint,
  headerText: palette.headerText,

  // Accent — the one blue. It means "act" or "you are here", nothing else.
  accent: palette.accent,
  accentStrong: palette.accentStrong,
  accentTint: palette.accentTint,
  accentFocus: palette.accentFocus,

  // Emphasis — a deeper blue, for the single most important thing on a
  // surface, and nothing else. If two things are emphasised, neither is.
  emphasis: palette.emphasis,
  emphasisTint: palette.emphasisTint,

  // Editable grid cell — a faint tint marks borderless cells you can type into.
  editable: palette.editable,

  // Feedback — a full traffic light. These are information, not brand, and do
  // not follow the accent.
  danger: palette.danger,
  dangerTint: palette.dangerTint,
  warn: palette.warn,
  warnTint: palette.warnTint,
  ok: palette.ok,
  okTint: palette.okTint,

  // Type
  font: type.font,
  fontMono: type.fontMono,
  fsBase: type.fsBase,
  fsGrid: type.fsGrid,
  fsHeader: type.fsHeader,
  fsSmall: type.fsSmall,
  fsSection: type.fsSection,
  fsTitle: type.fsTitle,
  fsKpi: type.fsKpi,

  // Density
  rowHeight: density.rowHeight,
  rowHeightComfortable: density.rowHeightComfortable,
  inputHeight: density.inputHeight,
  radius: density.radius,
  radiusLg: density.radiusLg,
  radiusField: density.radiusField,
  radiusSm: density.radiusSm,

  // Elevation
  shadowSm: elevation.shadowSm,
  shadowMd: elevation.shadowMd,
  shadowHeader: elevation.shadowHeader,
  shadowChrome: elevation.shadowChrome,
  shadowPress: elevation.shadowPress,

  // Motion — short and functional; clarifies a state change, never decorates.
  transition: motion.transition,
  spring: motion.spring,
};

// Workflow statuses, in the order a job moves through them.
//
// Coloured by phase, so a colour says where a job is in its life rather than
// giving twelve statuses twelve hues. The word carries the exact status. Each
// phase has a text colour and the pale tint its chip sits on (both pairs pass
// 4.5:1, and the text colour also carries white words as a fill):
//
//   Intake      QUOTE, New                   violet — nobody has committed yet;
//               New is a portal order waiting to be confirmed (F11), so it
//               sits with the quote rather than the work
//   Production  ORDER, In Progress, PRINT    blue
//               PROOF                        amber — the one production status
//               where someone outside is holding things up
//   Fulfil      Pick/Pack, Desp/Ready, FINISH teal
//   Billing     INVOICE, PAID                green
//   Closed      CANCEL                       grey
// `onDark` is the same phase lifted for the one dark surface (Home's work in
// hand): the text colours above sink into a near-black ground.
const PHASES = {
  intake:     { color: '#6d28d9', tint: '#f3effe', onDark: '#b69cf7' },
  production: { color: '#0b63f6', tint: '#eef4ff', onDark: '#6ea2ff' },
  waiting:    { color: '#b45309', tint: '#fff5e8', onDark: '#f2b056' },
  fulfil:     { color: '#0f766e', tint: '#e8f6f4', onDark: '#4fd1c1' },
  billing:    { color: '#15803d', tint: '#ecf8f0', onDark: '#5fd38a' },
  closed:     { color: '#52525b', tint: '#f1f1f3', onDark: '#a1a1aa' },
};

const STATUS_PHASE = {
  QUOTE: 'intake',
  New: 'intake',
  ORDER: 'production',
  'In Progress': 'production',
  PROOF: 'waiting',
  PRINT: 'production',
  'Pick/Pack': 'fulfil',
  'Desp/Ready': 'fulfil',
  FINISH: 'fulfil',
  INVOICE: 'billing',
  PAID: 'billing',
  CANCEL: 'closed',
};

export const STATUS_COLORS = Object.fromEntries(
  Object.entries(STATUS_PHASE).map(([status, phase]) => [status, PHASES[phase].color]),
);

export function statusColor(status) {
  return STATUS_COLORS[status] ?? T.textMuted;
}

export function statusTint(status) {
  return PHASES[STATUS_PHASE[status]]?.tint ?? T.hairlineSoft;
}

export function statusOnDark(status) {
  return PHASES[STATUS_PHASE[status]]?.onDark ?? '#a1a1aa';
}
