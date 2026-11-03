import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ client: { patch: vi.fn() } }))

import { client } from "../../lib/sanity.client"
import handler from "../../pages/api/poll-vote"
import { pollLimiter } from "../../lib/writeLimiters"
import { fakePatch, mockReq, mockRes, sitePost } from "../helpers/http"

const patch = client.patch as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
	patch.mockReset()
	pollLimiter.reset()
	vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("POST /api/poll-vote", () => {
	it.each(["GET", "PUT", "DELETE"])("rejects %s with 405", async (method) => {
		const res = mockRes()
		await handler(mockReq({ method }), res)
		expect(res.statusCode).toBe(405)
		expect(patch).not.toHaveBeenCalled()
	})

	it("refuses a call that didn't come from this site's page", async () => {
		const res = mockRes()
		await handler(mockReq({ method: "POST", body: JSON.stringify({ _id: "x", choice: "A" }) }), res)
		expect(res.statusCode).toBe(403)
		expect(patch).not.toHaveBeenCalled()
	})

	it.each([
		["no id", { choice: "A" }],
		["no choice", { _id: "x" }],
		["a lowercase choice", { _id: "x", choice: "a" }],
		["a third option", { _id: "x", choice: "C" }],
		["a draft id", { _id: "drafts.x", choice: "A" }],
		["an id with GROQ in it", { _id: 'x" || true || "', choice: "A" }],
		["a non-string id", { _id: { $ne: 1 }, choice: "A" }],
	])("rejects %s with a 400 and writes nothing", async (_l, body) => {
		const res = mockRes()
		await handler(sitePost(body), res)
		expect(res.statusCode).toBe(400)
		expect(patch).not.toHaveBeenCalled()
	})

	it("returns 400 (not a crash) on a body that isn't JSON", async () => {
		const res = mockRes()
		await handler(sitePost("not json"), res)
		expect(res.statusCode).toBe(400)
	})

	it("increments A on a published game report, selected by type and id in the same write", async () => {
		const { chain, calls } = fakePatch({ pollVotesA: 4, pollVotesB: 2 })
		patch.mockReturnValueOnce(chain)
		const res = mockRes()
		await handler(sitePost({ _id: "poll1", choice: "A" }), res)
		const [selection] = patch.mock.calls[0]
		expect(selection.query).toContain('_type == "gameReport"')
		expect(selection.query).toContain('!(_id in path("drafts.**"))')
		expect(selection.params).toEqual({ id: "poll1" })
		expect(calls.setIfMissing).toEqual({ pollVotesA: 0, pollVotesB: 0 })
		expect(calls.inc).toEqual({ pollVotesA: 1 })
		expect(res.statusCode).toBe(200)
		expect(res.body).toEqual({ pollVotesA: 4, pollVotesB: 2 })
	})

	it("increments B and only B", async () => {
		const { chain, calls } = fakePatch({ pollVotesA: 1, pollVotesB: 9 })
		patch.mockReturnValueOnce(chain)
		await handler(sitePost({ _id: "poll1", choice: "B" }), mockRes())
		expect(calls.inc).toEqual({ pollVotesB: 1 })
	})

	it("answers 404 when no published game report matches (a post, a draft, a made-up id)", async () => {
		patch.mockReturnValueOnce({
			setIfMissing: () => ({ inc: () => ({ commit: async () => [] }) }),
		})
		const res = mockRes()
		await handler(sitePost({ _id: "a-post", choice: "A" }), res)
		expect(res.statusCode).toBe(404)
	})

	it("returns a generic 500 when Sanity rejects the write, without echoing the error", async () => {
		patch.mockReturnValueOnce({
			setIfMissing: () => ({ inc: () => ({ commit: async () => Promise.reject(new Error("token abc123 rejected")) }) }),
		})
		const res = mockRes()
		await handler(sitePost({ _id: "poll1", choice: "A" }), res)
		expect(res.statusCode).toBe(500)
		expect(JSON.stringify(res.body)).not.toContain("abc123")
	})

	it("slows one address down after 30 votes in ten minutes", async () => {
		patch.mockImplementation(() => fakePatch({ pollVotesA: 1, pollVotesB: 0 }).chain)
		let last = mockRes()
		for (let i = 0; i < 31; i++) {
			last = mockRes()
			await handler(sitePost({ _id: "poll1", choice: "A" }), last)
		}
		expect(last.statusCode).toBe(429)
		expect(Number(last.headers["Retry-After"])).toBeGreaterThan(0)
	})

	it.todo("limits one vote per visitor server-side (today the browser remembers it in localStorage)")
})
