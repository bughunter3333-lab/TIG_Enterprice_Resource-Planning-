import { useId, useState } from 'react';
import { T } from './tokens';

export default function Select({ label, options = [], error, style, onFocus, onBlur, ...rest }) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontFamily: T.font, ...style }}>
      {label && (
        <label htmlFor={id} style={{ fontSize: T.fsSmall, color: T.headerText, fontWeight: 600 }}>{label}</label>
      )}
      <select
        id={id}
        onFocus={e => { setFocused(true); onFocus?.(e); }}
        onBlur={e => { setFocused(false); onBlur?.(e); }}
        style={{
          height: T.inputHeight,
          fontSize: T.fsGrid,
          fontFamily: T.font,
          color: T.text,
          border: `1px solid ${error ? T.danger : T.hairline}`,
          borderRadius: T.radius - 1,
          background: T.panel,
          outline: 'none',
          boxShadow: focused ? `0 0 0 2px ${T.accentFocus}` : 'none',
        }}
        {...rest}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <div style={{ fontSize: 10, color: T.danger }}>{error}</div>}
    </div>
  );
}
