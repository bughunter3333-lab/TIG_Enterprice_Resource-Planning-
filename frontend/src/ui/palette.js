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
 * SAP S/4HANA — the SAP Fiori "Horizon" theme (2026-10-10, the owner's call:
 * "we do not need any backdated looking ERP"). Every value below is taken from
 * SAP's own open-source theme package, @sap-theming/theming-base-content
 * (Apache-2.0), file content/Base/baseLib/sap_horizon/css_variables.css; the
 * SAP variable each one comes from is named beside it, so a later Horizon
 * release can be followed by diffing that file. No SAP logos or marks are used.
 *
 * The key names are the app's own and predate this theme (`ink` is the shell,
 * `paper` the page). They are kept because ~3,000 call sites read them; what
 * changed is what they hold.
 *
 *   ink     the shell bar — white in Horizon, with dark text
 *   paper   the page background behind cards and tables
 *   panel   cards, tables, object pages
 *   accent  the brand blue; links, primary buttons, selection
 *   emphasis a second, deeper blue for the occasional highlight
 *
 * Semantic colour stays separate from brand colour: `ok`, `warn` and `danger`
 * are Fiori's positive / critical / negative and mean the same on every
 * surface. The *text* variants are used, because Horizon's critical orange
 * (#e76500) is only 3:1 on white and cannot carry small words.
 *
 * ── Contrast (against white) ──────────────────────────────────────────────
 *
 *   text #131e29 16:1 · muted #556b82 5.4:1 · faint #5b738b 4.9:1
 *   accentStrong #0064d9 5.2:1 · accent #0070f2 4.6:1
 *   ok #256f3a 6.3:1 · warn #b44f00 4.9:1 · danger #aa0808 8.2:1
 *   focus #0032a5 9.8:1 — the old cyan ring was 1.8:1 and failed WCAG 2.2.
 */

export const palette = {
  // ── Shell bar ──────────────────────────────────────────────────────────
  ink: '#ffffff',          // sapShellColor
  inkRaised: '#f5f6f7',    // sapBackgroundColor
  inkHover: '#eaecee',     // sapButton_Hover_Background
  inkText: '#131e29',      // sapShell_TextColor
  inkTextMuted: '#556b82', // sapContent_LabelColor

  // ── Ground and surfaces ────────────────────────────────────────────────
  paper: '#f5f6f7',        // sapBackgroundColor
  panel: '#ffffff',        // sapBaseColor / sapTile_Background
  panelAlt: '#f5f6f7',     // sapList_AlternatingBackground
  hairline: '#d9d9d9',     // sapGroup_ContentBorderColor
  hairlineSoft: '#eaecee', // sapList_Hover_Background

  // ── Text ───────────────────────────────────────────────────────────────
  text: '#131e29',         // sapTextColor
  muted: '#556b82',        // sapContent_LabelColor
  faint: '#5b738b',        // sapAccentColor10
  headerText: '#131e29',   // sapGroup_TitleTextColor

  // ── Accent: brand blue ─────────────────────────────────────────────────
  accent: '#0070f2',       // sapBrandColor
  accentStrong: '#0064d9', // sapLinkColor / sapHighlightColor
  accentTint: '#ebf8ff',   // sapList_SelectionBackgroundColor
  accentFocus: '#0032a5',  // sapContent_FocusColor

  // ── Emphasis: a deeper blue, sparingly ─────────────────────────────────
  emphasis: '#0057d2',     // sapAccentColor6
  emphasisTint: '#d1efff', // sapAccentBackgroundColor6

  // ── Semantic ───────────────────────────────────────────────────────────
  ok: '#256f3a',           // sapPositiveTextColor
  okTint: '#f5fae5',       // sapSuccessBackground
  warn: '#b44f00',         // sapCriticalTextColor
  warnTint: '#fff8d6',     // sapWarningBackground
  danger: '#aa0808',       // sapNegativeTextColor
  dangerTint: '#ffeaf4',   // sapErrorBackground

  // Editable grid cell. Fiori fields are white with a border; this faint
  // blue keeps borderless in-grid cells recognisably typeable.
  editable: '#f2f8ff',
};

/**
 * Density — Fiori "compact", the desktop content density S/4HANA uses: 2rem
 * rows, 1.625rem fields. Corners follow Horizon: .5rem for buttons and most
 * controls (sapButton_BorderCornerRadius), .75rem for cards and panels
 * (sapElement_BorderCornerRadius), .25rem for input fields.
 */
export const density = {
  rowHeight: 32,
  inputHeight: 26,
  radius: 8,
  radiusLg: 12,
  radiusField: 4,
};

/**
 * Type — SAP 72 for everything, 72 Mono where figures and codes must align.
 * Sizes follow Fiori: 14px body (sapFontSize), 12px small (sapFontSmallSize),
 * and nothing anyone reads below 12px.
 */
export const type = {
  font: "'72', '72full', Arial, Helvetica, sans-serif",
  fontMono: "'72Mono', ui-monospace, SFMono-Regular, monospace",
  fsBase: 14,
  fsGrid: 13,
  fsHeader: 12,
  fsSmall: 12,
};

/**
 * Elevation — Horizon's shadows, tinted with its slate (rgba(34,53,72)).
 */
export const elevation = {
  shadowSm: '0 0 0.125rem 0 rgba(34,53,72,.2), 0 0.125rem 0.25rem 0 rgba(34,53,72,.2)',      // sapContent_Shadow0
  shadowMd: '0 0 0 0.0625rem rgba(34,53,72,.48), 0 0.125rem 0.5rem 0 rgba(34,53,72,.3)',     // sapContent_Shadow1
  shadowHeader: '0 0.125rem 0.125rem 0 rgba(34,53,72,.05), inset 0 -0.0625rem 0 0 #d9d9d9',   // sapContent_HeaderShadow
  shadowChrome: '0 0.125rem 0.125rem 0 rgba(34,53,72,.15)',                                    // shell bar
  shadowPress: '0 0 0 0.0625rem rgba(34,53,72,.48), 0 0.625rem 1.875rem 0 rgba(34,53,72,.25)', // sapContent_Shadow2
};

export const motion = {
  transition: '120ms cubic-bezier(.4,0,.2,1)',
  spring: '340ms cubic-bezier(.32,.72,0,1)',
};
