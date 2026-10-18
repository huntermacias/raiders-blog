// The life of an event (a game or a question) and of a player's entry on it.
//
// Locks are decided here from a clock the SERVER passes in. A browser's clock is never an input.
//
// Published policy (also shown to players):
//  - An entry locks at the event's lock time, which is its kickoff unless a postponement moved it.
//  - A postponement announced before the lock moves the lock with the kickoff and keeps every pick.
//  - A pick can be changed any number of times before the lock; every change is kept as a revision.
//  - Once locked, the pick is final. The blogger's pick follows the same lock; changing it afterwards is a
//    recorded correction with a reason, visible on the game (see `reviseBloggerPick`).
//  - Cancelled games are voided: no points either way.
//
// Pure: no I/O.

export type EventState = "scheduled" | "postponed" | "in_progress" | "final" | "cancelled"

export type EventResult = { away: number; home: number }

export type LeagueEvent = {
	id: string
	/** ISO kickoff time. */
	kickoff: string
	/** Optional override set by an admin when the lock must differ from kickoff. ISO. */
	lockAt?: string | null
	state: EventState
	/** Present once the game is final. */
	result?: EventResult | null
}

export function lockAtMs(ev: Pick<LeagueEvent, "kickoff" | "lockAt">): number {
	return Date.parse(ev.lockAt ?? ev.kickoff)
}

/** True while entries can still be created or changed. */
export function isOpen(ev: LeagueEvent, nowMs: number): boolean {
	if (ev.state !== "scheduled" && ev.state !== "postponed") return false
	if (ev.result) return false
	return nowMs < lockAtMs(ev)
}

export type EntryState = "draft" | "submitted" | "locked" | "awaiting_result" | "graded" | "corrected" | "void" | "missed"

export type EntrySnapshot = {
	/** Null for a draft that was never submitted. */
	submittedAt: string | null
	/** Number of grade rows in the chain for this entry (0 = not graded). */
	gradeCount: number
	/** True when the current grade is a void grade. */
	voided: boolean
}

export function entryStateOf(entry: EntrySnapshot | null, ev: LeagueEvent, nowMs: number): EntryState {
	if (ev.state === "cancelled" || entry?.voided) return "void"
	const submitted = entry !== null && entry.submittedAt !== null
	if (isOpen(ev, nowMs)) return submitted ? "submitted" : "draft"
	if (!submitted) return "missed"
	if (entry!.gradeCount > 1) return "corrected"
	if (entry!.gradeCount === 1) return "graded"
	return ev.state === "final" && ev.result ? "awaiting_result" : "locked"
}

// --- submitting ---------------------------------------------------------------

export type Revision<P> = { n: number; payload: P; at: string }

export type Entry<P> = {
	id: string
	playerId: string
	eventId: string
	payload: P
	submittedAt: string
	/** First submission time. `submittedAt` is the latest. */
	firstSubmittedAt: string
	revisions: Revision<P>[]
}

export type SubmitError = "closed" | "invalid" | "not_found"
export type SubmitResult<P> =
	| { ok: true; entry: Entry<P>; change: "created" | "revised" | "unchanged" }
	| { ok: false; error: SubmitError; message: string }

