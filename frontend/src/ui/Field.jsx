import { useId, useState } from 'react';
import { T } from './tokens';
import { fieldChrome, labelStyle, errorStyle } from './fieldStyle';

export default function Field({ label, error, style, inputStyle, onFocus, onBlur, onMouseEnter, onMouseLeave, ...rest }) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: T.font, ...style }}>
      {label && <label htmlFor={id} style={labelStyle}>{label}</label>}
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        onFocus={e => { setFocused(true); onFocus?.(e); }}
        onBlur={e => { setFocused(false); onBlur?.(e); }}
        onMouseEnter={e => { setHovered(true); onMouseEnter?.(e); }}
        onMouseLeave={e => { setHovered(false); onMouseLeave?.(e); }}
        style={{ ...fieldChrome({ error, focused, hovered }), padding: '0 10px', ...inputStyle }}
        {...rest}
      />
      {error && <div style={errorStyle}>{error}</div>}
    </div>
  );
}
