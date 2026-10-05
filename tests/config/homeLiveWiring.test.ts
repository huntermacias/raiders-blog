import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Read the page source in a node-environment test. These checks used to sit in livestrip.test.tsx, but
// that file runs under jsdom, where some setups resolve `node:fs` to a browser stub and readFileSync
// is not a function.
describe("homepage wiring", () => {
	// The calendar card was once imported and never rendered. Guard the page itself.
	const src = readFileSync("app/(user)/page.tsx", "utf8")
	it("renders the strip and feeds it the server's scoreboard", () => {
		expect(src).toMatch(/<LiveStrip initialBoard=\{board\} serverNow=\{Date\.now\(\)\} \/>/)
	})
	it("gives the feed a deadline so a slow ESPN can't hold the homepage up", () => {
		expect(src).toMatch(/setTimeout\(\(\) => resolve\(null\), 1500\)/)
	})
})
