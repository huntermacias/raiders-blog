import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ client: { create: vi.fn() } }))

import { client } from "../../lib/sanity.client"
import handler from "../../pages/api/createComment"
import { mockReq, mockRes } from "../helpers/http"

const create = client.create as unknown as ReturnType<typeof vi.fn>
const send = (body: unknown) => mockReq({ method: "POST", body: JSON.stringify(body) })

beforeEach(() => {
	create.mockReset()
	vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("POST /api/createComment", () => {
	it("creates a comment document that references the post", async () => {
		create.mockResolvedValueOnce({ _id: "c1" })
		const res = mockRes()
		await handler(send({ _id: "post1", name: "Al", email: "al@example.com", comment: "Let's go" }), res)
		expect(create).toHaveBeenCalledWith({
			_type: "comment",
			post: { _type: "reference", _ref: "post1" },
			name: "Al",
			email: "al@example.com",
			comment: "Let's go",
		})
		expect(res.statusCode).toBe(200)
		expect(res.body).toEqual({ message: "Comment Submitted" })
	})

	it("surfaces the real Sanity error message on failure", async () => {
		create.mockRejectedValueOnce(new Error("Insufficient permissions"))
		const res = mockRes()
		await handler(send({ _id: "p", name: "a", email: "a@b.c", comment: "hi" }), res)
		expect(res.statusCode).toBe(500)
		expect(res.body).toEqual({ message: "Insufficient permissions" })
	})

	it("falls back to the response body message, then a generic one", async () => {
		create.mockRejectedValueOnce({ response: { body: { message: "from body" } } })
		const a = mockRes()
		await handler(send({ _id: "p" }), a)
		expect(a.body).toEqual({ message: "from body" })

		create.mockRejectedValueOnce({})
		const b = mockRes()
		await handler(send({ _id: "p" }), b)
		expect(b.body).toEqual({ message: "Couldn't submit comment" })
	})

	it.todo("returns 400 on a body that isn't JSON (today JSON.parse throws outside the try block)")
	it.todo("rejects empty names, emails and comments")
	it.todo("rate limits comment creation")
})
