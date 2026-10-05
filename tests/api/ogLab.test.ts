import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn() }, client: { fetch: vi.fn() } }))

import handler from "../../pages/api/og"
import { mockReq, mockRes } from "../helpers/http"

vi.setConfig({ testTimeout: 60_000 })

const get = (query: Record<string, string>) => mockReq({ method: "GET", query })
const isPng = (b: unknown) => (Buffer.isBuffer(b) || b instanceof Uint8Array) && Buffer.from(b as Uint8Array).subarray(1, 4).toString() === "PNG"

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("/api/og?type=lab", () => {
	it("renders the story card, cached for a week", async () => {
		const res = mockRes()
		await handler(get({ type: "lab", slug: "week-3" }), res)
		expect(res.statusCode).toBe(200)
		expect(res.headers["Content-Type"]).toBe("image/png")
		expect(isPng(res.rawBody ?? res.body)).toBe(true)
		expect(res.headers["Cache-Control"]).toBe("public, s-maxage=604800, stale-while-revalidate=2592000")
	})

	it("renders the drive card, with or without a drive number", async () => {
		for (const q of [{ view: "drive" }, { view: "drive", drive: "2" }, { view: "drive", drive: "nope" }] as Record<string, string>[]) {
			const res = mockRes()
			await handler(get({ type: "lab", slug: "week-1", ...q }), res)
			expect(res.statusCode).toBe(200)
			expect(isPng(res.rawBody ?? res.body)).toBe(true)
		}
	})

	it("falls back to the default card for an unknown or malformed slug", async () => {
		for (const slug of ["week-99", "../etc", "WEEK-3", ""]) {
			const res = mockRes()
			await handler(get({ type: "lab", slug }), res)
			expect(res.redirectedTo).toBe("/og-default-v2.png")
		}
	})
})