export type SubmitInput<P> = {
	entryId: string
	playerId: string
	payload: P
	/** The server's clock, ms since the epoch. */
	nowMs: number
	/** Payload-specific validation. Return a message to reject. */
	validate: (payload: P) => string | null
	equals?: (a: P, b: P) => boolean
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Create or change an entry. Re-submitting the same payload changes nothing (so a double tap or a retry after a
 * dropped connection is harmless). A different payload before the lock becomes a new revision.
 */
export function submitEntry<P>(ev: LeagueEvent | null, existing: Entry<P> | null, input: SubmitInput<P>): SubmitResult<P> {
	if (!ev) return { ok: false, error: "not_found", message: "Game not found" }
	if (!isOpen(ev, input.nowMs)) return { ok: false, error: "closed", message: "Picks are closed for this game" }
	const bad = input.validate(input.payload)
	if (bad) return { ok: false, error: "invalid", message: bad }

	const at = new Date(input.nowMs).toISOString()
	if (!existing) {
		const entry: Entry<P> = {
			id: input.entryId,
			playerId: input.playerId,
			eventId: ev.id,
			payload: input.payload,
			submittedAt: at,
			firstSubmittedAt: at,
			revisions: [{ n: 1, payload: input.payload, at }],
		}
		return { ok: true, entry, change: "created" }
	}
	const eq = input.equals ?? sameJson
	if (eq(existing.payload, input.payload)) return { ok: true, entry: existing, change: "unchanged" }
	const entry: Entry<P> = {
		...existing,
		payload: input.payload,
		submittedAt: at,
		revisions: existing.revisions.concat([{ n: existing.revisions.length + 1, payload: input.payload, at }]),
	}
	return { ok: true, entry, change: "revised" }
}

// --- score picks ---------------------------------------------------------------

export const MAX_SCORE = 99
export type ScorePickPayload = { away: number; home: number }

const isScore = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_SCORE

/** Same rules as the League today: whole numbers 0 to 99, and no tied scores. */
export function validateScorePick(p: { away?: unknown; home?: unknown }): string | null {
	if (!isScore(p.away) || !isScore(p.home)) return `Scores must be whole numbers from 0 to ${MAX_SCORE}`
	if (p.away === p.home) return "Pick a winner: the scores can't be tied"
	return null
}

export type WinnerPayload = { pick: "away" | "home" }
export const validateWinnerPick = (p: { pick?: unknown }): string | null => (p.pick === "away" || p.pick === "home" ? null : "Pick a team")

// --- confidence ----------------------------------------------------------------

export type ConfidenceEntry = { eventId: string; pick: "away" | "home"; rank: number }

/**
 * Check a confidence slate. Ranks must be unique whole numbers from 1 to the number of picks, and a game that has
 * already locked must keep exactly the pick and rank it had. Games not yet locked can be re-ranked freely, so the
 * ranks of locked games are fixed and the rest are shuffled around them.
 */
export function validateConfidence(
	next: readonly ConfidenceEntry[],
	previous: readonly ConfidenceEntry[],
	events: Readonly<Record<string, LeagueEvent>>,
	nowMs: number,
	/** Highest rank in play. Defaults to the number of picks; the public league passes the week's game count so ranks can leave gaps. */
	max: number = next.length
): string | null {
	const n = max
	const seen: Record<number, true> = {}
	for (let i = 0; i < next.length; i++) {
		const e = next[i]
		if (e.pick !== "away" && e.pick !== "home") return "Pick a team for every game"
		if (!Number.isInteger(e.rank) || e.rank < 1 || e.rank > n) return `Confidence ranks run from 1 to ${n}`
		if (seen[e.rank]) return "Each confidence rank can be used once"
		seen[e.rank] = true
		if (!events[e.eventId]) return "Unknown game in your picks"
	}
	const prevBy: Record<string, ConfidenceEntry> = {}
	previous.forEach((p) => {
		prevBy[p.eventId] = p
	})
	const nextBy: Record<string, ConfidenceEntry> = {}
	next.forEach((p) => {
		nextBy[p.eventId] = p
	})
	// A locked game's pick and rank are fixed; it cannot be dropped or changed.
	for (const id in prevBy) {
		const ev = events[id]
		if (!ev || isOpen(ev, nowMs)) continue
		const now = nextBy[id]
		if (!now || now.pick !== prevBy[id].pick || now.rank !== prevBy[id].rank) return "A game that has started can't be changed"
	}
	for (let i = 0; i < next.length; i++) {
		const ev = events[next[i].eventId]
		const before = prevBy[next[i].eventId]
		if (!isOpen(ev, nowMs) && !before) return "A game that has started can't be added"
	}
	return null
}

// --- the blogger's pick ---------------------------------------------------------

export type BloggerPick = {
	eventId: string
	away: number
	home: number
	enteredAt: string
	/** Every version, oldest first. */
	revisions: { n: number; away: number; home: number; at: string; reason: string | null; afterLock: boolean }[]
}

export type BloggerResult = { ok: true; pick: BloggerPick; afterLock: boolean; change: "created" | "revised" | "unchanged" } | { ok: false; message: string }

/**
 * Enter or revise the blogger's own pick. Before the lock it behaves like a reader's. After the lock a change needs
 * a written reason and is flagged `afterLock` forever, so the site can show it and nobody can rewrite history quietly.
 */
export function reviseBloggerPick(
	ev: LeagueEvent | null,
	existing: BloggerPick | null,
	input: { away: unknown; home: unknown; reason?: string | null; nowMs: number }
): BloggerResult {
	if (!ev) return { ok: false, message: "Game not found" }
	if (ev.state === "cancelled") return { ok: false, message: "This game was cancelled" }
	const bad = validateScorePick({ away: input.away, home: input.home })
	if (bad) return { ok: false, message: bad }
	const away = input.away as number
	const home = input.home as number
	const at = new Date(input.nowMs).toISOString()
	const afterLock = !isOpen(ev, input.nowMs)

	if (!existing) {
		if (afterLock) return { ok: false, message: "The blogger's pick has to be entered before the lock" }
		const pick: BloggerPick = { eventId: ev.id, away, home, enteredAt: at, revisions: [{ n: 1, away, home, at, reason: null, afterLock: false }] }
		return { ok: true, pick, afterLock: false, change: "created" }
	}
	if (existing.away === away && existing.home === home) return { ok: true, pick: existing, afterLock, change: "unchanged" }
	const reason = (input.reason ?? "").trim()
	if (afterLock && reason.length < 10) return { ok: false, message: "A change after the lock needs a written reason (at least 10 characters)" }
	const pick: BloggerPick = {
		...existing,
		away,
		home,
		revisions: existing.revisions.concat([{ n: existing.revisions.length + 1, away, home, at, reason: reason || null, afterLock }]),
	}
	return { ok: true, pick, afterLock, change: "revised" }
}
