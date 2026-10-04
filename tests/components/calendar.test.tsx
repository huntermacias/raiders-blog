// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import CalendarPanel from "../../components/schedule/CalendarPanel"
import ScheduleList from "../../components/schedule/ScheduleList"
import type { ScheduleRow } from "../../lib/schedule"

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

const link = (name: string) => screen.getByRole("link", { name: new RegExp(name) })
const feed = () => (screen.getByLabelText("Calendar feed link") as HTMLInputElement).value

describe("<CalendarPanel />", () => {
	it("defaults to a 30 minute reminder and builds subscribe, Google and download links from it", () => {
		render(<CalendarPanel games={17} />)
		expect(screen.getByText(/All 17 kickoffs/)).toBeTruthy()
		expect((screen.getByLabelText("30 min") as HTMLInputElement).checked).toBe(true)
		expect(feed()).toMatch(/\/schedule\.ics\?alarm=30$/)
		expect(link("Subscribe").getAttribute("href")).toMatch(/^webcal:\/\/.+\/schedule\.ics\?alarm=30$/)
		const google = link("Google Calendar").getAttribute("href")!
		expect(google.startsWith("https://calendar.google.com/calendar/r?cid=webcal")).toBe(true)
		expect(decodeURIComponent(google)).toContain("schedule.ics?alarm=30")
		expect(link("Download").getAttribute("href")).toBe("/schedule.ics?alarm=30&download=1")
		expect(link("Download").hasAttribute("download")).toBe(true)
	})

	it("changes every link when the reminder changes", () => {
		render(<CalendarPanel games={17} />)
		fireEvent.click(screen.getByLabelText("1 day"))
		expect(feed()).toMatch(/alarm=1440$/)
		expect(link("Subscribe").getAttribute("href")).toMatch(/alarm=1440$/)
		fireEvent.click(screen.getByLabelText("At kickoff"))
		expect(feed()).toMatch(/alarm=0$/)
	})

	it("drops the reminder when None is chosen", () => {
		render(<CalendarPanel games={17} />)
		fireEvent.click(screen.getByLabelText("No reminder"))
		expect(feed()).toMatch(/\/schedule\.ics$/)
		expect(link("Download").getAttribute("href")).toBe("/schedule.ics?download=1")
	})

	it("copies the link and says so", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined)
		vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })
		render(<CalendarPanel games={17} />)
		fireEvent.click(screen.getByRole("button", { name: /Copy link/ }))
		await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy())
		expect(writeText).toHaveBeenCalledWith(feed())
	})

	it("falls back to selecting the link when the clipboard is blocked", async () => {
		vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } })
		render(<CalendarPanel games={17} />)
		fireEvent.click(screen.getByRole("button", { name: /Copy link/ }))
		await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Calendar feed link")))
		expect(screen.queryByText("Copied")).toBeNull()
	})
})

describe("<ScheduleList /> calendar links", () => {
	const rows: ScheduleRow[] = [
		{ week: 3, opponent: "New Orleans Saints", homeAway: "home", kickoff: "2026-09-27T20:25:00Z", pick: null, outcome: { raiders: 35, opponent: 27, result: "W" } },
		{ week: 4, opponent: "Kansas City Chiefs", homeAway: "away", kickoff: "2026-10-04T20:25:00Z", network: "CBS", pick: null, outcome: null },
		{ week: 5, bye: true, pick: null, outcome: null },
		{ week: 6, opponent: "Denver Broncos", homeAway: "home", kickoff: null, pick: null, outcome: null },
	]

	it("offers Add links only on games that haven't been played and have a kickoff", () => {
		render(<ScheduleList rows={rows} />)
		expect(screen.getAllByText("Add")).toHaveLength(1)
		const google = screen.getByLabelText("Add week 4 to Google Calendar")
		expect(google.getAttribute("href")).toContain("calendar.google.com/calendar/render")
		expect(google.getAttribute("href")).toContain("Raiders+at+Chiefs")
		expect(google.getAttribute("target")).toBe("_blank")
		expect(google.getAttribute("rel")).toContain("noopener")
		const ics = screen.getByLabelText("Download week 4 for Apple or Outlook calendar")
		expect(ics.getAttribute("href")).toBe("/schedule.ics?week=4&alarm=30&download=1")
		expect(ics.hasAttribute("download")).toBe(true)
	})
})
