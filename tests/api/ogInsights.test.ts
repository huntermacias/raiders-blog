// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn() }, client: { fetch: vi.fn() } }))

import handler from "../../pages/api/og"
import { insightSpec } from "../../lib/og/insightSpecs"
import { playBlurb } from "../../lib/og/insightCards"
import { mockReq, mockRes } from "../helpers/http"

vi.setConfig({ testTimeout: 60_000 })

const get = (query: Record<string, string>) => mockReq({ method: "GET", query })
const isPng = (b: unknown) => (Buffer.isBuffer(b) || b instanceof Uint8Array) && Buffer.from(b as Uint8Array).subarray(1, 4).toString() === "PNG"
const q = (o: Partial<Record<"type" | "slug" | "view" | "rank" | "opp" | "week" | "stat", string>>) => ({ type: "", slug: "", view: "", rank: "", opp: "", week: "", ...o })

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("insightSpec", () => {
	it("picks the play of a game, and other ranks", () => {
		const a = insightSpec(q({ type: "lab", slug: "week-3", view: "play", rank: "1" }))
		const b = insightSpec(q({ type: "lab", slug: "week-3", view: "play", rank: "2" }))
		expect(a?.type).toBe("play")
		expect(b?.type).toBe("play")
		if (a?.type === "play" && b?.type === "play") {
			expect(a.rank).toBe(1)
			expect(b.rank).toBe(2)
			expect(a.week).toBe(3)
			expect(a.points).toMatch(/^[+−]\d+$/)
		}
	})

	it("treats a bad rank as the first play", () => {
		const a = insightSpec(q({ type: "lab", slug: "week-3", view: "play", rank: "99" }))
		expect(a?.type === "play" && a.rank).toBe(1)
	})

	it("picks the biggest play of the season across games", () => {
		const a = insightSpec(q({ type: "lab", slug: "season", view: "play" }))
		expect(a?.type === "play" && a.scope).toBe("season")
	})

	it("builds the fourth-down card for a game and for the season", () => {
		const g = insightSpec(q({ type: "lab", slug: "week-2", view: "fourth" }))
		const s = insightSpec(q({ type: "lab", slug: "season", view: "fourth" }))
		expect(g?.type).toBe("fourth")
		expect(s?.type === "fourth" && s.graded).toBeGreaterThan(0)
		expect(g?.type === "fourth" && g.rows.length).toBeGreaterThan(0)
	})

	it("builds a scouting card for an opponent, never for the Raiders or a made-up team", () => {
		const kc = insightSpec(q({ type: "scout", opp: "KC", week: "5" }))
		expect(kc?.type === "scout" && kc.oppNick).toBe("Chiefs")
		expect(kc?.type === "scout" && kc.rows).toHaveLength(2)
		expect(insightSpec(q({ type: "scout", opp: "LV" }))).toBeNull()
		expect(insightSpec(q({ type: "scout", opp: "ZZZ" }))).toBeNull()
		expect(insightSpec(q({ type: "scout", opp: "kc" }))).toBeNull()
	})

	it("builds a will-it-last card for any stat in the catalog, and nothing for a made-up one", () => {
		const a = insightSpec(q({ type: "last", stat: "def.turnovers" }))
		expect(a?.type).toBe("last")
		if (a?.type === "last") {
			expect(a.title).toBe("Takeaways")
			expect(a.start.length).toBe(a.end.length)
			expect(a.start.length).toBeGreaterThan(20)
			expect(a.start.length).toBeLessThanOrEqual(120)
			for (const d of [...a.start, ...a.end]) {
				expect(d.x).toBeGreaterThanOrEqual(0)
				expect(d.x).toBeLessThanOrEqual(1)
			}
			expect(a.raiders).toBeGreaterThan(0)
			expect(a.raiders).toBeLessThan(1)
			expect(a.band[0]).toBeLessThan(a.band[1])
			expect(a.line).toMatch(/teams since 1999/)
			expect(a.wins).toMatch(/^Won \d+% of games early, \d+% after · \d+% made the playoffs$/)
		}
		expect(insightSpec(q({ type: "last", stat: "off.epaRush" }))?.type).toBe("last")
		expect(insightSpec(q({ type: "last", stat: "off.nope" }))).toBeNull()
		expect(insightSpec(q({ type: "last", stat: "../x" }))).toBeNull()
		expect(insightSpec(q({ type: "last" }))).toBeNull()
	})

	it("returns null for anything else so the route can fall through", () => {
		expect(insightSpec(q({ type: "lab", slug: "week-3" }))).toBeNull()
		expect(insightSpec(q({ type: "lab", slug: "week-99", view: "play" }))).toBeNull()
		expect(insightSpec(q({ type: "lab", slug: "../x", view: "fourth" }))).toBeNull()
		expect(insightSpec(q({ type: "post", slug: "week-3", view: "play" }))).toBeNull()
	})
})

describe("playBlurb", () => {
	it("drops tackler names and ends on a whole sentence", () => {
		const t = "P.Mahomes pass deep left to T.Thornton to LV 5 for 55 yards (T.Stukes). KC-T.Thornton was injured during the play. PENALTY on LV-Q.Walker, Unnecessary Roughness, 15 yards, enforced at LV 5. Extra words to make it long enough to cut."
		const out = playBlurb(t)
		expect(out).not.toMatch(/Stukes/)
		expect(out.length).toBeLessThanOrEqual(150)
		expect(out.endsWith(".")).toBe(true)
	})
	it("keeps a short play whole", () => {
		expect(playBlurb("J.Doe up the middle for 3 yards (A.B).")).toBe("J.Doe up the middle for 3 yards.")
	})
})

describe("/api/og insight cards", () => {
	const cases: [string, Record<string, string>][] = [
		["play of the game", { type: "lab", slug: "week-3", view: "play" }],
		["play of the season", { type: "lab", slug: "season", view: "play", rank: "2" }],
		["fourth down, one game", { type: "lab", slug: "week-1", view: "fourth" }],
		["fourth down, season", { type: "lab", slug: "season", view: "fourth" }],
		["scouting report", { type: "scout", opp: "KC", week: "5" }],
		["scouting report without a week", { type: "scout", opp: "JAX" }],
		["will it last, takeaways", { type: "last", stat: "def.turnovers", n: "4" }],
		["will it last, a stat that stands out the other way", { type: "last", stat: "def.redZone", n: "4" }],
	]
	it.each(cases)("renders %s as a cached PNG", async (_n, query) => {
		const res = mockRes()
		await handler(get(query), res)
		expect(res.statusCode).toBe(200)
		expect(res.headers["Content-Type"]).toBe("image/png")
		expect(isPng(res.rawBody ?? res.body)).toBe(true)
		expect(res.headers["Cache-Control"]).toBe("public, s-maxage=604800, stale-while-revalidate=2592000")
	})

	it("falls back to the default card when there is nothing to show", async () => {
		const misses: Record<string, string>[] = [{ type: "scout", opp: "LV" }, { type: "scout" }, { type: "lab", slug: "week-99", view: "fourth" }, { type: "last", stat: "nope" }, { type: "last" }]
		for (const query of misses) {
			const res = mockRes()
			await handler(get(query), res)
			expect(res.redirectedTo).toBe("/og-default-v2.png")
		}
	})
})
