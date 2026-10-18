// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DISMISS_KEY, DISMISS_MS, OFF_TTL_MS, STRIP_KEY, STRIP_TTL_MS, TEAM_KEY, cacheStrip, chooseTeam, dismiss, isDismissed, isTeamAbbr, loadStrip, readCachedStrip, readLocalTeam, writeLocalTeam } from "../../lib/league2/myTeam"

const player = { signedIn: true, handle: "SilverFan", favoriteTeam: "KC", next: { kind: "pick", title: "Pick Raiders at Chiefs", detail: "Locks in 2 days.", lockAt: null }, rank: { rank: 3, of: 40, points: 21 } }

const reply = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status }))

beforeEach(() => {
	localStorage.clear()
	sessionStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe("my team", () => {
	it("only accepts real team abbreviations", () => {
		expect(isTeamAbbr("KC")).toBe(true)
		expect(isTeamAbbr("LV")).toBe(true)
		expect(isTeamAbbr("XX")).toBe(false)
		expect(isTeamAbbr("<script>")).toBe(false)
		expect(isTeamAbbr(null)).toBe(false)
	})
	it("keeps the team in this browser and ignores anything that is not a team", () => {
		expect(readLocalTeam()).toBeNull()
		writeLocalTeam("DEN")
		expect(readLocalTeam()).toBe("DEN")
		localStorage.setItem(TEAM_KEY, "nonsense")
		expect(readLocalTeam()).toBeNull()
		writeLocalTeam("DEN")
		writeLocalTeam(null)
		expect(localStorage.getItem(TEAM_KEY)).toBeNull()
		writeLocalTeam("XX")
		expect(localStorage.getItem(TEAM_KEY)).toBeNull()
	})
	it("lets the account win once it has a team, and falls back to this browser's choice", () => {
		expect(chooseTeam("DEN", "KC")).toBe("KC")
		expect(chooseTeam("DEN", null)).toBe("DEN")
		expect(chooseTeam(null, "KC")).toBe("KC")
		expect(chooseTeam(null, null)).toBeNull()
		expect(chooseTeam("XX", "YY")).toBeNull()
	})
	it("never throws when storage is blocked", () => {
		const boom = () => {
			throw new Error("blocked")
		}
		vi.stubGlobal("localStorage", { getItem: boom, setItem: boom, removeItem: boom })
		vi.stubGlobal("sessionStorage", { getItem: boom, setItem: boom, removeItem: boom })
		expect(readLocalTeam()).toBeNull()
		expect(() => writeLocalTeam("KC")).not.toThrow()
		expect(readCachedStrip()).toBeNull()
		expect(() => cacheStrip({ status: "visitor" })).not.toThrow()
		expect(isDismissed()).toBe(false)
		expect(() => dismiss()).not.toThrow()
	})
})

describe("the strip cache", () => {
	it("reuses an answer for a minute, and 'accounts are off' for five", () => {
		cacheStrip({ status: "visitor" }, 1000)
		expect(readCachedStrip(1000 + STRIP_TTL_MS)).toEqual({ status: "visitor" })
		expect(readCachedStrip(1001 + STRIP_TTL_MS)).toBeNull()
		cacheStrip({ status: "off" }, 1000)
		expect(readCachedStrip(1000 + OFF_TTL_MS)).toEqual({ status: "off" })
		expect(readCachedStrip(1001 + OFF_TTL_MS)).toBeNull()
	})
	it("round-trips a player and never stores the loading state", () => {
		const s = { status: "player" as const, strip: player as never }
		cacheStrip(s, 5)
		expect(readCachedStrip(6)).toEqual(s)
		sessionStorage.clear()
		cacheStrip({ status: "loading" })
		expect(sessionStorage.getItem(STRIP_KEY)).toBeNull()
	})
	it("ignores garbage and a clock that ran backwards", () => {
		sessionStorage.setItem(STRIP_KEY, "{not json")
		expect(readCachedStrip()).toBeNull()
		sessionStorage.setItem(STRIP_KEY, JSON.stringify({ at: 1000, state: "player" }))
		expect(readCachedStrip(1001)).toBeNull()
		sessionStorage.setItem(STRIP_KEY, JSON.stringify({ at: 5000, state: "visitor" }))
		expect(readCachedStrip(4000)).toBeNull()
		sessionStorage.setItem(STRIP_KEY, JSON.stringify({ at: 1, state: "admin" }))
		expect(readCachedStrip(2)).toBeNull()
	})
})

describe("dismissing the invitation", () => {
	it("hides it for a week and then brings it back", () => {
		expect(isDismissed(1000)).toBe(false)
		dismiss(1000)
		expect(isDismissed(1000 + DISMISS_MS - 1)).toBe(true)
		expect(isDismissed(1000 + DISMISS_MS)).toBe(false)
		localStorage.setItem(DISMISS_KEY, "abc")
		expect(isDismissed()).toBe(false)
	})
})

describe("asking the site who is looking", () => {
	it("treats a 404 as 'accounts are off'", async () => {
		vi.stubGlobal("fetch", reply(404))
		expect(await loadStrip()).toEqual({ status: "off" })
	})
	it("treats {signedIn:false}, errors and network failures as a visitor", async () => {
		vi.stubGlobal("fetch", reply(200, { signedIn: false }))
		expect(await loadStrip()).toEqual({ status: "visitor" })
		sessionStorage.clear()
		vi.stubGlobal("fetch", reply(500))
		expect(await loadStrip()).toEqual({ status: "visitor" })
		sessionStorage.clear()
		vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))))
		expect(await loadStrip()).toEqual({ status: "visitor" })
	})
	it("returns the player, asks only once for components that ask together, and then uses the cache", async () => {
		const f = reply(200, player)
		vi.stubGlobal("fetch", f)
		const [a, b] = await Promise.all([loadStrip(), loadStrip()])
		expect(a).toEqual({ status: "player", strip: player })
		expect(b).toEqual(a)
		expect(await loadStrip()).toEqual(a)
		expect(f).toHaveBeenCalledTimes(1)
		expect(f.mock.calls[0]).toEqual(["/api/league/account/strip", expect.objectContaining({ credentials: "same-origin", cache: "no-store" })])
	})
})
