import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import handler from "../../pages/api/subscribe"
import { mockReq, mockRes } from "../helpers/http"

const KEY = "test-key"
const okResponse = () => new Response("{}", { status: 201 })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
	process.env.BUTTONDOWN_API_KEY = KEY
	fetchMock = vi.fn(async () => okResponse())
	vi.stubGlobal("fetch", fetchMock)
	vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
	delete process.env.BUTTONDOWN_API_KEY
	vi.unstubAllGlobals()
})

const post = (body: unknown, headers: Record<string, string | string[] | undefined> = {}, extra: { remoteAddress?: string } = {}) =>
	mockReq({ method: "POST", body, headers: { host: "www.raidersrundown.com", ...headers }, ...extra })

describe("POST /api/subscribe: request checks", () => {
	it("only accepts POST", async () => {
		const res = mockRes()
		await handler(mockReq({ method: "GET" }), res)
		expect(res.statusCode).toBe(405)
		expect(res.headers.Allow).toBe("POST")
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it("refuses to run without an API key, and says signups aren't open", async () => {
		delete process.env.BUTTONDOWN_API_KEY
		const res = mockRes()
		await handler(post({ email: "fan@example.com" }), res)
		expect(res.statusCode).toBe(503)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it.each([
		["https://www.raidersrundown.com", true],
		["https://raidersrundown.com", true],
		["https://evil.example", false],
		["https://www.raidersrundown.com.evil.example", false],
		["not a url", false],
	])("checks the Origin header: %s", async (origin, allowed) => {
		const res = mockRes()
		await handler(post({ email: "fan@example.com" }, { origin, host: "localhost:3000" }), res)
		expect(res.statusCode).toBe(allowed ? 200 : 403)
		expect(fetchMock).toHaveBeenCalledTimes(allowed ? 1 : 0)
	})

	it("allows the request's own host (local dev) and callers with no Origin", async () => {
		const own = mockRes()
		await handler(post({ email: "fan@example.com" }, { origin: "http://localhost:3000", host: "localhost:3000" }), own)
		expect(own.statusCode).toBe(200)
		const none = mockRes()
		await handler(post({ email: "fan@example.com" }), none)
		expect(none.statusCode).toBe(200)
	})
})

describe("POST /api/subscribe: validation", () => {
	it.each([
		["empty", ""],
		["no at-sign", "fan.example.com"],
		["no domain dot", "fan@example"],
		["spaces", "fan @example.com"],
		["short tld", "fan@example.c"],
		["not a string", 12345],
		["too long", `${"a".repeat(250)}@example.com`],
	])("rejects a bad email (%s) without calling Buttondown", async (_label, email) => {
		const res = mockRes()
		await handler(post({ email }), res)
		expect(res.statusCode).toBe(400)
		expect(res.body).toEqual({ message: "Enter a valid email address." })
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it("quietly accepts a filled honeypot and does nothing", async () => {
		const res = mockRes()
		await handler(post({ email: "bot@example.com", website: "http://spam.example" }), res)
		expect(res.statusCode).toBe(200)
		expect(res.body).toEqual({ ok: true })
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it("treats an empty honeypot as a normal signup", async () => {
		const res = mockRes()
		await handler(post({ email: "fan@example.com", website: "   " }), res)
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it("reads a JSON string body", async () => {
		const res = mockRes()
		await handler(post(JSON.stringify({ email: "fan@example.com" })), res)
		expect(res.statusCode).toBe(200)
	})

	it("fails safely on a body that isn't JSON", async () => {
		const res = mockRes()
		await handler(post("{nope"), res)
		expect(res.statusCode).toBe(500)
		expect(fetchMock).not.toHaveBeenCalled()
	})
})

describe("POST /api/subscribe: what is sent to Buttondown", () => {
	const sent = () => {
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
		return { url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> }
	}

	it("posts a trimmed, lower-cased address with the secret key in the auth header", async () => {
		await handler(post({ email: "  Fan@Example.COM " }), mockRes())
		const { url, init, body } = sent()
		expect(url).toBe("https://api.buttondown.com/v1/subscribers")
		expect(init.method).toBe("POST")
		expect(init.headers.Authorization).toBe(`Token ${KEY}`)
		expect(init.headers["X-Buttondown-Collision-Behavior"]).toBe("add")
		expect(body.email_address).toBe("fan@example.com")
		expect(body.utm_source).toBe("raidersrundown.com")
	})

	it("never puts the API key anywhere in the response", async () => {
		const res = mockRes()
		await handler(post({ email: "fan@example.com" }), res)
		expect(JSON.stringify(res.body)).not.toContain(KEY)
	})

	it("passes the visitor's IP (first x-forwarded-for entry) so Buttondown judges them, not our server", async () => {
		await handler(post({ email: "fan@example.com" }, { "x-forwarded-for": "203.0.113.9, 10.0.0.1" }), mockRes())
		expect(sent().body.ip_address).toBe("203.0.113.9")
	})

	it("falls back to the socket address, and omits it when neither is known", async () => {
		await handler(post({ email: "fan@example.com" }, {}, { remoteAddress: "198.51.100.7" }), mockRes())
		expect(sent().body.ip_address).toBe("198.51.100.7")

		fetchMock.mockClear()
		await handler(post({ email: "fan@example.com" }), mockRes())
		expect(sent().body.ip_address).toBeUndefined()
	})

	it("records where on the site the signup came from, capped at 60 characters", async () => {
		await handler(post({ email: "fan@example.com", source: "home" }), mockRes())
		expect(sent().body.utm_medium).toBe("home")

		fetchMock.mockClear()
		await handler(post({ email: "fan@example.com", source: "x".repeat(200) }), mockRes())
		expect(String(sent().body.utm_medium)).toHaveLength(60)

		fetchMock.mockClear()
		await handler(post({ email: "fan@example.com" }), mockRes())
		expect(sent().body.utm_medium).toBe("site")
	})

	it("forwards the campaign a tagged visitor arrived with, keeping the placement as metadata", async () => {
		await handler(
			post({ email: "fan@example.com", source: "home", utm: { source: "x", medium: "social", campaign: "week4-league", content: "scoring" } }),
			mockRes()
		)
		const { body } = sent()
		expect(body.utm_source).toBe("x")
		expect(body.utm_medium).toBe("social")
		expect(body.utm_campaign).toBe("week4-league")
		expect(body.metadata).toEqual({ placement: "home", utm_content: "scoring" })
	})

	it("fills gaps from the old defaults when only part of a campaign is known", async () => {
		await handler(post({ email: "fan@example.com", source: "post-footer", utm: { campaign: "recap" } }), mockRes())
		const { body } = sent()
		expect(body.utm_source).toBe("raidersrundown.com")
		expect(body.utm_medium).toBe("post-footer")
		expect(body.utm_campaign).toBe("recap")
	})

	it("cleans a hostile utm payload and never sends fields it doesn't know", async () => {
		await handler(
			post({ email: "fan@example.com", utm: { source: "<script>X</script>", campaign: "a".repeat(300), admin: true, tags: ["vip"] } }),
			mockRes()
		)
		const { body } = sent()
		expect(body.utm_source).toBe("scriptxscript")
		expect(String(body.utm_campaign)).toHaveLength(64)
		expect(body).not.toHaveProperty("admin")
		expect(body).not.toHaveProperty("tags")
	})

	it("sends no campaign fields for an untagged signup and ignores a non-object utm", async () => {
		for (const utm of [undefined, null, "x", 5, []]) {
			fetchMock.mockClear()
			await handler(post({ email: "fan@example.com", source: "home", utm }), mockRes())
			const { body } = sent()
			expect(body.utm_source).toBe("raidersrundown.com")
			expect(body.utm_medium).toBe("home")
			expect(body).not.toHaveProperty("utm_campaign")
			expect(body.metadata).toEqual({ placement: "home" })
		}
	})

	it("uses the referring page, or the site as a default", async () => {
		await handler(post({ email: "fan@example.com" }, { referer: "https://www.raidersrundown.com/predictions" }), mockRes())
		expect(sent().body.referrer_url).toBe("https://www.raidersrundown.com/predictions")

		fetchMock.mockClear()
		await handler(post({ email: "fan@example.com" }), mockRes())
		expect(sent().body.referrer_url).toBe("https://www.raidersrundown.com/")
	})
})

describe("POST /api/subscribe: Buttondown's answer", () => {
	const answer = (status: number, text = "") => fetchMock.mockResolvedValueOnce(new Response(text, { status }))

	it("reports success only for a 2xx", async () => {
		for (const status of [200, 201]) {
			answer(status)
			const res = mockRes()
			await handler(post({ email: "fan@example.com" }), res)
			expect(res.statusCode).toBe(200)
			expect(res.body).toEqual({ ok: true })
		}
	})

	it.each([
		[400, 422, "We couldn't add that address"],
		[403, 422, "We couldn't add that address"],
		[422, 400, "doesn't look right"],
		[429, 502, "Try again in a minute"],
		[500, 502, "Try again in a minute"],
	])("maps a Buttondown %i to our %i and never claims success", async (upstream, ours, text) => {
		answer(upstream, '{"code":"subscriber_blocked"}')
		const res = mockRes()
		await handler(post({ email: "fan@example.com" }), res)
		expect(res.statusCode).toBe(ours)
		expect((res.body as { message: string }).message).toContain(text)
		expect(res.body).not.toHaveProperty("ok")
	})

	it("logs why a signup was refused with the address redacted", async () => {
		answer(400, '{"detail":"fan@example.com was blocked"}')
		await handler(post({ email: "fan@example.com" }), mockRes())
		const logged = (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls.flat().join(" ")
		expect(logged).toContain("newsletter signup refused")
		expect(logged).toContain("[email]")
		expect(logged).not.toContain("fan@example.com")
	})

	it("returns a generic 500 if the request itself fails", async () => {
		fetchMock.mockRejectedValueOnce(new Error("network down"))
		const res = mockRes()
		await handler(post({ email: "fan@example.com" }), res)
		expect(res.statusCode).toBe(500)
		expect(JSON.stringify(res.body)).not.toContain("network down")
	})
})
