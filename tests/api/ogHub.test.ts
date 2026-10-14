// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn() }, client: { fetch: vi.fn() } }))

import handler from "../../pages/api/og"
import { mockReq, mockRes } from "../helpers/http"

vi.setConfig({ testTimeout: 90_000 })

const isPng = (b: unknown) => (Buffer.isBuffer(b) || b instanceof Uint8Array) && Buffer.from(b as Uint8Array).subarray(1, 4).toString() === "PNG"

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("GET /api/og?type=hub", () => {
	it("answers with the Lab Report as a PNG, cached for the data's life, whatever the link's version", async () => {
		const res = mockRes()
		await handler(mockReq({ method: "GET", query: { type: "hub", v: "123" } }) as never, res as never)
		expect(res.statusCode).toBe(200)
		expect(res.headers["Content-Type"]).toBe("image/png")
		expect(res.headers["Cache-Control"]).toMatch(/s-maxage=604800/)
		expect(isPng(res.rawBody ?? res.body)).toBe(true)
	})
})
