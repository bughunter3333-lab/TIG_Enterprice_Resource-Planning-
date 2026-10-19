import { palette, type, elevation } from './src/ui/palette.js';

/**
 * The theme reads the same palette as src/ui/tokens.js.
 *
 * Before this, `theme.extend` carried fonts and nothing else, so every colour
 * utility in the app resolved against Tailwind's stock palette while the design
 * tokens lived in a separate JS object. Two palettes, no relationship: changing
 * a token moved the 58% of the interface that used inline styles and left the
 * 2,155 hardcoded utilities on the old colours.
 *
 * Names are semantic rather than hue-based — `bg-panel`, `text-muted`,
 * `border-hairline` — so a utility says what it is for. A future palette change
 * then has one place to happen.
 *
 * Tailwind's own colours are deliberately still available. This is `extend`,
 * not a replacement, because the conversion of those 2,155 utilities happens in
 * reviewable batches and the app has to keep building in between.
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Chrome — the shell bar (white in SAP Horizon).
        ink: {
          DEFAULT: palette.ink,
          raised: palette.inkRaised,
          hover: palette.inkHover,
          text: palette.inkText,
          muted: palette.inkTextMuted,
        },

        // Ground and surfaces.
        paper: palette.paper,
        panel: { DEFAULT: palette.panel, alt: palette.panelAlt },
        hairline: { DEFAULT: palette.hairline, soft: palette.hairlineSoft },

        // Text. `fg` rather than `text` so the utility reads `text-fg` instead
        // of the nonsense `text-text`.
        fg: palette.text,
        muted: palette.muted,
        faint: palette.faint,
        header: palette.headerText,

        // Accent — Horizon brand blue; `accent-strong` (5.2:1) carries words.
        accent: {
          DEFAULT: palette.accent,
          strong: palette.accentStrong,
          tint: palette.accentTint,
          focus: palette.accentFocus,
        },

        // Emphasis — a deeper blue, for one thing per surface.
        emphasis: { DEFAULT: palette.emphasis, tint: palette.emphasisTint },

        // Traffic light. Information, not brand.
        ok: { DEFAULT: palette.ok, tint: palette.okTint },
        warn: { DEFAULT: palette.warn, tint: palette.warnTint },
        danger: { DEFAULT: palette.danger, tint: palette.dangerTint },

        // A borderless cell you can type into is faintly tinted.
        editable: palette.editable,
      },

      fontFamily: {
        // Quoted: a family name that starts with a digit is not a valid CSS
        // identifier, and an unquoted `72` would void the whole declaration.
        sans: ['"72"', '"72full"', 'Arial', 'Helvetica', 'sans-serif'],
        mono: ['"72Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },

      // Figures in a column have to line up, or the eye cannot compare them.
      fontVariantNumeric: { tabular: 'tabular-nums' },

      boxShadow: {
        // SAP Horizon's shadows (palette.js `elevation`).
        sm: elevation.shadowSm,
        DEFAULT: elevation.shadowMd,
        header: elevation.shadowHeader,
        chrome: elevation.shadowChrome,
        press: elevation.shadowPress,
      },

      transitionTimingFunction: {
        press: 'cubic-bezier(.32,.72,0,1)',
      },
    },
  },
  plugins: [],
};
