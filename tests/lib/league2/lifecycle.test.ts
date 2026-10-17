import { describe, expect, it } from "vitest"

import { type ConfidenceEntry, type Entry, type LeagueEvent, entryStateOf, isOpen, lockAtMs, reviseBloggerPick, submitEntry, validateConfidence, validateScorePick, validateWinnerPick } from "../../../lib/league2/domain"

const KICK = "2026-10-04T17:00:00.000Z"
const kick = Date.parse(KICK)
const ev = (over: Partial<LeagueEvent> = {}): LeagueEvent => ({ id: "g1", kickoff: KICK, state: "scheduled", ...over })
const pick = { away: 17, home: 24 }
const input = (nowMs: number, payload = pick) => ({ entryId: "p1:g1", playerId: "p1", payload, nowMs, validate: validateScorePick })

describe("locks use the server clock and the event's lock time", () => {
	it("is open before kickoff and closed from kickoff on", () => {
		expect(isOpen(ev(), kick - 1)).toBe(true)
		expect(isOpen(ev(), kick)).toBe(false)
		expect(isOpen(ev(), kick + 1)).toBe(false)
	})

	it("closes for a finished, in-progress or cancelled game whatever the clock says", () => {
		expect(isOpen(ev({ state: "in_progress" }), kick - 1000)).toBe(false)
		expect(isOpen(ev({ state: "cancelled" }), kick - 1000)).toBe(false)
		expect(isOpen(ev({ state: "final", result: { away: 1, home: 2 } }), kick - 1000)).toBe(false)
	})

	it("moves the lock with a postponement and keeps the pick", () => {
		const later = "2026-10-05T01:00:00.000Z"
		const postponed = ev({ state: "postponed", kickoff: later })
		expect(lockAtMs(postponed)).toBe(Date.parse(later))
		expect(isOpen(postponed, kick + 3600_000)).toBe(true)
		const first = submitEntry(ev(), null, input(kick - 5000))
		expect(first.ok).toBe(true)
		const revised = submitEntry(postponed, first.ok ? first.entry : null, input(kick + 3600_000, { away: 20, home: 27 }))
		expect(revised.ok && revised.change).toBe("revised")
	})

	it("honours an explicit lockAt override", () => {
		const e = ev({ lockAt: "2026-10-04T16:00:00.000Z" })
		expect(isOpen(e, Date.parse("2026-10-04T16:30:00.000Z"))).toBe(false)
	})
})

describe("submitting and editing a pick", () => {
	it("creates, then ignores an identical resubmission, then keeps every change", () => {
		const a = submitEntry(ev(), null, input(kick - 60_000))
		expect(a.ok && a.change).toBe("created")
		if (!a.ok) throw new Error("expected ok")
		const same = submitEntry(ev(), a.entry, input(kick - 30_000))
		expect(same.ok && same.change).toBe("unchanged")
		expect(same.ok && same.entry.revisions.length).toBe(1)
		const b = submitEntry(ev(), a.entry, input(kick - 20_000, { away: 10, home: 13 }))
		expect(b.ok && b.change).toBe("revised")
		if (!b.ok) throw new Error("expected ok")
		expect(b.entry.revisions.map((r) => r.payload)).toEqual([pick, { away: 10, home: 13 }])
		expect(b.entry.firstSubmittedAt).toBe(a.entry.firstSubmittedAt)
		expect(b.entry.submittedAt).not.toBe(a.entry.submittedAt)
	})

	it("refuses at and after kickoff, whatever the payload", () => {
		for (const t of [kick, kick + 1, kick + 86_400_000]) {
			const r = submitEntry(ev(), null, input(t))
			expect(r.ok).toBe(false)
			expect(!r.ok && r.error).toBe("closed")
		}
	})

	it("cannot change a locked pick", () => {
		const a = submitEntry(ev(), null, input(kick - 1000))
		if (!a.ok) throw new Error("expected ok")
		const late = submitEntry(ev(), a.entry, input(kick + 1000, { away: 3, home: 4 }))
		expect(late.ok).toBe(false)
		expect(a.entry.payload).toEqual(pick)
	})

	it("rejects bad scores and ties", () => {
		expect(validateScorePick({ away: 1.5, home: 3 })).toMatch(/whole numbers/)
		expect(validateScorePick({ away: -1, home: 3 })).toMatch(/whole numbers/)
		expect(validateScorePick({ away: 100, home: 3 })).toMatch(/whole numbers/)
		expect(validateScorePick({ away: "7", home: 3 })).toMatch(/whole numbers/)
		expect(validateScorePick({ away: 20, home: 20 })).toMatch(/tied/)
		expect(validateScorePick({ away: 0, home: 99 })).toBeNull()
		const r = submitEntry(ev(), null, input(kick - 1000, { away: 7, home: 7 }))
		expect(!r.ok && r.error).toBe("invalid")
	})

	it("reports a missing game", () => {
		const r = submitEntry(null, null, input(kick - 1000))
		expect(!r.ok && r.error).toBe("not_found")
	})

	it("validates winner picks", () => {
		expect(validateWinnerPick({ pick: "home" })).toBeNull()
		expect(validateWinnerPick({ pick: "tie" })).not.toBeNull()
	})
})

