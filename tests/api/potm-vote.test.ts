import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ client: { patch: vi.fn() } }))

import { client } from "../../lib/sanity.client"
import handler from "../../pages/api/potm-vote"
import { fakePatch, mockReq, mockRes } from "../helpers/http"

const patch = client.patch as unknown as ReturnType<typeof vi.fn>
const send = (body: unknown) => mockReq({ method: "POST", body: JSON.stringify(body) })

beforeEach(() => {
	patch.mockReset()
	vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("POST /api/potm-vote", () => {
	it("rejects non-POST with 405", async () => {
		const res = mockRes()
		await handler(mockReq({ method: "GET" }), res)
		expect(res.statusCode).toBe(405)
	})

	it.each([
		["no id", { candidateKey: "k1" }],
		["no candidate key", { _id: "p1" }],
		["empty strings", { _id: "", candidateKey: "" }],
	])("rejects %s with a 400", async (_l, body) => {
		const res = mockRes()
		await handler(send(body), res)
		expect(res.statusCode).toBe(400)
		expect(patch).not.toHaveBeenCalled()
	})

	it("increments the votes on the chosen candidate", async () => {
		const { chain, calls } = fakePatch({ potmCandidates: [{ _key: "k1", votes: 3 }] })
		patch.mockReturnValueOnce(chain)
		const res = mockRes()
		await handler(send({ _id: "p1", candidateKey: "k1" }), res)
		expect(patch).toHaveBeenCalledWith("p1")
		const path = 'potmCandidates[_key=="k1"].votes'
		expect(calls.setIfMissing).toEqual({ [path]: 0 })
		expect(calls.inc).toEqual({ [path]: 1 })
		expect(res.statusCode).toBe(200)
		expect(res.body).toEqual({ potmCandidates: [{ _key: "k1", votes: 3 }] })
	})

	it("returns 500 when the write fails", async () => {
		patch.mockReturnValueOnce({
			setIfMissing: () => ({ inc: () => ({ commit: async () => Promise.reject(new Error("nope")) }) }),
		})
		const res = mockRes()
		await handler(send({ _id: "p1", candidateKey: "k1" }), res)
		expect(res.statusCode).toBe(500)
	})

	it.todo('rejects candidate keys containing quotes or brackets (the key is interpolated into a Sanity path today)')
	it.todo("only allows votes on documents of the right type")
})
