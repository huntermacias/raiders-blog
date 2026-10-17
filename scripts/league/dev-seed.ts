// Fills a LOCAL database with a believable League so the pages can be tried by hand or by the end-to-end tests.
//   LEAGUE_DATABASE_URL=postgresql://... npx vite-node scripts/league/dev-seed.ts
// Refuses anything that does not look like a local scratch database. Safe to run again (it resets the League tables).
import { Pool } from "pg"

import type { RawExport } from "../../lib/league2/backfill"
import { dbFromPool } from "../../lib/league2/db"
import { syncBtbFromFeed } from "../../lib/league2/services/sync"
import { gradeCompetition } from "../../lib/league2/services/grade"
import { type NflFeedGame, NFL_COMPETITION, syncNflFromFeed } from "../../lib/league2/services/syncNfl"
import { uuidV5 } from "../../lib/league2/ids"
import { TEAMS } from "../../lib/nfl"

const url = process.env.LEAGUE_DATABASE_URL ?? ""
if (!/(localhost|127\.0\.0\.1|host=\/)/.test(url) || !/(test|dev|scratch)/i.test(url)) {
	console.error("Refusing to seed: LEAGUE_DATABASE_URL must be a local database whose name contains test, dev or scratch.")
	process.exit(1)
}

function rng(seed: number) {
	let s = seed >>> 0
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0
		return s / 4294967296
	}
}

async function main() {
	const pool = new Pool({ connectionString: url })
	const db = dbFromPool(pool)
	await pool.query(`truncate league_audit_log, league_grades, league_entry_revisions, league_entries, league_blogger_pick_revisions, league_blogger_picks, league_result_snapshots, league_events, league_competitions, league_legacy_identities, league_handle_reservations, league_admins, league_support_cases, league_notification_prefs, league_rate_limits, league_players, "session", "account", "verification", "rateLimit", "user" restart identity cascade`)
	const now = Date.now()
	const iso = (ms: number) => new Date(ms).toISOString()
	const H = 3600_000
	const r = rng(7)
	const opp = ["New England Patriots", "Kansas City Chiefs", "Denver Broncos", "Los Angeles Chargers", "Dallas Cowboys", "Miami Dolphins"]
	const games = opp.map((o, i) => {
		const kickoff = now + (i - 3) * 7 * 24 * H + 8 * H
		const final = kickoff < now
		return {
			_id: `dev-g${i + 1}`,
			_createdAt: iso(kickoff - 6 * 24 * H),
			season: 2026,
			week: i + 3,
			awayTeam: i % 2 === 0 ? "Las Vegas Raiders" : o,
			homeTeam: i % 2 === 0 ? o : "Las Vegas Raiders",
			kickoff: iso(kickoff),
			predictedAwayScore: 14 + Math.floor(r() * 14),
			predictedHomeScore: 14 + Math.floor(r() * 14),
			actualAwayScore: final ? Math.floor(r() * 31) : null,
			actualHomeScore: final ? Math.floor(r() * 31) : null,
		}
	})
	for (const g of games) if (g.predictedAwayScore === g.predictedHomeScore) g.predictedHomeScore += 3
	const names = ["SilverBullet", "BlackHole", "DesertRaider", "PirateFlag", "Vegas_Vic", "CarrWho", "AllDayAdams", "Crosby55", "RaiderRon", "NevadaNate", "SinCityStan", "TheRaidersWay", "OaklandOG", "AllegiantAl", "MaxxCrosby", "Silver_Fox", "GhostTown", "SpinTheWheel", "RaidersGal", "Commitment2Ex", "JustWinBaby", "BlackAndBlue", "Gruden_Grin", "TurnoverTim", "PunterPete", "Sack_Attack", "NoCoverage", "Hail_Mary", "GoDeep", "RedZoneRay", "FourthAndOne", "Pocket_Pres", "DraftDayDan", "HailRaiders", "StripSack", "Neon_Nick", "Dog_Pound", "SilverStreak", "Hammer_Time", "ShutdownCorner"]
	const players = names.map((n, i) => ({ _id: `leaguePlayer.${n.toLowerCase()}`, _createdAt: iso(now - (60 - i) * 24 * H), handle: n, handleLower: n.toLowerCase(), keyHash: `dev${i}`.padEnd(64, "0") }))
	const picks: RawExport["picks"] = []
	for (const p of players) {
		for (const g of games) {
			if (r() < 0.25) continue
			const a = Math.floor(r() * 35)
			const h = a + (r() < 0.5 ? 1 : -1) * (1 + Math.floor(r() * 12))
			if (h < 0) continue
			picks.push({ _id: `leaguePick.${p.handleLower}.${g._id}`, player: p.handleLower, predictionId: g._id, awayScore: a, homeScore: h, pickedAt: iso(Date.parse(g.kickoff) - 24 * H) })
		}
	}
	const report = await syncBtbFromFeed(db, { games, players, picks }, 2026, now)
	console.log("seeded", JSON.stringify(report))

	// The public NFL league: last week finished, this week part locked and part open, next week open.
	const nfl: NflFeedGame[] = []
	const kick = (w: number, i: number) => now + (w - 6) * 7 * 24 * H + (i === 0 ? -1 * H : (i + 1) * 3 * H) + (w === 5 ? -2 * 24 * H : 0)
	for (const w of [5, 6, 7]) {
		for (let i = 0; i < 8; i++) {
			const away = TEAMS[(2 * i + w) % 32].abbr
			const home = TEAMS[(2 * i + 1 + w) % 32].abbr
			const done = w === 5
			nfl.push({ id: `dev-nfl-${w}-${i}`, week: w, kickoff: iso(kick(w, i)), away, home, awayScore: done ? 10 + Math.floor(r() * 25) : null, homeScore: done ? 10 + Math.floor(r() * 25) : null })
		}
	}
	// Week 5 starts unscored so picks can be seeded "before kickoff", then the finals arrive.
	const pre = nfl.map((g) => (g.week === 5 ? { ...g, awayScore: null, homeScore: null } : g))
	await syncNflFromFeed(db, pre, 2026, now)
	const evs = (await pool.query(`select id, nfl_game_id, week, kickoff from league_events where nfl_game_id like 'dev-nfl-%'`)).rows
	const pids = (await pool.query(`select id from league_players where legacy_handle_lower is not null order by handle`)).rows.map((x) => x.id as string)
	for (const pid of pids) {
		for (const e of evs) {
			if (e.week === 7 || r() < 0.2) continue
			if (e.week === 6 && r() < 0.5) continue
			const id = uuidV5(`entry:${pid}:${e.id}:${NFL_COMPETITION(2026)}`)
			const at = iso(Date.parse(e.kickoff) - 30 * H)
			await pool.query(`insert into league_entries (id, competition_id, player_id, event_id, payload, first_submitted_at, submitted_at) values ($1, $2, $3, $4, $5::jsonb, $6, $6)`, [id, NFL_COMPETITION(2026), pid, e.id, JSON.stringify({ pick: r() < 0.5 ? "away" : "home" }), at])
			await pool.query(`insert into league_entry_revisions (entry_id, n, payload, at) select id, 1, payload, submitted_at from league_entries where id = $1`, [id])
		}
	}
	const fin = await syncNflFromFeed(db, nfl, 2026, now)
	await pool.query(`update league_competitions set enabled = true where id = $1`, [NFL_COMPETITION(2026)])
	await gradeCompetition(db, { competitionId: NFL_COMPETITION(2026), now })
	console.log("seeded nfl", JSON.stringify(fin))
	await pool.end()
}
main().catch((e) => {
	console.error(e)
	process.exit(1)
})
