// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import DriveReplay from "../../components/lab/DriveReplay"
import WinProbabilityReplay from "../../components/lab/WinProbabilityReplay"
import type { Drive, KeyPlay, WpPoint } from "../../lib/lab/types"

afterEach(cleanup)

const series: WpPoint[] = [
	[0, 0.5],
	[600, 0.35],
	[1800, 0.7],
	[3000, 0.2],
	[3600, 1],
]

const keyPlays: KeyPlay[] = [
	{ el: 600, q: 1, clock: "5:00", kind: "TD", team: "NO", wpBefore: 0.5, wpAfter: 0.35, text: "Shough pass to Johnson for 2 yards, TOUCHDOWN.", score: [0, 6] },
	{ el: 1800, q: 2, clock: "0:00", kind: "TD", team: "LV", wpBefore: 0.5, wpAfter: 0.7, text: "Cousins pass to Mayer for 3 yards, TOUCHDOWN.", score: [7, 6] },
	{ el: 3000, q: 4, clock: "10:00", kind: "INT", team: "NO", wpBefore: 0.2, wpAfter: 0.9, text: "Shough pass INTERCEPTED by Masses.", score: [7, 6] },
]
const scores: [number, number, number][] = [
	[600, 0, 6],
	[601, 0, 7],
	[1800, 6, 7],
	[1801, 7, 7],
	[3300, 14, 7],
]

function renderReplay() {
	return render(
		<WinProbabilityReplay
			series={series}
			keyPlays={keyPlays}
			scores={scores}
			teamName="Raiders"
			oppName="Saints"
			finalScore={[14, 7]}
			sharePath="/lab/week-3"
			shareText="share"
		/>
	)
}

describe("<WinProbabilityReplay />", () => {
	it("starts fully drawn at the final score, so it works without JavaScript animation", () => {
		renderReplay()
		expect(screen.getByText("FINAL")).toBeTruthy()
		expect(screen.getAllByText("14").length).toBeGreaterThan(0)
		expect(screen.getAllByText("100%").length).toBeGreaterThan(0)
		expect(screen.getByRole("img", { name: /ending at 100%/ })).toBeTruthy()
	})

	it("draws one keyboard-reachable marker per key play", () => {
		renderReplay()
		const markers = screen.getAllByRole("button", { name: /^(Touchdown|Interception)/ })
		expect(markers).toHaveLength(3)
		for (const m of markers) expect(m.getAttribute("tabindex")).toBe("0")
	})

	it("moves through the game with the scrubber, including the score and win probability", () => {
		renderReplay()
		const scrub = screen.getByLabelText("Game time") as HTMLInputElement
		fireEvent.change(scrub, { target: { value: "700" } })
		expect(screen.queryByText("FINAL")).toBeNull()
		expect(screen.getByText("Q1 3:20")).toBeTruthy()
		// Saints scored the touchdown and the extra point by now.
		const bug = screen.getByText("Saints").parentElement as HTMLElement
		expect(bug.textContent).toContain("7")
		// Markers that have not happened yet are not drawn.
		expect(screen.getAllByRole("button", { name: /^Touchdown/ })).toHaveLength(1)
	})

	it("jumps to a play from the key plays list and shows its win probability swing", () => {
		renderReplay()
		const list = screen.getByRole("list", { name: "Key plays" })
		fireEvent.click(within(list).getByRole("button", { name: /INTERCEPTED/ }))
		expect(screen.getAllByText("+70 pts").length).toBeGreaterThan(0)
		expect(screen.getByText("20% to 90%")).toBeTruthy()
		// The scrubber lands just after the play, so the headline win probability matches the marker.
		expect((screen.getByLabelText("Game time") as HTMLInputElement).value).toBe("3600")
		expect(screen.getAllByText(/Interception/).length).toBeGreaterThan(0)
	})

	it("uses a real minus sign for plays that hurt the Raiders", () => {
		renderReplay()
		const list = screen.getByRole("list", { name: "Key plays" })
		fireEvent.click(within(list).getByRole("button", { name: /Johnson/ }))
		expect(screen.getAllByText("−15 pts").length).toBeGreaterThan(0)
	})

	it("explains the symbols: a legend, and a tooltip when a marker is hovered or focused", () => {
		renderReplay()
		const legend = screen.getByRole("list", { name: "Symbol legend" })
		for (const word of ["Touchdown", "Field goal", "Safety", "Two-point conversion", "Turnover", "Big swing"]) {
			expect(within(legend).getByText(word)).toBeTruthy()
		}
		// Each legend entry carries a tooltip with the plain-English meaning.
		expect(within(legend).getAllByRole("tooltip").length).toBe(6)
		expect(within(legend).getByText(/lost the ball/)).toBeTruthy()

		expect(screen.queryByText(/Mayer for 3 yards/, { selector: "p.mt-1\\.5" })).toBeNull()
		const marker = screen.getAllByRole("button", { name: /^Touchdown/ })[1]
		fireEvent.focus(marker)
		expect(screen.getAllByText(/Cousins pass to Mayer/).length).toBeGreaterThan(1)
		fireEvent.blur(marker)
	})

	it("gives the key-plays tags a tooltip without making them part of the row's name", () => {
		renderReplay()
		const list = screen.getByRole("list", { name: "Key plays" })
		const row = within(list).getByRole("button", { name: /INTERCEPTED/ })
		// The accessible name says what kind of play it is, in words.
		expect(row.textContent).toContain("Interception")
		expect(within(row).queryByRole("tooltip")).toBeNull()
	})

	it("describes win probability and swings on hover", () => {
		renderReplay()
		expect(screen.getByText(/It is not a prediction/)).toBeTruthy()
		fireEvent.click(within(screen.getByRole("list", { name: "Key plays" })).getByRole("button", { name: /INTERCEPTED/ }))
		expect(screen.getByText(/percentage points this play added/)).toBeTruthy()
	})

	it("pauses and replays from the transport button", () => {
		renderReplay()
		const play = screen.getByRole("button", { name: "Replay from the start" })
		fireEvent.click(play)
		expect(screen.getByRole("button", { name: "Pause replay" })).toBeTruthy()
		fireEvent.click(screen.getByRole("button", { name: "Pause replay" }))
		expect(screen.getByRole("button", { name: /Play replay|Replay from the start/ })).toBeTruthy()
	})
})

