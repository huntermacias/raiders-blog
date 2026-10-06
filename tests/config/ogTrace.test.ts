import { createRequire } from "node:module"
import { existsSync } from "node:fs"
import { describe, expect, it } from "vitest"

const require = createRequire(import.meta.url)
const config = require("../../next.config.js")

// The card route reads hb.wasm from harfbuzzjs with fs at runtime. Vercel's tracer can't see that, so the
// deployed function lacked the file and every share card silently fell back to the default image.
describe("share-card route file tracing", () => {
	const includes: string[] = config.outputFileTracingIncludes?.["/api/og"] ?? []

	it("ships harfbuzz's wasm with /api/og", () => {
		expect(includes).toContain("./node_modules/harfbuzzjs/hb.wasm")
	})

	it("points at a file that exists in node_modules", () => {
		expect(existsSync("node_modules/harfbuzzjs/hb.wasm")).toBe(true)
	})
})
