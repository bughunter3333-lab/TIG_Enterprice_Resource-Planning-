/**
 * What each role can do, area by area — from GET /users/access, which counts
 * it from the gates on the server's own routes. Nothing here is written by
 * hand, so it cannot promise something the server does not enforce (the old
 * user screen's legend did not mention managers at all).
 */
import { T } from '../../ui/tokens';
import { ROLE_LABELS } from '../../roles';
import { accessWords } from './userRules';

const head = { textAlign: 'left', padding: '6px 10px', fontSize: T.fsSmall, fontWeight: 700, color: T.headerText, borderBottom: `1px solid ${T.hairline}`, whiteSpace: 'nowrap' };
const cell = { padding: '6px 10px', fontSize: T.fsSmall, borderBottom: `1px solid ${T.hairlineSoft}`, verticalAlign: 'top' };

function Can({ kind, counts }) {
  const words = accessWords(kind, counts);
  if (!words) return null;
  const none = counts[0] === 0;
  return <div style={{ color: none ? T.textFaint : T.text, fontWeight: none ? 400 : 600 }}>{words}</div>;
}

export default function AccessTable({ table }) {
  return (
    <section aria-labelledby="access-title" style={{ marginTop: 20 }}>
      <h3 id="access-title" style={{ margin: 0, fontSize: T.fsBase, fontWeight: 700, color: T.text }}>What each role can do</h3>
      <p style={{ margin: '4px 0 10px', fontSize: T.fsSmall, color: T.textMuted, maxWidth: 760 }}>
        Counted from the server’s own access rules, so this is what is enforced: for each area, how many of
        its actions a role may use — looking things up (view) and adding, editing or removing them (change).
        A new role applies from the person’s next request.
      </p>
      <div style={{ overflowX: 'auto', border: `1px solid ${T.hairline}`, borderRadius: T.radius }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.font }}>
          <thead>
            <tr style={{ background: T.hairlineSoft }}>
              <th scope="col" style={head}>Area</th>
              {table.roles.map((role) => <th key={role} scope="col" style={head}>{ROLE_LABELS[role] ?? role}</th>)}
            </tr>
          </thead>
          <tbody>
            {table.areas.map((area) => (
              <tr key={area.area}>
                <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 700, color: T.text, whiteSpace: 'nowrap' }}>{area.area}</th>
                {table.roles.map((role) => (
                  <td key={role} style={cell}>
                    <Can kind="view" counts={area.view[role]} />
                    <Can kind="change" counts={area.change[role]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
