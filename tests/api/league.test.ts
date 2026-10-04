import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({
	client: { createIfNotExists: vi.fn(), getDocument: vi.fn(), fetch: vi.fn(), createOrReplace: vi.fn() },
}))

import { client } from "../../lib/sanity.client"
import { generateKey, hashKey } from "../../lib/league.server"
import join from "../../pages/api/league/join"
import signin from "../../pages/api/league/signin"
import pickRoute from "../../pages/api/league/pick"
import { mockReq, mockRes } from "../helpers/http"

const c = client as unknown as Record<"createIfNotExists" | "getDocument" | "fetch" | "createOrReplace", ReturnType<typeof vi.fn>>

let n = 0
/** Each request gets its own address so the in-memory rate limits never bleed between tests. */
const post = (body: unknown, ip = `10.0.0.${++n}`) => mockReq({ method: "POST", body: JSON.stringify(body), remoteAddress: ip })

beforeEach(() => {
	for (const f of Object.values(c)) f.mockReset()
	vi.spyOn(console, "log").mockImplementation(() => {})
})

const KEY = generateKey()
const PLAYER = { _id: "leaguePlayer.ann", handle: "Ann", handleLower: "ann", keyHash: hashKey(KEY) }
const FUTURE = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
const PAST = new Date(Date.now() - 3600 * 1000).toISOString()
const OPEN_GAME = { _id: "game1", season: 2026, week: 5, kickoff: FUTURE, actualAwayScore: null, actualHomeScore: null }

describe("POST /api/league/join", () => {
	it.each(["GET", "PUT"])("rejects %s", async (method) => {
		const res = mockRes()
		await join(mockReq({ method }), res)
		expect(res.statusCode).toBe(405)
	})

	it.each([undefined, "", "ab", "has space", "admin", "fuck_off"])("rejects the handle %j without writing", async (handle) => {
		const res = mockRes()
		await join(post({ handle }), res)
		expect(res.statusCode).toBe(400)
		expect(c.createIfNotExists).not.toHaveBeenCalled()
	})

	it("creates a private, derived-id player and returns the key once", async () => {
		c.createIfNotExists.mockImplementationOnce(async (doc) => doc)
		const res = mockRes()
		await join(post({ handle: "SilverFan" }), res)
		expect(res.statusCode).toBe(200)
		const body = res.body as { handle: string; key: string }
		expect(body.handle).toBe("SilverFan")
		expect(body.key).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/)

		const doc = c.createIfNotExists.mock.calls[0][0]
		expect(doc._id).toBe("leaguePlayer.silverfan")
		expect(doc._type).toBe("leaguePlayer")
		expect(doc.handleLower).toBe("silverfan")
		expect(doc.banned).toBe(false)
		// Only the hash is stored, never the key.
		expect(doc.keyHash).toBe(hashKey(body.key))
		expect(JSON.stringify(doc)).not.toContain(body.key)
	})

	it("returns 409 when the handle already belongs to someone else", async () => {
		c.createIfNotExists.mockResolvedValueOnce({ ...PLAYER, keyHash: hashKey(generateKey()) })
		const res = mockRes()
		await join(post({ handle: "Ann" }), res)
		expect(res.statusCode).toBe(409)
		expect(JSON.stringify(res.body)).not.toMatch(/[A-Z2-9]{5}-[A-Z2-9]{5}/)
	})

	it("rate limits one address after five sign-ups", async () => {
		c.createIfNotExists.mockImplementation(async (doc) => doc)
		const ip = "203.0.113.9"
		for (let i = 0; i < 5; i++) {
			const ok = mockRes()
			await join(post({ handle: `Fan_${i}x` }, ip), ok)
			expect(ok.statusCode).toBe(200)
		}
		const res = mockRes()
		await join(post({ handle: "OneMore" }, ip), res)
		expect(res.statusCode).toBe(429)
		expect(res.headers["Retry-After"]).toBeTruthy()
	})

	it("tolerates a body that isn't JSON", async () => {
		const res = mockRes()
		await join(mockReq({ method: "POST", body: "{nope", remoteAddress: "198.51.100.1" }), res)
		expect(res.statusCode).toBe(400)
	})

	it("returns a friendly 500 when Sanity rejects the write (e.g. token without write access)", async () => {
		c.createIfNotExists.mockRejectedValueOnce(Object.assign(new Error("Insufficient permissions"), { statusCode: 403 }))
		const res = mockRes()
		await join(post({ handle: "Okayfan" }), res)
		expect(res.statusCode).toBe(500)
		expect(JSON.stringify(res.body)).not.toContain("Insufficient")
	})
})

