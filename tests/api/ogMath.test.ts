import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn() }, client: { fetch: vi.fn() } }))

const loadMath = vi.fn()
vi.mock("../../lib/math/server", () => ({ loadMath: (...a: unknown[]) => loadMath(...a) }))

import handler from "../../pages/api/og"
import { buildOdds, buildReport } from "../../lib/math/report"
import { buildBoards } from "../../lib/rankings"
import { TEAMS } from "../../lib/nfl"
import { mockReq, mockRes } from "../helpers/http"
import { schedule } from "../stubs/seasonSchedule"

vi.setConfig({ testTimeout: 90_000 })

const games = schedule(4)
const boards = buildBoards([4].map((week) => ({ _id: `w${week}`, season: 2026, week, teams: TEAMS.map((t) => ({ team: t.name, note: null })) })))
const report = buildReport(boards, games, 4, buildOdds(games, 4))
const page = { weeks: [4], newest: 4, week: 4, report }

const get = (query: Record<string, string>) => mockReq({ method: "GET", query })
const isPng = (b: unknown) => (Buffer.isBuffer(b) || b instanceof Uint8Array) && Buffer.from(b as Uint8Array).subarray(1, 4).toString() === "PNG"

beforeEach(() => {
	loadMath.mockReset().mockResolvedValue(page)
	vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("/api/og?type=math", () => {
	it("renders the Raiders card by default, cached for an hour", async () => {
		const res = mockRes()
		await handler(get({ type: "math" }), res)
		expect(res.statusCode).toBe(200)
		expect(res.headers["Content-Type"]).toBe("image/png")
		expect(isPng(res.rawBody ?? res.body)).toBe(true)
		expect(res.headers["Cache-Control"]).toBe("public, s-maxage=3600, stale-while-revalidate=86400")
		expect(loadMath).toHaveBeenCalledWith(undefined, { boxBudgetMs: 3000, model: "full" })
	})

	it("passes the week and model through, ignoring nonsense", async () => {
		await handler(get({ type: "math", week: "3", model: "season" }), mockRes())
		expect(loadMath).toHaveBeenLastCalledWith(3, { boxBudgetMs: 3000, model: "season" })
		await handler(get({ type: "math", week: "abc", model: "wat" }), mockRes())
		expect(loadMath).toHaveBeenLastCalledWith(undefined, { boxBudgetMs: 3000, model: "full" })
	})

	it("renders a team card and a disagreement card", async () => {
		for (const q of [{ team: "KC" }, { take: "DEN" }] as Record<string, string>[]) {
			const res = mockRes()
			await handler(get({ type: "math", ...q }), res)
			expect(res.statusCode).toBe(200)
			expect(isPng(res.rawBody ?? res.body)).toBe(true)
		}
	})

	it("falls back to the default card for an unknown team, no report, or a loader that throws", async () => {
		const unknown = mockRes()
		await handler(get({ type: "math", team: "ZZZ" }), unknown)
		expect(unknown.redirectedTo).toBe("/og-default-v2.png")

		loadMath.mockResolvedValueOnce({ weeks: [], newest: null, week: null, report: null })
		const none = mockRes()
		await handler(get({ type: "math" }), none)
		expect(none.redirectedTo).toBe("/og-default-v2.png")

		loadMath.mockRejectedValueOnce(new Error("ESPN down"))
		const boom = mockRes()
		await handler(get({ type: "math" }), boom)
		expect(boom.redirectedTo).toBe("/og-default-v2.png")
	})
})
