# Deployment Runbook — Total Image ERP

Both halves run on Vercel as two projects from this one repository: the **frontend** (`tig-enterprice-resource-planning.vercel.app`, Root Directory `frontend`) and the **API** (FastAPI as a Python serverless function, Root Directory `backend`). The **database** is Postgres on Supabase. Sign-in answers "Can't reach the server" until the API project exists and its database has been migrated.

## Architecture

```
Browser ──► Vercel: frontend (static) ──/api/* rewrite──► Vercel: API (FastAPI function) ──► Supabase (Postgres)
```

The frontend calls `/api/*` (same-origin). A Vercel **rewrite** proxies `/api/*` to the backend server-side, so the browser only ever talks to the Vercel domain. This keeps the backend's `SameSite=Lax` auth cookies working **without** any CORS or cookie changes (a cross-origin setup would instead require `SameSite=None; Secure` + CORS origins — avoided by the rewrite).

---

## Step 1 — The database (Supabase)

The app talks to Supabase as a plain Postgres database, through the connection string in `DATABASE_URL`. It does not use Supabase's client libraries, Auth or Data API.

1. **Supabase → your project → Connect.** Two connection strings are used, both through Supabase's pooler:
   - **Transaction pooler** (port 6543) for the API on Vercel. Serverless functions open a connection per request, and this pooler is built for that; `app/database.py` turns off SQLAlchemy's own pool on Vercel for the same reason. The API's driver (psycopg2) uses no server-side prepared statements, which is what transaction mode cannot carry.
   - **Session pooler** (port 5432) for migrations and seeding (Step 3). Schema changes need a whole session.
   - Not *Direct connection*: that is IPv6-only unless the project has the IPv4 add-on.
2. Put the database password into the string, and add `?sslmode=require` to the end so the connection is always encrypted. If the password has characters such as `@ : / # ?` in it, they must be percent-encoded (`@` → `%40`) — or reset the database password to letters and digits (which also avoids PowerShell reading a `$` in it as a variable).
3. **Turn the Data API off** (Supabase → Integrations → Data API → *Enable Data API*). The tables are created by this app's migrations, so they have no row-level security; with the Data API on, they are reachable over HTTPS by anyone holding the project's API keys. The app does not need it.
4. The connection string is a password. It goes in the API project's environment variables on Vercel and in the repository's Actions secrets, and nowhere else — never in the frontend project, git, chat or a screenshot.

**Keep the database and the backend in the same region.** Every screen makes many small database queries through the backend, and each one crosses the distance between them: across the Pacific that adds up to seconds. Set the API project's function region to the one nearest the Supabase project: Vercel → the API project → Settings → *Functions* → *Function Region* (for Supabase's *Southeast Asia (Singapore)*, that is `sin1`). It defaults to Washington, D.C. A Supabase project cannot move region, but while it is still empty, deleting it and creating a new one costs nothing.

