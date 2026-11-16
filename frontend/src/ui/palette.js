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
 * ── The direction (2026-10-25) ────────────────────────────────────────────
 *
 * A calm, modern product look (the owner's references: Humaplus, FlowAI, the
 * spline.one system) over Fiori's page structure, which stays. Spec:
 * docs/superpowers/specs/2026-10-25-calm-product-look.md.
 *
 *   - A near-neutral ground, white surfaces drawn with hairlines rather than
 *     shadows, and one blue that means "act" or "you are here".
 *   - Colour carries state, never decoration: the traffic light and the job's
 *     phase are the only other hues on a screen.
 *   - Geist for every word, Geist Mono for codes and IDs, tabular figures
 *     everywhere so a column of numbers lines up.
 *
 * It replaces the SAP Horizon values (2026-10-10). The key names are the app's
 * own and are kept because ~3,000 call sites read them; what changed is what
 * they hold.
 *
 *   ink     the top bar — white, with dark text
 *   rail    the sidebar: a second neutral, a step off the page
 *   paper   the page background behind cards and tables
 *   panel   cards, tables, record pages
 *   accent  the one blue; primary actions, links, selection, focus
 *   emphasis a deeper blue for the occasional single highlight
 *
 * ── Contrast (against white) ──────────────────────────────────────────────
 *
 *   text #111114 18.9:1 · muted #55575f 7.2:1 · faint #6e7079 4.9:1
 *   accent #0b63f6 5.1:1 · accentStrong #0a52cc 6.8:1
 *   ok #15803d 5.0:1 · warn #b45309 5.0:1 · danger #c0262d 5.9:1
 *
 * Every chip pairs one of those text colours with its own pale tint, so the
 * word passes 4.5:1 on the chip as well.
 */

export const palette = {
  // ── Top bar ────────────────────────────────────────────────────────────
  ink: '#ffffff',
  inkRaised: '#f7f7f8',
  inkHover: '#f0f0f2',
  inkText: '#111114',
  inkTextMuted: '#5d5f67',

  // ── Sidebar: the second neutral layer ──────────────────────────────────
  rail: '#fafafa',
  railHover: '#f0f0f2',

  // ── Ground and surfaces ────────────────────────────────────────────────
  paper: '#f5f5f6',
  panel: '#ffffff',
  panelAlt: '#fafafb',
  hairline: '#e4e4e7',
  hairlineSoft: '#efeff1',
  // A field's edge: a step darker than a card's, so an empty input still
  // reads as a place to type.
  fieldBorder: '#cfd0d5',
  fieldBorderHover: '#a1a3ab',

  // ── Text ───────────────────────────────────────────────────────────────
  text: '#111114',
  muted: '#55575f',
  faint: '#6e7079',
  headerText: '#111114',

  // ── Accent: the one blue ───────────────────────────────────────────────
  accent: '#0b63f6',
  accentStrong: '#0a52cc',
  accentTint: '#eef4ff',
  accentFocus: '#0a52cc',

  // ── Emphasis: a deeper blue, sparingly ─────────────────────────────────
  emphasis: '#0a52cc',
  emphasisTint: '#e3ecff',

  // ── Semantic ───────────────────────────────────────────────────────────
  ok: '#15803d',
  okTint: '#ecf8f0',
  warn: '#b45309',
  warnTint: '#fff5e8',
  danger: '#c0262d',
  dangerTint: '#fdeeee',

  // Editable grid cell: a faint blue keeps borderless in-grid cells
  // recognisably typeable.
  editable: '#f5f8ff',

  // Selected text: the browser draws it, but it is still part of the design.
  selection: '#d6e4ff',
};

/**
 * Density. Work grids are compact by default (32px rows) with a comfortable
 * step (40px) a person can switch to; fields are 32px, the size a pointer hits
 * without aiming. One corner language: 8px for controls and fields, 12px for
 * cards and panels, 6px for chips.
 */
export const density = {
  rowHeight: 32,
  rowHeightComfortable: 40,
  inputHeight: 32,
  radius: 8,
  radiusLg: 12,
  radiusField: 8,
  radiusSm: 6,
};

/**
 * Type — Geist for everything, Geist Mono where codes and IDs must align.
 * A tight scale (about 1.2 between steps): product screens have many type
 * elements, and wide contrast between them reads as noise.
 */
export const type = {
  font: "'Geist Variable', ui-sans-serif, system-ui, sans-serif",
  fontMono: "'Geist Mono Variable', ui-monospace, SFMono-Regular, monospace",
  fsBase: 14,
  fsGrid: 13,
  fsHeader: 12,
  fsSmall: 12,
  fsSection: 15,
  fsTitle: 20,
  fsKpi: 28,
};

/**
 * Elevation. Surfaces are drawn with hairlines; shadow is kept for what sits
 * above the page — a card's faint resting lift, a menu, a dialog.
 */
export const elevation = {
  shadowSm: '0 1px 2px rgba(17,17,20,.05)',
  shadowMd: '0 1px 2px rgba(17,17,20,.06), 0 4px 12px rgba(17,17,20,.06)',
  shadowHeader: 'inset 0 -1px 0 0 #e4e4e7',
  shadowChrome: 'inset 0 -1px 0 0 #e4e4e7',
  shadowPress: '0 2px 6px rgba(17,17,20,.08), 0 12px 32px rgba(17,17,20,.14)',
};

export const motion = {
  transition: '150ms cubic-bezier(.2,0,0,1)',
  spring: '240ms cubic-bezier(.16,1,.3,1)',
};
