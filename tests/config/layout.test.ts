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

	// Web Analytics, GA4 and Speed Insights are mounted once, in the body, through one wrapper that skips browsers that announce they are automated.
	it("mounts the analytics wrapper once, in the body", () => {
		expect(layout).toContain('import TrustedAnalytics from "../../components/TrustedAnalytics"')
		expect(layout.match(/<TrustedAnalytics /g)).toHaveLength(1)
		expect(layout.indexOf("<TrustedAnalytics")).toBeGreaterThan(layout.indexOf("<body"))
		expect(layout).toContain('measurementId="G-P1HE62KWXG"')
	})

	it("the wrapper mounts Web Analytics, Speed Insights and GA4, each once", () => {
		const wrapper = readFileSync(resolve(__dirname, "../../components/TrustedAnalytics.tsx"), "utf8")
		expect(wrapper).toContain('import { SpeedInsights } from "@vercel/speed-insights/next"')
		expect(wrapper.match(/<Analytics /g)).toHaveLength(1)
		expect(wrapper.match(/<SpeedInsights /g)).toHaveLength(1)
		expect(wrapper.match(/<GoogleAnalytics /g)).toHaveLength(1)
	})
})
