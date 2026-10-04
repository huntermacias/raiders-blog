import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ client: { patch: vi.fn() } }))

import { client } from "../../lib/sanity.client"
import handler from "../../pages/api/poll-vote"
import { fakePatch, mockReq, mockRes } from "../helpers/http"

const patch = client.patch as unknown as ReturnType<typeof vi.fn>
const send = (body: unknown) => mockReq({ method: "POST", body: JSON.stringify(body) })

beforeEach(() => {
	patch.mockReset()
	vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("POST /api/poll-vote", () => {
	it.each(["GET", "PUT", "DELETE"])("rejects %s with 405", async (method) => {
		const res = mockRes()
		await handler(mockReq({ method }), res)
		expect(res.statusCode).toBe(405)
		expect(patch).not.toHaveBeenCalled()
	})

	it.each([
		["no id", { choice: "A" }],
		["no choice", { _id: "x" }],
		["a lowercase choice", { _id: "x", choice: "a" }],
		["a third option", { _id: "x", choice: "C" }],
	])("rejects %s with a 400 and writes nothing", async (_l, body) => {
		const res = mockRes()
		await handler(send(body), res)
		expect(res.statusCode).toBe(400)
		expect(patch).not.toHaveBeenCalled()
	})

	it("increments A and returns both counts", async () => {
		const { chain, calls } = fakePatch({ pollVotesA: 4, pollVotesB: 2 })
		patch.mockReturnValueOnce(chain)
		const res = mockRes()
		await handler(send({ _id: "poll1", choice: "A" }), res)
		expect(patch).toHaveBeenCalledWith("poll1")
		expect(calls.setIfMissing).toEqual({ pollVotesA: 0, pollVotesB: 0 })
		expect(calls.inc).toEqual({ pollVotesA: 1 })
		expect(res.statusCode).toBe(200)
		expect(res.body).toEqual({ pollVotesA: 4, pollVotesB: 2 })
	})

	it("increments B and only B", async () => {
		const { chain, calls } = fakePatch({ pollVotesA: 1, pollVotesB: 9 })
		patch.mockReturnValueOnce(chain)
		await handler(send({ _id: "poll1", choice: "B" }), mockRes())
		expect(calls.inc).toEqual({ pollVotesB: 1 })
	})

	it("returns 500 when Sanity rejects the write", async () => {
		patch.mockReturnValueOnce({
			setIfMissing: () => ({ inc: () => ({ commit: async () => Promise.reject(new Error("boom")) }) }),
		})
		const res = mockRes()
		await handler(send({ _id: "poll1", choice: "A" }), res)
		expect(res.statusCode).toBe(500)
	})

	it("returns 500 (not a crash) on a body that isn't JSON", async () => {
		const res = mockRes()
		await handler(mockReq({ method: "POST", body: "not json" }), res)
		expect(res.statusCode).toBe(500)
	})

	// Known weakness, tracked here so it shows up in every test run.
	it.todo("only allows votes on documents of the poll type (today any _id can be patched)")
	it.todo("limits one vote per visitor server-side (today it relies on localStorage)")
})