describe("POST /api/league/signin", () => {
	it("rejects non-POST", async () => {
		const res = mockRes()
		await signin(mockReq({ method: "GET" }), res)
		expect(res.statusCode).toBe(405)
	})

	it("returns the player's own picks for a valid handle and key", async () => {
		c.getDocument.mockResolvedValueOnce(PLAYER)
		c.fetch.mockResolvedValueOnce([{ predictionId: "game1", awayScore: 20, homeScore: 24 }])
		const res = mockRes()
		await signin(post({ handle: "ann", key: KEY }), res)
		expect(res.statusCode).toBe(200)
		expect(res.body).toEqual({ handle: "Ann", picks: [{ predictionId: "game1", awayScore: 20, homeScore: 24 }] })
		const [query, params] = c.fetch.mock.calls[0]
		expect(query).toContain("player == $player")
		expect(params).toEqual({ player: "ann", season: 2026 })
	})

	it("401s a wrong key with the same message as an unknown handle, and fetches nothing", async () => {
		c.getDocument.mockResolvedValueOnce(PLAYER)
		const wrong = mockRes()
		await signin(post({ handle: "ann", key: generateKey() }), wrong)
		c.getDocument.mockResolvedValueOnce(null)
		const unknown = mockRes()
		await signin(post({ handle: "ghost", key: KEY }), unknown)
		expect(wrong.statusCode).toBe(401)
		expect(unknown.body).toEqual(wrong.body)
		expect(c.fetch).not.toHaveBeenCalled()
	})

	it("rate limits guessing against one handle", async () => {
		c.getDocument.mockResolvedValue(PLAYER)
		let last = 0
		for (let i = 0; i < 16; i++) {
			const res = mockRes()
			await signin(post({ handle: "guessme", key: generateKey() }), res)
			last = res.statusCode
		}
		expect(last).toBe(429)
	})

	it("403s a banned player", async () => {
		c.getDocument.mockResolvedValueOnce({ ...PLAYER, banned: true })
		const res = mockRes()
		await signin(post({ handle: "ann", key: KEY }), res)
		expect(res.statusCode).toBe(403)
	})

	it("returns a friendly 500 when Sanity is down", async () => {
		c.getDocument.mockRejectedValueOnce(new Error("down"))
		const res = mockRes()
		await signin(post({ handle: "ann", key: KEY }), res)
		expect(res.statusCode).toBe(500)
	})
})

