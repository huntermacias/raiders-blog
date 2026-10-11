// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
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
