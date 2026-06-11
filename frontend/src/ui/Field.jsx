import { useId, useState } from 'react';
import { T } from './tokens';

export default function Field({ label, error, style, inputStyle, ...rest }) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontFamily: T.font, ...style }}>
      {label && (
        <label htmlFor={id} style={{ fontSize: T.fsSmall, color: T.headerText, fontWeight: 600 }}>{label}</label>
      )}
      <input
        id={id}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          height: T.inputHeight,
          fontSize: T.fsGrid,
          fontFamily: T.font,
          color: T.text,
          padding: '0 7px',
          border: `1px solid ${error ? T.danger : T.hairline}`,
          borderRadius: T.radius - 1,
          outline: 'none',
          boxShadow: focused ? `0 0 0 2px ${T.accentFocus}` : 'none',
          background: T.panel,
          ...inputStyle,
        }}
        {...rest}
      />
      {error && <div style={{ fontSize: 10, color: T.danger }}>{error}</div>}
    </div>
  );
}
