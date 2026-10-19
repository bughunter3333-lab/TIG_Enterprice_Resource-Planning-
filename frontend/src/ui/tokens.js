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
  // Chrome — the shell bar. SAP Horizon: white, with dark text.
  chrome: palette.ink,
  chromeRaised: palette.inkRaised,
  chromeHover: palette.inkHover,
  chromeText: palette.inkText,
  chromeTextMuted: palette.inkTextMuted,

  // Surfaces
  page: palette.paper,
  panel: palette.panel,
  panelAlt: palette.panelAlt,
  hairline: palette.hairline,
  hairlineSoft: palette.hairlineSoft,

  // Text
  text: palette.text,
  textMuted: palette.muted,
  textFaint: palette.faint,
  headerText: palette.headerText,

  // Accent — Horizon brand blue. Small words use accentStrong (5.2:1).
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

  // Density
  rowHeight: density.rowHeight,
  inputHeight: density.inputHeight,
  radius: density.radius,
  radiusLg: density.radiusLg,
  radiusField: density.radiusField,

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
// Coloured by phase, from SAP Fiori's indication palette (sap_horizon
// sapIndicationColor_N), so a colour says where a job is in its life rather
// than giving eleven statuses eleven hues. The word and the stage stepper
// carry the exact status. Semantic colours are kept for meaning:
//
//   Sales       QUOTE                        indication 7  violet
//   Production  New, ORDER, In Progress, PRINT  indication 5  blue
//               PROOF                        indication 3  orange — the one
//               production status where someone outside is holding things up
//   Fulfil      Pick/Pack, FINISH            indication 6  teal
//   Billing     INVOICE, PAID                positive green
//   Closed      CANCEL                       indication 10 grey
//
// 'In Progress' used to be the warning colour, so every job on the floor
// looked like a problem. All values pass 4.5:1 as text on white and as a fill
// behind white text.
export const STATUS_COLORS = {
  QUOTE: '#5d36ff',
  New: '#0064d9',
  ORDER: '#0064d9',
  'In Progress': '#0064d9',
  PROOF: '#b95100',
  PRINT: '#0064d9',
  'Pick/Pack': '#046c7a',
  FINISH: '#046c7a',
  INVOICE: '#256f3a',
  PAID: '#256f3a',
  CANCEL: '#45484a',
};

export function statusColor(status) {
  return STATUS_COLORS[status] ?? T.textMuted;
}
