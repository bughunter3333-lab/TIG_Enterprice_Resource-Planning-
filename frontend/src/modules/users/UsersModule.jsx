/**
 * Users and roles — the admin's screen for who can sign in and what they may
 * do. It lives in the Admin section (components/admin/AdminPanel).
 *
 * Access here is one thing: the role on the account. The server checks it on
 * every request, so this screen only has to make three things easy to get
 * right — give a new person an account, change or take away what someone can
 * do, and see what a role actually allows (AccessTable, counted from the
 * server's own rules). Everything it does is admin-only on the server as well.
 */
import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, UserPlus } from 'lucide-react';
import * as api from '../../api';
import { T } from '../../ui/tokens';
import Button from '../../ui/Button';
import { ROLES, ROLE_LABELS } from '../../roles';
import { allowed, filterUsers, userCounts } from './userRules';
import { AddUserDialog, ConfirmUserDialog, EditUserDialog, ResetPasswordDialog } from './UserDialogs';
import AccessTable from './AccessTable';

const head = { textAlign: 'left', padding: '7px 10px', fontSize: T.fsSmall, fontWeight: 700, color: T.headerText, borderBottom: `1px solid ${T.hairline}`, whiteSpace: 'nowrap' };
const cell = { padding: '7px 10px', fontSize: T.fsGrid, color: T.text, borderBottom: `1px solid ${T.hairlineSoft}`, verticalAlign: 'middle' };

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never');

function Chip({ active, onClick, children }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      style={{
        height: 26, padding: '0 10px', cursor: 'pointer', fontFamily: T.font, fontSize: T.fsSmall, fontWeight: 600,
        borderRadius: T.radius, border: `1px solid ${active ? T.accentStrong : T.hairline}`,
        background: active ? T.accentTint : T.panel, color: active ? T.accentStrong : T.text,
      }}>
      {children}
    </button>
  );
}

function RoleTag({ role }) {
  const admin = role === 'admin';
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: T.fsSmall, fontWeight: 700, whiteSpace: 'nowrap',
      border: `1px solid ${admin ? T.accentStrong : T.hairline}`, background: admin ? T.accentStrong : T.panel, color: admin ? '#fff' : T.text,
    }}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