describe("POST /api/league/pick", () => {
	const body = (over: object = {}) => ({ handle: "ann", key: KEY, predictionId: "game1", awayScore: 20, homeScore: 24, ...over })

	function signedIn(game: object | null = OPEN_GAME) {
		c.getDocument.mockResolvedValueOnce(PLAYER)
		c.fetch.mockResolvedValueOnce(game)
	}

	it("rejects non-POST", async () => {
		const res = mockRes()
		await pickRoute(mockReq({ method: "GET" }), res)
		expect(res.statusCode).toBe(405)
	})

	it.each([
		["no game id", { predictionId: undefined }],
		["a drafts id", { predictionId: "drafts.game1" }],
		["an id with a dot", { predictionId: "a.b" }],
		["an id with a slash", { predictionId: "a/b" }],
		["a numeric id", { predictionId: 5 }],
	])("rejects %s before touching Sanity", async (_l, over) => {
		const res = mockRes()
		await pickRoute(post(body(over)), res)
		expect(res.statusCode).toBe(400)
		expect(c.getDocument).not.toHaveBeenCalled()
		expect(c.createOrReplace).not.toHaveBeenCalled()
	})

	it("requires a valid handle and key", async () => {
		c.getDocument.mockResolvedValueOnce(PLAYER)
		const res = mockRes()
		await pickRoute(post(body({ key: generateKey() })), res)
		expect(res.statusCode).toBe(401)
		expect(c.createOrReplace).not.toHaveBeenCalled()
	})

	it("saves one deterministic, private pick document", async () => {
		signedIn()
		c.createOrReplace.mockResolvedValueOnce({})
		const res = mockRes()
		await pickRoute(post(body()), res)
		expect(res.statusCode).toBe(200)
		expect(res.body).toEqual({ ok: true, predictionId: "game1", awayScore: 20, homeScore: 24 })
		const doc = c.createOrReplace.mock.calls[0][0]
		expect(doc).toMatchObject({
			_id: "leaguePick.ann.game1",
			_type: "leaguePick",
			season: 2026,
			week: 5,
			player: "ann",
			predictionId: "game1",
			awayScore: 20,
			homeScore: 24,
		})
		expect(Number.isNaN(Date.parse(doc.pickedAt))).toBe(false)
	})

	it("uses the authenticated identity, not a handle in the body", async () => {
		signedIn()
		c.createOrReplace.mockResolvedValueOnce({})
		await pickRoute(post(body({ player: "bo", handle: "ANN" })), mockRes())
		expect(c.createOrReplace.mock.calls[0][0].player).toBe("ann")
	})

	it("looks the game up as a published gamePrediction by bound id", async () => {
		signedIn()
		c.createOrReplace.mockResolvedValueOnce({})
		await pickRoute(post(body()), mockRes())
		const [query, params] = c.fetch.mock.calls[0]
		expect(query).toContain('_type == "gamePrediction"')
		expect(query).toContain("_id == $id")
		expect(params).toEqual({ id: "game1" })
	})

	it("404s a game that doesn't exist", async () => {
		signedIn(null)
		const res = mockRes()
		await pickRoute(post(body()), res)
		expect(res.statusCode).toBe(404)
		expect(c.createOrReplace).not.toHaveBeenCalled()
	})

	it("409s after kickoff, trusting the server clock", async () => {
		signedIn({ ...OPEN_GAME, kickoff: PAST })
		const res = mockRes()
		await pickRoute(post(body()), res)
		expect(res.statusCode).toBe(409)
		expect(c.createOrReplace).not.toHaveBeenCalled()
	})

	it("409s once the game has a final score", async () => {
		signedIn({ ...OPEN_GAME, actualAwayScore: 10, actualHomeScore: 20 })
		const res = mockRes()
		await pickRoute(post(body()), res)
		expect(res.statusCode).toBe(409)
	})

	it.each([
		["a tie", { awayScore: 17, homeScore: 17 }],
		["a negative score", { awayScore: -3, homeScore: 10 }],
		["a decimal", { awayScore: 3.5, homeScore: 10 }],
		["a string score", { awayScore: "20", homeScore: 10 }],
		["a huge score", { awayScore: 20, homeScore: 1000 }],
	])("400s %s", async (_l, over) => {
		signedIn()
		const res = mockRes()
		await pickRoute(post(body(over)), res)
		expect(res.statusCode).toBe(400)
		expect(c.createOrReplace).not.toHaveBeenCalled()
	})

	it("blocks banned players", async () => {
		c.getDocument.mockResolvedValueOnce({ ...PLAYER, banned: true })
		const res = mockRes()
		await pickRoute(post(body()), res)
		expect(res.statusCode).toBe(403)
		expect(c.createOrReplace).not.toHaveBeenCalled()
	})

	it("returns a friendly 500 when the write fails", async () => {
		signedIn()
		c.createOrReplace.mockRejectedValueOnce(new Error("x"))
		const res = mockRes()
		await pickRoute(post(body()), res)
		expect(res.statusCode).toBe(500)
	})

	it("rate limits an address that spams picks", async () => {
		c.getDocument.mockResolvedValue(PLAYER)
		c.fetch.mockResolvedValue(OPEN_GAME)
		c.createOrReplace.mockResolvedValue({})
		const ip = "192.0.2.77"
		let last = 0
		for (let i = 0; i < 121; i++) {
			const res = mockRes()
			await pickRoute(post(body(), ip), res)
			last = res.statusCode
		}
		expect(last).toBe(429)
	})
})
