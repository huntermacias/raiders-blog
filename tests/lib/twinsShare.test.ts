import { describe, expect, it } from "vitest"

import { TWINS_PATH, TWINS_SECTION, TWINS_SHARE_PATH, readTwinsView, twinParam, twinsQuery } from "../../lib/lab/twinsShare"

const rows = new Set(["2022 JAX", "2006 NO", "2001 LV"])

describe("season twins links", () => {
	it("reads a valid request as it is", () => {
		expect(readTwinsView({ mode: "off", twin: "2022-JAX", size: "tall" }, rows)).toEqual({ mode: "off", twin: "2022 JAX", size: "tall" })
		expect(readTwinsView({ twin: "2006 NO" }, rows).twin).toBe("2006 NO")
	})

	it("drops anything that is not valid or not in the data", () => {
		expect(readTwinsView({}, rows)).toEqual({ mode: "all", twin: null, size: "wide" })
		expect(readTwinsView({ mode: "net", size: "huge", twin: "1850-ZZZ" }, rows)).toEqual({ mode: "all", twin: null, size: "wide" })
		for (const twin of ["../etc", "2022-jax", "20222-JAX", "2022-JAX-X", "<script>", "2022-JAX&x=1"]) expect(readTwinsView({ twin }, rows).twin, twin).toBeNull()
	})

	it("writes the shortest query that says the same thing", () => {
		expect(twinsQuery({})).toBe("")
		expect(twinsQuery({ mode: "all", twin: null })).toBe("")
		expect(twinsQuery({ mode: "def", twin: "2022 JAX" })).toBe("mode=def&twin=2022-JAX")
		expect(twinsQuery({ twin: "2001 LV" }, { size: "tall" })).toBe("size=tall&twin=2001-LV")
		expect(twinParam("2022 JAX")).toBe("2022-JAX")
	})

	it("round-trips", () => {
		const q = twinsQuery({ mode: "off", twin: "2006 NO" }, { size: "wide" })
		expect(readTwinsView(Object.fromEntries(new URLSearchParams(q)), rows)).toEqual({ mode: "off", twin: "2006 NO", size: "wide" })
	})

	it("names the page, its share page and the section a link scrolls to", () => {
		expect(TWINS_PATH).toBe("/lab/season-twins")
		expect(TWINS_SHARE_PATH).toBe("/lab/season-twins/share")
		expect(TWINS_SECTION).toBe("print-heading")
	})
})