**The free Supabase plan keeps no backups**, pauses a project after a week of low activity (Dashboard → the project → *Resume* brings it back), and stops at 500 MB. The first database this app had (Render's free Postgres) was deleted with everything in it — so on the free plan, take your own copy regularly. All of this app's tables are in the `public` schema; the rest belongs to Supabase and would not restore into another project:

```powershell
pg_dump '<the Supabase connection string>' --schema=public --no-owner --no-privileges --format=custom --file "tig-erp-$(Get-Date -Format yyyy-MM-dd).dump"
```

and to put a copy back into an empty database:

```powershell
pg_restore --no-owner --no-privileges --dbname '<the new connection string>' tig-erp-2026-10-18.dump
```

The connection string goes in single quotes so PowerShell leaves any `$` in the password alone. Both need PostgreSQL's command-line tools on your computer, at the same major version as the project's database or newer (Supabase → Project Settings → Infrastructure shows it). Restore one copy into a scratch project once, so you know the copies work before you need one. The Pro plan ($25/month) never pauses and keeps seven days of daily backups.

## Step 2 — Create the API project on Vercel

The API is `backend/` deployed as its own Vercel project. `backend/api/index.py` hands the FastAPI app to Vercel's Python runtime, and `backend/vercel.json` sends every path to it, so `/auth/login`, `/health` and the rest route exactly as they do locally. `backend/requirements.txt` holds only what the API needs at runtime; tests and lint tools are in `requirements-dev.txt`.

1. Vercel → **Add New → Project** → import this repository again.
2. **Project Name: `tig-erp-api`.** `frontend/vercel.json` sends `/api/*` to `https://tig-erp-api.vercel.app`; if Vercel gives the project a different address, put that address there instead (Step 4).
3. **Root Directory: `backend`.** Framework preset: *Other*. Leave the build and output settings empty.
4. **Environment Variables:**
   - `DATABASE_URL` — the Supabase **Transaction pooler** string (port 6543), with the password in it and `?sslmode=require` on the end.
   - `SECRET_KEY` — 64 hex characters: `python -c "import secrets; print(secrets.token_hex(32))"`. Changing it signs everyone out.
   - `ENVIRONMENT` — `production`.
   - `ANTHROPIC_API_KEY` — only if the AI assistant is used.
5. **Deploy**, then set the function region (Step 1) and redeploy.
6. Check `https://tig-erp-api.vercel.app/health` answers. `/health/ready` reports the database, and only says `ok` once Step 3 has built the tables.

> Each request runs for at most 60 seconds (`maxDuration` in `backend/vercel.json`). A long job — a big import, or *Bring history into the ledger* — can outlast that: the screen then says the server could not be reached, so look at the result (the imported rows, Ledger Health) before running it again. Pro allows a longer limit.
>
> `slowapi`'s sign-in rate limit counts per function instance, so on Vercel it is looser than it looks. The per-account lockout in `routers/auth.py` lives in the database and holds regardless.
>
> Hosting the API somewhere else instead (a container host or a VPS): `backend/Dockerfile` runs the migrations and then uvicorn. Point the rewrite in `frontend/vercel.json` at that host.

## Step 3 — Build the tables, and seed the first admin user

A serverless function has no start-up step to run migrations in, so the **Migrate database** GitHub Action (`.github/workflows/migrate.yml`) does it. It runs on every push to `main` that adds or changes a migration, and on demand.

1. GitHub → the repository → Settings → **Secrets and variables → Actions** → *New repository secret*:
   - `DATABASE_URL` — the Supabase **Session pooler** string (port 5432).
   - `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` — the first admin account.
2. Actions → **Migrate database** → *Run workflow* → tick **Also create the first admin user** → *Run*. The log shows `Running upgrade …` down to the current head, then `Admin user '…' created`.
3. `/health/ready` on the API now says `"database":"ok"`.
4. Delete the three `ADMIN_*` secrets; the account exists now. Run the workflow again later without the box ticked whenever you need to migrate by hand.

From your own computer instead, in the `backend` folder:

```powershell
$env:DATABASE_URL = '<the Session pooler string>'
$env:SECRET_KEY = 'not-used-here'
python -m alembic upgrade head
python seed_admin.py
```

Close the terminal afterwards. `backend/.env` is untouched, so local development still uses the local database.

### Optional — seed demo data for the testing period

Run `python seed_data.py` (no args) the same way to populate a realistic dataset: 6 customers, 3 suppliers, 12 stock items, and 12 jobs spanning the full status workflow (quote → order → in progress → … → paid/cancel). It is **idempotent and additive** — it inserts only rows whose IDs don't already exist, so it never duplicates or clobbers data and is safe to re-run. Skip on a production database you intend to fill with real records.

## Step 4 — Wire the frontend to the API

`frontend/vercel.json` rewrites `/api/:path*` to `https://tig-erp-api.vercel.app/:path*`. If the API project's address is different, change the host there (keep the shape — backend routes live at root), commit and push; the frontend redeploys itself.

**The plan.** Vercel's free Hobby plan is for non-commercial, personal use only, and Vercel counts a site used for a business as commercial. Move the team to **Pro** — Vercel → Settings → Billing → *Upgrade* — at $20/month for your own seat; staff who only use the website need no seat.

Previews of pull requests are full copies of the site wired to the same API and database. Keep them behind your Vercel sign-in (Settings → *Deployment Protection* → Vercel Authentication on previews, the default), since the repository is public. Leave the API project's **production** address unprotected: the frontend's rewrite reaches it as an anonymous visitor.

## Step 5 — Verify

1. Open the frontend's Vercel URL → **Sign In** with the seeded admin.
2. **Turn on two-factor for every admin account** — *Set up two-factor* on the sign-in card. It is offered, not forced: an admin without it is protected only by the password and the lockout (five wrong passwords lock the account for fifteen minutes).
3. If sign-in fails: does `https://<your-site>/api/health` answer? Is the host in `frontend/vercel.json` the API project's address? In the Network tab, `/api/auth/login` should be `200`, not `404` (wrong rewrite host) or `500`/`502` (the API failed — Vercel → the API project → *Logs* says why).

---

## Environment variables (API project on Vercel)

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | The Supabase **Transaction pooler** connection string (Step 1). |
| `SECRET_KEY` | yes | 64-char hex: `python -c "import secrets; print(secrets.token_hex(32))"`. |
| `ENVIRONMENT` | no | `production` (default) → JSON logs, Secure cookies, and **no** `/docs` / `/openapi.json`. Anything else serves the interactive API docs — never set it to anything but `production` on a public host. |
| `ANTHROPIC_API_KEY` | no | Only for AI assistant features. |

The frontend project needs none. The GitHub Actions secrets are listed in Step 3.

## Migrations

Applied by the **Migrate database** workflow on every push to `main` that touches `backend/alembic/`, or by hand from the Actions tab (Step 3). Vercel deploys the API from the same push, so for a few minutes new code can run against the old schema — write migrations that the previous release also survives (add a column before using it; drop one only after nothing reads it).

CI proves two things on every push, against a real Postgres rather than the SQLite the unit tests use: that the whole chain applies to an **empty** database (which is exactly what a new or replaced database gets), and that `alembic check` finds no difference between the models and the migrated schema. SQLite ignores column lengths and never runs a migration, so without this job a production-only schema error passes every test.

## Moving to a new database

What happened once already: the first deploy (23 June 2026) used Render's free Postgres, which expires 30 days after it is created and is deleted two weeks later, with no backup. The data in it is gone. The database has been on Supabase since October 2026.

To bring the site up on a new, empty database:

1. Put the new Transaction pooler string in the API project's `DATABASE_URL` and redeploy it, and the new Session pooler string in the `DATABASE_URL` Actions secret.
2. Run **Migrate database** (Step 3), seeding an admin if the database is empty, then check `/health/ready` returns `"database":"ok"`.
3. Give people their roles in *Admin → Users and roles*. Editing a stock location needs **admin** or **manager**.
4. Sign in through the frontend's Vercel URL.
5. **Accounts → Ledger Health → Bring history into the ledger.** Once, as an admin, after any existing jobs and bills have been loaded. Running it again posts nothing new.

## Production checklist


- [ ] Vercel on the Pro plan (Hobby is for non-commercial use only)
- [ ] The API project's function region next to the Supabase region (Step 1)
- [ ] A Supabase plan with backups, or a `pg_dump` copy taken on a schedule (Step 1)
- [ ] Supabase's Data API switched off, and the connection strings stored only in the API project and the Actions secrets
- [ ] `ENVIRONMENT=production` on the API project (it is the default)
- [ ] Two-factor enabled on every admin account
- [ ] Settings → Company filled in — ABN, BSB, account number and name print on every invoice
- [ ] At least one **manager** assigned if anyone besides admins maintains stock locations
- [ ] `https://<frontend>/` returns `X-Frame-Options: DENY` (set in `frontend/vercel.json`)
- [ ] History brought into the ledger, and Ledger Health in agreement
- [ ] A lock date set once each BAS is lodged, so the lodged figures cannot move
