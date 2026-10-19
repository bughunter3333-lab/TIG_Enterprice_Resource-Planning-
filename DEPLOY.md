# Deployment Runbook — Total Image ERP

Two services. **Vercel** runs the website and the API, as two projects in one team; **Supabase** holds the database. Sign-in fails until all three parts are up and wired.

## Architecture

```
Browser ──► Vercel: website (frontend/) ──/api/* rewrite──► Vercel: API (backend/, Python) ──► Supabase (Postgres)
```

The website calls `/api/*` on its own domain. `frontend/vercel.json` rewrites those requests to the API project on Vercel's side, so the browser only ever talks to the website's domain. That keeps the API's `SameSite=Lax` sign-in cookies working **without** any CORS or cookie changes.

**The rewrite is switched last** (Step 4). Until the API project exists and its address is confirmed, the rewrite keeps pointing at the old, suspended Render service. That address is still yours, so sign-ins go nowhere rather than to anyone else. The repository is public: an address the website rewrites to has to be one you already hold.

The API is the FastAPI app in `backend/`. It runs as a Vercel Function in Sydney (`backend/vercel.json`), beside the database. Supabase cannot run it — its own functions are TypeScript only — so Supabase is the database and nothing else. The app talks to it as plain Postgres, through the connection strings below; it does not use Supabase's client libraries, Auth or Data API.

---

## Step 1 — The database (Supabase)

1. **Region — check it before anything else.** Supabase → Project Settings → General shows the project's region, and it cannot be changed. The API has to run beside it, and `backend/vercel.json` says where (`"regions"`):
   - *Oceania (Sydney)*, `ap-southeast-2` → `syd1`, as it is now. The best choice for this business.
   - *Southeast Asia (Singapore)*, `ap-southeast-1` (the region the old runbook advised) → `sin1`.
   - If the project is still empty, deleting it and creating a new one in Sydney costs nothing.

   Every screen makes many small queries through the API, and each one crosses the distance between the API and the database, so the two must not be apart. Say which region it is before the API project is created, so `backend/vercel.json` matches.
2. **Two connection strings** (Supabase → your project → **Connect**):
   - **Transaction pooler**, port **6543** — for the API. It looks like `postgresql://postgres.<project-ref>:<password>@aws-<n>-ap-southeast-2.pooler.supabase.com:6543/postgres`. Supabase makes this one for serverless functions, which open many short-lived connections.
   - **Session pooler**, port **5432** — the same string with `:5432`. For migrations, and for anything you run from your own computer (seeding the first admin, backups).
   - Not *Direct connection*: that is IPv6-only unless the project has the IPv4 add-on, and Vercel connects over IPv4.
3. In both, put the database password in, start the string with `postgresql://` (not `postgres://`), and add `?sslmode=require` to the end so the connection is always encrypted. If the password has characters such as `@ : / # ?` in it, they must be percent-encoded (`@` → `%40`) — or reset the database password to letters and digits (which also avoids PowerShell reading a `$` in it as a variable).
4. **Turn the Data API off** (Supabase → Integrations → Data API → *Enable Data API* off). The tables are created by this app's migrations, so they have no row-level security; with the Data API on, they are reachable over HTTPS by anyone holding the project's public API key. The app does not need it.
5. **Do not install Supabase's Vercel integration.** It copies a dozen variables into the Vercel project — admin keys among them — and the app reads none of them.
6. The connection strings are passwords. They go in the **API** project's environment settings on Vercel and nowhere else — never the website project, git, chat or a screenshot.

