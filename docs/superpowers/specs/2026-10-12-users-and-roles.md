# Users and roles (2026-10-12)

Access control in this system is one thing: **the role on the account**. Every
endpoint names the roles it lets through as a dependency (`require_admin`,
`require_manager`, `require_staff`, `require_any` in
`backend/app/core/dependencies.py`), the role is read from the database on every
request, and nothing else is consulted. There are four roles, most senior first:
`admin`, `manager`, `staff`, `overseas_staff` (`ROLES`, mirrored in
`frontend/src/roles.js`; a test holds the two together).

## The screen

**Admin section → Users and roles** (`frontend/src/modules/users/`, mounted as the
first tab of `components/admin/AdminPanel.jsx`). The Admin section is only offered
to admins, and every endpoint behind this screen is admin-only on the server.

- **List**: name, username, email, role, active or deactivated, whether two-factor
  sign-in is on, last sign-in. Search, and filter by role and status.
- **Add user**: username, full name, email, role, first password. The admin gives
  the person the password; the first time they sign in, they choose their own
  before going on. Until then the list says *Yet to choose a password*.
- **Edit**: name, email, role. Only what changed is sent.
- **Reset password**: signs the person out everywhere and unlocks the account if
  failed sign-ins had locked it. Removing two-factor sign-in is a separate tick,
  offered only when the account has it.
- **Deactivate / Reactivate**: the way to take access away. The account and
  everything recorded under it stay.
- **Delete**: for an account made by mistake. Refused (409) for one with despatches
  recorded under it; its saved lists go with it.

The old screen (`modules/UserManagement.jsx`) had been unreachable since the shell
redesign — nothing navigated to it — and its role legend left managers out. It is
removed.

## Rules the server holds (`backend/app/routers/users.py`)

- Only an admin lists, adds, changes, resets or deletes accounts, or reads the
  access table. Anyone signed in may read their own details (`GET /users/me`).
- A role is one of the four. Anything else is a 400 naming them.
- **An admin cannot change their own role or deactivate or delete their own
  account.** Whoever is acting is an active admin, so there is always one left;
  another admin has to do it.
- A username is 3–50 letters, digits, dots, dashes or underscores, starting with a
  letter or digit, and is **unique without regard to case** — `Emon117` and
  `emon117` as two accounts is a mistake waiting to happen. Sign-in itself still
  matches the username exactly.
- Email is a real address, unique without regard to case. Full name is 1–100
  characters, stored with its spacing tidied.
- A password is at least 8 characters with an uppercase letter and a digit, and at
  most 72 bytes: bcrypt reads no further, so two passwords differing only after
  that would both open the account. One rule, in `app/core/security.py`, used for
  a new account, an admin's reset and a person's own change.
- **There is always an active admin.** The self rule above covers one admin acting
  alone; two acting on each other in the same instant each pass it. So any change
  that takes an active admin away (demoting, deactivating or deleting one) reads the
  active admins under a row lock and is refused if none other would be left.
- A change of role applies from the person's next request: the account is read on
  every one (and on token refresh).
- **Deactivating ends the account's sessions**, it does not suspend them: the token
  version is bumped, so cookies issued before do not come back to life when the
  account is reactivated. A password reset does the same.
- **A password an admin chose is replaced on first use** (2026-10-19). Adding an
  account and resetting someone else's password set `must_change_password` (an
  admin resetting their own is not asked again: nobody else knows it); the
  person's own change clears it, and refuses a new password that is the same as
  the current one. While it is set, every route answers 403 with
  `{"code": "password_change_required"}`. The check is in `get_current_user`,
  which every gate is built on, and in `_require_authenticated`, which the
  sign-in routes that read the cookie themselves use — so the second-factor
  setup is refused too: otherwise whoever else knows the given password could
  bind the account to their own authenticator first. What still answers:
  `GET /users/me` (on `get_signed_in_user`, so the app can learn it has to ask;
  `test_access_gates.py` fails if any other route uses it), `/auth/change-
  password`, signing out, and refreshing a token, which grants nothing. The app
  shows *Choose your own password* (`modules/auth/ChoosePasswordScreen.jsx`) in
  place of everything else. Accounts that existed before keep the password they
  have.
- A sign-in that is half done — password accepted, second factor not yet given —
  cannot be finished after a reset or a deactivation: the five-minute cookie
  carries the token version and the account is checked again.
- **What was sent is not sent back.** The server's validation refusals carry the
  field and the reason only (`app/main.py`), not the input: a refused password, or
  the whole form when another field was missing, used to be repeated in the body.
  Password fields are bounded at 256 characters before anything reads them.
- Username and email clashes are compared by the database on both sides, and a
  clash that slips past the check (two requests at once) is still a 409.
- Account changes are logged (who, what, by whom) — never passwords.

## What each role can do

`GET /users/access` returns, for each business area, how many of its view and
change actions each role may use — **counted from the gates on the routes
themselves** (`backend/app/core/access.py`), not written by hand. The screen shows
it as "View all · Change 15 of 21".

It is derived because a description goes stale. Building it found one that had:
goods receipts and the supplier price list spelled their gate out as
`("admin", "staff")`, written before `manager` existed, so **managers were refused
where staff were let in**. Both now use the shared gates.

Two tests keep it that way (`backend/tests/unit/test_access_gates.py`), over every
route in the app:

- every route has a gate, except the sign-in routes and health checks, which are
  listed by name;
- **seniority**: the roles a route admits are an unbroken run from the top — no
  route lets a role in while refusing a more senior one.

## Not done

- No per-person permissions: access is the role, and the four roles are fixed in
  code. A new role or a finer rule is a code change with tests, by design.
- No audit screen for account changes (they are in the server log).
- New accounts are not forced to set up two-factor sign-in.
