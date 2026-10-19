// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import NextMatchup, { cardsFor } from "../../components/live/NextMatchup"
import { getScouting, getUnits } from "../../lib/lab/data"

afterEach(cleanup)

const next = { week: 7, opp: "LAR", home: true, date: "2026-10-25", time: "16:25", spread: -7 }

describe("NextMatchup", () => {
	it("names the game, when it is and the line", () => {
		render(<NextMatchup next={next} />)
		expect(screen.getByRole("heading", { name: /Raiders vs\. Los Angeles Rams/ })).toBeTruthy()
		expect(screen.getByTestId("next-kickoff").textContent).toBe("Sun, Oct 25 · 4:25 PM ET · Rams favored by 7")
		expect(screen.getByText(/Week 7/)).toBeTruthy()
	})

	it("says at, not vs., on the road", () => {
		render(<NextMatchup next={{ week: 8, opp: "NYJ", home: false, date: "2026-11-01", time: "13:00", spread: null }} />)
		expect(screen.getByRole("heading", { name: /Raiders at New York Jets/ })).toBeTruthy()
		expect(screen.getByTestId("next-kickoff").textContent).toBe("Sun, Nov 1 · 1:00 PM ET")
	})

	it("links to the opponent's pages in the Lab", () => {
		render(<NextMatchup next={next} />)
		const hrefs = within(screen.getByTestId("next-matchup")).getAllByRole("link").map((a) => a.getAttribute("href"))
		expect(hrefs).toEqual(expect.arrayContaining(["/lab/scouting/lar", "/lab/matchup/lv-vs-lar", "/lab/flags/team/lar", "/lab/players", "/lab/rooting-guide", "/lab/playoff-machine"]))
	})

	it("has a way forward for every team the Raiders can play, and no link to a page that doesn't exist", () => {
		const withUnits = Object.keys(getUnits().teams)
		for (const abbr of Object.keys(getScouting().teams)) {
			if (abbr === "LV") continue
			const hrefs = cardsFor(abbr).map((c) => c.href)
			expect(hrefs).toContain(`/lab/scouting/${abbr.toLowerCase()}`)
			expect(hrefs.includes(`/lab/matchup/lv-vs-${abbr.toLowerCase()}`)).toBe(withUnits.includes(abbr))
			for (const c of cardsFor(abbr)) expect(c.text.length).toBeGreaterThan(10)
		}
	})

	it("leaves out the pages it has no data for", () => {
		const hrefs = cardsFor("XYZ").map((c) => c.href)
		expect(hrefs.some((h) => h.startsWith("/lab/scouting/"))).toBe(false)
		expect(hrefs.some((h) => h.startsWith("/lab/matchup/"))).toBe(false)
	})

	it("still sends fans somewhere when there is no next game", () => {
		render(<NextMatchup next={null} />)
		expect(screen.getByRole("heading", { name: "While you wait" })).toBeTruthy()
		expect(within(screen.getByTestId("next-matchup")).getAllByRole("link").length).toBeGreaterThanOrEqual(3)
	})
})
