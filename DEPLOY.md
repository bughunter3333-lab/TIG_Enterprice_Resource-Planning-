# Deployment Runbook — Total Image ERP

The **frontend** is on Vercel (`tig-enterprice-resource-planning.vercel.app`). The **backend** (FastAPI, on Render) and the **database** (Postgres, on Supabase) are deployed separately and proxied behind the frontend's `/api` path. Login 404s until the backend is up and wired.

## Architecture

```
Browser ──► Vercel (frontend, static)  ──/api/* rewrite──►  Render (FastAPI) ──► Supabase (Postgres)
```

The frontend calls `/api/*` (same-origin). A Vercel **rewrite** proxies `/api/*` to the backend server-side, so the browser only ever talks to the Vercel domain. This keeps the backend's `SameSite=Lax` auth cookies working **without** any CORS or cookie changes (a cross-origin setup would instead require `SameSite=None; Secure` + CORS origins — avoided by the rewrite).

---

## Step 1 — The database (Supabase)

The app talks to Supabase as a plain Postgres database, through the connection string in `DATABASE_URL`. It does not use Supabase's client libraries, Auth or Data API.

1. **Supabase → your project → Connect.** Copy the **Session pooler** connection string. It looks like `postgresql://postgres.<project-ref>:<password>@aws-<n>-<region>.pooler.supabase.com:5432/postgres`.
   - Not *Direct connection*: that is IPv6-only unless the project has the IPv4 add-on, and Render connects over IPv4.
   - Not *Transaction pooler* (port 6543): that is for serverless functions and does not support prepared statements. The API is a long-running server.
2. Put the database password into the string, and add `?sslmode=require` to the end so the connection is always encrypted. If the password has characters such as `@ : / # ?` in it, they must be percent-encoded (`@` → `%40`) — or reset the database password to letters and digits.
3. **Turn the Data API off** (Supabase → Integrations → Data API → *Enable Data API*). The tables are created by this app's migrations, so they have no row-level security; with the Data API on, they are reachable over HTTPS by anyone holding the project's API keys. The app does not need it.
4. The connection string is a password. It goes in Render's environment settings and nowhere else — never in git, chat or a screenshot.

The free Supabase plan pauses a project after a week without activity; a paid plan does not, and adds daily backups.

## Step 2 — Deploy the backend (Render, via `render.yaml`)

`render.yaml` (repo root) is a Render Blueprint for the API: it generates `SECRET_KEY` and runs migrations on every start. `DATABASE_URL` is marked `sync: false`, so Render asks for it once and never overwrites it.

1. Render dashboard → **New → Blueprint** → connect this repository → paste the Supabase connection string when asked for `DATABASE_URL` → **Apply**. For an existing service: **Environment → DATABASE_URL → edit → Save**, which redeploys.
2. The first start runs `alembic upgrade head` — on an empty database that builds the whole schema — then starts uvicorn.
3. When live, verify health: `https://<your-service>.onrender.com/health/ready` should return `"database":"ok"`.

> **A free web service is not production.** It sleeps when idle (about a minute to wake), has no Shell tab, and Render suspends it when the month's free hours or bandwidth run out. Move `plan:` in `render.yaml` to a paid tier before real work depends on it.
>
> Other hosts (Railway / Fly.io / a VPS): use `backend/Dockerfile` instead of the Blueprint. Set the same env vars (`DATABASE_URL`, `SECRET_KEY`, `ENVIRONMENT=production`). On a VPS, front it with Caddy/nginx for HTTPS.

## Step 3 — Seed the first admin user

The app has no users until you seed one, and sign-in answers 401 until then.

- **From your own computer** (the way that works on a free Render service, which has no Shell): in a terminal, from the `backend` folder, point that one terminal at Supabase and run the script. It asks for the username, email and password.

  ```powershell
  cd backend
  $env:DATABASE_URL = "<the Supabase connection string>"
  python seed_admin.py
  ```

  Close the terminal afterwards. `backend/.env` is untouched, so local development still uses the local database.
- **Render Shell** (paid service → *Shell* tab): run `python seed_admin.py` and answer the prompts.

### Optional — seed demo data for the testing period

