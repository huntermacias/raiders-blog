import { beforeEach, describe, expect, it, vi } from "vitest"

// Next 13.2.1 caches token-free server fetches for a year, so a published Studio edit (new power rankings,
// graded keys) never showed up on Vercel until the next deploy. The read client must opt every query out.
const rawFetch = vi.fn(async (..._args: unknown[]) => ({ ok: true }))

vi.mock("next-sanity", () => ({
	groq: (s: TemplateStringsArray) => s.raw.join(""),
	createClient: () => ({ fetch: rawFetch }),
}))

describe("readClient", () => {
	beforeEach(() => {
		rawFetch.mockClear()
		vi.resetModules()
	})

	it("sends cache: no-store by default", async () => {
		const { readClient } = await import("../../lib/sanity.client")
		await readClient.fetch("*[_type=='x']", { a: 1 })
		expect(rawFetch).toHaveBeenCalledWith("*[_type=='x']", { a: 1 }, { cache: "no-store" })
	})

	it("works without params", async () => {
		const { readClient } = await import("../../lib/sanity.client")
		await readClient.fetch("*[_type=='x']")
		expect(rawFetch).toHaveBeenCalledWith("*[_type=='x']", {}, { cache: "no-store" })
	})

	it("lets a caller opt back into caching", async () => {
		const { readClient } = await import("../../lib/sanity.client")
		await readClient.fetch("q", {}, { next: { revalidate: 60 }, cache: "force-cache" })
		expect(rawFetch).toHaveBeenCalledWith("q", {}, { next: { revalidate: 60 }, cache: "force-cache" })
	})
})
