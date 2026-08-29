/**
 * The single source of colour for the whole application.
 *
 * This file exists because there were two palettes. `tokens.js` held the design
 * system and was read through inline `style` props, while every Tailwind colour
 * utility in the app — 2,155 of them — resolved against Tailwind's stock
 * palette instead, which the theme never overrode. Changing a token therefore
 * moved 58% of the interface and left the rest on the old colours.
 *
 * Both now read from here: `tailwind.config.js` spreads these into
 * `theme.extend.colors`, so `bg-panel` and `text-muted` are real utilities, and
 * `tokens.js` builds the `T` object from the same values for the inline-style
 * call sites. One change, one effect, everywhere.
 *
 * ── The direction ─────────────────────────────────────────────────────────
 *
 * "Press room", carried inward from the sign-in screen. The business puts ink
 * and thread onto garments, so the interface is built from the press floor
 * rather than from generic business software:
 *
 *   ink     the machine — chrome, top bar, nav, primary text
 *   paper   warm newsprint stock, the ground everything sits on
 *   panel   the sheet being worked on; stays pure white so data reads cleanly
 *   accent  process cyan, the live ink
 *   emphasis process magenta, used sparingly for the one thing that matters
 *
 * Semantic colour is deliberately separate from brand colour. `ok`, `warn` and
 * `danger` are a traffic light and mean the same thing on every surface; they
 * are not free to follow the brand, because a job status is information rather
 * than decoration.
 *
 * ── Contrast ──────────────────────────────────────────────────────────────
 *
 * Ratios below are against `panel` (#ffffff) unless stated. `accent` is 3.5:1,
 * which passes for graphics and large text but NOT for body copy — use
 * `accentStrong` (5.2:1) wherever cyan carries words. `faint` is 3.4:1 and is
 * for non-essential text only; anything a user must read uses `muted` or above.
 */

export const palette = {
  // ── Chrome: the machine ────────────────────────────────────────────────
  ink: '#17171c',
  inkRaised: '#23232b',
  inkHover: '#2f2f39',
  inkText: '#ffffff',
  inkTextMuted: '#a8a8b8',

  // ── Ground and surfaces ────────────────────────────────────────────────
  paper: '#f1eee8',
  panel: '#ffffff',
  panelAlt: '#faf8f4',
  hairline: '#d8d3c8',
  hairlineSoft: '#ebe7de',

  // ── Text ───────────────────────────────────────────────────────────────
  text: '#1a1a1f',
  muted: '#5c5c66',
  faint: '#8d8d99',
  headerText: '#3a3a44',

  // ── Accent: process cyan ───────────────────────────────────────────────
  accent: '#0090c8',
  accentStrong: '#00719e',
  accentTint: '#d9f0fa',
  accentFocus: '#7fcbe8',

  // ── Emphasis: process magenta. One thing at a time. ────────────────────
  emphasis: '#c8006b',
  emphasisTint: '#fce4f1',

  // ── Semantic traffic light ─────────────────────────────────────────────
  ok: '#15803d',
  okTint: '#dcf5e4',
  warn: '#b45309',
  warnTint: '#fdf0d5',
  danger: '#c8102e',
  dangerTint: '#fdeaec',

  // Editable grid cell. Jim2 tints columns you can type into; the tint is
  // warmed here so it sits on paper rather than glowing against it.
  editable: '#fdf9e3',
};

/**
 * Density. The brief was to relax slightly: larger targets and more room to
 * read, paid for with a few rows per screen. Row height moves 30 → 33 and the
 * grid type 12 → 13, which at 1080p costs roughly three rows on a full-height
 * list and buys a noticeably calmer surface for someone reading it all day.
 */
export const density = {
  rowHeight: 33,
  inputHeight: 29,
  radius: 5,
  radiusLg: 8,
};

/**
 * Type. Archivo carries the UI: it is a grotesque with a large x-height and a
 * narrow set width, so it holds more characters per column than IBM Plex Sans
 * at the same size while reading better at 13px. IBM Plex Mono stays for
 * anything that must align in a column — SKUs, job numbers, money, dates.
 */
export const type = {
  font: "'Archivo', ui-sans-serif, system-ui, sans-serif",
  fontMono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace",
  fsBase: 14,
  fsGrid: 13,
  fsHeader: 11,
  fsSmall: 11.5,
};

/**
 * Elevation, tinted with the chrome ink rather than pure black — black shadows
 * go muddy on a warm ground. Depth separates layers; it is not decoration, and
 * density is never traded for it.
 */
export const elevation = {
  shadowSm: '0 1px 2px rgba(23,23,28,.07), 0 1px 1px rgba(23,23,28,.04)',
  shadowMd: '0 2px 8px rgba(23,23,28,.11), 0 1px 2px rgba(23,23,28,.06)',
  shadowHeader: '0 3px 5px -2px rgba(23,23,28,.10)',
  shadowChrome: '0 1px 3px rgba(23,23,28,.30)',
  shadowPress: '3px 3px 0 rgba(23,23,28,.85)',
};

export const motion = {
  transition: '120ms cubic-bezier(.4,0,.2,1)',
  spring: '340ms cubic-bezier(.32,.72,0,1)',
};