export default function UsersModule({ currentUser }) {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  // The dialog that is open: { kind, user }.
  const [open, setOpen] = useState(null);
  const opener = useRef(null);

  const isAdmin = currentUser?.role === 'admin';
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: api.users.list, enabled: isAdmin, staleTime: 30_000 });
  const accessQuery = useQuery({ queryKey: ['users-access'], queryFn: api.users.access, enabled: isAdmin, staleTime: 300_000 });

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const counts = useMemo(() => userCounts(users), [users]);
  const shown = useMemo(() => filterUsers(users, { query, role, status }), [users, query, role, status]);

  // A dialog hands the keyboard back to the button that opened it.
  const show = (kind, user) => (e) => { opener.current = e.currentTarget; setOpen({ kind, user }); };
  const close = () => {
    setOpen(null);
    const from = opener.current;
    // After the list has re-rendered: the button may have been replaced.
    setTimeout(() => { if (from?.isConnected) from.focus(); }, 0);
  };

  if (!isAdmin) {
    return (
      <div role="note" style={{ background: T.panel, borderRadius: T.radiusLg, padding: 24, color: T.textMuted, fontFamily: T.font, fontSize: T.fsBase }}>
        Only an admin can manage users and roles.
      </div>
    );
  }

  return (
    <div style={{ background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radiusLg, padding: 16, fontFamily: T.font }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <ShieldCheck size={18} aria-hidden style={{ color: T.accentStrong }} />
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text }}>Users and roles</h2>
          <p style={{ margin: 0, fontSize: T.fsSmall, color: T.textMuted }}>
            {counts.all} account{counts.all === 1 ? '' : 's'} · {counts.active} active{counts.inactive ? ` · ${counts.inactive} deactivated` : ''}
          </p>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" onClick={show('add')}><UserPlus size={14} aria-hidden />Add user</Button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '14px 0 10px' }}>
        <input type="search" aria-label="Find a user" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, username or email"
          style={{ width: 240, height: 28, padding: '0 8px', fontFamily: T.font, fontSize: T.fsBase, border: `1px solid ${T.textMuted}`, borderRadius: T.radiusField, background: T.panel, color: T.text }} />
        <div role="group" aria-label="Role" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <Chip active={role === 'all'} onClick={() => setRole('all')}>All roles</Chip>
          {ROLES.map((r) => <Chip key={r} active={role === r} onClick={() => setRole(r)}>{ROLE_LABELS[r]} {counts[r]}</Chip>)}
        </div>
        <div role="group" aria-label="Status" style={{ display: 'flex', gap: 4 }}>
          {[['all', 'Any status'], ['active', 'Active'], ['inactive', 'Deactivated']].map(([value, label]) => (
            <Chip key={value} active={status === value} onClick={() => setStatus(value)}>{label}</Chip>
          ))}
        </div>
      </div>

      {usersQuery.isError && (
        <p role="alert" style={{ fontSize: T.fsBase, color: T.danger }}>
          Couldn't load the accounts: {usersQuery.error?.message || String(usersQuery.error)}.{' '}
          <button type="button" onClick={() => usersQuery.refetch()} style={{ color: T.accentStrong, background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}>Try again</button>
        </p>
      )}
      {usersQuery.isLoading && <p style={{ fontSize: T.fsBase, color: T.textMuted }}>Loading accounts…</p>}

      {usersQuery.data && (
        <div style={{ overflowX: 'auto', border: `1px solid ${T.hairline}`, borderRadius: T.radius }}>
          <table aria-label="Accounts" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.font }}>
            <thead>
              <tr style={{ background: T.hairlineSoft }}>
                {['User', 'Email', 'Role', 'Status', 'Two-factor', 'Last signed in'].map((h) => <th key={h} scope="col" style={head}>{h}</th>)}
                <th scope="col" style={head}><span style={{ position: 'absolute', left: -9999 }}>Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={7} style={{ ...cell, color: T.textMuted, textAlign: 'center', padding: 18 }}>
                  {users.length === 0 ? 'No accounts yet.' : 'No account matches.'}
                </td></tr>
              )}
              {shown.map((u) => {
                const may = allowed(currentUser, u);
                return (
                  <tr key={u.id} style={{ background: u.is_active ? undefined : T.hairlineSoft }}>
                    <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 400 }}>
                      <div style={{ fontWeight: 700, color: u.is_active ? T.text : T.textMuted }}>
                        {u.full_name}{may.self && <span style={{ fontWeight: 400, color: T.accentStrong }}> (you)</span>}
                      </div>
                      <div style={{ fontFamily: T.fontMono, fontSize: T.fsSmall, color: T.textMuted }}>{u.username}</div>
                    </th>
                    <td style={{ ...cell, color: T.textMuted }}>{u.email}</td>
                    <td style={cell}><RoleTag role={u.role} /></td>
                    <td style={{ ...cell, fontWeight: 600, color: u.is_active ? T.ok : T.textMuted }}>
                      {u.is_active ? 'Active' : 'Deactivated'}
                      {u.must_change_password && (
                        <div style={{ fontWeight: 400, fontSize: T.fsSmall, color: T.textMuted }}>Yet to choose a password</div>
                      )}
                    </td>
                    <td style={{ ...cell, color: u.totp_enabled ? T.text : T.textMuted }}>{u.totp_enabled ? 'On' : 'Off'}</td>
                    <td style={{ ...cell, color: T.textMuted, whiteSpace: 'nowrap' }}>{when(u.last_login)}</td>
                    <td style={{ ...cell, whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <Button size="sm" variant="ghost" aria-label={`Edit ${u.username}`} onClick={show('edit', u)}>Edit</Button>
                      <Button size="sm" variant="ghost" aria-label={`Reset password for ${u.username}`} onClick={show('reset', u)}>Reset password</Button>
                      {may.deactivate && (u.is_active
                        ? <Button size="sm" variant="ghost" aria-label={`Deactivate ${u.username}`} onClick={show('deactivate', u)}>Deactivate</Button>
                        : <Button size="sm" variant="ghost" aria-label={`Reactivate ${u.username}`} onClick={show('reactivate', u)}>Reactivate</Button>)}
                      {may.remove && <Button size="sm" variant="ghost" aria-label={`Delete ${u.username}`} onClick={show('delete', u)}>Delete</Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {accessQuery.data && <AccessTable table={accessQuery.data} />}
      {accessQuery.isError && (
        <p role="alert" style={{ marginTop: 16, fontSize: T.fsSmall, color: T.warn }}>
          Couldn't load what each role can do: {accessQuery.error?.message || String(accessQuery.error)}.
        </p>
      )}

      {open?.kind === 'add' && <AddUserDialog users={users} onClose={close} />}
      {open?.kind === 'edit' && <EditUserDialog user={open.user} users={users} me={currentUser} onClose={close} />}
      {open?.kind === 'reset' && <ResetPasswordDialog user={open.user} onClose={close} />}
      {['deactivate', 'reactivate', 'delete'].includes(open?.kind) && <ConfirmUserDialog kind={open.kind} user={open.user} onClose={close} />}
    </div>
  );
}