**The free Supabase plan keeps no backups**, pauses a project after a week of low activity (Dashboard → the project → *Resume* brings it back), and stops at 500 MB. The first database this app had (Render's free Postgres) was deleted with everything in it — so on the free plan, take your own copy regularly, through the session pooler string. All of this app's tables are in the `public` schema; the rest belongs to Supabase and would not restore into another project:

```powershell
pg_dump '<the session pooler string>' --schema=public --no-owner --no-privileges --format=custom --file "tig-erp-$(Get-Date -Format yyyy-MM-dd).dump"
```

and to put a copy back into an empty database:

```powershell
pg_restore --no-owner --no-privileges --dbname '<the new session pooler string>' tig-erp-2026-10-19.dump
```

The connection string goes in single quotes so PowerShell leaves any `$` in the password alone. Both need PostgreSQL's command-line tools on your computer, at the same major version as the project's database or newer (Supabase → Project Settings → Infrastructure shows it). Restore one copy into a scratch project once, so you know the copies work before you need one. The Pro plan ($25/month) never pauses and keeps seven days of daily backups.

## Step 2 — The API (a second Vercel project)

1. Vercel → **Add New → Project** → import this repository again (the website project stays as it is).
   - **Project name: `tig-erp-api`.** If the name is free, its address is `https://tig-erp-api.vercel.app`; if not, Vercel gives it another, and Step 2.5 says where to read it.
   - **Root Directory: `backend`.** Vercel recognises the FastAPI app in `app/main.py`; leave the build settings as they are — `backend/vercel.json` sets the build step and the Sydney region, and `backend/.python-version` the Python version (3.12).
2. **Environment Variables** — add them under the API project's Settings → Environment Variables (not on the import screen), each as Type **Secret**, Environment **Production** only:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the **transaction pooler** string (port 6543) |
   | `MIGRATION_DATABASE_URL` | the **session pooler** string (port 5432) |
   | `SECRET_KEY` | 64 hex characters: `python -c "import secrets; print(secrets.token_hex(32))"` |
   | `ENVIRONMENT` | `production` |

   Production only, because a preview deployment must not reach the live database: previews of the API then have no database at all. Leave *Automatically expose System Environment Variables* on (the default): the build reads `VERCEL_ENV` to know it is a production build, and refuses to deploy without it.
3. **Deploy.** Vercel makes a first production deployment as soon as the project is imported, before the variables exist; that one fails with *A production build with no database to migrate* — expected. Once the variables are in: Deployments → the latest → ⋯ → **Redeploy**. The build runs `backend/migrate_on_deploy.py`, which on a production build runs `alembic upgrade head` — on an empty database that builds the whole schema. A migration that fails fails the build, and the live API stays on the version it had.
4. **The proof that the tables exist is the build log**: `Running upgrade … -> a7b8c9d0e1f2` near the end. `/health/ready` only shows the database answers, not that it has been migrated. Then check `https://<the API's address>/health/ready` returns `"database":"ok"`.
5. **Its address**: the API project → Settings → **Domains** shows its production domain (`tig-erp-api.vercel.app` if the name was free). That is the address the website will use (Step 4) — never a deployment or branch URL from the Deployments page, which change and sit behind Vercel's sign-in. Leave the API project's Deployment Protection at *Standard Protection* (the default), never *All Deployments*, which would put the production domain behind the sign-in as well.

**The secret key is new.** The old one was generated by Render and is not known. That signs everyone out (harmless on a new database), and if the database already holds data from before, the saved SMTP password was encrypted with the old key and can no longer be read: enter it again in Settings → Company after the first deploy.

What to know about the API on Vercel:

- **Every push to `main` deploys the API as well, migrating first.** A push to `main` is therefore the moment a new migration reaches the live database.
- **Uploads:** Vercel takes request bodies up to 4.5 MB, so CSV imports are limited to 4 MB. Split a bigger file.
- **Long jobs:** the website's rewrite waits up to two minutes for the API, and the API itself may run for up to 800 seconds (`backend/vercel.json`, on Pro). A job between the two — a big import, or *Bring history into the ledger* — still finishes, but the screen says the server could not be reached: look at the result (the imported rows, Ledger Health) before running it again. A job past 800 seconds is stopped and its work undone (the API project's Logs show `FUNCTION_INVOCATION_TIMEOUT`); split a big import into smaller files.
- **Sign-in limits:** the per-minute limits on sign-in attempts are kept by each running copy of the API, so they are looser than on one server. The per-account lockout — five wrong passwords lock the account for fifteen minutes — is kept in the database and holds regardless.
- **Email:** an email is sent while the screen waits, and a send that fails says so at once (and is listed as failed in the email log). Vercel blocks outgoing port 25, so the SMTP settings must use port 587 or 465. Send yourself one invoice email after the first deploy and check it arrives.

