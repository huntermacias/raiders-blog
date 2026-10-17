// Grading: turning final results into stored, auditable grade rows.
//
// A grade is never edited. A correction (a changed final score) adds a new grade that supersedes the old one, and a
// voided game adds a void grade. Running the same grading twice adds nothing: each grade has a deterministic key
// made of the entry, the policy version and the result it was graded against.
//
// Pure: no I/O.

import { type EventResult, type LeagueEvent, type ScorePickPayload } from "./lifecycle"
import { type ConfidencePolicy, type ScorePickPolicy, type ScoringPolicy, type UpsetPolicy, type WinnerPolicy, scoreScoreline } from "./policy"

export type Grade = {
	/** `${entryId}|${policyId}|${resultHash}`, with `|#n` added for the nth later grade of the same entry. Unique per grade. */
	key: string
	entryId: string
	eventId: string
	playerId: string
	policyId: string
	/** Canonical form of the result this was graded against. "void" for a void grade. */
	resultHash: string
	points: number
	/** Components for display and tiebreaks, e.g. { winner: true, marginError: 3, exact: false }. */
	detail: { correct: boolean; marginError: number | null; exact: boolean }
	voided: boolean
	gradedAt: string
	/** Key of the grade this one replaces, if any. */
	supersedes: string | null
}

export const resultHash = (r: EventResult): string => `${r.away}-${r.home}`
export const gradeKey = (entryId: string, policyId: string, hash: string, generation = 0) =>
	generation === 0 ? `${entryId}|${policyId}|${hash}` : `${entryId}|${policyId}|${hash}|#${generation}`

export type GradableEntry = { id: string; playerId: string; eventId: string; payload: unknown }

/** The latest grade of each entry: the one nothing supersedes. */
export function currentGrades(grades: readonly Grade[]): Grade[] {
	const replaced: Record<string, true> = {}
	grades.forEach((g) => {
		if (g.supersedes) replaced[g.supersedes] = true
	})
	return grades.filter((g) => !replaced[g.key])
}

type Draft = Pick<Grade, "points" | "detail">

function gradeScorePick(policy: ScorePickPolicy, payload: ScorePickPayload, result: EventResult): Draft {
	const s = scoreScoreline(policy, { away: payload.away, home: payload.home }, result)
	return { points: s.points, detail: { correct: s.winner, marginError: s.marginError, exact: s.exact } }
}

function winnerOf(r: EventResult): "away" | "home" | "tie" {
	return r.away === r.home ? "tie" : r.home > r.away ? "home" : "away"
}

function gradeWinner(policy: WinnerPolicy, payload: { pick: "away" | "home" }, result: EventResult): Draft {
	const correct = winnerOf(result) === payload.pick
	return { points: correct ? policy.rules.correct : 0, detail: { correct, marginError: null, exact: false } }
}

function gradeConfidence(policy: ConfidencePolicy, payload: { pick: "away" | "home"; rank: number }, result: EventResult): Draft {
	const correct = winnerOf(result) === payload.pick
	return { points: correct ? payload.rank * policy.rules.perRank : 0, detail: { correct, marginError: null, exact: false } }
}

/** Win chance of the favourite and the tier of an upset, from a pre-lock rating snapshot. */
export function upsetTier(policy: UpsetPolicy, favouriteWinChance: number): number {
	let tier = 1
	for (let i = 0; i < policy.rules.tierBoundaries.length; i++) {
		if (favouriteWinChance >= policy.rules.tierBoundaries[i]) tier = i + 2
	}
	return tier
}

function gradeUpset(
	policy: UpsetPolicy,
	payload: { pick: "away" | "home" },
	result: EventResult,
	snapshot: { underdog: "away" | "home"; favouriteWinChance: number }
): Draft {
	const won = winnerOf(result) === payload.pick
	const pickedUnderdog = payload.pick === snapshot.underdog
	const points = won && pickedUnderdog ? policy.rules.base + (upsetTier(policy, snapshot.favouriteWinChance) - 1) * policy.rules.perTier : 0
	return { points, detail: { correct: won && pickedUnderdog, marginError: null, exact: false } }
}

export type UpsetSnapshot = { underdog: "away" | "home"; favouriteWinChance: number }

/**
 * Pure, deterministic grade of one entry. `snapshot` is only used by the upset policy and must be the rating-derived
 * underdog captured at lock time, so a later rating change cannot move the answer.
 */
