import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ client: { patch: vi.fn() } }))

import { client } from "../../lib/sanity.client"
import handler from "../../pages/api/react"
import { reactLimiter } from "../../lib/writeLimiters"
import { fakePatch, mockReq, mockRes, sitePost } from "../helpers/http"

const patch = client.patch as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
	patch.mockReset()
	reactLimiter.reset()
	vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("POST /api/react", () => {
	it("rejects non-POST with 405", async () => {
		const res = mockRes()
		await handler(mockReq({ method: "GET" }), res)
		expect(res.statusCode).toBe(405)
	})

	it("refuses a call that didn't come from this site's page", async () => {
		const res = mockRes()
		await handler(mockReq({ method: "POST", body: JSON.stringify({ _id: "x", reaction: "fire" }) }), res)
		expect(res.statusCode).toBe(403)
		expect(patch).not.toHaveBeenCalled()
	})

	it.each([
		["no id", { reaction: "fire" }],
		["no reaction", { _id: "x" }],
		["an unknown reaction", { _id: "x", reaction: "love" }],
		["a path-injection attempt", { _id: "x", reaction: "fire; drop" }],
		["a prototype key", { _id: "x", reaction: "__proto__" }],
		["a draft id", { _id: "drafts.x", reaction: "fire" }],
	])("rejects %s with a 400", async (_l, body) => {
		const res = mockRes()
		await handler(sitePost(body), res)
		expect(res.statusCode).toBe(400)
		expect(patch).not.toHaveBeenCalled()
	})

	it.each(["fire", "thumbsDown", "angry"])("increments %s on a published game report", async (reaction) => {
		const { chain, calls } = fakePatch({ reactions: { fire: 1, thumbsDown: 0, angry: 0 } })
		patch.mockReturnValueOnce(chain)
		const res = mockRes()
		await handler(sitePost({ _id: "post1", reaction }), res)
		const [selection] = patch.mock.calls[0]
		expect(selection.query).toContain('_type == "gameReport"')
		expect(selection.params).toEqual({ id: "post1" })
		expect(calls.setIfMissing).toEqual({ reactions: { fire: 0, thumbsDown: 0, angry: 0 } })
		expect(calls.inc).toEqual({ [`reactions.${reaction}`]: 1 })
		expect(res.statusCode).toBe(200)
		expect(res.body).toEqual({ reactions: { fire: 1, thumbsDown: 0, angry: 0 } })
	})

	it("answers 404 when no published game report matches", async () => {
		patch.mockReturnValueOnce({ setIfMissing: () => ({ inc: () => ({ commit: async () => [] }) }) })
		const res = mockRes()
		await handler(sitePost({ _id: "settings", reaction: "fire" }), res)
		expect(res.statusCode).toBe(404)
	})

	it("returns a generic 500 when the write fails", async () => {
		patch.mockReturnValueOnce({
			setIfMissing: () => ({ inc: () => ({ commit: async () => Promise.reject(new Error("x")) }) }),
		})
		const res = mockRes()
		await handler(sitePost({ _id: "post1", reaction: "fire" }), res)
		expect(res.statusCode).toBe(500)
	})
})
