import { beforeEach, describe, expect, it, vi } from "vitest"

const commit = vi.fn()
const inc = vi.fn(() => ({ commit }))
const patch = vi.fn(() => ({ inc }))
const createIfNotExists = vi.fn()
vi.mock("../../lib/sanity.client", () => ({ client: { createIfNotExists: (...a: unknown[]) => createIfNotExists(...a), patch: (...a: unknown[]) => (patch as (...x: unknown[]) => unknown)(...a) }, readClient: { fetch: vi.fn() } }))

const weekGames = vi.fn()
vi.mock("../../lib/live/service", () => ({ weekGames: (...a: unknown[]) => weekGames(...a) }))

import handler from "../../pages/api/math-vote"
import { SEASON } from "../../lib/predictions"
import { mockReq, mockRes } from "../helpers/http"

const post = (body: unknown, remoteAddress = "10.0.0.1") => mockReq({ method: "POST", body, remoteAddress })
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()
const game = (over: Record<string, unknown> = {}) => ({ week: 5, id: "1", kickoff: inDays(3), home: "LV", away: "NE", homeScore: null, awayScore: null, ...over })

beforeEach(() => {
	for (const f of [commit, inc, patch, createIfNotExists, weekGames]) f.mockReset()
	inc.mockImplementation(() => ({ commit }))
	patch.mockImplementation(() => ({ inc }))
	commit.mockResolvedValue({ blogger: 2, math: 5 })
	weekGames.mockResolvedValue([game()])
	vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("/api/math-vote", () => {
	it("405s anything but POST", async () => {
		const res = mockRes()
		await handler(mockReq({ method: "GET" }), res)
		expect(res.statusCode).toBe(405)
	})

	it.each([
		["no body", undefined],
		["a bad key", { key: "w5-NE-NE", side: "math" }],
		["an unknown team", { key: "w5-XX-LV", side: "math" }],
		["a bad side", { key: "w5-NE-LV", side: "both" }],
		["no side", { key: "w5-NE-LV" }],
	])("400s %s without touching ESPN or Sanity", async (_l, body) => {
		const res = mockRes()
		await handler(post(body), res)
		expect(res.statusCode).toBe(400)
		expect(weekGames).not.toHaveBeenCalled()
		expect(createIfNotExists).not.toHaveBeenCalled()
	})

	it("counts a vote on an open game and returns the tally", async () => {
		const res = mockRes()
		await handler(post({ key: "w5-NE-LV", side: "math" }), res)
		expect(res.statusCode).toBe(200)
		expect(res.body).toEqual({ blogger: 2, math: 5 })
		expect(weekGames).toHaveBeenCalledWith(5)
		expect(createIfNotExists).toHaveBeenCalledWith({ _id: `mathvote-${SEASON}-w5-NE-LV`, _type: "mathVote", season: SEASON, week: 5, away: "NE", home: "LV", blogger: 0, math: 0 })
		expect(patch).toHaveBeenCalledWith(`mathvote-${SEASON}-w5-NE-LV`)
		expect(inc).toHaveBeenCalledWith({ math: 1 })
	})

	it("accepts a JSON string body and a vote for the blogger", async () => {
		const res = mockRes()
		await handler(post(JSON.stringify({ key: "w5-NE-LV", side: "blogger" })), res)
		expect(res.statusCode).toBe(200)
		expect(inc).toHaveBeenCalledWith({ blogger: 1 })
	})

	it("404s a game that isn't on that week's schedule", async () => {
		const res = mockRes()
		await handler(post({ key: "w5-KC-DEN", side: "math" }), res)
		expect(res.statusCode).toBe(404)
		expect(createIfNotExists).not.toHaveBeenCalled()
	})

	it.each([
		["a game already final", game({ homeScore: 20, awayScore: 17 })],
		["a game that has kicked off", game({ kickoff: inDays(-0.1) })],
		["a game with no kickoff time", game({ kickoff: null })],
	])("409s %s", async (_l, g) => {
		weekGames.mockResolvedValue([g])
		const res = mockRes()
		await handler(post({ key: "w5-NE-LV", side: "math" }), res)
		expect(res.statusCode).toBe(409)
		expect(createIfNotExists).not.toHaveBeenCalled()
	})

	it("409s a game more than two weeks away", async () => {
		weekGames.mockResolvedValue([game({ kickoff: inDays(30) })])
		const res = mockRes()
		await handler(post({ key: "w5-NE-LV", side: "math" }), res)
		expect(res.statusCode).toBe(409)
		expect(createIfNotExists).not.toHaveBeenCalled()
	})

	it("fails closed when ESPN can't be reached", async () => {
		weekGames.mockRejectedValue(new Error("down"))
		const res = mockRes()
		await handler(post({ key: "w5-NE-LV", side: "math" }), res)
		expect(res.statusCode).toBe(503)
		expect(createIfNotExists).not.toHaveBeenCalled()
	})

	it("500s, without leaking the error, when Sanity refuses the write", async () => {
		createIfNotExists.mockRejectedValue({ statusCode: 403, message: "Insufficient permissions" })
		const res = mockRes()
		await handler(post({ key: "w5-NE-LV", side: "math" }), res)
		expect(res.statusCode).toBe(500)
		expect(JSON.stringify(res.body)).not.toContain("Insufficient")
	})

	it("rate-limits one address", async () => {
		let last = 0
		for (let i = 0; i < 61; i++) {
			const res = mockRes()
			await handler(post({ key: "w5-NE-LV", side: "math" }, "10.9.9.9"), res)
			last = res.statusCode
		}
		expect(last).toBe(429)
	})
})
