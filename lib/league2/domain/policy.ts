// Scoring policies for the League.
//
// A policy is data, not code that anyone edits in place: it has a family, a version and an `effectiveFrom` time.
// Once a policy has been used to grade anything it is frozen. A rule change is a new version that only applies to
// games that lock after it takes effect, so a past week can never be silently re-scored.
//
// Pure: no I/O, no clock, no randomness.

export type Scoreline = { away: number; home: number }

/** The Beat the Blogger rules: exact score picks. */
export type ScorePickRules = {
	winner: number
	/** Margin error thresholds, checked in order: the first tier whose `max` is >= the error earns `pts`. */
	margin: readonly { max: number; pts: number }[]
	exactScore: number
}

export type PolicyBase = {
	/** Stable name of the rule family, e.g. "btb-classic". */
	family: string
	version: number
	/** `${family}-v${version}`. */
	id: string
	label: string
	/** Games that lock at or after this instant are graded under this version. ISO string. */
	effectiveFrom: string
	/** Set when the policy is published and frozen. Null means still a draft. */
	frozenAt: string | null
}

export type ScorePickPolicy = PolicyBase & { kind: "score-pick"; rules: ScorePickRules }
export type WinnerPolicy = PolicyBase & { kind: "winner"; rules: { correct: number } }
export type ConfidencePolicy = PolicyBase & { kind: "confidence"; rules: { perRank: number } }
export type UpsetPolicy = PolicyBase & {
	kind: "upset"
	rules: {
		/** Underdog win scores `base`; add `perTier` for each rating-gap tier above the first. */
		base: number
		perTier: number
		/** Rating-gap (win probability) boundaries between tiers, descending favourite win chance. */
		tierBoundaries: readonly number[]
	}
}
export type ScoringPolicy = ScorePickPolicy | WinnerPolicy | ConfidencePolicy | UpsetPolicy

export const policyId = (family: string, version: number) => `${family}-v${version}`

/**
 * Beat the Blogger Classic v1: exactly the rules the League has used since launch (lib/league.ts `POINTS`).
 * A test grades a grid of scorelines under both and requires identical results, so this can never drift.
 */
export const CLASSIC_V1: ScorePickPolicy = {
	family: "btb-classic",
	version: 1,
	id: policyId("btb-classic", 1),
	label: "Beat the Blogger Classic",
	kind: "score-pick",
	effectiveFrom: "1970-01-01T00:00:00.000Z",
	frozenAt: "2026-09-01T00:00:00.000Z",
	rules: {
		winner: 10,
		margin: [
			{ max: 0, pts: 10 },
			{ max: 3, pts: 6 },
			{ max: 7, pts: 3 },
		],
		exactScore: 5,
	},
}

export const WINNER_V1: WinnerPolicy = {
	family: "nfl-winner",
	version: 1,
	id: policyId("nfl-winner", 1),
	label: "NFL game winners",
	kind: "winner",
	effectiveFrom: "1970-01-01T00:00:00.000Z",
	frozenAt: null,
	rules: { correct: 1 },
}

export const CONFIDENCE_V1: ConfidencePolicy = {
	family: "nfl-confidence",
	version: 1,
	id: policyId("nfl-confidence", 1),
	label: "Confidence picks",
	kind: "confidence",
	effectiveFrom: "1970-01-01T00:00:00.000Z",
	frozenAt: null,
	rules: { perRank: 1 },
}

export const UPSET_V1: UpsetPolicy = {
	family: "nfl-upset",
	version: 1,
	id: policyId("nfl-upset", 1),
	label: "Upset challenge",
	kind: "upset",
	effectiveFrom: "1970-01-01T00:00:00.000Z",
	frozenAt: null,
	// Favourite win chance of 0.5-0.65 is tier 1, 0.65-0.80 tier 2, above 0.80 tier 3.
	rules: { base: 1, perTier: 1, tierBoundaries: [0.65, 0.8] },
}

export function maxScorePickPoints(rules: ScorePickRules): number {
	return rules.winner + (rules.margin.length > 0 ? rules.margin[0].pts : 0) + rules.exactScore
}

export type ScorePickResult = {
	points: number
	winner: boolean
	marginError: number
	exact: boolean
}

