// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn() }, client: { fetch: vi.fn() } }))

import handler from "../../pages/api/og"
import { insightSpec } from "../../lib/og/insightSpecs"
import { getTwinsView } from "../../lib/lab/twins"
import { playBlurb } from "../../lib/og/insightCards"
import { MATCHUP_VIEWS } from "../../lib/lab/matchupShare"
import { mockReq, mockRes } from "../helpers/http"

vi.setConfig({ testTimeout: 60_000 })

const get = (query: Record<string, string>) => mockReq({ method: "GET", query })
const isPng = (b: unknown) => (Buffer.isBuffer(b) || b instanceof Uint8Array) && Buffer.from(b as Uint8Array).subarray(1, 4).toString() === "PNG"
const q = (o: Partial<Record<"type" | "slug" | "view" | "rank" | "opp" | "week" | "stat" | "kind" | "size" | "scope" | "team" | "po" | "years" | "pin" | "y" | "mode" | "twin" | "a" | "b" | "sort" | "show", string>>) => ({ type: "", slug: "", view: "", rank: "", opp: "", week: "", ...o })

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

	it("no longer builds a fourth-down card", () => {
		expect(insightSpec(q({ type: "lab", slug: "week-2", view: "fourth" }))).toBeNull()
		expect(insightSpec(q({ type: "lab", slug: "season", view: "fourth" }))).toBeNull()
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
		expect(insightSpec(q({ type: "lab", slug: "../x", view: "play" }))).toBeNull()
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
		["season twins", { type: "twins" }],
		["season twins, tall", { type: "twins", size: "tall" }],
		["season twins, offense only", { type: "twins", mode: "off" }],
		["season twins, defense only, tall", { type: "twins", mode: "def", size: "tall" }],
		["matchup, Raiders", { type: "matchup", a: "LV", b: "NE" }],
		["matchup, Raiders, tall", { type: "matchup", a: "LV", b: "NE", size: "tall" }],
		["matchup, two other teams", { type: "matchup", a: "KC", b: "BUF" }],
		["matchup, two other teams, tall", { type: "matchup", a: "KC", b: "BUF", size: "tall" }],
		...MATCHUP_VIEWS.flatMap((view): [string, Record<string, string>][] => [
			[`matchup ${view}`, { type: "matchup", a: "LV", b: "NE", view }],
			[`matchup ${view}, tall`, { type: "matchup", a: "LV", b: "NE", view, size: "tall" }],
			[`matchup ${view}, two other teams`, { type: "matchup", a: "KC", b: "BUF", view }],
		]),
		["the week's slate", { type: "slate" }],
		["the week's slate, tall", { type: "slate", size: "tall" }],
		["the league board", { type: "board" }],
		["the league board, tall", { type: "board", size: "tall" }],
		["the league board, sorted and filtered", { type: "board", sort: "rush", show: "AFC West", team: "LV" }],
		["the league board, a conference, tall", { type: "board", sort: "qb", show: "NFC", team: "DAL", size: "tall" }],
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
		expect(await dims({ type: "twins", size: "tall" })).toEqual([1080, 1350])
		expect(await dims({ type: "twins" })).toEqual([1200, 630])
		expect(await dims({ type: "matchup", a: "LV", b: "NE", size: "tall" })).toEqual([1080, 1350])
		expect(await dims({ type: "matchup", a: "LV", b: "NE" })).toEqual([1200, 630])
		for (const view of MATCHUP_VIEWS) {
			expect(await dims({ type: "matchup", a: "LV", b: "NE", view, size: "tall" })).toEqual([1080, 1350])
			expect(await dims({ type: "matchup", a: "LV", b: "NE", view })).toEqual([1200, 630])
		}
		for (const type of ["slate", "board"]) {
			expect(await dims({ type, size: "tall" })).toEqual([1080, 1350])
			expect(await dims({ type })).toEqual([1200, 630])
		}
	})

	it("builds a matchup card with eight pairings, edges that add up, and ignores anything made up", () => {
		const m = insightSpec(q({ type: "matchup", a: "LV", b: "NE", view: "pairs" }))
		expect(m?.type).toBe("matchup")
		if (m?.type !== "matchup" || m.view !== "pairs") throw new Error("expected a pairs card")
		expect(m.rows).toHaveLength(8)
		expect(m.rows.filter((r) => r.attacker === 0)).toHaveLength(4)
		expect(m.teams.map((t) => t.abbr)).toEqual(["LV", "NE"])
		expect(m.size).toBe("wide")
		expect(m.edges[0] + m.edges[1]).toBeLessThanOrEqual(8)
		for (const r of m.rows) {
			expect(r.attackScore).toBeGreaterThanOrEqual(0)
			expect(r.attackScore).toBeLessThanOrEqual(100)
			expect(r.winner === null || r.winner === 0 || r.winner === 1).toBe(true)
		}
		// Edges on the card are the pairings the winner column says each team won.
		expect(m.edges[0]).toBe(m.rows.filter((r) => r.winner === 0).length)
		expect(m.edges[1]).toBe(m.rows.filter((r) => r.winner === 1).length)
		expect(insightSpec(q({ type: "matchup", a: "LV", b: "NE", size: "huge" }))).toMatchObject({ size: "wide" })
		expect(insightSpec(q({ type: "matchup", a: "LV", b: "LV" }))).toBeNull()
		expect(insightSpec(q({ type: "matchup", a: "LV", b: "ZZZ" }))).toBeNull()
		expect(insightSpec(q({ type: "matchup", a: "LV" }))).toBeNull()
		// A team code in lower case is read as the team.
		expect(insightSpec(q({ type: "matchup", a: "lv", b: "ne" }))).toMatchObject({ view: "overview", teams: [{ abbr: "LV" }, { abbr: "NE" }] })
	})

	it("builds each part of a matchup as its own card, and falls back to the overview", () => {
		expect(insightSpec(q({ type: "matchup", a: "LV", b: "NE" }))).toMatchObject({ view: "overview" })
		expect(insightSpec(q({ type: "matchup", a: "LV", b: "NE", view: "nonsense" }))).toMatchObject({ view: "overview" })
		for (const view of MATCHUP_VIEWS) {
			for (const size of ["wide", "tall"]) {
				const m = insightSpec(q({ type: "matchup", a: "LV", b: "NE", view, size }))
				expect(m).toMatchObject({ type: "matchup", view, size })
			}
		}
		const ov = insightSpec(q({ type: "matchup", a: "LV", b: "NE", view: "overview" }))
		if (ov?.type !== "matchup" || ov.view !== "overview") throw new Error("expected an overview")
		expect(ov.radar).toHaveLength(7)
		for (const s of ov.radar) {
			expect(s.a).toBeGreaterThanOrEqual(0)
			expect(s.a).toBeLessThanOrEqual(1)
			expect(s.b).toBeGreaterThanOrEqual(0)
			expect(s.b).toBeLessThanOrEqual(1)
		}
		expect(ov.callouts.length).toBeGreaterThan(0)
		expect(ov.callouts.length).toBeLessThanOrEqual(3)
		const tape = insightSpec(q({ type: "matchup", a: "LV", b: "NE", view: "tape" }))
		expect(tape?.type === "matchup" && tape.view === "tape" && tape.groups).toHaveLength(7)
		const coaches = insightSpec(q({ type: "matchup", a: "LV", b: "NE", view: "coaches", size: "tall" }))
		if (coaches?.type !== "matchup" || coaches.view !== "coaches") throw new Error("expected a coaches card")
		expect(coaches.rows.length).toBeGreaterThanOrEqual(6)
		const wideCoaches = insightSpec(q({ type: "matchup", a: "LV", b: "NE", view: "coaches" }))
		expect(wideCoaches?.type === "matchup" && wideCoaches.view === "coaches" && wideCoaches.rows.length).toBeLessThanOrEqual(6)
		const inj = insightSpec(q({ type: "matchup", a: "LV", b: "NE", view: "injuries" }))
		if (inj?.type !== "matchup" || inj.view !== "injuries") throw new Error("expected an injuries card")
		expect(inj.sides).toHaveLength(2)
		for (const side of inj.sides) expect(side.players.length).toBeLessThanOrEqual(6)
	})

	it("builds the week's slate with the Raiders' game first, and a board that can be sorted, filtered and focused", () => {
		const s = insightSpec(q({ type: "slate" }))
		if (s?.type !== "slate") throw new Error("expected a slate")
		expect(s.games.length).toBeGreaterThan(0)
		expect(s.games.length).toBeLessThanOrEqual(5)
		const tall = insightSpec(q({ type: "slate", size: "tall" }))
		expect(tall?.type === "slate" && tall.games.length).toBeLessThanOrEqual(9)
		if (tall?.type === "slate") expect(tall.games.length + tall.more).toBe(s.games.length + s.more)

		const b = insightSpec(q({ type: "board" }))
		if (b?.type !== "board") throw new Error("expected a board")
		expect(b.sort).toBe("composite")
		expect(b.show).toBeNull()
		expect(b.total).toBe(32)
		expect(b.rows.length).toBeLessThanOrEqual(7)
		expect(b.rows.some((r) => r.abbr === "LV")).toBe(true)

		const west = insightSpec(q({ type: "board", sort: "rush", show: "AFC West", team: "LV" }))
		if (west?.type !== "board") throw new Error("expected a board")
		expect(west).toMatchObject({ sort: "rush", show: "AFC West", focus: "LV", total: 4 })
		expect(west.rows).toHaveLength(4)

		// Anything made up falls back to the plain league board.
		const odd = insightSpec(q({ type: "board", sort: "bogus", show: "Mars", team: "ZZZ" }))
		expect(odd).toMatchObject({ type: "board", sort: "composite", show: null, total: 32 })
	})

	it("builds a season twins card for the closest twin, a chosen one, or the Raiders' own, and ignores anything made up", () => {
		const a = insightSpec(q({ type: "twins" }))
		expect(a?.type).toBe("twins")
		if (a?.type !== "twins") return
		expect(a.mine).toHaveLength(18)
		expect(a.theirs).toHaveLength(18)
		expect(a.mode).toBe("all")
		expect(a.title).toMatch(/^\d{4} [A-Z][A-Za-z0-9]+/)
		const off = insightSpec(q({ type: "twins", mode: "off" }))
		expect(off?.type === "twins" && off.mine).toHaveLength(9)
		expect(off?.type === "twins" && off.modeName).toBe("Offense only")
		// A twin that is not one of the five shown, a made-up mode and a made-up size all fall back to the defaults.
		const junk = insightSpec(q({ type: "twins", mode: "net", size: "huge", twin: "1850-ZZZ" }))
		expect(junk?.type === "twins" && junk.title).toBe(a.title)
		expect(junk?.type === "twins" && junk.size).toBe("wide")
		const third = getTwinsView()!.modes.all!.result.twins[2]
		const picked = insightSpec(q({ type: "twins", twin: third.row.replace(" ", "-") }))
		expect(picked?.type === "twins" && picked.title).toBe(third.label)
		const defTwin = getTwinsView()!.modes.def!.result.twins[3]
		const inDef = insightSpec(q({ type: "twins", mode: "def", twin: defTwin.row.replace(" ", "-") }))
		expect(inDef?.type === "twins" && inDef.title).toBe(defTwin.label)
		const own = getTwinsView()!.modes.all!.result.raidersTwin!
		expect((insightSpec(q({ type: "twins", twin: own.row.replace(" ", "-") })) as { title: string }).title).toBe(own.label)
		const tall = insightSpec(q({ type: "twins", size: "tall" }))
		expect(tall?.type === "twins" && tall.size).toBe("tall")
	})

	it("falls back to the default card when there is nothing to show", async () => {
		const misses: Record<string, string>[] = [{ type: "scout", opp: "LV" }, { type: "scout" }, { type: "lab", slug: "week-99", view: "play" }, { type: "last", stat: "off.nope" }, { type: "last", kind: "season" }, { type: "last", kind: "season", pin: "2016-ZZZ" }]
		for (const query of misses) {
			const res = mockRes()
			await handler(get(query), res)
			expect(res.redirectedTo).toBe("/og-default-v2.png")
		}
	})
})
