import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ client: { fetch: vi.fn(), create: vi.fn(), patch: vi.fn() } }))

import { client } from "../../lib/sanity.client"
import handler from "../../pages/api/liveEvent"
import { fakePatch, mockReq, mockRes } from "../helpers/http"

const c = client as unknown as { fetch: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; patch: ReturnType<typeof vi.fn> }
const SECRET = "s3cret"
const authed = { "x-live-secret": SECRET }
const post = (body: unknown, headers: Record<string, string> = authed) => mockReq({ method: "POST", headers, body: JSON.stringify(body) })

const original = process.env.LIVE_POST_SECRET
beforeEach(() => {
	process.env.LIVE_POST_SECRET = SECRET
	c.fetch.mockReset()
	c.create.mockReset()
	c.patch.mockReset()
	vi.spyOn(console, "log").mockImplementation(() => {})
})
afterEach(() => {
	if (original === undefined) delete process.env.LIVE_POST_SECRET
	else process.env.LIVE_POST_SECRET = original
})

describe("/api/liveEvent authorization", () => {
	it("fails closed when LIVE_POST_SECRET isn't configured", async () => {
		delete process.env.LIVE_POST_SECRET
		const res = mockRes()
		await handler(mockReq({ method: "GET", headers: { "x-live-secret": "" } }), res)
		expect(res.statusCode).toBe(401)
		expect(c.fetch).not.toHaveBeenCalled()
	})

	it.each(["GET", "POST"])("rejects %s with no secret", async (method) => {
		const res = mockRes()
		await handler(mockReq({ method, headers: {}, body: "{}" }), res)
		expect(res.statusCode).toBe(401)
	})

	it("rejects a wrong secret on every method and never touches Sanity", async () => {
		for (const method of ["GET", "POST", "DELETE"]) {
			const res = mockRes()
			await handler(mockReq({ method, headers: { "x-live-secret": "nope" }, body: "{}" }), res)
			expect(res.statusCode).toBe(401)
		}
		expect(c.fetch).not.toHaveBeenCalled()
		expect(c.create).not.toHaveBeenCalled()
		expect(c.patch).not.toHaveBeenCalled()
	})

	it("405s other methods once authorized", async () => {
		const res = mockRes()
		await handler(mockReq({ method: "DELETE", headers: authed }), res)
		expect(res.statusCode).toBe(405)
	})
})

describe("GET /api/liveEvent", () => {
	it("lists events", async () => {
		c.fetch.mockResolvedValueOnce([{ _id: "e1" }])
		const res = mockRes()
		await handler(mockReq({ method: "GET", headers: authed }), res)
		expect(res.statusCode).toBe(200)
		expect(res.body).toEqual({ events: [{ _id: "e1" }] })
	})

	it("500s when the query fails", async () => {
		c.fetch.mockRejectedValueOnce(new Error("x"))
		const res = mockRes()
		await handler(mockReq({ method: "GET", headers: authed }), res)
		expect(res.statusCode).toBe(500)
	})
})

describe("POST createEvent", () => {
	it.each([[undefined], [""], ["   "], [42]])("requires a real title (%s)", async (title) => {
		const res = mockRes()
		await handler(post({ action: "createEvent", title }), res)
		expect(res.statusCode).toBe(400)
		expect(c.create).not.toHaveBeenCalled()
	})

	it("creates a live event with a slugified title", async () => {
		c.create.mockImplementationOnce(async (doc) => ({ _id: "e1", ...doc }))
		const res = mockRes()
		await handler(post({ action: "createEvent", title: "  Raiders vs. Chiefs: LIVE!! " }), res)
		const doc = c.create.mock.calls[0][0]
		expect(doc._type).toBe("liveEvent")
		expect(doc.title).toBe("Raiders vs. Chiefs: LIVE!!")
		expect(doc.slug).toEqual({ _type: "slug", current: "raiders-vs-chiefs-live" })
		expect(doc.status).toBe("live")
		expect(doc.updates).toEqual([])
		expect(Number.isNaN(Date.parse(doc.startedAt))).toBe(false)
		expect(res.statusCode).toBe(200)
	})

	it("caps slugs at 96 characters", async () => {
		c.create.mockImplementationOnce(async (doc) => doc)
		await handler(post({ action: "createEvent", title: "a".repeat(300) }), mockRes())
		expect(c.create.mock.calls[0][0].slug.current).toHaveLength(96)
	})
})

