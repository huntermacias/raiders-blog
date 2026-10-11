import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const page = readFileSync(join(__dirname, "../../app/(user)/page.tsx"), "utf8")
const code = page.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")

describe("the homepage's Lab band wiring", () => {
	it("is built from the hub state and the stored Rooting Guide, not from anything fetched over the network", () => {
		expect(code).toContain("labPhase(state, Date.now())")
		expect(code).toContain("loadRootingSnapshot()")
		expect(code).toMatch(/import \{ loadRootingSnapshot \} from "\.\.\/\.\.\/lib\/homeLab\.server"/)
	})

	it("comes before the stories on game days and after them the rest of the week", () => {
		expect(code).toMatch(/const labFirst = phase === "live" \|\| phase === "final"/)
		const first = code.indexOf("{labFirst && labBand}")
		const stories = code.indexOf("<FeaturedStories")
		const after = code.indexOf("{!labFirst && labBand}")
		expect(first).toBeGreaterThan(-1)
		expect(first).toBeLessThan(stories)
		expect(after).toBeGreaterThan(stories)
	})

	it("keeps the page's own tagline visible on phones", () => {
		expect(code).not.toMatch(/hidden[^"]*md:block">Independent coverage/)
	})
})
