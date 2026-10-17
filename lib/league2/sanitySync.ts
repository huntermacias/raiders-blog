// Runs the Sanity -> Postgres sync with the real clients. Server only; tests use syncBtbFromFeed directly.

import { BACKFILL_QUERY, type RawExport } from "./backfill"
import type { Runtime } from "./auth/server"
import { client } from "../sanity.client"
import { withEspnFinals } from "../live/service"
import { claimSync, syncBtbFromFeed } from "./services/sync"

/** At most one run a minute across all servers. Never throws. */
export async function maybeSyncBtb(rt: Runtime, season: number): Promise<void> {
	try {
		if (!(await claimSync(rt.db, "btb", 60_000))) return
		const raw = (await client.fetch(BACKFILL_QUERY, { season })) as RawExport
		// The same ESPN overlay the live League page uses, so the two always agree on a final score.
		const games = await withEspnFinals(raw.games)
		const report = await syncBtbFromFeed(rt.db, { ...raw, games }, season, Date.now())
		await rt.db.query(`update league_sync_state set detail = $2::jsonb where key = $1`, ["btb", JSON.stringify(report)]).catch(() => null)
	} catch (e) {
		console.log("league: sync failed:", (e as Error).message)
	}
}