describe("POST postUpdate", () => {
	it.each([
		["no event", { action: "postUpdate", body: "hi" }],
		["no body", { action: "postUpdate", eventId: "e1" }],
		["a blank body", { action: "postUpdate", eventId: "e1", body: "   " }],
	])("rejects %s", async (_l, payload) => {
		const res = mockRes()
		await handler(post(payload), res)
		expect(res.statusCode).toBe(400)
		expect(c.patch).not.toHaveBeenCalled()
	})

	it("appends a keyed, timestamped update", async () => {
		const { chain, calls } = fakePatch({ _id: "e1" })
		c.patch.mockReturnValueOnce(chain)
		const res = mockRes()
		await handler(post({ action: "postUpdate", eventId: "e1", body: "  TD Raiders  " }), res)
		expect(c.patch).toHaveBeenCalledWith("e1")
		expect(calls.setIfMissing).toEqual({ updates: [] })
		const [field, items] = calls.append as [string, any[]]
		expect(field).toBe("updates")
		expect(items).toHaveLength(1)
		expect(items[0]).toMatchObject({ _type: "liveUpdate", body: "TD Raiders" })
		expect(items[0]._key).toBeTruthy()
		expect(items[0].embedUrl).toBeUndefined()
		expect(res.statusCode).toBe(200)
	})

	it("includes a trimmed embed url only when it's a non-empty string", async () => {
		const a = fakePatch({})
		c.patch.mockReturnValueOnce(a.chain)
		await handler(post({ action: "postUpdate", eventId: "e1", body: "x", embedUrl: " https://x.com/1 " }), mockRes())
		expect((a.calls.append as any[])[1][0].embedUrl).toBe("https://x.com/1")

		const b = fakePatch({})
		c.patch.mockReturnValueOnce(b.chain)
		await handler(post({ action: "postUpdate", eventId: "e1", body: "x", embedUrl: "  " }), mockRes())
		expect((b.calls.append as any[])[1][0].embedUrl).toBeUndefined()
	})
})

describe("POST setStatus", () => {
	it.each(["upcoming", "live", "final"])("accepts %s", async (status) => {
		const { chain, calls } = fakePatch({ _id: "e1", status })
		c.patch.mockReturnValueOnce(chain)
		const res = mockRes()
		await handler(post({ action: "setStatus", eventId: "e1", status }), res)
		expect(calls.set).toEqual({ status })
		expect(res.statusCode).toBe(200)
	})

	it.each([["archived"], [undefined], ["LIVE"]])("rejects status %s", async (status) => {
		const res = mockRes()
		await handler(post({ action: "setStatus", eventId: "e1", status }), res)
		expect(res.statusCode).toBe(400)
		expect(c.patch).not.toHaveBeenCalled()
	})

	it("rejects a missing event id", async () => {
		const res = mockRes()
		await handler(post({ action: "setStatus", status: "final" }), res)
		expect(res.statusCode).toBe(400)
	})
})

describe("POST misc", () => {
	it("rejects unknown actions", async () => {
		const res = mockRes()
		await handler(post({ action: "deleteEverything" }), res)
		expect(res.statusCode).toBe(400)
	})

	it("500s on a body that isn't JSON", async () => {
		const res = mockRes()
		await handler(mockReq({ method: "POST", headers: authed, body: "{{" }), res)
		expect(res.statusCode).toBe(500)
	})

	it("500s when Sanity fails", async () => {
		c.create.mockRejectedValueOnce(new Error("x"))
		const res = mockRes()
		await handler(post({ action: "createEvent", title: "T" }), res)
		expect(res.statusCode).toBe(500)
	})
})
