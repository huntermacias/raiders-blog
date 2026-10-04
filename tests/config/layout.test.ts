import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const layout = readFileSync(resolve(__dirname, "../../app/(user)/layout.tsx"), "utf8")

describe("root layout", () => {
	// Without this, tagged links are never remembered and signups lose their campaign.
	it("mounts the UTM capture once, in the body", () => {
		expect(layout).toContain('import UtmCapture from "../../components/UtmCapture"')
		expect(layout.match(/<UtmCapture \/>/g)).toHaveLength(1)
		expect(layout.indexOf("<UtmCapture />")).toBeGreaterThan(layout.indexOf("<body"))
	})

	it("still mounts both analytics components", () => {
		expect(layout).toContain("<Analytics />")
		expect(layout).toContain("<GoogleAnalytics")
	})
})
