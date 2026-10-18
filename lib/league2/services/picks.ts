// Saving a player's pick. The server decides everything that matters: the clock, whether the game is open, whether the
// player may play, and what counts as a valid pick. The browser only proposes.

import type { Db, Queryable } from "../db"
import { type ConfidenceEntry, type Entry, type LeagueEvent, type SubmitError, DEFAULT_MAX_UPSETS, submitEntry, validateConfidence, validateConfidencePick, validateScorePick, validateUpsetCall, validateWinnerPick } from "../domain"
import { uuidV5 } from "../ids"
import { toLeagueEvent } from "./grade"

export type PickResult = { ok: true; entryId: string; change: "created" | "revised" | "unchanged"; submittedAt: string } | { ok: false; error: SubmitError | "not_allowed"; message: string }
export type WeekSaveResult = { ok: true; saved: number; changed: number } | { ok: false; error: SubmitError | "not_allowed"; message: string }

type EventRow = { id: string; week: number; season: number; kickoff: Date; lock_at: Date | null; state: "scheduled" | "postponed" | "in_progress" | "final" | "cancelled"; away_score: number | null; home_score: number | null; legacy_prediction_id: string | null; nfl_game_id: string | null }
const EVENT_COLS = `id, week, season, kickoff, lock_at, state, away_score, home_score, legacy_prediction_id, nfl_game_id`

const notFound = (message = "Game not found") => ({ ok: false, error: "not_found", message }) as const
const notAllowed = (message: string) => ({ ok: false, error: "not_allowed", message }) as const
const invalid = (message: string) => ({ ok: false, error: "invalid", message }) as const

async function loadComp(q: Queryable, competitionId: string): Promise<{ kind: string; enabled: boolean; config: Record<string, unknown> } | null> {
	const r = await q.query<{ kind: string; enabled: boolean; config: Record<string, unknown> }>(`select kind, enabled, config from league_competitions where id = $1`, [competitionId])
	return r.rows[0] ?? null
}

async function playerMayPlay(q: Queryable, playerId: string): Promise<boolean> {
	return (await q.query(`select 1 from league_players where id = $1 and disabled_at is null`, [playerId])).rows.length > 0
}

/** Create or change one entry, with its history. Shared by every format. */
async function putEntry(q: Queryable, a: { competitionId: string; playerId: string; row: EventRow; payload: unknown; validate: (p: unknown) => string | null; now: number }): Promise<PickResult> {
	const { row } = a
	const have = await q.query<{ id: string; payload: unknown; first_submitted_at: Date; submitted_at: Date; voided_at: Date | null }>(`select id, payload, first_submitted_at, submitted_at, voided_at from league_entries where competition_id = $1 and player_id = $2 and event_id = $3 for update`, [a.competitionId, a.playerId, row.id])
	if (have.rows[0]?.voided_at) return notAllowed("This pick was removed by the league admin and cannot be changed")
	const revs = have.rows[0] ? await q.query<{ n: number; payload: unknown; at: Date }>(`select n, payload, at from league_entry_revisions where entry_id = $1 order by n`, [have.rows[0].id]) : { rows: [] }
	const existing: Entry<unknown> | null = have.rows[0]
		? { id: have.rows[0].id, playerId: a.playerId, eventId: row.id, payload: have.rows[0].payload, submittedAt: new Date(have.rows[0].submitted_at).toISOString(), firstSubmittedAt: new Date(have.rows[0].first_submitted_at).toISOString(), revisions: revs.rows.map((r) => ({ n: r.n, payload: r.payload, at: new Date(r.at).toISOString() })) }
		: null
	const result = submitEntry(toLeagueEvent(row), existing, {
		entryId: have.rows[0]?.id ?? uuidV5(`entry:${a.playerId}:${row.id}:${a.competitionId}`),
		playerId: a.playerId,
		payload: a.payload,
		nowMs: a.now,
		validate: a.validate,
	})
	if (!result.ok) return result
	const e = result.entry
	if (result.change === "created") {
		await q.query(`insert into league_entries (id, competition_id, player_id, event_id, payload, first_submitted_at, submitted_at) values ($1, $2, $3, $4, $5::jsonb, $6, $6)`, [e.id, a.competitionId, a.playerId, row.id, JSON.stringify(e.payload), e.submittedAt])
		await q.query(`insert into league_entry_revisions (entry_id, n, payload, at) values ($1, 1, $2::jsonb, $3)`, [e.id, JSON.stringify(e.payload), e.submittedAt])
	} else if (result.change === "revised") {
		const rev = e.revisions[e.revisions.length - 1]
		await q.query(`update league_entries set payload = $2::jsonb, submitted_at = $3 where id = $1`, [e.id, JSON.stringify(e.payload), e.submittedAt])
		await q.query(`insert into league_entry_revisions (entry_id, n, payload, at) values ($1, $2, $3::jsonb, $4)`, [e.id, rev.n, JSON.stringify(e.payload), rev.at])
	}
	return { ok: true, entryId: e.id, change: result.change, submittedAt: e.submittedAt }
}

