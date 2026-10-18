#!/usr/bin/env bash
# Runs every League browser journey against a LOCAL dev server and scratch database, in the order they need.
#
# Before running: a scratch Postgres with all migrations in db/league/migrations applied, and a dev server started with
#   LEAGUE_ACCOUNTS=on BETTER_AUTH_SECRET=<32+ chars> LEAGUE_DATABASE_URL=<scratch db> BETTER_AUTH_URL=http://localhost:3000
#   LEAGUE_ADMIN_EMAILS=admin@example.com LEAGUE_DEV_OUTBOX=on
# The seed script refuses any database that does not look local. Usage: scripts/league/e2e/run-all.sh [base_url]
set -u
BASE="${1:-http://localhost:3000}"
cd "$(dirname "$0")/../../.."
fail=0
run() { echo "== $1"; shift; "$@" || fail=1; }
run "seed" node_modules/.bin/vite-node scripts/league/dev-seed.ts
run "account journeys" python3 scripts/league/e2e/journeys.py "$BASE"
run "seed" node_modules/.bin/vite-node scripts/league/dev-seed.ts
run "NFL journeys" python3 scripts/league/e2e/nfl.py "$BASE"
run "NFL confidence and upset journeys" python3 scripts/league/e2e/nfl_formats.py "$BASE"
run "admin journeys" python3 scripts/league/e2e/admin.py "$BASE"
run "accessibility audit" python3 scripts/league/e2e/a11y.py "$BASE"
exit $fail