Run `python seed_data.py` (no args) to populate a realistic dataset: 6 customers, 3 suppliers, 12 stock items, and 12 jobs spanning the full status workflow (quote → order → in progress → … → paid/cancel). It is **idempotent and additive** — it inserts only rows whose IDs don't already exist, so it never duplicates or clobbers data and is safe to re-run. Skip on a production database you intend to fill with real records.

## Step 4 — Wire the frontend to the backend

`frontend/vercel.json` is **pre-wired** to `https://tig-erp-api.onrender.com` (the service name from `render.yaml`), so no edit is needed if Render serves the API at that subdomain.

- **Only if** Render appended a suffix (because `tig-erp-api` was globally taken): edit `frontend/vercel.json` → change the host to the real one Render shows, keeping the `/api/:path*` → `https://<host>/:path*` shape (backend routes live at root: `/auth/login`, `/health`, …), then commit and push — Vercel redeploys automatically.

## Step 5 — Verify

1. Open the Vercel URL → **Sign In** with the seeded admin.
2. **Turn on two-factor for every admin account** — *Set up two-factor* on the sign-in card. It is offered, not forced: an admin without it is protected only by the password and the lockout (five wrong passwords lock the account for fifteen minutes).
3. If login still 404s: confirm the `vercel.json` host is correct and the backend `/health` is green. Check the browser Network tab — `/api/auth/login` should be `200`, not `404`.

---

## Environment variables (backend)

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | The Supabase Session pooler connection string (Step 1). Set by hand in the Render dashboard; `render.yaml` never overwrites it. |
| `SECRET_KEY` | yes | 64-char hex. Auto-generated by `render.yaml`. Manually: `python -c "import secrets; print(secrets.token_hex(32))"`. |
| `ENVIRONMENT` | no | `production` (default) → JSON logs, Secure cookies, and **no** `/docs` / `/openapi.json`. Anything else serves the interactive API docs — never set it to anything but `production` on a public host. |
| `ANTHROPIC_API_KEY` | no | Only for AI assistant features. Set manually (not in git). |
| `ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | no | Only for non-interactive seeding: `seed_admin.py` skips its prompts when they are set. Remove after. |

## Migrations

Run automatically on every backend start (`alembic upgrade head`). To run manually: `cd backend && python -m alembic upgrade head`.

CI proves two things on every push, against a real Postgres rather than the SQLite the unit tests use: that the whole chain applies to an **empty** database (which is exactly what a new or replaced database gets), and that `alembic check` finds no difference between the models and the migrated schema. SQLite ignores column lengths and never runs a migration, so without this job a production-only schema error passes every test.

## Moving to a new database

What happened once already: the first deploy (23 June 2026) used Render's free Postgres, which expires 30 days after it is created and is deleted two weeks later, with no backup. The data in it is gone. The database has been on Supabase since October 2026.

To bring the site up on a new, empty database:

1. Set `DATABASE_URL` on the Render service (Step 2) and resume the service if Render shows it as suspended — the dashboard's Billing page says why.
2. Watch the deploy log for `Running upgrade …` lines ending at the current head, then check `/health/ready` returns `"database":"ok"`.
3. Seed an admin (Step 3), then assign roles in *User Management*. Editing a stock location needs **admin** or **manager**.
4. Sign in through the Vercel URL.
5. **Accounts → Ledger Health → Bring history into the ledger.** Once, as an admin, after any existing jobs and bills have been loaded. Running it again posts nothing new.

## Production checklist

- [ ] A paid Render plan for the web service (`render.yaml`), and a Supabase plan that does not pause
- [ ] Supabase's Data API switched off, and the connection string stored only in Render
- [ ] `ENVIRONMENT=production` on the web service (it is the default)
- [ ] Two-factor enabled on every admin account
- [ ] Settings → Company filled in — ABN, BSB, account number and name print on every invoice
- [ ] At least one **manager** assigned if anyone besides admins maintains stock locations
- [ ] `https://<frontend>/` returns `X-Frame-Options: DENY` (set in `frontend/vercel.json`)
- [ ] History brought into the ledger, and Ledger Health in agreement
- [ ] A lock date set once each BAS is lodged, so the lodged figures cannot move
