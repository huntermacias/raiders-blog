// Import plan: today's Sanity league (players, picks, Hunter's picks, finals) becomes rows for the new database.
//
// This file only PLANS. It reads a plain export and returns rows plus a validation report; it writes nothing. A
// loader (run by hand, after approval) inserts the rows in one transaction, and the report must be clean first.
//
// Principles:
//  - Nothing is dropped silently: a pick that cannot be attached to a game is listed, and blocks validation.
//  - Every id is derived from the Sanity id, so running the import twice is a no-op.
//  - Historical points are recomputed under btb-classic-v1 and must equal what the live League computes today.

import { type LeagueGame, type LeaguePick, type LeaguePlayer, bloggerScore, buildStandings } from "./../league"
import { CLASSIC_TIEBREAKS, CLASSIC_V1, buildRows, currentGrades, planGrading, scoreScoreline } from "./domain"
import { uuidV5 } from "./ids"

/** What the one-off export query returns. It includes key hashes, so it must only ever run server-side, once. */
export const BACKFILL_QUERY = `{
	"games": *[_type == 'gamePrediction' && season == $season && !(_id in path('drafts.**'))] | order(kickoff asc) {
		_id, _createdAt, season, week, awayTeam, homeTeam, kickoff,
		predictedAwayScore, predictedHomeScore, actualAwayScore, actualHomeScore
	},
	"players": *[_type == 'leaguePlayer' && !(_id in path('drafts.**'))] {
		_id, _createdAt, handle, handleLower, keyHash, banned, signupSource, signupMedium, signupCampaign, signupContent
	},
	"picks": *[_type == 'leaguePick' && season == $season && !(_id in path('drafts.**'))] {
		_id, player, predictionId, awayScore, homeScore, pickedAt
	}
}`

export type RawGame = {
	_id: string
	_createdAt?: string
	season: number
	week: number
	awayTeam: string
	homeTeam: string
	kickoff: string
	predictedAwayScore: number
	predictedHomeScore: number
	actualAwayScore?: number | null
	actualHomeScore?: number | null
}
export type RawPlayer = { _id: string; _createdAt: string; handle: string; handleLower: string; keyHash: string; banned?: boolean | null; signupSource?: string; signupMedium?: string; signupCampaign?: string; signupContent?: string }
export type RawPick = { _id: string; player: string; predictionId: string; awayScore: number; homeScore: number; pickedAt?: string | null }
export type RawExport = { games: RawGame[]; players: RawPlayer[]; picks: RawPick[] }

export const COMPETITION_ID = (season: number) => `btb-${season}`

export type Plan = {
	season: number
	competition: { id: string; season: number; kind: "btb"; name: string; policyFamily: "btb-classic"; enabled: true }
	players: { id: string; handle: string; legacyHandleLower: string; joinedAt: string; disabledAt: string | null; disabledReason: string | null }[]
	legacy: { handleLower: string; playerId: string; keyHash: string; sourceDocId: string }[]
	events: { id: string; legacyPredictionId: string; season: number; week: number; awayTeam: string; homeTeam: string; kickoff: string; state: "scheduled" | "final"; awayScore: number | null; homeScore: number | null }[]
	snapshots: { eventId: string; source: "import"; awayScore: number; homeScore: number; hash: string }[]
	bloggerPicks: { eventId: string; away: number; home: number; enteredAt: string }[]
	entries: { id: string; competitionId: string; playerId: string; eventId: string; payload: { away: number; home: number }; firstSubmittedAt: string; submittedAt: string }[]
	grades: ReturnType<typeof planGrading>["create"]
	/** Everything found and not imported. Validation fails unless this is empty. */
	orphans: { kind: "pick_without_game" | "pick_without_player" | "tie_pick" | "duplicate_pick"; id: string; detail: string }[]
}

const SKIP_TIED = (p: RawPick) => p.awayScore === p.homeScore

