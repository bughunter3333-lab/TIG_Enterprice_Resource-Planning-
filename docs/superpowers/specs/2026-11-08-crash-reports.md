# Crash reports (2026-11-08)

When the app breaks, the person using it can say so in two clicks, with a
picture of what they saw — and the crash is recorded even if they don't.

## Owner decisions (2026-11-08)

- **Screenshot:** taken automatically (the app pictures its own page,
  `modern-screenshot`, loaded only when a picture is taken), with paste
  (Ctrl+V) or attach as well.
- **Offered on:** a screen crash (a recovery panel, not a white page); a server
  error (the error notice gets a **Report** button, with the request id); and
  **Report a problem** in the top bar at any time.
- **Recorded even if not reported:** a screen crash, and any other uncaught
  error, is sent on its own (no picture, no words), once per kind per visit.
- **Go to:** a Crash reports screen in Admin; a `crash-reports/` folder on the
  developer's PC (`backend/pull_crash_reports.py`); an email to the admins on
  each new kind of crash.
- **Read by:** admins only. Anyone signed in may send.

## What a report holds

Kind (`crash` — the screen broke; `error` — an uncaught error; `server_error`;
`report` — a person's own report), whether it was recorded automatically, the
error's message and stack (and React's component stack), the person's words,
the screenshot, the last ~40 steps (screens opened, jobs opened, every API call
with its status and time), the screen and job open, the app's build, the
browser and window size, the server's request id, who and when, and a status
(New · Looking · Fixed) with an admin note.

**Kind of crash** (`fingerprint`): the error's name and message with numbers
and ids taken out, and the top frame of its stack — so the same fault from many
people is one kind. A person's own report is its own kind.

## Rules

- `POST /crash-reports` — `require_any`, at most 30 an hour from one address.
  Long text is cut to fit, not refused (a crash must never fail to report
  because its stack is long). A screenshot is JPEG, PNG or WebP, checked by its
  bytes, at most 3 MB (Vercel takes 4.5 MB a request); anything else is 422.
- `PATCH /crash-reports/{id}/details` — the person whose crash was recorded
  automatically adds their words and picture, within an hour, once.
- `GET /crash-reports`, `GET /crash-reports/{id}`,
  `GET /crash-reports/{id}/screenshot`, `PATCH /crash-reports/{id}` (status,
  note) — `require_admin`. The list counts each kind's reports.
- The first report of a kind emails every active admin through the company's
  mail server, logged like any email; no mail server, or a failed send, never
  fails the report.
- A crash before sign-in cannot be sent (the routes need a person); it still
  shows the recovery panel.

## Screens

- `frontend/src/modules/crash-reports/`: `CrashBoundary` (recovery panel; one
  round the whole app, one round each screen — moving to another screen clears
  it), `CrashReporter` (one dialog for every way in; the picture is taken
  before the dialog opens, so it shows the page, not the dialog),
  `ReportDialog`, `CrashReportsModule` (Admin → Crash reports).
- `frontend/src/lib/crashContext.js`: the steps and the context, fed by
  `api.js` (every call) and the shell (every screen, every job opened).
- Toasts with the same words within a few seconds become one, so a server
  error is one notice with a Report button.

## The folder on the PC

`cd backend && python pull_crash_reports.py` writes
`crash-reports/<when>_<id>_<kind>/` — `report.json`, `screenshot.jpg|png|webp`,
`steps.txt` — and `crash-reports/INDEX.md`, skipping reports already pulled.
It reads the database `DATABASE_URL` names (set it to the live one to pull live
reports). `crash-reports/` is git-ignored: reports show customers' details and
the repository is public.

## After review (2026-11-08)

- The picture never holds a password field, nor anything marked
  `data-sensitive` (the two-factor QR code, a password being shown).
- Reports, and the Report buttons, are offered only to someone signed in; on
  sign-out the steps are cleared, so the next person on a shared PC never
  sends the last one's.
- A person sends at most 10 pictures an hour and 40 a day; past that a report
  still goes, without its picture. One person's reports are counted one at a
  time (their account row is held), so a burst cannot slip past the limit.
- The admins hear of at most 10 new kinds an hour, and never of a person's own
  report (read on the screen). An admin may delete a report and its picture.
- An unhandled server error answers with its request id, in the header and
  the body; a server error's report names the call that failed
  (`PATCH /jobs/# → …`), so different failures are different kinds.
- A kind survives a new build (hashes with dashes) and Firefox or Safari
  stacks; a crash React hands the window as well is recorded once.
- `pull_crash_reports.py` writes a report again when it changes (the person's
  words added later, a status, a note).
- The `crash-reports/` rule in `.gitignore` is anchored (`/crash-reports/`):
  unanchored, it hid the frontend module of the same name from git.
