// The bridge from Sanity (where the blogger enters games, picks and results) into Postgres (where the League lives).
// It never deletes anything and is safe to run repeatedly: every write is an insert-if-missing or a recorded revision.
//
//  - New games, results and the blogger's picks arrive from Sanity as before; nothing about the weekly routine changes.
//  - Players and picks made through the old key-based flow are imported until their owner upgrades. After an
//    upgrade the old key is refused by the old endpoints, and any pick still arriving for that player is ignored here.
//  - A result that changes after it was graded adds a superseding grade; it never rewrites history.
//  - A change to the blogger's pick after its lock is NOT applied. It is logged for an admin, who can make the
//    correction with a reason.

import type { Db, Queryable } from "../db"
import { COMPETITION_ID, type RawExport } from "../backfill"
import { lockAtMs } from "../domain"
import { uuidV5 } from "../ids"
import { writeAudit } from "./audit"
import { gradeCompetition } from "./grade"

export type SyncReport = {
	playersAdded: number
	gamesAdded: number
	resultsApplied: number
	picksAdded: number
	picksRevised: number
	picksIgnored: number
	bloggerPicksAdded: number
	bloggerDrift: string[]
	graded: number
}

const BANNED = "Banned in Studio before the move to accounts"

/** Claim a sync job for this minute. Only one request gets true. */
export async function claimSync(q: Queryable, key: string, minIntervalMs: number): Promise<boolean> {
	const r = await q.query(`update league_sync_state set ran_at = now() where key = $1 and ran_at < now() - ($2::int * interval '1 millisecond') returning key`, [key, minIntervalMs])
	return r.rows.length > 0
}

export async function ensureCompetition(q: Queryable, c: { id: string; season: number; kind: string; name: string; family: string; enabled: boolean }): Promise<void> {
	await q.query(`insert into league_competitions (id, season, kind, name, policy_family, enabled) values ($1, $2, $3, $4, $5, $6) on conflict (id) do nothing`, [c.id, c.season, c.kind, c.name, c.family, c.enabled])
}

const iso = (d: unknown) => new Date(d as string).toISOString()

