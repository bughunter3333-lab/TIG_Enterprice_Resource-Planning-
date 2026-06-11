import { useId } from 'react';
import { T } from './tokens';

export default function Select({ label, options = [], error, style, ...rest }) {
  const id = useId();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontFamily: T.font, ...style }}>
      {label && (
        <label htmlFor={id} style={{ fontSize: T.fsSmall, color: T.headerText, fontWeight: 600 }}>{label}</label>
      )}
      <select
        id={id}
        style={{
          height: T.inputHeight,
          fontSize: T.fsGrid,
          fontFamily: T.font,
          color: T.text,
          border: `1px solid ${error ? T.danger : T.hairline}`,
          borderRadius: T.radius - 1,
          background: T.panel,
          outline: 'none',
        }}
        {...rest}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <div style={{ fontSize: 10, color: T.danger }}>{error}</div>}
    </div>
  );
}
