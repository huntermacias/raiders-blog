# League accounts: setup, cutover and rollback

Everything here is **off by default**. Deploying the code changes nothing for visitors until `LEAGUE_ACCOUNTS=on`.
The existing League (recovery keys, Sanity) keeps working throughout, and keeps working for any player who has not upgraded.

## Environment variables

| Variable | Needed | Notes |
|---|---|---|
| `LEAGUE_ACCOUNTS` | yes | `on` turns the account routes live. Anything else: every route answers 404. |
| `LEAGUE_DATABASE_URL` | yes | Postgres connection string. On Vercel use the pooled one. Falls back to `DATABASE_URL`. |
| `BETTER_AUTH_SECRET` | yes | 32+ random characters (`openssl rand -base64 48`). Rotating it signs everyone out. |
| `BETTER_AUTH_URL` | recommended | `https://www.raidersrundown.com` |
| `RESEND_API_KEY`, `LEAGUE_FROM_EMAIL` | production | Without both, accounts stay off in production. The from-address needs a verified Resend domain. |
| `LEAGUE_ADMIN_EMAILS` | for admins | Comma-separated. Admin access also needs a row in `league_admins` (add by hand with SQL). Two locks on purpose. |

## First-time setup (no visitor impact)

1. Create the Neon database. Check Neon's and Resend's current free-tier limits yourself before relying on them.
2. `LEAGUE_DATABASE_URL=<direct url> node scripts/league/migrate.mjs` shows what would run. Add `--apply` to run it. Safe to repeat.
3. Dry-run the backfill: `npx vite-node scripts/league/backfill.ts --season 2026 --out /tmp/league-backfill.sql`.
   It prints counts and a list of problems. **It refuses to continue unless the copy reproduces today's standings exactly**
   (rank, points, games, correct winners, exact scores, the blogger's total). The SQL file holds key hashes: keep it private, delete it after.
4. Load it: same command with `--apply`. One transaction, safe to repeat (`on conflict do nothing`).
5. Add the env vars in Vercel (Preview first), leaving `LEAGUE_ACCOUNTS` unset.

## Cutover

1. Preview deploy with `LEAGUE_ACCOUNTS=on`. Register a throwaway account, confirm the email, sign in, hit `/api/league/account/me`.
2. Upgrade one real legacy player (yours): `claim/start` with handle + key, then `claim/register`, confirm email. Check history is intact.
3. Production: set `LEAGUE_ACCOUNTS=on`. Legacy keys keep working until a player completes their upgrade (confirming the email).
   Nothing is deleted: a key hash is never removed, even after the upgrade.

## Rollback

* Switch off: unset `LEAGUE_ACCOUNTS`. Every account route returns 404; legacy sign-in is untouched.
* One player's upgrade went wrong: an admin runs `rollback_claim` with a written reason. The player returns to the key, and the audit log keeps the record.
* Never edit `league_audit_log`, `league_grades` or entry revisions by hand: they are append-only on purpose.

## Tests

`NEXT_PUBLIC_LAB_METHOD=v2 npx vitest run tests/lib/league2` runs the pure tests. The database tests are skipped unless
`LEAGUE_TEST_PG` points at a scratch database whose name contains `test`. They share one database, so run them with
`--no-file-parallelism`. They truncate League tables: never point them at a real database.

## Package changes needed on your machine

The code imports `better-auth`, `pg` and `@types/pg`. Add them with yarn so `yarn.lock` is regenerated, and commit both files together:
`yarn add better-auth@1.7.10 pg` and `yarn add -D @types/pg`. Building without the lockfile update will fail on Vercel.
