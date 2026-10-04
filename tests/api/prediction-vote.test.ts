import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ client: { fetch: vi.fn(), patch: vi.fn() } }))

import { client } from "../../lib/sanity.client"
import handler from "../../pages/api/prediction-vote"
import { fakePatch, mockReq, mockRes } from "../helpers/http"

const fetchDoc = client.fetch as unknown as ReturnType<typeof vi.fn>
const patch = client.patch as unknown as ReturnType<typeof vi.fn>

const FUTURE = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
const PAST = new Date(Date.now() - 3600 * 1000).toISOString()

const vote = (body: unknown) => mockReq({ method: "POST", body })

beforeEach(() => {
	fetchDoc.mockReset()
	patch.mockReset()
	vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("POST /api/prediction-vote", () => {
	it("only accepts POST", async () => {
		const res = mockRes()
		await handler(mockReq({ method: "GET" }), res)
		expect(res.statusCode).toBe(405)
		expect(fetchDoc).not.toHaveBeenCalled()
	})

	it.each([
		["no body", undefined],
		["no id", { choice: "home" }],
		["non-string id", { _id: 7, choice: "home" }],
		["no choice", { _id: "abc" }],
		["a choice that isn't away or home", { _id: "abc", choice: "tie" }],
		["a draft id", { _id: "drafts.abc", choice: "home" }],
	])("rejects %s with a 400 and touches nothing", async (_label, body) => {
		const res = mockRes()
		await handler(vote(body), res)
		expect(res.statusCode).toBe(400)
		expect(fetchDoc).not.toHaveBeenCalled()
		expect(patch).not.toHaveBeenCalled()
	})

	it("only looks up documents of the right type, binding the id as a parameter", async () => {
		fetchDoc.mockResolvedValueOnce(null)
		await handler(vote({ _id: "abc", choice: "home" }), mockRes())
		const [query, params] = fetchDoc.mock.calls[0]
		expect(query).toContain('_type == "gamePrediction"')
		expect(query).toContain("_id == $id")
		expect(params).toEqual({ id: "abc" })
	})

	it("404s when the pick doesn't exist, so counts can't be pushed onto other documents", async () => {
		fetchDoc.mockResolvedValueOnce(null)
		const res = mockRes()
		await handler(vote({ _id: "abc", choice: "home" }), res)
		expect(res.statusCode).toBe(404)
		expect(patch).not.toHaveBeenCalled()
	})

	it("closes voting once the game has kicked off", async () => {
		fetchDoc.mockResolvedValueOnce({ kickoff: PAST })
		const res = mockRes()
		await handler(vote({ _id: "abc", choice: "home" }), res)
		expect(res.statusCode).toBe(409)
		expect(patch).not.toHaveBeenCalled()
	})

	it("closes voting once the pick has been graded, even before kickoff time says so", async () => {
		fetchDoc.mockResolvedValueOnce({ kickoff: FUTURE, actualAwayScore: 17, actualHomeScore: 24 })
		const res = mockRes()
		await handler(vote({ _id: "abc", choice: "away" }), res)
		expect(res.statusCode).toBe(409)
		expect(patch).not.toHaveBeenCalled()
	})

	it("counts a 0-0 final as graded", async () => {
		fetchDoc.mockResolvedValueOnce({ kickoff: FUTURE, actualAwayScore: 0, actualHomeScore: 0 })
		const res = mockRes()
		await handler(vote({ _id: "abc", choice: "away" }), res)
		expect(res.statusCode).toBe(409)
	})

	it.each([
		["home", "readerVotesHome"],
		["away", "readerVotesAway"],
	])("a %s vote adds one to %s and returns the new totals", async (choice, field) => {
		fetchDoc.mockResolvedValueOnce({ kickoff: FUTURE })
		const { chain, calls } = fakePatch({ readerVotesAway: 4, readerVotesHome: 9 })
		patch.mockReturnValueOnce(chain)
		const res = mockRes()
		await handler(vote({ _id: "abc", choice }), res)
		expect(patch).toHaveBeenCalledWith("abc")
		expect(calls.setIfMissing).toEqual({ readerVotesAway: 0, readerVotesHome: 0 })
		expect(calls.inc).toEqual({ [field]: 1 })
		expect(res.statusCode).toBe(200)
		expect(res.body).toEqual({ readerVotesAway: 4, readerVotesHome: 9 })
	})

	it("accepts a JSON string body", async () => {
		fetchDoc.mockResolvedValueOnce({ kickoff: FUTURE })
		patch.mockReturnValueOnce(fakePatch({ readerVotesAway: 0, readerVotesHome: 1 }).chain)
		const res = mockRes()
		await handler(vote(JSON.stringify({ _id: "abc", choice: "home" })), res)
		expect(res.statusCode).toBe(200)
	})

	it("returns a generic 500 without leaking Sanity's error when the save fails", async () => {
		fetchDoc.mockResolvedValueOnce({ kickoff: FUTURE })
		patch.mockImplementationOnce(() => {
			throw Object.assign(new Error("Insufficient permissions; token xyz"), { statusCode: 403 })
		})
		const res = mockRes()
		await handler(vote({ _id: "abc", choice: "home" }), res)
		expect(res.statusCode).toBe(500)
		expect(JSON.stringify(res.body)).not.toContain("token")
	})
})
