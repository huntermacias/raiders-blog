import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ client: { patch: vi.fn() } }))

import { client } from "../../lib/sanity.client"
import handler from "../../pages/api/potm-vote"
import { potmLimiter } from "../../lib/writeLimiters"
import { fakePatch, mockReq, mockRes, sitePost } from "../helpers/http"

const patch = client.patch as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
	patch.mockReset()
	potmLimiter.reset()
	vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("POST /api/potm-vote", () => {
	it("rejects non-POST with 405", async () => {
		const res = mockRes()
		await handler(mockReq({ method: "GET" }), res)
		expect(res.statusCode).toBe(405)
	})

	it("refuses a call that didn't come from this site's page", async () => {
		const res = mockRes()
		await handler(mockReq({ method: "POST", body: JSON.stringify({ _id: "p1", candidateKey: "k1" }) }), res)
		expect(res.statusCode).toBe(403)
		expect(patch).not.toHaveBeenCalled()
	})

	it.each([
		["no id", { candidateKey: "k1" }],
		["no candidate key", { _id: "p1" }],
		["empty strings", { _id: "", candidateKey: "" }],
		["a key with a quote (path injection)", { _id: "p1", candidateKey: 'k1"] || true || x[_key=="' }],
		["a key with brackets", { _id: "p1", candidateKey: "k1]" }],
		["a draft id", { _id: "drafts.p1", candidateKey: "k1" }],
	])("rejects %s with a 400", async (_l, body) => {
		const res = mockRes()
		await handler(sitePost(body), res)
		expect(res.statusCode).toBe(400)
		expect(patch).not.toHaveBeenCalled()
	})

	it("increments the votes on the chosen candidate of a published game report that has it", async () => {
		const { chain, calls } = fakePatch({ potmCandidates: [{ _key: "k1", votes: 3 }] })
		patch.mockReturnValueOnce(chain)
		const res = mockRes()
		await handler(sitePost({ _id: "p1", candidateKey: "k1" }), res)
		const [selection] = patch.mock.calls[0]
		expect(selection.query).toContain('_type == "gameReport"')
		expect(selection.query).toContain("count(potmCandidates[_key == $key]) == 1")
		expect(selection.params).toEqual({ id: "p1", key: "k1" })
		const path = 'potmCandidates[_key=="k1"].votes'
		expect(calls.setIfMissing).toEqual({ [path]: 0 })
		expect(calls.inc).toEqual({ [path]: 1 })
		expect(res.statusCode).toBe(200)
		expect(res.body).toEqual({ potmCandidates: [{ _key: "k1", votes: 3 }] })
	})

	it("answers 404 when nothing matches", async () => {
		patch.mockReturnValueOnce({ setIfMissing: () => ({ inc: () => ({ commit: async () => [] }) }) })
		const res = mockRes()
		await handler(sitePost({ _id: "p1", candidateKey: "nope" }), res)
		expect(res.statusCode).toBe(404)
	})

	it("returns a generic 500 when the write fails", async () => {
		patch.mockReturnValueOnce({
			setIfMissing: () => ({ inc: () => ({ commit: async () => Promise.reject(new Error("secret detail")) }) }),
		})
		const res = mockRes()
		await handler(sitePost({ _id: "p1", candidateKey: "k1" }), res)
		expect(res.statusCode).toBe(500)
		expect(JSON.stringify(res.body)).not.toContain("secret")
	})
})