export function planBackfill(raw: RawExport, importedAt: string): Plan {
	const season = raw.games.length > 0 ? raw.games[0].season : new Date(importedAt).getUTCFullYear()
	const plan: Plan = {
		season,
		competition: { id: COMPETITION_ID(season), season, kind: "btb", name: "Beat the Blogger", policyFamily: "btb-classic", enabled: true },
		players: [],
		legacy: [],
		events: [],
		snapshots: [],
		bloggerPicks: [],
		entries: [],
		grades: [],
		orphans: [],
	}

	const playerId: Record<string, string> = {}
	raw.players.forEach((p) => {
		const id = uuidV5(`player:${p.handleLower}`)
		playerId[p.handleLower] = id
		plan.players.push({ id, handle: p.handle, legacyHandleLower: p.handleLower, joinedAt: p._createdAt, disabledAt: p.banned ? importedAt : null, disabledReason: p.banned ? "Banned in Studio before the move to accounts" : null })
		plan.legacy.push({ handleLower: p.handleLower, playerId: id, keyHash: p.keyHash, sourceDocId: p._id })
	})

	const eventId: Record<string, string> = {}
	const gameById: Record<string, RawGame> = {}
	raw.games.forEach((g) => {
		const id = uuidV5(`event:${g._id}`)
		eventId[g._id] = id
		gameById[g._id] = g
		const final = typeof g.actualAwayScore === "number" && typeof g.actualHomeScore === "number"
		plan.events.push({ id, legacyPredictionId: g._id, season: g.season, week: g.week, awayTeam: g.awayTeam, homeTeam: g.homeTeam, kickoff: g.kickoff, state: final ? "final" : "scheduled", awayScore: final ? (g.actualAwayScore as number) : null, homeScore: final ? (g.actualHomeScore as number) : null })
		if (final) plan.snapshots.push({ eventId: id, source: "import", awayScore: g.actualAwayScore as number, homeScore: g.actualHomeScore as number, hash: `${g.actualAwayScore}-${g.actualHomeScore}` })
		plan.bloggerPicks.push({ eventId: id, away: g.predictedAwayScore, home: g.predictedHomeScore, enteredAt: g._createdAt ?? importedAt })
	})

	const seen: Record<string, true> = {}
	raw.picks.forEach((p) => {
		if (!gameById[p.predictionId]) return void plan.orphans.push({ kind: "pick_without_game", id: p._id, detail: `${p.player} picked game ${p.predictionId}, which is not in the export` })
		if (!playerId[p.player]) return void plan.orphans.push({ kind: "pick_without_player", id: p._id, detail: `no player ${p.player}` })
		if (SKIP_TIED(p)) return void plan.orphans.push({ kind: "tie_pick", id: p._id, detail: `${p.player} picked a tie, which the rules never allowed` })
		const dupKey = `${p.player}|${p.predictionId}`
		if (seen[dupKey]) return void plan.orphans.push({ kind: "duplicate_pick", id: p._id, detail: `second pick by ${p.player} for ${p.predictionId}` })
		seen[dupKey] = true
		const at = p.pickedAt ?? gameById[p.predictionId]._createdAt ?? importedAt
		plan.entries.push({
			id: uuidV5(`entry:${p.player}:${p.predictionId}`),
			competitionId: plan.competition.id,
			playerId: playerId[p.player],
			eventId: eventId[p.predictionId],
			payload: { away: p.awayScore, home: p.homeScore },
			firstSubmittedAt: at,
			submittedAt: at,
		})
	})

	// Grade every final game under Classic v1, exactly as the live page does.
	plan.events.forEach((ev) => {
		if (ev.state !== "final") return
		const entries = plan.entries.filter((e) => e.eventId === ev.id).map((e) => ({ id: e.id, playerId: e.playerId, eventId: e.eventId, payload: e.payload }))
		plan.grades.push(
			...planGrading({
				event: { id: ev.id, kickoff: ev.kickoff, state: "final", result: { away: ev.awayScore as number, home: ev.homeScore as number } },
				entries,
				existing: [],
				policy: CLASSIC_V1,
				now: importedAt,
			}).create
		)
	})
	return plan
}