`backend/Dockerfile` still runs the API anywhere that runs containers, if it ever has to move.

## Step 3 — Seed the first admin user

The app has no users until you seed one, and sign-in answers 401 until then. Either way works:

**From GitHub, with no terminal** — the *Migrate database* workflow (`.github/workflows/migrate.yml`):

1. GitHub → the repository → Settings → Secrets and variables → **Actions** → New repository secret: `DATABASE_URL` = the **session pooler** string, and `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` for the first admin.
2. Actions → **Migrate database** → *Run workflow*, with *Also create the first admin user* ticked.
3. Delete the three `ADMIN_*` secrets afterwards; the account exists now. Keep `DATABASE_URL` only if you want to run migrations by hand from there again.

**From your own computer** — in a terminal, from the `backend` folder, point that one terminal at Supabase through the **session pooler** string and run the script. It asks for the username, email and password.

```powershell
cd backend
$env:DATABASE_URL = '<the session pooler string>'
$env:SECRET_KEY = 'anything'
python seed_admin.py
```

Close the terminal afterwards. `backend/.env` is untouched, so local development still uses the local database. (`SECRET_KEY` is only there because the settings require one; seeding signs nothing.)

Signing in with the password typed here does not ask for a new one: it is yours already. Accounts you then add for other people do ask, the first time they sign in.

### Optional — seed demo data for the testing period

Run `python seed_data.py` (no args) to populate a realistic dataset: 6 customers, 3 suppliers, 12 stock items, and 12 jobs spanning the full status workflow (quote → order → in progress → … → paid/cancel). It is **idempotent and additive** — it inserts only rows whose IDs don't already exist, so it never duplicates or clobbers data and is safe to re-run. Skip on a production database you intend to fill with real records.

## Step 4 — The website (the existing Vercel project)

The website is the Vercel project `tig-enterprice-resource-planning` (Root Directory `frontend`). It needs no environment variables.

