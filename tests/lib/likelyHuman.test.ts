import { describe, expect, it } from "vitest"

import { isLikelyHuman, looksAutomated } from "../../lib/likelyHuman"

describe("looksAutomated", () => {
	it("flags a browser that says it is driven by a program", () => {
		expect(looksAutomated({ webdriver: true, userAgent: "Mozilla/5.0 Chrome/126", languages: ["en-US"] })).toBe(true)
		expect(looksAutomated({ webdriver: false, userAgent: "Mozilla/5.0 HeadlessChrome/126.0", languages: ["en-US"] })).toBe(true)
		expect(looksAutomated({ webdriver: false, userAgent: "Mozilla/5.0 Chrome/126", languages: [] })).toBe(true)
	})

	it("leaves ordinary browsers alone, including when the signals are missing", () => {
		expect(looksAutomated({ webdriver: false, userAgent: "Mozilla/5.0 (Macintosh) Safari/605.1.15", languages: ["en-US", "en"] })).toBe(false)
		expect(looksAutomated({ userAgent: "Mozilla/5.0 (iPhone) Safari" })).toBe(false)
		expect(looksAutomated(undefined)).toBe(false)
	})

	it("isLikelyHuman is the opposite, and takes the real navigator by default", () => {
		expect(isLikelyHuman({ webdriver: true })).toBe(false)
		expect(isLikelyHuman({ webdriver: false, userAgent: "Mozilla/5.0 Safari" })).toBe(true)
		expect(typeof isLikelyHuman()).toBe("boolean")
	})
})
