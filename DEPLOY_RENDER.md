# Deploying the showcase (Render + a free Postgres)

This is the always-on public demo. The full AWS version (ECS/RDS/OIDC pipeline)
lives in the **SpendWise_AWS** repo and is brought up on demand.

Render tracks **`main`**: push to `main` and it redeploys. Branch flow is the
same as AWS — work on `dev`, promote `dev → uat → main`.

## Why a separate database
The app can't use the AWS RDS: RDS is private (only the ECS host may reach it),
and exposing it to the internet is forbidden by the project's own rules. So the
showcase gets its own free Postgres. Use **Neon** (neon.tech) — its free tier is
persistent (it auto-suspends when idle and wakes on the next connection, and it
is not deleted), which suits a "set it and forget it" demo. Render's own free
Postgres is deleted after ~90 days, so don't use that one.

## One-time setup
1. **Create a Neon project** (free). Copy its admin connection string.
2. **Create the two roles** the isolation model needs:
   ```
   python tools/bootstrap_showcase_db.py --admin-url "postgresql://<admin>:<pw>@<host>/<db>?sslmode=require"
   ```
   It prints `DATABASE_URL` (app role) and `MIGRATION_DATABASE_URL` (owner role).
3. **Create the Render service from this repo:** Render → New → Blueprint →
   pick this repo. Render reads `render.yaml`, builds the Dockerfile, and asks
   for the two values marked `sync: false`. Paste the two URLs from step 2.
   `JWT_SECRET` is generated for you; `COOKIE_SECURE` is already `true`.
4. **First deploy** runs `alembic upgrade head` at container start (owner role),
   then serves on Render's `$PORT` over HTTPS.
5. **Seed demo data** once (so the dashboard isn't empty). From a machine with
   the two URLs exported and this repo checked out:
   ```
   DATABASE_URL=... MIGRATION_DATABASE_URL=... JWT_SECRET=... BOOTSTRAP_ADMIN_EMAIL=admin@spendwise.app SPENDWISE_DOTENV=0 \
     python tools/reset_and_seed.py
   ```
   It prints the demo logins once.

Your live URL is `https://spendwise-XXXX.onrender.com`. Put it on your portfolio.

## Notes
- Free Render web services sleep after ~15 min idle; the first hit then takes
  ~30–60s to wake, then it's fast. Upgrade the web service to Starter (~$7/mo)
  to remove the cold start.
- HTTPS and the `*.onrender.com` subdomain are free. A custom domain can be
  pointed at Render later with a CNAME (free TLS).


## The always-on front (SW-ADR-160)

`spendwise-front` is a free Render **static site** (`srv-dbbu5rg473hc73cias3g`,
https://spendwise-front.onrender.com). It serves the same `client/dist`, and its rewrite rules pass
`/api/*` and `/healthz` to the web service, so the browser stays same-origin. Static sites never
sleep, so the landing page's tree and fog appear at once while the web service wakes behind the
countdown. It does **not** auto-deploy. After deploying the web service, deploy the front too:
`POST /v1/services/srv-dbbu5rg473hc73cias3g/deploys`.
