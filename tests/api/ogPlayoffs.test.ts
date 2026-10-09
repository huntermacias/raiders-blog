import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn() }, client: { fetch: vi.fn() } }))

import { getGames } from "../../lib/playoffs/data"
import { pickTeamGames } from "../../lib/playoffs/picks"
import { encodeScenario } from "../../lib/playoffs/share"
import handler from "../../pages/api/og"
import { mockReq, mockRes } from "../helpers/http"

vi.setConfig({ testTimeout: 90_000 })

const get = (query: Record<string, string>) => mockReq({ method: "GET", query })
const isPng = (b: unknown) => (Buffer.isBuffer(b) || b instanceof Uint8Array) && Buffer.from(b as Uint8Array).subarray(1, 4).toString() === "PNG"
const CACHE = "public, s-maxage=604800, stale-while-revalidate=2592000"

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("/api/og?type=playoffs", () => {
	it("renders the race as it stands for the Raiders with no query, cached for a week", async () => {
		const res = mockRes()
		await handler(get({ type: "playoffs" }), res)
		expect(res.statusCode).toBe(200)
		expect(res.headers["Content-Type"]).toBe("image/png")
		expect(isPng(res.rawBody ?? res.body)).toBe(true)
		expect(res.headers["Cache-Control"]).toBe(CACHE)
	})

	it("renders a scenario for another team as the tall picture", async () => {
		const games = getGames()
		const s = encodeScenario(games, pickTeamGames(games, {}, "KC", "W"))
		const res = mockRes()
		await handler(get({ type: "playoffs", s, t: "KC", size: "tall" }), res)
		expect(res.statusCode).toBe(200)
		expect(isPng(res.rawBody ?? res.body)).toBe(true)
		expect(res.headers["Cache-Control"]).toBe(CACHE)
	})

	it("shows the race as it stands, not an error, for a damaged code, an unknown team and an unknown size", async () => {
		const res = mockRes()
		await handler(get({ type: "playoffs", s: "garbage", t: "XXX", size: "huge" }), res)
		expect(res.statusCode).toBe(200)
		expect(isPng(res.rawBody ?? res.body)).toBe(true)
	})
})