describe("entry states", () => {
	const entry = (over = {}) => ({ submittedAt: "2026-10-01T00:00:00Z", gradeCount: 0, voided: false, ...over })
	it("walks draft, submitted, locked, awaiting result, graded, corrected", () => {
		expect(entryStateOf(null, ev(), kick - 1000)).toBe("draft")
		expect(entryStateOf(entry(), ev(), kick - 1000)).toBe("submitted")
		expect(entryStateOf(entry(), ev({ state: "in_progress" }), kick + 1000)).toBe("locked")
		expect(entryStateOf(entry(), ev({ state: "final", result: { away: 10, home: 20 } }), kick + 9_000_000)).toBe("awaiting_result")
		expect(entryStateOf(entry({ gradeCount: 1 }), ev({ state: "final", result: { away: 10, home: 20 } }), kick + 9_000_000)).toBe("graded")
		expect(entryStateOf(entry({ gradeCount: 2 }), ev({ state: "final", result: { away: 10, home: 20 } }), kick + 9_000_000)).toBe("corrected")
	})
	it("marks a never-submitted entry missed after the lock and cancelled games void", () => {
		expect(entryStateOf(null, ev(), kick + 1)).toBe("missed")
		expect(entryStateOf(entry(), ev({ state: "cancelled" }), kick - 1000)).toBe("void")
		expect(entryStateOf(entry({ voided: true }), ev(), kick - 1000)).toBe("void")
	})
})

describe("confidence slates", () => {
	const e1 = ev({ id: "a", kickoff: "2026-10-04T17:00:00Z" })
	const e2 = ev({ id: "b", kickoff: "2026-10-04T20:00:00Z" })
	const e3 = ev({ id: "c", kickoff: "2026-10-05T00:20:00Z" })
	const events = { a: e1, b: e2, c: e3 }
	const slate = (...r: [string, "away" | "home", number][]): ConfidenceEntry[] => r.map(([eventId, pick, rank]) => ({ eventId, pick, rank }))
	const before = Date.parse("2026-10-04T12:00:00Z")
	const afterFirst = Date.parse("2026-10-04T18:00:00Z")

	it("accepts unique ranks from 1 to the number of picks", () => {
		expect(validateConfidence(slate(["a", "home", 3], ["b", "away", 1], ["c", "home", 2]), [], events, before)).toBeNull()
	})
	it("rejects duplicates, gaps and out-of-range ranks", () => {
		expect(validateConfidence(slate(["a", "home", 1], ["b", "away", 1]), [], events, before)).toMatch(/once/)
		expect(validateConfidence(slate(["a", "home", 1], ["b", "away", 3]), [], events, before)).toMatch(/1 to 2/)
		expect(validateConfidence(slate(["a", "home", 0]), [], events, before)).toMatch(/1 to 1/)
	})
	it("lets unlocked games be re-ranked but freezes the one that has started", () => {
		const prev = slate(["a", "home", 3], ["b", "away", 1], ["c", "home", 2])
		expect(validateConfidence(slate(["a", "home", 3], ["b", "away", 2], ["c", "home", 1]), prev, events, afterFirst)).toBeNull()
		expect(validateConfidence(slate(["a", "home", 2], ["b", "away", 3], ["c", "home", 1]), prev, events, afterFirst)).toMatch(/started/)
		expect(validateConfidence(slate(["a", "away", 3], ["b", "away", 1], ["c", "home", 2]), prev, events, afterFirst)).toMatch(/started/)
		expect(validateConfidence(slate(["b", "away", 1], ["c", "home", 2]), prev, events, afterFirst)).toMatch(/started/)
	})
	it("does not allow adding a game that has already started", () => {
		expect(validateConfidence(slate(["a", "home", 1], ["b", "away", 2]), slate(["b", "away", 1]), events, afterFirst)).toMatch(/added/)
	})
})

describe("the blogger's own pick", () => {
	it("is entered and freely revised before the lock, with history", () => {
		const a = reviseBloggerPick(ev(), null, { away: 17, home: 24, nowMs: kick - 100_000 })
		if (!a.ok) throw new Error("expected ok")
		const b = reviseBloggerPick(ev(), a.pick, { away: 20, home: 27, nowMs: kick - 50_000 })
		expect(b.ok && b.change).toBe("revised")
		expect(b.ok && b.pick.revisions.length).toBe(2)
		expect(b.ok && b.afterLock).toBe(false)
	})
	it("cannot be created after the lock", () => {
		const r = reviseBloggerPick(ev(), null, { away: 17, home: 24, nowMs: kick + 1 })
		expect(r.ok).toBe(false)
	})
	it("can be corrected after the lock only with a reason, and the correction is flagged forever", () => {
		const a = reviseBloggerPick(ev(), null, { away: 17, home: 24, nowMs: kick - 1000 })
		if (!a.ok) throw new Error("expected ok")
		expect(reviseBloggerPick(ev(), a.pick, { away: 30, home: 3, nowMs: kick + 1000 }).ok).toBe(false)
		expect(reviseBloggerPick(ev(), a.pick, { away: 30, home: 3, reason: "short", nowMs: kick + 1000 }).ok).toBe(false)
		const fixed = reviseBloggerPick(ev(), a.pick, { away: 24, home: 17, reason: "I typed the teams the wrong way round", nowMs: kick + 1000 })
		expect(fixed.ok && fixed.afterLock).toBe(true)
		expect(fixed.ok && fixed.pick.revisions[1]).toMatchObject({ afterLock: true, reason: "I typed the teams the wrong way round" })
		expect(fixed.ok && fixed.pick.revisions[0]).toMatchObject({ away: 17, home: 24 })
	})
	it("treats an identical resubmission as no change even after the lock", () => {
		const a = reviseBloggerPick(ev(), null, { away: 17, home: 24, nowMs: kick - 1000 })
		if (!a.ok) throw new Error("expected ok")
		expect(reviseBloggerPick(ev(), a.pick, { away: 17, home: 24, nowMs: kick + 1000 })).toMatchObject({ ok: true, change: "unchanged" })
	})
})

// An Entry is generic over its payload.
const _typed: Entry<{ away: number; home: number }> | null = null
void _typed