/** Score one exact-score pick under a score-pick policy. Identical to the League's live scoring for Classic v1. */
export function scoreScoreline(policy: ScorePickPolicy, pred: Scoreline, actual: Scoreline): ScorePickResult {
	const predMargin = pred.home - pred.away
	const actualMargin = actual.home - actual.away
	const winner = actualMargin !== 0 && predMargin !== 0 && Math.sign(predMargin) === Math.sign(actualMargin)
	const marginError = Math.abs(predMargin - actualMargin)
	const exact = pred.away === actual.away && pred.home === actual.home

	let points = winner ? policy.rules.winner : 0
	for (let i = 0; i < policy.rules.margin.length; i++) {
		const tier = policy.rules.margin[i]
		if (marginError <= tier.max) {
			points += tier.pts
			break
		}
	}
	if (exact) points += policy.rules.exactScore
	return { points, winner, marginError, exact }
}

export function isFrozen(policy: ScoringPolicy): boolean {
	return policy.frozenAt !== null
}

/** Freeze a policy. Freezing twice returns the same policy (idempotent). */
export function freezePolicy<P extends ScoringPolicy>(policy: P, at: string): P {
	return policy.frozenAt !== null ? policy : { ...policy, frozenAt: at }
}

/**
 * Change a policy's rules. A frozen policy is never edited: the result is the next version, effective from `from`.
 * An unfrozen draft may be edited in place. Rules of a different shape are the caller's type error, not a runtime one.
 */
export function reviseRules<P extends ScoringPolicy>(policy: P, rules: P["rules"], from: string): P {
	if (!isFrozen(policy)) return { ...policy, rules }
	const version = policy.version + 1
	return { ...policy, version, id: policyId(policy.family, version), rules, effectiveFrom: from, frozenAt: null }
}

/**
 * The policy a game is graded under: the highest-numbered frozen-or-draft version of the family whose `effectiveFrom`
 * is not after the game's lock time. Null when none applies.
 */
export function policyFor<P extends ScoringPolicy>(policies: readonly P[], family: string, lockAt: string): P | null {
	const t = Date.parse(lockAt)
	let best: P | null = null
	for (let i = 0; i < policies.length; i++) {
		const p = policies[i]
		if (p.family !== family || Date.parse(p.effectiveFrom) > t) continue
		if (best === null || p.version > best.version) best = p
	}
	return best
}

const isInt = (n: unknown, min: number, max: number): n is number => typeof n === "number" && Number.isInteger(n) && n >= min && n <= max

/**
 * Check rules typed in by an admin before they become a policy version. Returns a message for the first problem, or
 * null when the rules are usable. The shapes mirror the policy types above.
 */
export function validateRules(kind: ScoringPolicy["kind"], rules: unknown): string | null {
	const r = (rules && typeof rules === "object" ? rules : {}) as Record<string, unknown>
	switch (kind) {
		case "score-pick": {
			if (!isInt(r.winner, 0, 1000) || !isInt(r.exactScore, 0, 1000)) return "Winner and exact-score points must be whole numbers from 0 to 1000"
			const m = r.margin
			if (!Array.isArray(m) || m.length > 8) return "Margin tiers must be a list of up to 8 tiers"
			let last = -1
			for (let i = 0; i < m.length; i++) {
				const t = m[i] as { max?: unknown; pts?: unknown }
				if (!t || !isInt(t.max, 0, 99) || !isInt(t.pts, 0, 1000)) return "Each margin tier needs a whole-number margin (0 to 99) and points (0 to 1000)"
				if (t.max <= last) return "Margin tiers must go from the tightest margin to the widest"
				last = t.max
			}
			return null
		}
		case "winner":
			return isInt(r.correct, 1, 1000) ? null : "Points for a correct pick must be a whole number from 1 to 1000"
		case "confidence":
			return isInt(r.perRank, 1, 1000) ? null : "Points per confidence rank must be a whole number from 1 to 1000"
		case "upset": {
			if (!isInt(r.base, 0, 1000) || !isInt(r.perTier, 0, 1000)) return "Base and per-tier points must be whole numbers from 0 to 1000"
			const b = r.tierBoundaries
			if (!Array.isArray(b) || b.length > 6) return "Tier boundaries must be a list of up to 6 numbers"
			let last = 0.5
			for (let i = 0; i < b.length; i++) {
				if (typeof b[i] !== "number" || !(b[i] > last) || !(b[i] < 1)) return "Tier boundaries must rise between 0.5 and 1"
				last = b[i]
			}
			return null
		}
	}
}
