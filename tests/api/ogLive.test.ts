import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn() }, client: { fetch: vi.fn() } }))
vi.mock("../../lib/live/service", async () => {
	const actual = await vi.importActual<typeof import("../../lib/live/service")>("../../lib/live/service")
	return { ...actual, getScoreboard: vi.fn(), getGame: vi.fn() }
})

import { parseScoreboard, parseSummary } from "../../lib/live/espn"
import { getGame, getScoreboard } from "../../lib/live/service"
import handler from "../../pages/api/og"
import { mockReq, mockRes } from "../helpers/http"
import { scoreboard, summary } from "../stubs/liveFeed"

vi.setConfig({ testTimeout: 90_000 })

const board = parseScoreboard(scoreboard)
const scoreboardMock = getScoreboard as unknown as ReturnType<typeof vi.fn>
const gameMock = getGame as unknown as ReturnType<typeof vi.fn>
const get = (query: Record<string, string>) => mockReq({ method: "GET", query })
const isPng = (b: unknown) => Buffer.isBuffer(b) || b instanceof Uint8Array

function result(state: "pre" | "in" | "post") {
	const info = { ...board.find((g) => g.id === "401872980")!, state }
	return { game: parseSummary(structuredClone(summary), info), stale: false, at: 0 }
}

beforeEach(() => {
	scoreboardMock.mockReset()
	gameMock.mockReset()
	vi.spyOn(console, "error").mockImplementation(() => {})
	scoreboardMock.mockResolvedValue({ value: board, stale: false, at: 0 })
})

describe("/api/og?type=live", () => {
	it("draws the named game as a PNG that is cached for seconds while it's live", async () => {
		gameMock.mockResolvedValue(result("in"))
		const res = mockRes()
		await handler(get({ type: "live", game: "401872980" }), res)
		expect(res.statusCode).toBe(200)
		expect(res.headers["Content-Type"]).toBe("image/png")
		expect(res.headers["Cache-Control"]).toContain("s-maxage=20")
		expect(isPng(res.rawBody)).toBe(true)
		expect(gameMock).toHaveBeenCalledWith("401872980")
	})

	it("caches a pregame card for minutes and a final card for a day", async () => {
		gameMock.mockResolvedValue(result("pre"))
		const pre = mockRes()
		await handler(get({ type: "live", game: "401872980" }), pre)
		expect(pre.headers["Cache-Control"]).toContain("s-maxage=300")

		gameMock.mockResolvedValue(result("post"))
		const post = mockRes()
		await handler(get({ type: "live", game: "401872980" }), post)
		expect(post.headers["Cache-Control"]).toContain("s-maxage=86400")
	})

	it("uses the Raiders' game when no id is given", async () => {
		gameMock.mockResolvedValue(result("in"))
		const res = mockRes()
		await handler(get({ type: "live" }), res)
		expect(res.statusCode).toBe(200)
		expect(gameMock).toHaveBeenCalledWith("401872980")
	})

	it.each([["letters", "abc"], ["too short", "123"], ["a path", "../x"], ["too long", "1234567890123"]])("redirects a game id that is %s without calling the feed", async (_l, id) => {
		const res = mockRes()
		await handler(get({ type: "live", game: id }), res)
		expect(res.redirectedTo).toBe("/og-default-v2.png")
		expect(gameMock).not.toHaveBeenCalled()
	})

	it("redirects when the game isn't on the board, and when the feed is down", async () => {
		gameMock.mockResolvedValue(null)
		const a = mockRes()
		await handler(get({ type: "live", game: "401999999" }), a)
		expect(a.redirectedTo).toBe("/og-default-v2.png")
		expect(a.headers["Cache-Control"]).toContain("s-maxage=60")

		gameMock.mockRejectedValue(new Error("ESPN responded 500"))
		const b = mockRes()
		await handler(get({ type: "live", game: "401872980" }), b)
		expect(b.redirectedTo).toBe("/og-default-v2.png")
	})

	it("redirects when there is no board at all", async () => {
		scoreboardMock.mockResolvedValue({ value: [], stale: false, at: 0 })
		const res = mockRes()
		await handler(get({ type: "live" }), res)
		expect(res.redirectedTo).toBe("/og-default-v2.png")
	})
})