**Switching it to the API**, once Step 2 is done and its address confirmed (Step 2.5): change the host in the rewrite in `frontend/vercel.json` to that address, keeping the `/:path*` ending (the API's routes live at its root: `/auth/login`, `/health`, …), then commit and push. The website redeploys and from then on reaches the API. Until then it still points at the suspended Render service.

**Keep the Render service; don't delete it.** It is suspended and costs nothing, and every earlier version of the website still rewrites to its address. Deleted, that name could be taken by anyone, and rolling the website back to an earlier version would send sign-ins to them.

**The plan.** Vercel's free Hobby plan is for non-commercial, personal use only, and Vercel counts a site used for a business as commercial. Move the team that holds both projects to **Pro** — Vercel → Settings → Billing → *Upgrade* — at $20/month for your own seat; staff who only use the website need no seat. Pro includes $20 of usage a month, which by the published rates covers the API several times over, along with 1 TB of transfer and 10 million requests; you can set a spending limit. Both projects should be in that same team.

Previews of pull requests are full copies of the website, wired to the same API. Keep them behind your Vercel sign-in (Settings → *Deployment Protection* → Vercel Authentication on previews, the default), since the repository is public.

## Step 5 — Verify

1. After the switch: `https://tig-enterprice-resource-planning.vercel.app/api/health` returns `{"status":"ok", …}` — the website reaches the API through the rewrite.
2. Open the website → **Sign In** with the seeded admin. On first sign-in with a password someone else chose, the app asks for a password of your own.
3. **Turn on two-factor for every admin account** — *Set up two-factor* on the sign-in card. It is offered, not forced: an admin without it is protected only by the password and the lockout.
4. If sign-in fails: is `/api/health` green through the website, and `/health/ready` on the API's own address? Is the host in `frontend/vercel.json` the API project's address? In the Network tab, `/api/auth/login` should be `200`, not `404` (wrong rewrite host) or `500`/`502` (the API failed — the API project's *Logs* say why).

The build id in the status bar (bottom of the screen) is the commit Vercel built the website from — compare it with the latest commit on GitHub before deciding a fix "didn't work".

---

## Environment variables (the API project)

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | The Supabase **transaction pooler** string, port 6543 (Step 1). |
| `MIGRATION_DATABASE_URL` | yes on Vercel | The Supabase **session pooler** string, port 5432. Migrations use it when it is set, `DATABASE_URL` otherwise. |
| `SECRET_KEY` | yes | 64-char hex: `python -c "import secrets; print(secrets.token_hex(32))"`. Changing it signs everyone out. |
| `ENVIRONMENT` | no | `production` (default) → JSON logs, Secure cookies, and **no** `/docs` / `/openapi.json`. Anything else serves the interactive API docs — never set it to anything but `production` on a public host. |
| `ANTHROPIC_API_KEY` | no | Only for AI assistant features. |
| `ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | no | Only for non-interactive seeding: `seed_admin.py` skips its prompts when they are set. Remove after. |

The website project needs none.

## Migrations

Run on every production deploy of the API, during the build (`backend/migrate_on_deploy.py`), through `MIGRATION_DATABASE_URL`, before the new deployment takes any traffic; a failed migration stops the deploy. Two runs at once (a push and a redeploy) take turns on a database lock, so one waits for the other.

To run them by hand: GitHub → Actions → **Migrate database** → *Run workflow* (it needs the `DATABASE_URL` repository secret, Step 3), or from `backend/` with `DATABASE_URL` set to the session pooler string, `python -m alembic upgrade head`. The workflow has no automatic trigger on purpose: running beside a deploy, it could apply a migration after the new code had gone live.

CI proves two things on every push, against a real Postgres rather than the SQLite the unit tests use: that the whole chain applies to an **empty** database (which is exactly what a new or replaced database gets), and that `alembic check` finds no difference between the models and the migrated schema. SQLite ignores column lengths and never runs a migration, so without this job a production-only schema error passes every test.

## Moving to a new database

What happened once already: the first deploy (23 June 2026) used Render's free Postgres, which expires 30 days after it is created and is deleted two weeks later, with no backup. The data in it is gone. The database has been on Supabase since October 2026, and the API on Vercel since the same month (Render, its first host, is retired; keep its suspended service, Step 4).

To bring the site up on a new, empty database:

1. Set `DATABASE_URL` and `MIGRATION_DATABASE_URL` on the API project (Step 2), then redeploy it (Deployments → the latest → *Redeploy*) — variables apply only to new deployments.
2. Watch the build log for `Running upgrade …` lines ending at the current head, then check `/health/ready` returns `"database":"ok"`.
3. Seed an admin (Step 3), then give people their roles in *Admin → Users and roles*. Editing a stock location needs **admin** or **manager**.
4. Sign in through the website.
5. **Accounts → Ledger Health → Bring history into the ledger.** Once, as an admin, after any existing jobs and bills have been loaded. Running it again posts nothing new.

## Production checklist

- [ ] Vercel on the Pro plan, with the website and the API projects in the same team (Hobby is for non-commercial use only)
- [ ] The API project's variables set for Production only, Type Secret (Step 2), and its system environment variables exposed
- [ ] `regions` in `backend/vercel.json` matching the Supabase project's region (Step 1)
- [ ] The website's rewrite switched to the API's production domain (Step 4), and the old Render service kept
- [ ] A Supabase plan with backups, or a `pg_dump` copy taken on a schedule (Step 1)
- [ ] Supabase's Data API switched off, and its Vercel integration not installed
- [ ] `ENVIRONMENT=production` on the API project
- [ ] Two-factor enabled on every admin account
- [ ] One invoice email sent and received (Step 2)
- [ ] Settings → Company filled in — ABN, BSB, account number and name print on every invoice
- [ ] At least one **manager** assigned if anyone besides admins maintains stock locations
- [ ] `https://<website>/` returns `X-Frame-Options: DENY` (set in `frontend/vercel.json`)
- [ ] History brought into the ledger, and Ledger Health in agreement
- [ ] A lock date set once each BAS is lodged, so the lodged figures cannot move