/** Bring Postgres up to date with a full read of the season from Sanity. `raw.games` should already carry ESPN finals. */
export async function syncBtbFromFeed(db: Db, raw: RawExport, season: number, now: number): Promise<SyncReport> {
	const report: SyncReport = { playersAdded: 0, gamesAdded: 0, resultsApplied: 0, picksAdded: 0, picksRevised: 0, picksIgnored: 0, bloggerPicksAdded: 0, bloggerDrift: [], graded: 0 }
	const competitionId = COMPETITION_ID(season)
	const nowIso = new Date(now).toISOString()

	await db.tx(async (q) => {
		await ensureCompetition(q, { id: competitionId, season, kind: "btb", name: "Beat the Blogger", family: "btb-classic", enabled: true })

		// Players and their legacy keys (hashes only).
		if (raw.players.length > 0) {
			const ps = raw.players
			const added = await q.query(
				`insert into league_players (id, handle, legacy_handle_lower, joined_at)
				 select * from unnest($1::uuid[], $2::text[], $3::text[], $4::timestamptz[]) on conflict do nothing`,
				[ps.map((p) => uuidV5(`player:${p.handleLower}`)), ps.map((p) => p.handle), ps.map((p) => p.handleLower), ps.map((p) => p._createdAt)]
			)
			report.playersAdded = added.rowCount ?? 0
			await q.query(
				`insert into league_legacy_identities (handle_lower, player_id, key_hash, source_doc_id)
				 select u.l, u.id, u.k, u.d from unnest($1::text[], $2::uuid[], $3::text[], $4::text[]) as u(l, id, k, d)
				 where exists (select 1 from league_players p where p.id = u.id) on conflict do nothing`,
				[ps.map((p) => p.handleLower), ps.map((p) => uuidV5(`player:${p.handleLower}`)), ps.map((p) => p.keyHash), ps.map((p) => p._id)]
			)
			const banned = ps.filter((p) => p.banned).map((p) => p.handleLower)
			if (banned.length > 0) await q.query(`update league_players set disabled_at = $2, disabled_reason = $3 where legacy_handle_lower = any($1::text[]) and disabled_at is null`, [banned, nowIso, BANNED])
		}

		// Games and results.
		for (const g of raw.games) {
			const id = uuidV5(`event:${g._id}`)
			const final = typeof g.actualAwayScore === "number" && typeof g.actualHomeScore === "number"
			const ins = await q.query(
				`insert into league_events (id, kind, season, week, legacy_prediction_id, away_team, home_team, kickoff, state, away_score, home_score)
				 values ($1, 'game', $2, $3, $4, $5, $6, $7, $8, $9, $10) on conflict (legacy_prediction_id) do nothing returning id`,
				[id, g.season, g.week, g._id, g.awayTeam, g.homeTeam, g.kickoff, final ? "final" : "scheduled", final ? g.actualAwayScore : null, final ? g.actualHomeScore : null]
			)
			if (ins.rows.length > 0) {
				report.gamesAdded++
				if (final) await q.query(`insert into league_result_snapshots (event_id, source, away_score, home_score, hash) values ($1, 'sanity', $2, $3, $4)`, [id, g.actualAwayScore, g.actualHomeScore, `${g.actualAwayScore}-${g.actualHomeScore}`])
				continue
			}
			// Existing game: follow edits to kickoff and teams while it is open, and apply a result or a correction.
			const cur = await q.query<{ state: string; away_score: number | null; home_score: number | null; kickoff: Date; pinned: boolean }>(`select state, away_score, home_score, kickoff, result_pinned_at is not null as pinned from league_events where id = $1 for update`, [id])
			const row = cur.rows[0]
			if (!row) continue
			if (row.state !== "final" && row.state !== "cancelled" && (iso(row.kickoff) !== iso(g.kickoff))) {
				await q.query(`update league_events set kickoff = $2, week = $3, away_team = $4, home_team = $5, updated_at = now() where id = $1`, [id, g.kickoff, g.week, g.awayTeam, g.homeTeam])
			}
			if (final && !row.pinned && row.state !== "cancelled" && (row.state !== "final" || row.away_score !== g.actualAwayScore || row.home_score !== g.actualHomeScore)) {
				await q.query(`update league_events set state = 'final', away_score = $2, home_score = $3, updated_at = now() where id = $1`, [id, g.actualAwayScore, g.actualHomeScore])
				await q.query(`insert into league_result_snapshots (event_id, source, away_score, home_score, hash) values ($1, 'sanity', $2, $3, $4)`, [id, g.actualAwayScore, g.actualHomeScore, `${g.actualAwayScore}-${g.actualHomeScore}`])
				report.resultsApplied++
			}
		}

		// The blogger's picks.
		const events = await q.query<{ id: string; legacy: string; kickoff: Date; lock_at: Date | null }>(`select id, legacy_prediction_id as legacy, kickoff, lock_at from league_events where legacy_prediction_id is not null and season = $1`, [season])
		const eventByLegacy: Record<string, { id: string; kickoff: string; lockAt: string | null }> = {}
		events.rows.forEach((e) => (eventByLegacy[e.legacy] = { id: e.id, kickoff: iso(e.kickoff), lockAt: e.lock_at ? iso(e.lock_at) : null }))
		const bp = await q.query<{ event_id: string; away: number; home: number }>(`select event_id, away, home from league_blogger_picks`)
		const bpBy: Record<string, { away: number; home: number }> = {}
		bp.rows.forEach((b) => (bpBy[b.event_id] = { away: b.away, home: b.home }))
		for (const g of raw.games) {
			const ev = eventByLegacy[g._id]
			if (!ev || g.predictedAwayScore === g.predictedHomeScore) continue
			const have = bpBy[ev.id]
			if (!have) {
				await q.query(`insert into league_blogger_picks (event_id, away, home, entered_at) values ($1, $2, $3, $4) on conflict do nothing`, [ev.id, g.predictedAwayScore, g.predictedHomeScore, g._createdAt ?? nowIso])
				await q.query(`insert into league_blogger_pick_revisions (event_id, n, away, home, at, imported, actor) values ($1, 1, $2, $3, $4, true, 'sync') on conflict do nothing`, [ev.id, g.predictedAwayScore, g.predictedHomeScore, g._createdAt ?? nowIso])
				report.bloggerPicksAdded++
			} else if (have.away !== g.predictedAwayScore || have.home !== g.predictedHomeScore) {
				if (now < lockAtMs({ kickoff: ev.kickoff, lockAt: ev.lockAt })) {
					const n = await q.query<{ n: number }>(`select coalesce(max(n), 0) + 1 as n from league_blogger_pick_revisions where event_id = $1`, [ev.id])
					await q.query(`update league_blogger_picks set away = $2, home = $3 where event_id = $1`, [ev.id, g.predictedAwayScore, g.predictedHomeScore])
					await q.query(`insert into league_blogger_pick_revisions (event_id, n, away, home, at, imported, actor) values ($1, $2, $3, $4, $5, true, 'sync')`, [ev.id, n.rows[0].n, g.predictedAwayScore, g.predictedHomeScore, nowIso])
				} else {
					report.bloggerDrift.push(g._id)
					await writeAudit(q, { actor: "system", actorRole: "system", action: "sync.blogger_pick_drift", subject: `event:${ev.id}`, before: have, after: { away: g.predictedAwayScore, home: g.predictedHomeScore } }, now)
				}
			}
		}

		// Readers' picks made through the old flow.
		const claimed = await q.query<{ handle_lower: string }>(`select handle_lower from league_legacy_identities where state in ('claimed', 'retired')`)
		const isClaimed: Record<string, true> = {}
		claimed.rows.forEach((c) => (isClaimed[c.handle_lower] = true))
		const pl = await q.query<{ id: string; legacy: string }>(`select id, legacy_handle_lower as legacy from league_players where legacy_handle_lower is not null`)
		const playerBy: Record<string, string> = {}
		pl.rows.forEach((p) => (playerBy[p.legacy] = p.id))
		const ex = await q.query<{ id: string; player_id: string; event_id: string; payload: { away: number; home: number } }>(`select id, player_id, event_id, payload from league_entries where competition_id = $1`, [competitionId])
		const entryBy: Record<string, { id: string; payload: { away: number; home: number } }> = {}
		ex.rows.forEach((e) => (entryBy[`${e.player_id}|${e.event_id}`] = { id: e.id, payload: e.payload }))

		const newEntries: { id: string; player: string; event: string; payload: { away: number; home: number }; at: string }[] = []
		const revisions: { id: string; payload: { away: number; home: number }; at: string }[] = []
		for (const p of raw.picks) {
			const ev = eventByLegacy[p.predictionId]
			const player = playerBy[p.player]
			if (!ev || !player || p.awayScore === p.homeScore || isClaimed[p.player]) {
				report.picksIgnored++
				continue
			}
			// Old picks without a timestamp were accepted by the old endpoint, which only took picks before kickoff.
			const lock = lockAtMs({ kickoff: ev.kickoff, lockAt: ev.lockAt })
			const at = p.pickedAt ?? new Date(Math.min(now, lock - 1)).toISOString()
			if (Date.parse(at) >= lock) {
				report.picksIgnored++
				continue
			}
			const have = entryBy[`${player}|${ev.id}`]
			if (!have) {
				const id = uuidV5(`entry:${p.player}:${p.predictionId}`)
				newEntries.push({ id, player, event: ev.id, payload: { away: p.awayScore, home: p.homeScore }, at })
				entryBy[`${player}|${ev.id}`] = { id, payload: { away: p.awayScore, home: p.homeScore } }
			} else if (have.payload.away !== p.awayScore || have.payload.home !== p.homeScore) {
				revisions.push({ id: have.id, payload: { away: p.awayScore, home: p.homeScore }, at })
				have.payload = { away: p.awayScore, home: p.homeScore }
			}
		}
		if (newEntries.length > 0) {
			await q.query(
				`insert into league_entries (id, competition_id, player_id, event_id, payload, first_submitted_at, submitted_at)
				 select u.id, $1, u.p, u.e, u.pl::jsonb, u.at, u.at from unnest($2::uuid[], $3::uuid[], $4::uuid[], $5::text[], $6::timestamptz[]) as u(id, p, e, pl, at) on conflict do nothing`,
				[competitionId, newEntries.map((e) => e.id), newEntries.map((e) => e.player), newEntries.map((e) => e.event), newEntries.map((e) => JSON.stringify(e.payload)), newEntries.map((e) => e.at)]
			)
			await q.query(
				`insert into league_entry_revisions (entry_id, n, payload, at)
				 select u.id, 1, u.pl::jsonb, u.at from unnest($1::uuid[], $2::text[], $3::timestamptz[]) as u(id, pl, at) on conflict do nothing`,
				[newEntries.map((e) => e.id), newEntries.map((e) => JSON.stringify(e.payload)), newEntries.map((e) => e.at)]
			)
			report.picksAdded = newEntries.length
		}
		for (const r of revisions) {
			const n = await q.query<{ n: number }>(`select coalesce(max(n), 0) + 1 as n from league_entry_revisions where entry_id = $1`, [r.id])
			await q.query(`update league_entries set payload = $2::jsonb, submitted_at = $3 where id = $1`, [r.id, JSON.stringify(r.payload), r.at])
			await q.query(`insert into league_entry_revisions (entry_id, n, payload, at) values ($1, $2, $3::jsonb, $4)`, [r.id, n.rows[0].n, JSON.stringify(r.payload), r.at])
			report.picksRevised++
		}

		const graded = await gradeCompetition(q, { competitionId, now })
		report.graded = graded.created
	})
	return report
}
