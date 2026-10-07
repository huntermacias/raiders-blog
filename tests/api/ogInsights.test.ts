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
const q = (o: Partial<Record<"type" | "slug" | "view" | "rank" | "opp" | "week" | "stat" | "kind" | "size" | "scope" | "team" | "po" | "years" | "pin" | "y", string>>) => ({ type: "", slug: "", view: "", rank: "", opp: "", week: "", ...o })

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

	it("builds a will-it-last chart card for any stat in the catalog, and nothing for a made-up one", () => {
		const a = insightSpec(q({ type: "last", stat: "def.turnovers" }))
		expect(a?.type).toBe("last")
		if (a?.type === "last" && a.kind === "chart") {
			expect(a.size).toBe("wide")
			expect(a.title).toBe("Takeaways")
			const dots = a.plot.dots
			expect(dots.length).toBeGreaterThan(20)
			expect(dots.length).toBeLessThanOrEqual(400)
			for (const d of dots) for (const v of [d.a, d.b, d.y]) expect(v >= 0 && v <= 1).toBe(true)
			// Teams that made the playoffs and teams that missed are both on the card, and so are earlier Raiders teams.
			expect(dots.some((d) => d.po)).toBe(true)
			expect(dots.some((d) => !d.po)).toBe(true)
			expect(dots.some((d) => d.raiders)).toBe(true)
			expect(a.plot.raiders).toBeGreaterThan(0)
			expect(a.plot.raiders).toBeLessThan(1)
			expect(a.plot.band[0]).toBeLessThan(a.plot.band[1])
			expect(a.plot.ticks).toHaveLength(5)
			expect(a.plot.pin).toBeNull()
			expect(a.line).toMatch(/teams since 1999/)
			expect(a.tiles.map((t) => t.v).every((v) => /^\d+%$/.test(v))).toBe(true)
			expect(a.filter).toBe("Teams that started like the Raiders")
		}
		expect(insightSpec(q({ type: "last", stat: "off.epaRush" }))?.type).toBe("last")
		expect(insightSpec(q({ type: "last", stat: "net.points" }))?.type).toBe("last")
		expect(insightSpec(q({ type: "last", stat: "off.nope" }))).toBeNull()
		// A stat that is not even shaped like one is ignored, and the card is about the Raiders' loudest number.
		expect(insightSpec(q({ type: "last", stat: "../x" }))?.type).toBe("last")
		expect(insightSpec(q({ type: "last" }))?.type).toBe("last")
	})

	it("honors the filters, the pinned team and the final-wins layout on the chart card", () => {
		const a = insightSpec(q({ type: "last", stat: "def.turnovers", scope: "all", po: "made", team: "KC", years: "2016,2021,1800,abc", pin: "2016-LV", y: "wins" }))
		expect(a?.type === "last" && a.kind).toBe("chart")
		if (a?.type === "last" && a.kind === "chart") {
			expect(a.filter).toBe("Every team since 1999 · Chiefs only · Made the playoffs · in 2016 and 2021")
			expect(a.plot.pin?.name).toBe("2016 Raiders")
			expect(a.plot.winTicks.length).toBeGreaterThan(0)
		}
		// Filters that match nothing leave nothing to show.
		expect(insightSpec(q({ type: "last", stat: "def.turnovers", team: "KC", po: "made", years: "1999" }))).toBeNull()
	})

	it("builds a card for each part of the page in both sizes", () => {
		const kinds = ["wins", "fifths", "checklist", "bottom"]
		for (const kind of kinds)
			for (const size of ["wide", "tall"]) {
				const c = insightSpec(q({ type: "last", kind, size, stat: "def.turnovers" }))
				expect(c?.type === "last" && c.kind).toBe(kind)
				expect(c?.type === "last" && c.size).toBe(size)
			}
		const w = insightSpec(q({ type: "last", kind: "wins", stat: "def.turnovers" }))
		if (w?.type === "last" && w.kind === "wins") {
			expect(w.made).toBeGreaterThanOrEqual(0)
			expect(w.made).toBeLessThanOrEqual(100)
			expect(w.bars).toHaveLength(3)
		}
		const f = insightSpec(q({ type: "last", kind: "fifths", stat: "def.turnovers" }))
		if (f?.type === "last" && f.kind === "fifths") {
			expect(f.bars).toHaveLength(5)
			expect(f.bars.filter((b) => b.mine)).toHaveLength(1)
		}
		const c = insightSpec(q({ type: "last", kind: "checklist" }))
		if (c?.type === "last" && c.kind === "checklist") expect(c.rows.length).toBeGreaterThan(5)
		const s = insightSpec(q({ type: "last", kind: "season", stat: "def.turnovers", pin: "2016-LV" }))
		if (s?.type === "last" && s.kind === "season") {
			expect(s.name).toBe("2016 Raiders")
			expect(s.raiders).toBe(true)
			expect(s.finalRecord).toMatch(/^\d+-\d+/)
		}
		// A season card is about a team: with no valid pin there is nothing to show.
		expect(insightSpec(q({ type: "last", kind: "season", stat: "def.turnovers" }))).toBeNull()
		expect(insightSpec(q({ type: "last", kind: "season", stat: "def.turnovers", pin: "2016-ZZZ" }))).toBeNull()
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
		["will it last, filtered and pinned, tall", { type: "last", kind: "chart", size: "tall", stat: "def.turnovers", scope: "all", po: "made", pin: "2016-LV", y: "wins" }],
		["will it last, wins and playoffs", { type: "last", kind: "wins", stat: "def.turnovers" }],
		["will it last, wins and playoffs, tall", { type: "last", kind: "wins", size: "tall", stat: "def.turnovers" }],
		["will it last, playoff odds by fifth", { type: "last", kind: "fifths", stat: "def.turnovers" }],
		["will it last, playoff odds by fifth, tall", { type: "last", kind: "fifths", size: "tall", stat: "def.turnovers" }],
		["will it last, the checklist", { type: "last", kind: "checklist" }],
		["will it last, the checklist, tall", { type: "last", kind: "checklist", size: "tall" }],
		["will it last, a team's season", { type: "last", kind: "season", stat: "def.turnovers", pin: "2016-LV" }],
		["will it last, a team's season, tall", { type: "last", kind: "season", size: "tall", stat: "def.turnovers", pin: "2016-LV" }],
		["will it last, the bottom line", { type: "last", kind: "bottom" }],
		["will it last, the bottom line, tall", { type: "last", kind: "bottom", size: "tall" }],
	]
	it.each(cases)("renders %s as a cached PNG", async (_n, query) => {
		const res = mockRes()
		await handler(get(query), res)
		expect(res.statusCode).toBe(200)
		expect(res.headers["Content-Type"]).toBe("image/png")
		expect(isPng(res.rawBody ?? res.body)).toBe(true)
		expect(res.headers["Cache-Control"]).toBe("public, s-maxage=604800, stale-while-revalidate=2592000")
	})

	it("draws the tall card at 1080x1350 and the wide one at 1200x630", async () => {
		const dims = async (query: Record<string, string>) => {
			const res = mockRes()
			await handler(get(query), res)
			const png = Buffer.from((res.rawBody ?? res.body) as Uint8Array)
			return [png.readUInt32BE(16), png.readUInt32BE(20)]
		}
		expect(await dims({ type: "last", kind: "chart", size: "tall", stat: "def.turnovers" })).toEqual([1080, 1350])
		expect(await dims({ type: "last", kind: "chart", stat: "def.turnovers" })).toEqual([1200, 630])
		expect(await dims({ type: "scout", opp: "KC" })).toEqual([1200, 630])
	})

	it("falls back to the default card when there is nothing to show", async () => {
		const misses: Record<string, string>[] = [{ type: "scout", opp: "LV" }, { type: "scout" }, { type: "lab", slug: "week-99", view: "fourth" }, { type: "last", stat: "off.nope" }, { type: "last", kind: "season" }, { type: "last", kind: "season", pin: "2016-ZZZ" }]
		for (const query of misses) {
			const res = mockRes()
			await handler(get(query), res)
			expect(res.redirectedTo).toBe("/og-default-v2.png")
		}
	})
})