export type ValidationReport = {
	ok: boolean
	problems: string[]
	counts: { players: number; picks: number; entries: number; finalGames: number; grades: number }
}

/**
 * Prove the plan reproduces what the live League shows today. Compares every active player's season rank, points,
 * graded games, correct winners and exact scores, the blogger's own total, and the pick/entry counts.
 */
export function validateBackfill(raw: RawExport, plan: Plan): ValidationReport {
	const problems: string[] = []
	plan.orphans.forEach((o) => problems.push(`${o.kind}: ${o.detail}`))

	const active = raw.players.filter((p) => !p.banned)
	const players: LeaguePlayer[] = active.map((p) => ({ handle: p.handle, lower: p.handleLower, joinedAt: p._createdAt }))
	const games = raw.games as unknown as LeagueGame[]
	const picks: LeaguePick[] = raw.picks.map((p) => ({ player: p.player, predictionId: p.predictionId, awayScore: p.awayScore, homeScore: p.homeScore }))
	const live = buildStandings(games, players, picks)

	const idOf: Record<string, string> = {}
	plan.players.forEach((p) => (idOf[p.id] = p.legacyHandleLower))
	const weekOf: Record<string, number> = {}
	const legacyOf: Record<string, string> = {}
	plan.events.forEach((e) => {
		weekOf[e.id] = e.week
		legacyOf[e.id] = e.legacyPredictionId
	})
	const standing = currentGrades(plan.grades).map((g) => ({ ...g, week: weekOf[g.eventId] }))
	const info = plan.players.filter((p) => p.disabledAt === null).map((p) => ({ id: p.id, handle: p.handle, joinedAt: p.joinedAt }))
	const rows = buildRows(standing, info, CLASSIC_TIEBREAKS)

	if (rows.length !== live.length) problems.push(`ranked players: live ${live.length}, plan ${rows.length}`)
	live.forEach((l, i) => {
		const r = rows[i]
		if (!r) return
		const same = idOf[r.playerId] === l.lower && r.rank === l.rank && r.points === l.points && r.games === l.games && r.correct === l.correct && r.exact === l.exact
		if (!same) problems.push(`row ${i + 1} differs: live ${l.lower} #${l.rank} ${l.points}pts ${l.games}g; plan ${idOf[r.playerId]} #${r.rank} ${r.points}pts ${r.games}g`)
	})

	const finalGames = games.filter((g) => typeof g.actualAwayScore === "number" && typeof g.actualHomeScore === "number")
	const liveBlogger = finalGames.reduce((n, g) => n + (bloggerScore(g)?.points ?? 0), 0)
	const planBlogger = plan.bloggerPicks.reduce((n, b) => {
		const ev = plan.events.find((e) => e.id === b.eventId)
		if (!ev || ev.state !== "final") return n
		return n + scoreScoreline(CLASSIC_V1, { away: b.away, home: b.home }, { away: ev.awayScore as number, home: ev.homeScore as number }).points
	}, 0)
	if (liveBlogger !== planBlogger) problems.push(`blogger total differs: ${liveBlogger} vs ${planBlogger}`)

	if (plan.entries.length + plan.orphans.length !== raw.picks.length) problems.push(`pick count: ${raw.picks.length} in Sanity, ${plan.entries.length} entries + ${plan.orphans.length} unplaced`)
	if (plan.players.length !== raw.players.length) problems.push(`player count: ${raw.players.length} in Sanity, ${plan.players.length} in plan`)
	if (new Set(plan.players.map((p) => p.handle.toLowerCase())).size !== plan.players.length) problems.push("two players share a handle ignoring case")

	return {
		ok: problems.length === 0,
		problems,
		counts: { players: plan.players.length, picks: raw.picks.length, entries: plan.entries.length, finalGames: finalGames.length, grades: plan.grades.length },
	}
}
