import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ client: { patch: vi.fn() } }))

import { client } from "../../lib/sanity.client"
import handler from "../../pages/api/react"
import { fakePatch, mockReq, mockRes } from "../helpers/http"

const patch = client.patch as unknown as ReturnType<typeof vi.fn>
const send = (body: unknown) => mockReq({ method: "POST", body: JSON.stringify(body) })

beforeEach(() => {
	patch.mockReset()
	vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("POST /api/react", () => {
	it("rejects non-POST with 405", async () => {
		const res = mockRes()
		await handler(mockReq({ method: "GET" }), res)
		expect(res.statusCode).toBe(405)
	})

	it.each([
		["no id", { reaction: "fire" }],
		["no reaction", { _id: "x" }],
		["an unknown reaction", { _id: "x", reaction: "love" }],
		["a path-injection attempt", { _id: "x", reaction: "fire; drop" }],
		["a prototype key", { _id: "x", reaction: "__proto__" }],
	])("rejects %s with a 400", async (_l, body) => {
		const res = mockRes()
		await handler(send(body), res)
		expect(res.statusCode).toBe(400)
		expect(patch).not.toHaveBeenCalled()
	})

	it.each(["fire", "thumbsDown", "angry"])("increments %s", async (reaction) => {
		const { chain, calls } = fakePatch({ reactions: { fire: 1, thumbsDown: 0, angry: 0 } })
		patch.mockReturnValueOnce(chain)
		const res = mockRes()
		await handler(send({ _id: "post1", reaction }), res)
		expect(calls.setIfMissing).toEqual({ reactions: { fire: 0, thumbsDown: 0, angry: 0 } })
		expect(calls.inc).toEqual({ [`reactions.${reaction}`]: 1 })
		expect(res.statusCode).toBe(200)
		expect(res.body).toEqual({ reactions: { fire: 1, thumbsDown: 0, angry: 0 } })
	})

	it("returns 500 when the write fails", async () => {
		patch.mockReturnValueOnce({
			setIfMissing: () => ({ inc: () => ({ commit: async () => Promise.reject(new Error("x")) }) }),
		})
		const res = mockRes()
		await handler(send({ _id: "post1", reaction: "fire" }), res)
		expect(res.statusCode).toBe(500)
	})

	it.todo("only allows reactions on posts (today any _id can be patched)")
})
