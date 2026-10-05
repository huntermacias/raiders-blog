import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn() }, client: { fetch: vi.fn() } }))

import { client, readClient } from "../../lib/sanity.client"
import handler from "../../pages/api/og"
import { mockReq, mockRes } from "../helpers/http"

const fetchDoc = readClient.fetch as unknown as ReturnType<typeof vi.fn>
const tokenFetch = client.fetch as unknown as ReturnType<typeof vi.fn>
const get = (query: Record<string, string>, method = "GET") => mockReq({ method, query })

const isPng = (b: unknown) => Buffer.isBuffer(b) || b instanceof Uint8Array

beforeEach(() => {
	fetchDoc.mockReset()
	tokenFetch.mockReset()
	vi.spyOn(console, "error").mockImplementation(() => {})
})

// The first real render parses the embedded fonts, which can take a while on a cold CI machine.
vi.setConfig({ testTimeout: 90_000 })

describe("/api/og", () => {
	it("405s anything but GET and HEAD", async () => {
		const res = mockRes()
		await handler(get({ type: "rankings" }, "POST"), res)
		expect(res.statusCode).toBe(405)
		expect(res.headers.Allow).toBe("GET, HEAD")
	})

	it.each([
		["no type", {}],
		["an unknown type", { type: "nope" }],
		["a post slug with path characters", { type: "post", slug: "../etc/passwd" }],
		["an uppercase slug", { type: "post", slug: "Bad_Slug" }],
		["a game with no slug", { type: "game" }],
		["a draft pick id", { type: "pick", id: "drafts.abc" }],
		["a pick id with spaces", { type: "pick", id: "a b" }],
	])("redirects %s to the default card without touching Sanity", async (_l, query) => {
		const res = mockRes()
		await handler(get(query as Record<string, string>), res)
		expect(res.statusCode).toBe(302)
		expect(res.redirectedTo).toBe("/og-default-v2.png")
		expect(fetchDoc).not.toHaveBeenCalled()
	})

	it("redirects when the post doesn't exist", async () => {
		fetchDoc.mockResolvedValueOnce(null)
		const res = mockRes()
		await handler(get({ type: "post", slug: "missing" }), res)
		expect(res.redirectedTo).toBe("/og-default-v2.png")
		expect(res.headers["Cache-Control"]).toContain("s-maxage=60")
	})

	it("redirects when a game report has no final score", async () => {
		fetchDoc.mockResolvedValueOnce({ title: "T", opponent: "Saints" })
		const res = mockRes()
		await handler(get({ type: "game", slug: "week-3" }), res)
		expect(res.redirectedTo).toBe("/og-default-v2.png")
	})

	it("falls back (never errors) when Sanity is down", async () => {
		fetchDoc.mockRejectedValueOnce(new Error("sanity down"))
		const res = mockRes()
		await handler(get({ type: "rankings" }), res)
		expect(res.statusCode).toBe(302)
		expect(res.redirectedTo).toBe("/og-default-v2.png")
	})

	it("binds the slug as a query parameter", async () => {
		fetchDoc.mockResolvedValueOnce(null)
		await handler(get({ type: "post", slug: "my-post" }), mockRes())
		expect(fetchDoc.mock.calls[0][1]).toEqual({ slug: "my-post" })
	})

	it("renders a post card as a cacheable PNG", async () => {
		fetchDoc.mockResolvedValueOnce({ title: "Raiders Week 4 Preview", category: "Previews" })
		const res = mockRes()
		await handler(get({ type: "post", slug: "week-4" }), res)
		expect(res.statusCode).toBe(200)
		expect(res.headers["Content-Type"]).toBe("image/png")
		expect(res.headers["Cache-Control"]).toContain("s-maxage=86400")
		expect(isPng(res.rawBody)).toBe(true)
	})

	it("renders a game card", async () => {
		fetchDoc.mockResolvedValueOnce({ title: "Raiders 24, Saints 17", opponent: "Saints", raidersScore: 24, opponentScore: 17 })
		const res = mockRes()
		await handler(get({ type: "game", slug: "week-3" }), res)
		expect(res.headers["Content-Type"]).toBe("image/png")
	})

	it("renders a rankings card, using the latest week", async () => {
		fetchDoc.mockResolvedValueOnce([
			{ _id: "a", season: 2026, week: 1, teams: [{ _key: "1", team: "Las Vegas Raiders" }] },
		])
		const res = mockRes()
		await handler(get({ type: "rankings" }), res)
		expect(res.headers["Content-Type"]).toBe("image/png")
	})

	it("falls back when there are no rankings yet", async () => {
		fetchDoc.mockResolvedValueOnce([])
		const res = mockRes()
		await handler(get({ type: "rankings" }), res)
		expect(res.redirectedTo).toBe("/og-default-v2.png")
	})

	it("renders a scoreboard card even with no picks", async () => {
		fetchDoc.mockResolvedValue([])
		const res = mockRes()
		await handler(get({ type: "scoreboard" }), res)
		expect(res.headers["Content-Type"]).toBe("image/png")
	})

	it("renders a graded pick card", async () => {
		fetchDoc.mockResolvedValueOnce({
			_id: "p1", week: 2, awayTeam: "Los Angeles Chargers", homeTeam: "Las Vegas Raiders", kickoff: "2026-09-20T20:25:00Z",
			predictedAwayScore: 20, predictedHomeScore: 24, actualAwayScore: 17, actualHomeScore: 27,
		})
		const res = mockRes()
		await handler(get({ type: "pick", id: "p1" }), res)
		expect(res.headers["Content-Type"]).toBe("image/png")
	})

	describe("league cards", () => {
		const leagueData = {
			games: [{ _id: "g1", week: 1, awayTeam: "Las Vegas Raiders", homeTeam: "Kansas City Chiefs", kickoff: "2026-09-13T20:00:00Z", predictedAwayScore: 24, predictedHomeScore: 20, actualAwayScore: 27, actualHomeScore: 20 }],
			players: [{ handle: "Ann", lower: "ann", joinedAt: "2026-09-01T00:00:00Z" }],
			picks: [{ player: "ann", predictionId: "g1", awayScore: 27, homeScore: 20 }],
		}

		it("renders the league's own card and reads private data with the token client", async () => {
			tokenFetch.mockResolvedValueOnce(leagueData)
			const res = mockRes()
			await handler(get({ type: "league" }), res)
			expect(res.headers["Content-Type"]).toBe("image/png")
			expect(tokenFetch).toHaveBeenCalledTimes(1)
			expect(fetchDoc).not.toHaveBeenCalled() // the public client can't see dotted ids
		})

		it("renders a player's card", async () => {
			tokenFetch.mockResolvedValueOnce(leagueData)
			const res = mockRes()
			await handler(get({ type: "league", handle: "ANN" }), res)
			expect(res.headers["Content-Type"]).toBe("image/png")
		})

		it("renders a card for a player who has no graded game yet", async () => {
			tokenFetch.mockResolvedValueOnce({ ...leagueData, picks: [] })
			const res = mockRes()
			await handler(get({ type: "league", handle: "ann" }), res)
			expect(res.headers["Content-Type"]).toBe("image/png")
		})

		it("falls back for a handle that isn't in the league", async () => {
			tokenFetch.mockResolvedValueOnce(leagueData)
			const res = mockRes()
			await handler(get({ type: "league", handle: "ghost" }), res)
			expect(res.redirectedTo).toBe("/og-default-v2.png")
		})

		it("falls back for a malformed handle without querying", async () => {
			tokenFetch.mockResolvedValueOnce(leagueData)
			const res = mockRes()
			await handler(get({ type: "league", handle: "../../x" }), res)
			expect(res.redirectedTo).toBe("/og-default-v2.png")
		})

		it("falls back when the league can't be read", async () => {
			tokenFetch.mockRejectedValueOnce(new Error("no token"))
			const res = mockRes()
			await handler(get({ type: "league" }), res)
			expect(res.redirectedTo).toBe("/og-default-v2.png")
		})

		it("renders a challenge card for a player", async () => {
			tokenFetch.mockResolvedValueOnce(leagueData)
			const res = mockRes()
			await handler(get({ type: "league", challenge: "ANN" }), res)
			expect(res.headers["Content-Type"]).toBe("image/png")
			expect(res.headers["Cache-Control"]).toContain("s-maxage=3600")
		})

		it("gives a challenge link for an unknown or malformed challenger the plain invite card, not the default image", async () => {
			for (const challenge of ["ghost", "../../x"]) {
				tokenFetch.mockResolvedValueOnce(leagueData)
				const res = mockRes()
				await handler(get({ type: "league", challenge }), res)
				expect(res.headers["Content-Type"]).toBe("image/png")
			}
		})

		it("renders the leaderboard look on request", async () => {
			tokenFetch.mockResolvedValueOnce(leagueData)
			const res = mockRes()
			await handler(get({ type: "league", view: "board" }), res)
			expect(res.headers["Content-Type"]).toBe("image/png")
		})
	})
})
