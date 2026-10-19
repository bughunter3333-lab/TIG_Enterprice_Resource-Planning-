/**
 * The dialogs of the Users screen: add an account, edit one, reset its
 * password, and the confirmations for switching one off or on and deleting it.
 * Each saves through one mutation and says what the server said if it refuses.
 */
import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../../api';
import { notify } from '../../lib/notify';
import { T } from '../../ui/tokens';
import Button from '../../ui/Button';
import Field from '../../ui/Field';
import Modal from '../../ui/Modal';
import Select from '../../ui/Select';
import { ROLES, ROLE_LABELS } from '../../roles';
import { allowed, editChanges, editProblems, newUserProblems, passwordProblem } from './userRules';

const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));
const note = { margin: 0, fontSize: T.fsSmall, color: T.textMuted };
const refusal = { margin: 0, fontSize: T.fsSmall, color: T.danger };
const stack = { display: 'grid', gap: 12 };

const said = (error) => error?.message || String(error);

function useSave(mutationFn, onDone) {
  const queryClient = useQueryClient();
  return useMutation({
    // Not queued while offline: a change to someone's access must not fire by itself, later.
    networkMode: 'always',
    mutationFn,
    onSuccess: (result, sent) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onDone(result, sent);
    },
  });
}

function PasswordField({ label, value, onChange, error, autoFocus }) {
  const [shown, setShown] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <Field label={label} type={shown ? 'text' : 'password'} value={value} onChange={onChange} error={error}
        aria-invalid={error ? true : undefined} autoComplete="new-password" autoFocus={autoFocus} maxLength={200} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: T.fsSmall, color: T.textMuted, cursor: 'pointer' }}>
        <input type="checkbox" checked={shown} onChange={(e) => setShown(e.target.checked)} />
        Show it
      </label>
    </div>
  );
}

export function AddUserDialog({ users, onClose }) {
  const formId = useId();
  const [form, setForm] = useState({ username: '', full_name: '', email: '', password: '', role: 'staff' });
  const [touched, setTouched] = useState({});
  const [tried, setTried] = useState(false);
  const problems = newUserProblems(form, users);
  // A field is not complained about before it has been filled in or a save tried.
  const shown = (field) => (tried || touched[field] ? problems[field] : undefined);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const blur = (field) => () => setTouched((t) => ({ ...t, [field]: true }));

  const save = useSave(
    (body) => api.users.create(body),
    (made) => {
      notify(`Account created for ${made.full_name} (${made.username}), as ${ROLE_LABELS[made.role] ?? made.role}`, { type: 'success' });
      onClose();
    },
  );
  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(problems).length || save.isPending) return;
    save.mutate({ ...form, username: form.username.trim(), full_name: form.full_name.trim(), email: form.email.trim() });
  };

  return (
    <Modal title="Add a user" width={480} onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} disabled={save.isPending}>{save.isPending ? 'Creating…' : 'Create account'}</Button>
        </>
      )}>
      <form id={formId} onSubmit={submit} noValidate style={stack}>
        <Field label="Username" value={form.username} onChange={set('username')} onBlur={blur('username')} error={shown('username')}
          aria-invalid={shown('username') ? true : undefined} autoComplete="off" autoFocus maxLength={50} placeholder="e.g. j.smith" />
        <Field label="Full name" value={form.full_name} onChange={set('full_name')} onBlur={blur('full_name')} error={shown('full_name')}
          aria-invalid={shown('full_name') ? true : undefined} autoComplete="off" maxLength={100} />
        <Field label="Email" type="email" value={form.email} onChange={set('email')} onBlur={blur('email')} error={shown('email')}
          aria-invalid={shown('email') ? true : undefined} autoComplete="off" maxLength={255} />
        <Select label="Role" options={ROLE_OPTIONS} value={form.role} onChange={set('role')} />
        <p style={note}>The role is everything the account may do. “What each role can do”, under the list, has the detail.</p>
        <PasswordField label="First password" value={form.password} onChange={set('password')} error={shown('password')} />
        <p style={note}>
          At least 8 characters with an uppercase letter and a digit. Give it to them directly; the first time they sign in, they choose one of their own before going on.
        </p>
        {save.error && <p role="alert" style={refusal}>Couldn't create the account: {said(save.error)}</p>}
      </form>
    </Modal>
  );
}