export function gradePayload(policy: ScoringPolicy, payload: unknown, result: EventResult, snapshot?: UpsetSnapshot): Draft | null {
	switch (policy.kind) {
		case "score-pick": {
			const p = payload as ScorePickPayload
			return typeof p?.away === "number" && typeof p?.home === "number" ? gradeScorePick(policy, p, result) : null
		}
		case "winner":
			return gradeWinner(policy, payload as { pick: "away" | "home" }, result)
		case "confidence": {
			const p = payload as { pick: "away" | "home"; rank: number }
			return typeof p?.rank === "number" ? gradeConfidence(policy, p, result) : null
		}
		case "upset":
			return snapshot ? gradeUpset(policy, payload as { pick: "away" | "home" }, result, snapshot) : null
	}
}

export type GradingPlan = {
	create: Grade[]
	/** Entries that already had this exact grade. */
	skipped: number
	/** Entries that could not be graded (malformed payload or missing snapshot). */
	unreadable: string[]
}

/**
 * Work out which grade rows to add for a finished event. Safe to run any number of times:
 *  - a final result not graded yet adds one grade per entry;
 *  - the same result again adds nothing;
 *  - a different (corrected) result adds a grade that supersedes the current one;
 *  - a non-final event adds nothing, so a game is never graded early;
 *  - a cancelled event adds a void grade (0 points, excluded from counts) for any entry that has none.
 */
export function planGrading(args: {
	event: LeagueEvent
	entries: readonly GradableEntry[]
	existing: readonly Grade[]
	policy: ScoringPolicy
	snapshot?: UpsetSnapshot
	now: string
}): GradingPlan {
	const { event, entries, existing, policy, snapshot, now } = args
	const plan: GradingPlan = { create: [], skipped: 0, unreadable: [] }
	const current = currentGrades(existing)
	const currentByEntry: Record<string, Grade> = {}
	current.forEach((g) => {
		currentByEntry[g.entryId] = g
	})
	// How many grades each entry already has: the next one gets a fresh key even if it repeats an earlier result.
	const generation: Record<string, number> = {}
	existing.forEach((g) => {
		generation[g.entryId] = (generation[g.entryId] || 0) + 1
	})

	if (event.state === "cancelled") {
		entries.forEach((e) => {
			const cur = currentByEntry[e.id]
			if (cur && cur.voided) return void plan.skipped++
			const key = gradeKey(e.id, policy.id, "void", generation[e.id] || 0)
			plan.create.push({
				key,
				entryId: e.id,
				eventId: e.eventId,
				playerId: e.playerId,
				policyId: policy.id,
				resultHash: "void",
				points: 0,
				detail: { correct: false, marginError: null, exact: false },
				voided: true,
				gradedAt: now,
				supersedes: cur ? cur.key : null,
			})
		})
		return plan
	}

	if (event.state !== "final" || !event.result) return plan
	const hash = resultHash(event.result)

	entries.forEach((e) => {
		const cur = currentByEntry[e.id]
		// Already graded against this very result under this policy: nothing to do.
		if (cur && !cur.voided && cur.policyId === policy.id && cur.resultHash === hash) return void plan.skipped++
		const key = gradeKey(e.id, policy.id, hash, generation[e.id] || 0)
		const draft = gradePayload(policy, e.payload, event.result as EventResult, snapshot)
		if (!draft) return void plan.unreadable.push(e.id)
		plan.create.push({
			key,
			entryId: e.id,
			eventId: e.eventId,
			playerId: e.playerId,
			policyId: policy.id,
			resultHash: hash,
			points: draft.points,
			detail: draft.detail,
			voided: false,
			gradedAt: now,
			supersedes: cur ? cur.key : null,
		})
	})
	return plan
}

/** Apply a plan to the grades you already have. Convenience for tests and in-memory runs. */
export function applyPlan(existing: readonly Grade[], plan: GradingPlan): Grade[] {
	return existing.concat(plan.create)
}

// --- rating-derived underdog ---------------------------------------------------

/** Logistic win chance for the home side from an Elo-style rating gap, with a published home-field constant. */
export function homeWinChance(homeRating: number, awayRating: number, homeField = 48): number {
	return 1 / (1 + Math.pow(10, -(homeRating + homeField - awayRating) / 400))
}

/**
 * Freeze the underdog for an event from the ratings known at lock time. A dead heat (exactly 0.5) has no underdog,
 * so no upset points are offered on that game.
 */
export function underdogSnapshot(homeRating: number, awayRating: number, homeField = 48): UpsetSnapshot | null {
	const p = homeWinChance(homeRating, awayRating, homeField)
	if (p === 0.5) return null
	return p > 0.5 ? { underdog: "away", favouriteWinChance: p } : { underdog: "home", favouriteWinChance: 1 - p }
}
