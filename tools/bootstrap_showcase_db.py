"""One-time: create the two roles the showcase needs on a fresh Postgres.

The app enforces isolation twice — every query filters on the token's user id,
AND Postgres RLS enforces it with FORCE ROW LEVEL SECURITY. For that, the
runtime role must NOT own the tables and must hold NO BYPASSRLS; a separate
owner role owns them and runs migrations. The app asserts this at boot, so a
single-role setup will not start.

Run this ONCE against a free Postgres (Neon recommended), connected with an
admin role that can CREATE ROLE, BEFORE the first Render deploy:

    python tools/bootstrap_showcase_db.py \
        --admin-url "postgresql://<admin>:<pw>@<host>/<db>?sslmode=require"

It prints the two connection URLs to set in Render as DATABASE_URL (app) and
MIGRATION_DATABASE_URL (owner). Passwords are generated here, shown once, and
written nowhere. Idempotent: re-running resets the two role passwords.
"""
from __future__ import annotations

import argparse
import re
import secrets
import sys
from urllib.parse import urlsplit, urlunsplit


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--admin-url", required=True,
                    help="admin connection that can CREATE ROLE (libpq form, sslmode=require)")
    args = ap.parse_args()

    try:
        import psycopg  # psycopg3
        connect = lambda u: psycopg.connect(u, autocommit=True)
    except ModuleNotFoundError:
        try:
            import psycopg2
            def connect(u):
                c = psycopg2.connect(u)
                c.autocommit = True
                return c
        except ModuleNotFoundError:
            print("need psycopg or psycopg2: pip install psycopg[binary]", file=sys.stderr)
            return 2

    owner_pw = secrets.token_urlsafe(18)
    app_pw = secrets.token_urlsafe(18)

    parts = urlsplit(args.admin_url)
    db = parts.path.lstrip("/") or "postgres"
    host = parts.hostname
    port = parts.port or 5432

    stmts = [
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='spendwise_owner') "
        "THEN CREATE ROLE spendwise_owner LOGIN; END IF; END $$;",
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='spendwise_app') "
        "THEN CREATE ROLE spendwise_app LOGIN; END IF; END $$;",
        "ALTER ROLE spendwise_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT "
        f"PASSWORD {_lit(owner_pw)};",
        "ALTER ROLE spendwise_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT "
        f"PASSWORD {_lit(app_pw)};",
        # The owner must own the schema it migrates into.
        "GRANT ALL ON SCHEMA public TO spendwise_owner;",
        "GRANT CONNECT ON DATABASE " + _ident(db) + " TO spendwise_app;",
        "GRANT CONNECT ON DATABASE " + _ident(db) + " TO spendwise_owner;",
    ]

    with connect(args.admin_url) as conn:
        cur = conn.cursor()
        for s in stmts:
            cur.execute(s)
    print("roles ready on", f"{host}:{port}/{db}")

    def url(user: str, pw: str) -> str:
        netloc = f"{user}:{pw}@{host}:{port}"
        return urlunsplit(("postgresql+asyncpg", netloc, "/" + db, "ssl=require", ""))

    print("\nSet these in Render (and locally in .env if you run it):")
    print("MIGRATION_DATABASE_URL=" + url("spendwise_owner", owner_pw))
    print("DATABASE_URL=" + url("spendwise_app", app_pw))
    print("\nShown once. Re-run this script to rotate them.")
    return 0


def _lit(s: str) -> str:
    # token_urlsafe is [A-Za-z0-9_-]; still quote defensively.
    return "'" + s.replace("'", "''") + "'"


def _ident(s: str) -> str:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", s):
        raise SystemExit(f"unexpected database name {s!r}")
    return '"' + s + '"'


if __name__ == "__main__":
    raise SystemExit(main())
