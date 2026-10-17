// One-off: copy the live Sanity League (players, picks, results) into Postgres, and prove the copy matches.
//   npx vite-node scripts/league/backfill.ts --season 2026 --out /tmp/league-backfill.sql   plan + validate, write SQL, touch nothing
//   npx vite-node scripts/league/backfill.ts --season 2026 --apply                        load it (one transaction, safe to repeat)
// Needs NEXT_PUBLIC_SANITY_PROJECT_ID, NEXT_PUBLIC_SANITY_DATASET, NEXT_SANITY_TOKEN; --apply also needs LEAGUE_DATABASE_URL.
// The SQL file contains recovery-key HASHES. Keep it private and delete it afterwards.
import { writeFileSync } from "node:fs"
import { createClient } from "@sanity/client"
import { Pool } from "pg"

import { BACKFILL_QUERY, planBackfill, validateBackfill, type RawExport } from "../../lib/league2/backfill"
import { planToSql } from "../../lib/league2/backfillSql"

const arg = (n: string) => {
	const i = process.argv.indexOf(`--${n}`)
	return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
	const season = Number(arg("season") ?? new Date().getFullYear())
	const sanity = createClient({ projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID, dataset: process.env.NEXT_PUBLIC_SANITY_DATASET, apiVersion: "2022-11-15", useCdn: false, token: process.env.NEXT_SANITY_TOKEN })
	const raw = (await sanity.fetch(BACKFILL_QUERY, { season })) as RawExport
	const plan = planBackfill(raw, new Date().toISOString())
	const report = validateBackfill(raw, plan)
	console.log(JSON.stringify({ season, ok: report.ok, counts: report.counts, problems: report.problems }, null, 2))
	if (!report.ok) {
		console.error("The copy does NOT match the live League. Nothing was written.")
		process.exit(1)
	}
	const sql = planToSql(plan)
	const out = arg("out")
	if (out) {
		writeFileSync(out, sql, { mode: 0o600 })
		console.log(`Wrote ${out} (private: contains key hashes).`)
	}
	if (process.argv.includes("--apply")) {
		const url = process.env.LEAGUE_DATABASE_URL || process.env.DATABASE_URL
		if (!url) throw new Error("Set LEAGUE_DATABASE_URL to apply.")
		const pool = new Pool({ connectionString: url })
		try {
			await pool.query(sql)
			const n = await pool.query(`select (select count(*) from league_players) players, (select count(*) from league_entries) entries, (select count(*) from league_grades) grades`)
			console.log("Loaded. Database now holds:", n.rows[0])
		} finally {
			await pool.end()
		}
	} else if (!out) console.log("Dry run only. Add --out <file> to save the SQL, or --apply to load it.")
}
main().catch((e) => {
	console.error(e.message)
	process.exit(1)
})