export function EditUserDialog({ user, users, me, onClose }) {
  const formId = useId();
  const [form, setForm] = useState({ full_name: user.full_name, email: user.email, role: user.role });
  const may = allowed(me, user);
  const problems = editProblems(form, user, users);
  const changes = editChanges(form, user);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = useSave(
    (body) => api.users.update(user.id, body),
    (saved, sent) => {
      const role = sent.role ? `, now ${ROLE_LABELS[saved.role] ?? saved.role}` : '';
      notify(`${saved.username} updated${role}`, { type: 'success' });
      onClose();
    },
  );
  const nothing = Object.keys(changes).length === 0;
  const submit = (e) => {
    e.preventDefault();
    if (Object.keys(problems).length || nothing || save.isPending) return;
    save.mutate(changes);
  };

  return (
    <Modal title={`Edit ${user.username}`} width={480} onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} disabled={save.isPending || nothing || Object.keys(problems).length > 0}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      )}>
      <form id={formId} onSubmit={submit} noValidate style={stack}>
        <Field label="Full name" value={form.full_name} onChange={set('full_name')} error={problems.full_name}
          aria-invalid={problems.full_name ? true : undefined} autoFocus maxLength={100} />
        <Field label="Email" type="email" value={form.email} onChange={set('email')} error={problems.email}
          aria-invalid={problems.email ? true : undefined} maxLength={255} />
        <Select label="Role" options={ROLE_OPTIONS} value={form.role} onChange={set('role')} disabled={!may.changeRole} />
        {may.self
          ? <p style={note}>This is your own account. Your role is another admin’s to change, so there is always an admin left.</p>
          : form.role !== user.role && (
            <p style={{ ...note, color: T.text }}>
              {user.full_name} goes from {ROLE_LABELS[user.role] ?? user.role} to {ROLE_LABELS[form.role]}. It applies from their next request.
            </p>
          )}
        {save.error && <p role="alert" style={refusal}>Couldn't save: {said(save.error)}</p>}
      </form>
    </Modal>
  );
}

export function ResetPasswordDialog({ user, onClose }) {
  const formId = useId();
  const [password, setPassword] = useState('');
  const [clear2fa, setClear2fa] = useState(false);
  const [tried, setTried] = useState(false);
  const problem = passwordProblem(password);

  const save = useSave(
    () => api.users.resetPassword(user.id, password, clear2fa),
    () => {
      notify(`Password reset for ${user.username}${clear2fa ? ', and two-factor sign-in removed' : ''}`, { type: 'success' });
      onClose();
    },
  );
  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (problem || save.isPending) return;
    save.mutate();
  };

  return (
    <Modal title={`Reset password — ${user.username}`} width={460} onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} disabled={save.isPending}>{save.isPending ? 'Resetting…' : 'Reset password'}</Button>
        </>
      )}>
      <form id={formId} onSubmit={submit} noValidate style={stack}>
        <PasswordField label="New password" value={password} onChange={(e) => setPassword(e.target.value)} error={tried ? problem ?? undefined : undefined} autoFocus />
        <p style={note}>
          At least 8 characters with an uppercase letter and a digit. Resetting signs {user.full_name} out everywhere,
          and lets them back in if the account was locked after failed sign-ins. When they sign in with it, they
          choose a new one of their own.
        </p>
        {user.totp_enabled && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: T.fsSmall, color: T.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={clear2fa} onChange={(e) => setClear2fa(e.target.checked)} style={{ marginTop: 2 }} />
            <span>
              Also remove two-factor sign-in.
              <span style={{ display: 'block', color: T.textMuted }}>
                Only for a lost authenticator: it leaves the account with a password alone until they enrol again.
              </span>
            </span>
          </label>
        )}
        {save.error && <p role="alert" style={refusal}>Couldn't reset the password: {said(save.error)}</p>}
      </form>
    </Modal>
  );
}

const CONFIRM = {
  deactivate: {
    title: (u) => `Deactivate ${u.username}?`,
    body: (u) => `${u.full_name} will not be able to sign in, and is signed out at their next request. Everything recorded under their name stays. The account can be reactivated at any time.`,
    action: 'Deactivate',
    busy: 'Deactivating…',
    variant: 'danger',
    run: (u) => api.users.update(u.id, { is_active: false }),
    done: (u) => `${u.username} deactivated`,
    failed: "Couldn't deactivate the account",
  },
  reactivate: {
    title: (u) => `Reactivate ${u.username}?`,
    body: (u) => `${u.full_name} will be able to sign in again, as ${ROLE_LABELS[u.role] ?? u.role}.`,
    action: 'Reactivate',
    busy: 'Reactivating…',
    variant: 'primary',
    run: (u) => api.users.update(u.id, { is_active: true }),
    done: (u) => `${u.username} reactivated`,
    failed: "Couldn't reactivate the account",
  },
  delete: {
    title: (u) => `Delete ${u.username}?`,
    body: (u) => `This removes ${u.full_name}’s account and their saved lists, and cannot be undone. It is for an account made by mistake: one with despatches recorded under it cannot be deleted, only deactivated.`,
    action: 'Delete account',
    busy: 'Deleting…',
    variant: 'danger',
    run: (u) => api.users.delete(u.id),
    done: (u) => `${u.username} deleted`,
    failed: "Couldn't delete the account",
  },
};

/** `kind` is 'deactivate', 'reactivate' or 'delete'. */
export function ConfirmUserDialog({ kind, user, onClose }) {
  const words = CONFIRM[kind];
  const save = useSave(
    () => words.run(user),
    () => {
      notify(words.done(user), { type: 'success' });
      onClose();
    },
  );
  return (
    <Modal title={words.title(user)} width={440} onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending} autoFocus>Cancel</Button>
          <Button variant={words.variant} onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? words.busy : words.action}</Button>
        </>
      )}>
      <div style={stack}>
        <p style={{ ...note, color: T.text }}>{words.body(user)}</p>
        {save.error && <p role="alert" style={refusal}>{words.failed}: {said(save.error)}</p>}
      </div>
    </Modal>
  );
}