/** One pick: a score (Beat the Blogger), a winner (NFL winners) or an upset call (NFL upset challenge). */
export async function submitPick(db: Db, a: { competitionId: string; playerId: string; eventId: unknown; payload: unknown; now: number }): Promise<PickResult> {
	if (typeof a.eventId !== "string" || !/^[0-9a-f-]{36}$/i.test(a.eventId)) return notFound()
	const payload = (a.payload && typeof a.payload === "object" ? a.payload : {}) as Record<string, unknown>
	return db.tx(async (q): Promise<PickResult> => {
		const c = await loadComp(q, a.competitionId)
		if (!c || !c.enabled) return notFound("This competition is not open")
		if (c.kind === "confidence") return notFound("Confidence picks are saved for the whole week at once")
		if (c.kind !== "btb" && c.kind !== "weekly-winners" && c.kind !== "upset") return notFound("This competition does not take picks yet")
		if (!(await playerMayPlay(q, a.playerId))) return notAllowed("This account cannot make picks")

		const evr = await q.query<EventRow>(`select ${EVENT_COLS} from league_events where id = $1 and kind = 'game' for update`, [a.eventId])
		const row = evr.rows[0]
		const belongs = row && (c.kind === "btb" ? row.legacy_prediction_id !== null : row.nfl_game_id !== null)
		if (!row || !belongs) return notFound()

		if (c.kind === "upset") {
			const line = await q.query<{ underdog: "away" | "home" }>(`select underdog from league_upset_lines where event_id = $1`, [row.id])
			const underdog = line.rows[0]?.underdog ?? null
			if (underdog === null) return invalid("The underdog for this game is set when its week opens")
			const pick = { pick: payload.pick }
			// One player's calls for a week are counted and written under one lock, so two taps at once cannot beat the cap.
			await q.query(`select pg_advisory_xact_lock(hashtext($1))`, [`upset:${a.playerId}:${row.season}:${row.week}`])
			if (pick.pick !== "none") {
				const cap = Number((c.config as { maxUpsets?: unknown }).maxUpsets) || DEFAULT_MAX_UPSETS
				const calls = await q.query<{ n: number; mine: boolean }>(
					`select count(*) filter (where n.payload->>'pick' <> 'none' and n.event_id <> $4)::int as n, coalesce(bool_or(n.event_id = $4 and n.payload->>'pick' <> 'none'), false) as mine
					 from league_entries n join league_events e on e.id = n.event_id
					 where n.competition_id = $1 and n.player_id = $2 and e.season = $3 and e.week = $5 and n.voided_at is null`,
					[a.competitionId, a.playerId, row.season, row.id, row.week]
				)
				if (!calls.rows[0].mine && calls.rows[0].n >= cap) return invalid(`You can call up to ${cap} upsets a week. Take one back to call another.`)
			}
			return putEntry(q, { competitionId: a.competitionId, playerId: a.playerId, row, payload: pick, validate: (p) => validateUpsetCall(p as { pick?: unknown }, underdog), now: a.now })
		}

		const clean = c.kind === "btb" ? { away: payload.away, home: payload.home } : { pick: payload.pick }
		return putEntry(q, { competitionId: a.competitionId, playerId: a.playerId, row, payload: clean, validate: (p) => (c.kind === "btb" ? validateScorePick(p as { away?: unknown; home?: unknown }) : validateWinnerPick(p as { pick?: unknown })), now: a.now })
	})
}

type Item = { eventId: string; pick: "away" | "home"; rank: number }

