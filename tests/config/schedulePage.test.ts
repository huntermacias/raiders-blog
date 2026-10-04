import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const page = readFileSync(resolve(__dirname, "../../app/(user)/schedule/page.tsx"), "utf8")

// The calendar card was once imported but never rendered, so the page shipped without it.
describe("schedule page", () => {
	it("renders the calendar card, gated on there being games with a kickoff", () => {
		expect(page).toMatch(/<CalendarPanel\s/)
		expect(page).toMatch(/rows\.some\(isScheduled\)/)
	})
	it("renders the card above the game list", () => {
		expect(page.indexOf("<CalendarPanel")).toBeLessThan(page.indexOf("<ScheduleList"))
	})
})
