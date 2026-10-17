// Apply db/league/migrations/*.sql to the League database, in order, once each.
//   node scripts/league/migrate.mjs            show what WOULD run (default; touches nothing)
//   node scripts/league/migrate.mjs --apply    run the pending files, each in its own transaction
// The connection string comes from LEAGUE_DATABASE_URL (or DATABASE_URL). Use the direct (non-pooled) one.
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const url = process.env.LEAGUE_DATABASE_URL || process.env.DATABASE_URL
if (!url) {
	console.error("Set LEAGUE_DATABASE_URL first.")
	process.exit(1)
}
const apply = process.argv.includes("--apply")
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../db/league/migrations")
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()

const client = new pg.Client({ connectionString: url })
await client.connect()
try {
	await client.query(`create table if not exists league_schema_migrations (name text primary key, applied_at timestamptz not null default now())`)
	const done = new Set((await client.query(`select name from league_schema_migrations`)).rows.map((r) => r.name))
	const pending = files.filter((f) => !done.has(f))
	console.log(pending.length ? `Pending: ${pending.join(", ")}` : "Nothing to apply.")
	if (apply) {
		for (const f of pending) {
			await client.query("begin")
			try {
				await client.query(readFileSync(path.join(dir, f), "utf8"))
				await client.query(`insert into league_schema_migrations (name) values ($1)`, [f])
				await client.query("commit")
				console.log(`Applied ${f}`)
			} catch (e) {
				await client.query("rollback")
				console.error(`Failed on ${f}: ${e.message}. Rolled back; nothing from that file was kept.`)
				process.exit(1)
			}
		}
	} else if (pending.length) console.log("Dry run. Add --apply to run them.")
} finally {
	await client.end()
}