function readItems(raw: unknown): Item[] | string {
	if (!Array.isArray(raw) || raw.length === 0) return "Send at least one pick"
	if (raw.length > 24) return "That is more games than a week has"
	const seen: Record<string, true> = {}
	const out: Item[] = []
	for (const r of raw) {
		const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>
		if (typeof o.eventId !== "string" || !/^[0-9a-f-]{36}$/i.test(o.eventId)) return "Game not found"
		if (seen[o.eventId]) return "Each game can only be in your picks once"
		seen[o.eventId] = true
		out.push({ eventId: o.eventId, pick: o.pick as "away" | "home", rank: o.rank as number })
	}
	return out
}

/**
 * Confidence picks are one slate per week, because every rank can be used once. The player sends the games they are
 * changing; everything else they already picked stays. The whole slate is checked together and written in one go, so a
 * swap of two ranks never leaves two games sharing one.
 */
export async function saveConfidenceWeek(db: Db, a: { competitionId: string; playerId: string; items: unknown; now: number }): Promise<WeekSaveResult> {
	const items = readItems(a.items)
	if (typeof items === "string") return items === "Game not found" ? notFound(items) : invalid(items)
	return db.tx(async (q): Promise<WeekSaveResult> => {
		const c = await loadComp(q, a.competitionId)
		if (!c || !c.enabled) return notFound("This competition is not open")
		if (c.kind !== "confidence") return notFound("This competition does not take a confidence slate")
		if (!(await playerMayPlay(q, a.playerId))) return notAllowed("This account cannot make picks")

		const ids = items.map((i) => i.eventId)
		const picked = await q.query<EventRow>(`select ${EVENT_COLS} from league_events where id = any($1::uuid[]) and kind = 'game' and nfl_game_id is not null for update`, [ids])
		if (picked.rows.length !== ids.length) return notFound()
		const { week, season } = picked.rows[0]
		if (picked.rows.some((r) => r.week !== week || r.season !== season)) return invalid("Confidence picks are for one week at a time")

		await q.query(`select pg_advisory_xact_lock(hashtext($1))`, [`confidence:${a.playerId}:${season}:${week}`])
		const weekEvents = await q.query<EventRow>(`select ${EVENT_COLS} from league_events where season = $1 and week = $2 and kind = 'game' and nfl_game_id is not null`, [season, week])
		const games = weekEvents.rows.length
		const events: Record<string, LeagueEvent> = {}
		weekEvents.rows.forEach((r) => (events[r.id] = toLeagueEvent(r)))

		const prev = await q.query<{ event_id: string; payload: { pick: "away" | "home"; rank: number }; voided_at: Date | null }>(
			`select n.event_id, n.payload, n.voided_at from league_entries n join league_events e on e.id = n.event_id where n.competition_id = $1 and n.player_id = $2 and e.season = $3 and e.week = $4`,
			[a.competitionId, a.playerId, season, week]
		)
		if (prev.rows.some((p) => p.voided_at && ids.includes(p.event_id))) return notAllowed("A pick of yours was removed by the league admin and cannot be changed")
		const previous: ConfidenceEntry[] = prev.rows.filter((p) => !p.voided_at).map((p) => ({ eventId: p.event_id, pick: p.payload.pick, rank: p.payload.rank }))

		// Per-pick shape first (a clear message beats a slate-wide one), then the slate as a whole.
		for (const i of items) {
			const bad = validateConfidencePick(i, games)
			if (bad) return invalid(bad)
		}
		const merged: Record<string, ConfidenceEntry> = {}
		previous.forEach((p) => (merged[p.eventId] = p))
		items.forEach((i) => (merged[i.eventId] = { eventId: i.eventId, pick: i.pick, rank: i.rank }))
		const next = Object.keys(merged).map((k) => merged[k])
		const bad = validateConfidence(next, previous, events, a.now, games)
		if (bad) return /has started/.test(bad) ? ({ ok: false, error: "closed", message: bad } as const) : invalid(bad)

		let changed = 0
		for (const i of items) {
			const row = picked.rows.find((r) => r.id === i.eventId) as EventRow
			const was = previous.find((p) => p.eventId === i.eventId)
			if (was && was.pick === i.pick && was.rank === i.rank) continue
			const r = await putEntry(q, { competitionId: a.competitionId, playerId: a.playerId, row, payload: { pick: i.pick, rank: i.rank }, validate: () => null, now: a.now })
			if (!r.ok) return r
			if (r.change !== "unchanged") changed++
		}
		return { ok: true, saved: items.length, changed }
	})
}
