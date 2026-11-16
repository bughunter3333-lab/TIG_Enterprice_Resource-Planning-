import { useId, useState } from 'react';
import { T } from './tokens';
import { fieldChrome, labelStyle, errorStyle } from './fieldStyle';

export default function Select({ label, options = [], error, style, onFocus, onBlur, onMouseEnter, onMouseLeave, ...rest }) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: T.font, ...style }}>
      {label && <label htmlFor={id} style={labelStyle}>{label}</label>}
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        onFocus={e => { setFocused(true); onFocus?.(e); }}
        onBlur={e => { setFocused(false); onBlur?.(e); }}
        onMouseEnter={e => { setHovered(true); onMouseEnter?.(e); }}
        onMouseLeave={e => { setHovered(false); onMouseLeave?.(e); }}
        style={{ ...fieldChrome({ error, focused, hovered }), padding: '0 8px', cursor: 'pointer' }}
        {...rest}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <div style={errorStyle}>{error}</div>}
    </div>
  );
}