const mkPlay = (n: number, over: Partial<Drive["plays"][number]> = {}): Drive["plays"][number] => ({
	n, dn: 1, ytg: 10, x: 25 + n * 5, xe: 30 + n * 5, yds: 5, type: "run", fd: false, td: false, text: `play ${n}`, ...over,
})

const drives: Drive[] = [
	{ n: 1, team: "NO", q: 1, clock: "14:56", result: "Punt", start: 27, yards: 6, top: null, plays: [mkPlay(1), mkPlay(2, { type: "punt", xe: null, text: "Wright punts 47 yards" })] },
	{ n: 2, team: "LV", q: 1, clock: "14:07", result: "Touchdown", start: 24, yards: 70, top: "6:32", plays: [mkPlay(1), mkPlay(2), mkPlay(3, { td: true, xe: 100, x: 94, yds: 6, text: "Cousins to Bowers, TOUCHDOWN" })] },
]

describe("<DriveReplay />", () => {
	const renderDrives = () => render(<DriveReplay drives={drives} teamAbbr="LV" teamName="Raiders" oppName="Saints" />)

	it("opens on the first Raiders drive", () => {
		renderDrives()
		expect(screen.getByText(/Raiders drive 2/i)).toBeTruthy()
		expect(screen.getByRole("img", { name: /Raiders drive 2, 3 plays, 70 yards, ending in touchdown/ })).toBeTruthy()
	})

	it("steps through plays and shows the result of each", () => {
		renderDrives()
		expect(screen.getByText("Play 1 of 3")).toBeTruthy()
		fireEvent.click(screen.getByRole("button", { name: "Next play" }))
		expect(screen.getByText("Play 2 of 3")).toBeTruthy()
		expect(screen.getAllByText("play 1").length).toBeGreaterThan(0)
		fireEvent.click(screen.getByRole("button", { name: "Next play" }))
		fireEvent.click(screen.getByRole("button", { name: "Next play" }))
		expect(screen.getAllByText("TOUCHDOWN").length).toBeGreaterThan(0)
		expect(screen.getByRole("button", { name: "Replay drive" })).toBeTruthy()
	})

	it("labels what the marks on the field mean", () => {
		renderDrives()
		const legend = screen.getByRole("list", { name: "Field legend" })
		for (const word of ["Line of scrimmage", "First-down marker", "Pass or kick", "Run", "Loss or penalty"]) {
			expect(within(legend).getByText(word)).toBeTruthy()
		}
	})

	it("says which way the offense is going, and orients left and right", () => {
		renderDrives()
		expect(screen.getByRole("img", { name: /moves up the screen toward the Saints end zone/ })).toBeTruthy()
		expect(screen.getByText(/left and right are the offense/)).toBeTruthy()
	})

	it("switches drives from the picker and resets to the first play", () => {
		renderDrives()
		fireEvent.click(screen.getByRole("button", { name: "Next play" }))
		fireEvent.click(screen.getByRole("tab", { name: /Saints/ }))
		expect(screen.getByText(/Saints drive 1/i)).toBeTruthy()
		expect(screen.getByText("Play 1 of 2")).toBeTruthy()
	})

	it("labels a kick instead of a down and distance", () => {
		renderDrives()
		fireEvent.click(screen.getByRole("tab", { name: /Saints/ }))
		fireEvent.click(screen.getByRole("button", { name: "Next play" }))
		fireEvent.click(screen.getByRole("button", { name: "Next play" }))
		expect(screen.getAllByText("PUNT").length).toBeGreaterThan(0)
	})
})
