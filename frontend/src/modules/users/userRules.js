/**
 * The rules for a user account, as the server holds them
 * (backend/app/routers/users.py, app/core/security.py) — applied here as the
 * form is filled in, so the admin is told what is wrong before saving. The
 * server still decides.
 */
import { ROLES } from '../../roles';

const USERNAME = /^[A-Za-z0-9][A-Za-z0-9._-]{2,49}$/;
// Deliberately loose: the server's check is the real one. This catches the
// address typed without its @ or its domain.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_PASSWORD_BYTES = 72;
export const MAX_NAME_LENGTH = 100;

const tidy = (value) => String(value ?? '').trim();
const lower = (value) => tidy(value).toLowerCase();

/** What a password still lacks, as the ends of the sentence "It needs …". Empty when it will do. */
export function passwordGaps(password) {
  const text = String(password ?? '');
  const gaps = [];
  // Counted as the server counts (Python's len): an emoji is one character, not two.
  if ([...text].length < 8) gaps.push('at least 8 characters');
  if (!/[A-Z]/.test(text)) gaps.push('an uppercase letter');
  if (!/[0-9]/.test(text)) gaps.push('a digit');
  // bcrypt reads no further, so the rest of a longer one would not count.
  if (new TextEncoder().encode(text).length > MAX_PASSWORD_BYTES) gaps.push(`to be no longer than ${MAX_PASSWORD_BYTES} bytes`);
  return gaps;
}

export const passwordProblem = (password) => {
  const gaps = passwordGaps(password);
  return gaps.length ? `It needs ${gaps.join(', ')}.` : null;
};

function nameProblem(name) {
  const text = tidy(name);
  if (!text) return 'Enter their full name.';
  return text.length > MAX_NAME_LENGTH ? `At most ${MAX_NAME_LENGTH} characters.` : null;
}

function emailProblem(email, users, exceptId) {
  const text = tidy(email);
  if (!EMAIL.test(text)) return 'Enter an email address, like jo@company.com.au.';
  const taken = (users ?? []).find((u) => u.id !== exceptId && lower(u.email) === text.toLowerCase());
  return taken ? `${taken.username} already uses this address.` : null;
}

/**
 * What stops a new account being created, by field — `{}` when nothing does.
 * `users` are the accounts that exist, to catch a username or address already
 * taken (compared without case, as the server compares them).
 */
export function newUserProblems(form, users) {
  const problems = {};
  const username = tidy(form.username);
  if (!USERNAME.test(username)) {
    problems.username = '3 to 50 letters, digits, dots, dashes or underscores, starting with a letter or digit.';
  } else if ((users ?? []).some((u) => lower(u.username) === username.toLowerCase())) {
    problems.username = 'That username is taken.';
  }
  const name = nameProblem(form.full_name);
  if (name) problems.full_name = name;
  const email = emailProblem(form.email, users, null);
  if (email) problems.email = email;
  const password = passwordProblem(form.password);
  if (password) problems.password = password;
  if (!ROLES.includes(form.role)) problems.role = 'Choose a role.';
  return problems;
}

/** What stops an account's details being saved, by field. */
export function editProblems(form, user, users) {
  const problems = {};
  const name = nameProblem(form.full_name);
  if (name) problems.full_name = name;
  const email = emailProblem(form.email, users, user.id);
  if (email) problems.email = email;
  if (!ROLES.includes(form.role)) problems.role = 'Choose a role.';
  return problems;
}

/** The fields of an edit that differ from what is on file — what gets sent. */
export function editChanges(form, user) {
  const changes = {};
  if (tidy(form.full_name) !== user.full_name) changes.full_name = tidy(form.full_name);
  if (tidy(form.email) !== user.email) changes.email = tidy(form.email);
  if (form.role !== user.role) changes.role = form.role;
  return changes;
}

/**
 * What the signed-in admin may do to an account. Their own role and their own
 * access are not theirs to take away — the server refuses it too — so there is
 * always an admin left.
 */
export function allowed(me, user) {
  const self = me?.id === user.id;
  return { changeRole: !self, deactivate: !self, remove: !self, self };
}

/** Accounts matching a search (username, name, email) and the role and status filters. */
export function filterUsers(users, { query = '', role = 'all', status = 'all' } = {}) {
  const q = lower(query);
  return (users ?? []).filter((u) => {
    if (role !== 'all' && u.role !== role) return false;
    if (status === 'active' && !u.is_active) return false;
    if (status === 'inactive' && u.is_active) return false;
    return !q || [u.username, u.full_name, u.email].some((v) => lower(v).includes(q));
  });
}

/** How many accounts hold each role, and how many are switched off. */
export function userCounts(users) {
  const counts = { all: 0, active: 0, inactive: 0 };
  for (const role of ROLES) counts[role] = 0;
  for (const u of users ?? []) {
    counts.all += 1;
    counts[u.is_active ? 'active' : 'inactive'] += 1;
    if (u.role in counts) counts[u.role] += 1;
  }
  return counts;
}

/**
 * One cell of the access table — `[allowed, of]` actions — in words:
 * "all", "none", or how many of how many.
 */
export function accessWords(kind, [can, of]) {
  const [verb, none] = kind === 'view' ? ['View', 'No view'] : ['Change', 'No changes'];
  if (of === 0) return null;
  if (can === 0) return none;
  return can === of ? `${verb} all` : `${verb} ${can} of ${of}`;
}
