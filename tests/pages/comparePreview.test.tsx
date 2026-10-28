import { describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn(async () => null) }, client: { fetch: vi.fn() } }))

import Preview, { generateMetadata as previewMeta } from "../../app/(user)/lab/players/compare/preview/page"
import { generateMetadata as pageMeta } from "../../app/(user)/lab/players/compare/page"
import { getPlayers } from "../../lib/lab/data"

const players = getPlayers().players
const qb = players.filter((p) => p.pos === "QB").slice(0, 2)
const q = { a: qb[0].slug, b: qb[1].slug }

describe("the page a link-preview bot is given", () => {
	it("carries the comparison's own title, description and card, exactly as the real page does", async () => {
		const real = await pageMeta({ searchParams: Promise.resolve(q) })
		const stub = await previewMeta({ searchParams: Promise.resolve(q) })
		expect(stub.title).toBe(real.title)
		expect(stub.description).toBe(real.description)
		expect(stub.openGraph).toEqual(real.openGraph)
		expect(stub.twitter).toEqual(real.twitter)
		expect(String((stub.twitter as { images: { url: string }[] }).images[0].url)).toContain(`/api/og?type=compare&a=${qb[0].slug}&b=${qb[1].slug}`)
	})

	it("is kept out of search results and leads nowhere else", async () => {
		expect((await previewMeta({ searchParams: Promise.resolve(q) })).robots).toEqual({ index: false, follow: false })
		expect(typeof Preview).toBe("function")
	})
})

describe("what is indexed", () => {
	it("leaves the bare comparison page, and one with only tracking tags, open to search engines", async () => {
		expect((await pageMeta({ searchParams: Promise.resolve({}) })).robots).toBeUndefined()
		expect((await pageMeta({ searchParams: Promise.resolve({ utm_source: "x", v: "1" } as never) })).robots).toBeUndefined()
	})

	it("keeps every configured address out, even one with a single player or an unknown one", async () => {
		for (const s of [{ a: qb[0].slug }, { a: "nobody", b: "else" }, { r: "form" }, q]) expect((await pageMeta({ searchParams: Promise.resolve(s) })).robots, JSON.stringify(s)).toEqual({ index: false, follow: false })
	})
})
