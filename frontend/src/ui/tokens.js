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
  // Chrome — the machine. Was steel-blue (#2c4a6e); now ink.
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

  // Accent — process cyan. `accent` is 3.5:1 on white: fills, borders and large
  // text only. Anything small that carries words uses accentStrong (5.2:1).
  accent: palette.accent,
  accentStrong: palette.accentStrong,
  accentTint: palette.accentTint,
  accentFocus: palette.accentFocus,

  // Emphasis — process magenta. For the single most important thing on a
  // surface, and nothing else. If two things are emphasised, neither is.
  emphasis: palette.emphasis,
  emphasisTint: palette.emphasisTint,

  // Editable grid cell — Jim2 tints columns you can type into.
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
// These are learned: staff read the colour before the word, so they are not
// free to follow the brand. Two were changed and the rest were left alone.
//
//   New   was #1d4ed8, a blue close enough to ORDER's indigo that the two were
//         hard to separate at badge size. It takes the process cyan instead,
//         at the darker step so white text on it still passes.
//   PROOF was #9333ea, a purple sitting beside QUOTE's violet with the same
//         problem. It takes the press magenta, which is both distinguishable
//         and the one place the emphasis colour earns a permanent home —
//         PROOF is the status that means someone outside is waiting on you.
export const STATUS_COLORS = {
  QUOTE: '#7c3aed',
  New: palette.accentStrong,
  ORDER: '#4f46e5',
  'In Progress': palette.warn,
  PROOF: palette.emphasis,
  PRINT: '#c2410c',
  'Pick/Pack': '#0e7490',
  FINISH: palette.ok,
  INVOICE: '#0f766e',
  PAID: '#047857',
  CANCEL: palette.muted,
};

export function statusColor(status) {
  return STATUS_COLORS[status] ?? T.textMuted;
}
