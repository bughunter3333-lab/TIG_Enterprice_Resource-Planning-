import { T } from './tokens';

// What every field shares (Field, Select): an empty field still reads as a
// place to type — a darker edge than a card's — darkens under the pointer, and
// takes the blue with a soft glow when focused.
export function fieldChrome({ error, focused, hovered }) {
  return {
    height: T.inputHeight,
    fontSize: T.fsGrid,
    fontFamily: T.font,
    color: T.text,
    border: `1px solid ${error ? T.danger : focused ? T.accent : hovered ? T.fieldBorderHover : T.fieldBorder}`,
    borderRadius: T.radiusField,
    outline: 'none',
    boxShadow: focused ? `0 0 0 3px ${error ? 'rgba(192,38,45,.16)' : 'rgba(11,99,246,.16)'}` : 'none',
    background: T.panel,
    transition: `border-color ${T.transition}, box-shadow ${T.transition}`,
  };
}

export const labelStyle = { fontSize: T.fsSmall, color: T.textMuted, fontWeight: 500 };
export const errorStyle = { fontSize: T.fsSmall, color: T.danger };
