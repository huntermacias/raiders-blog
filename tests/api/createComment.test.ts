import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ client: { create: vi.fn(), fetch: vi.fn() } }))

import { client } from "../../lib/sanity.client"
import handler from "../../pages/api/createComment"
import { commentLimiter } from "../../lib/writeLimiters"
import { mockReq, mockRes, sitePost } from "../helpers/http"

const create = client.create as unknown as ReturnType<typeof vi.fn>
const fetchCount = client.fetch as unknown as ReturnType<typeof vi.fn>

const good = { _id: "post1", name: "Al", email: "al@example.com", comment: "Let's go" }

beforeEach(() => {
	create.mockReset()
	fetchCount.mockReset()
	fetchCount.mockResolvedValue(1)
	commentLimiter.reset()
	vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("POST /api/createComment", () => {
	it("creates a comment document that references the post", async () => {
		create.mockResolvedValueOnce({ _id: "c1" })
		const res = mockRes()
		await handler(sitePost(good), res)
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

	it("checks the target is a published post or game report, binding the id as a parameter", async () => {
		create.mockResolvedValueOnce({})
		await handler(sitePost(good), mockRes())
		const [query, params] = fetchCount.mock.calls[0]
		expect(query).toContain('_type in ["post", "gameReport"]')
		expect(query).toContain('!(_id in path("drafts.**"))')
		expect(params).toEqual({ id: "post1" })
	})

	it("404s and writes nothing when the page doesn't take comments", async () => {
		fetchCount.mockResolvedValueOnce(0)
		const res = mockRes()
		await handler(sitePost(good), res)
		expect(res.statusCode).toBe(404)
		expect(create).not.toHaveBeenCalled()
	})

	it("only accepts POST", async () => {
		const res = mockRes()
		await handler(mockReq({ method: "GET" }), res)
		expect(res.statusCode).toBe(405)
	})

	it("refuses a call that didn't come from this site's page", async () => {
		const res = mockRes()
		await handler(mockReq({ method: "POST", body: JSON.stringify(good) }), res)
		expect(res.statusCode).toBe(403)
		expect(create).not.toHaveBeenCalled()
	})

	it("returns 400 on a body that isn't JSON", async () => {
		const res = mockRes()
		await handler(sitePost("{nope"), res)
		expect(res.statusCode).toBe(400)
		expect(create).not.toHaveBeenCalled()
	})

	it.each([
		["no name", { ...good, name: "" }],
		["a blank name", { ...good, name: "   " }],
		["a name over 80 characters", { ...good, name: "x".repeat(81) }],
		["no email", { ...good, email: undefined }],
		["an email that isn't one", { ...good, email: "not-an-email" }],
		["no comment", { ...good, comment: "" }],
		["a comment over 2,000 characters", { ...good, comment: "x".repeat(2001) }],
		["an object where the comment should be", { ...good, comment: { $gt: "" } }],
		["a draft target", { ...good, _id: "drafts.post1" }],
		["a target id with GROQ in it", { ...good, _id: 'a" || true' }],
	])("rejects %s with a 400", async (_l, body) => {
		const res = mockRes()
		await handler(sitePost(body), res)
		expect(res.statusCode).toBe(400)
		expect(create).not.toHaveBeenCalled()
	})

	it("quietly drops a submission that fills the hidden honeypot field", async () => {
		const res = mockRes()
		await handler(sitePost({ ...good, website: "http://spam.example" }), res)
		expect(res.statusCode).toBe(200)
		expect(create).not.toHaveBeenCalled()
	})

	it("strips control characters from what it stores", async () => {
		create.mockResolvedValueOnce({})
		await handler(sitePost({ ...good, comment: "hi\u0000 there\u0007" }), mockRes())
		expect(create.mock.calls[0][0].comment).toBe("hi there")
	})

	it("returns a generic 500 without leaking Sanity's message", async () => {
		create.mockRejectedValueOnce(new Error("Insufficient permissions; token sk123"))
		const res = mockRes()
		await handler(sitePost(good), res)
		expect(res.statusCode).toBe(500)
		expect(JSON.stringify(res.body)).not.toContain("sk123")
	})

	it("allows four comments in ten minutes from one address, then answers 429", async () => {
		create.mockResolvedValue({})
		const codes: number[] = []
		for (let i = 0; i < 5; i++) {
			const res = mockRes()
			await handler(sitePost(good), res)
			codes.push(res.statusCode)
		}
		expect(codes).toEqual([200, 200, 200, 200, 429])
	})
})
