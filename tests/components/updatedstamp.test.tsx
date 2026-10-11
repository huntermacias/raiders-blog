// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import UpdatedStamp from "../../components/lab/UpdatedStamp"
import { updatedText } from "../../lib/lab/unitsKit"

afterEach(cleanup)

const AT = "2026-10-11T20:35:12Z"

describe("<UpdatedStamp />", () => {
	it("says when the numbers last changed, in the NFL's time zone, with the date for machines", () => {
		render(<UpdatedStamp at={AT} kind="grades" />)
		const t = screen.getByText(updatedText(AT))
		expect(t.tagName).toBe("TIME")
		expect(t.getAttribute("datetime")).toBe(AT)
		expect(t.textContent).toBe("Sun, Oct 11, 4:35 PM ET")
		const box = screen.getByTestId("updated-stamp")
		expect(box.textContent).toContain("Grades updated")
		expect(box.textContent).toContain("Rechecked every few hours on game days")
	})

	it("words each kind of data for how it is refreshed", () => {
		const { rerender } = render(<UpdatedStamp at={AT} kind="results" />)
		expect(screen.getByTestId("updated-stamp").textContent).toMatch(/Standings updated .* ET.*a few hours after games end/)
		rerender(<UpdatedStamp at={AT} kind="odds" />)
		expect(screen.getByTestId("updated-stamp").textContent).toMatch(/Odds rebuilt/)
		rerender(<UpdatedStamp at={AT} kind="replays" />)
		expect(screen.getByTestId("updated-stamp").textContent).toMatch(/Replays rebuilt .* ET.*every Monday/)
	})

	it("lets a page change the words or drop the note", () => {
		render(<UpdatedStamp at={AT} kind="grades" what="Injury report changed" note={null} />)
		const box = screen.getByTestId("updated-stamp")
		expect(box.textContent).toContain("Injury report changed")
		expect(box.textContent).not.toContain("Rechecked")
	})

	it("shows nothing when the date is missing or unreadable, rather than a wrong time", () => {
		for (const at of [undefined, null, "", "not a date"]) {
			const { container } = render(<UpdatedStamp at={at} kind="grades" />)
			expect(container.innerHTML).toBe("")
			cleanup()
		}
	})
})

describe("the Lab pages that carry a stamp", () => {
	const root = join(__dirname, "..", "..")
	const read = (f: string) => readFileSync(join(root, "app/(user)/lab", f), "utf8")
	// Each page, the data file its numbers come from, and the kind of refresh that file has.
	const PAGES: [string, string, string][] = [
		["teams/page.tsx", "data.generatedAt", "grades"],
		["matchups/page.tsx", "data.generatedAt", "grades"],
		["matchup/[pair]/page.tsx", "data.generatedAt", "grades"],
		["scouting/page.tsx", "data.generatedAt", "grades"],
		["scouting/[abbr]/page.tsx", "data.generatedAt", "grades"],
		["will-it-last/page.tsx", "scouting.generatedAt", "grades"],
		["season-twins/page.tsx", "scouting.generatedAt", "grades"],
		["playoff-machine/page.tsx", "schedule.generatedAt", "results"],
		["rooting-guide/page.tsx", "data.generatedAt", "odds"],
		["top-plays/page.tsx", "season.generatedAt", "replays"],
	]

	it.each(PAGES)("%s shows when its data was updated", (file, at, kind) => {
		expect(read(file)).toContain(`<UpdatedStamp at={${at}} kind="${kind}"`)
	})

	it("no longer says the data is refreshed only on Mondays", () => {
		for (const [file] of PAGES) expect(read(file), file).not.toMatch(/Monday data refresh|weekly data refresh|updated every Monday/)
		expect(read("page.tsx")).not.toMatch(/updated every Monday/)
	})
})
