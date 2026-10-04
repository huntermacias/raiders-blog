// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import DriveReplay from "../../components/lab/DriveReplay"
import WinProbabilityReplay from "../../components/lab/WinProbabilityReplay"
import type { Drive, KeyPlay, WpPoint } from "../../lib/lab/types"

afterEach(cleanup)
// Moving between plays is a real glide (a fraction of a second each), so a few tests wait for it.
vi.setConfig({ testTimeout: 15000 })

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

const slow = { timeout: 3000 }

describe("<DriveReplay />", () => {
	const renderDrives = () => render(<DriveReplay drives={drives} teamAbbr="LV" teamName="Raiders" oppName="Saints" />)
	const slider = () => screen.getByRole("slider", { name: "Drive position" })

	it("opens on the first Raiders drive", () => {
		renderDrives()
		expect(screen.getByText(/Raiders drive 2/i)).toBeTruthy()
		expect(screen.getByRole("img", { name: /Raiders drive 2, 3 plays, 70 yards, ending in touchdown/ })).toBeTruthy()
	})

	it("steps through plays and shows the result of each", async () => {
		renderDrives()
		expect(screen.getByText("Play 1 of 3")).toBeTruthy()
		fireEvent.click(screen.getByRole("button", { name: "Next play" }))
		expect(await screen.findByText("Play 2 of 3", {}, slow)).toBeTruthy()
		expect(screen.getAllByText("play 1").length).toBeGreaterThan(0)
		// Quick repeat clicks add up instead of restarting the same step.
		fireEvent.click(screen.getByRole("button", { name: "Next play" }))
		fireEvent.click(screen.getByRole("button", { name: "Next play" }))
		await waitFor(() => expect(screen.getByRole("button", { name: "Replay drive" })).toBeTruthy(), slow)
		expect(screen.getAllByText("TOUCHDOWN").length).toBeGreaterThan(0)
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
		expect(slider().getAttribute("aria-valuenow")).toBe("0")
	})

	it("labels a kick instead of a down and distance", async () => {
		renderDrives()
		fireEvent.click(screen.getByRole("tab", { name: /Saints/ }))
		fireEvent.click(screen.getByRole("button", { name: "Next play" }))
		fireEvent.click(screen.getByRole("button", { name: "Next play" }))
		expect((await screen.findAllByText("PUNT", {}, slow)).length).toBeGreaterThan(0)
	})

	it("has a position slider that steps with the arrow keys and jumps with Home and End", async () => {
		renderDrives()
		expect(slider().getAttribute("aria-valuemax")).toBe("3")
		expect(slider().getAttribute("aria-valuetext")).toBe("Before play 1 of 3")
		fireEvent.keyDown(slider(), { key: "ArrowRight" })
		await waitFor(() => expect(slider().getAttribute("aria-valuenow")).toBe("1"), slow)
		expect(slider().getAttribute("aria-valuetext")).toBe("After play 1 of 3")
		fireEvent.keyDown(slider(), { key: "End" })
		await waitFor(() => expect(slider().getAttribute("aria-valuenow")).toBe("3"), slow)
		fireEvent.keyDown(slider(), { key: "ArrowLeft" })
		await waitFor(() => expect(slider().getAttribute("aria-valuenow")).toBe("2"), slow)
		fireEvent.keyDown(slider(), { key: "Home" })
		await waitFor(() => expect(slider().getAttribute("aria-valuenow")).toBe("0"), slow)
	})

	it("jumps to a play when its row is clicked, and marks that row as current", async () => {
		renderDrives()
		fireEvent.click(screen.getByRole("button", { name: /play 2/ }))
		await waitFor(() => expect(screen.getByText("Play 3 of 3")).toBeTruthy(), slow)
		const row = screen.getByRole("button", { name: /play 2/ })
		expect(row.getAttribute("aria-current")).toBe("true")
	})

	it("jumps to a play when its ring on the field is clicked", async () => {
		const { container } = renderDrives()
		fireEvent.keyDown(slider(), { key: "End" })
		await waitFor(() => expect(slider().getAttribute("aria-valuenow")).toBe("3"), slow)
		const rings = container.querySelectorAll("svg g.cursor-pointer")
		expect(rings.length).toBe(3)
		fireEvent.click(rings[1])
		await waitFor(() => expect(slider().getAttribute("aria-valuenow")).toBe("2"), slow)
	})

	it("shows a summary of the drive", () => {
		renderDrives()
		const summary = screen.getByLabelText("Drive summary")
		expect(within(summary).getByText("3 for 16")).toBeTruthy()
		expect(within(summary).getByText("6:32")).toBeTruthy()
		expect(within(summary).getByText("Plays")).toBeTruthy()
	})

	it("describes the play that just ended with its kind and facts", async () => {
		renderDrives()
		fireEvent.click(screen.getByRole("button", { name: "Next play" }))
		await screen.findByText("Play 2 of 3", {}, slow)
		expect(screen.getAllByText("Run").length).toBeGreaterThan(0)
		expect(screen.getByText("+5 yds")).toBeTruthy()
	})
})

describe("<DriveReplay /> filters", () => {
	const mixed: Drive = {
		n: 3, team: "LV", q: 2, clock: "9:00", result: "Field goal", start: 30, yards: 40, top: "4:00",
		plays: [
			mkPlay(1, { type: "run", text: "ran" }),
			mkPlay(2, { dn: 2, type: "pass", loc: "L", ay: 8, text: "threw left" }),
			mkPlay(3, { dn: 3, type: "pass", loc: "R", ay: 12, yds: 0, text: "threw right incomplete" }),
			mkPlay(4, { dn: 4, type: "field_goal", xe: null, text: "Gay 45 yard field goal is GOOD" }),
		],
	}
	const many: Drive[] = [
		{ ...mixed, n: 1, team: "NO", q: 1 },
		{ ...mixed, n: 2, team: "LV", q: 1 },
		{ ...mixed, n: 3, team: "NO", q: 2 },
		{ ...mixed, n: 4, team: "LV", q: 3 },
		{ ...mixed, n: 5, team: "NO", q: 4 },
	]
	const renderMixed = () => render(<DriveReplay drives={many} teamAbbr="LV" teamName="Raiders" oppName="Saints" />)
	const group = (name: string) => screen.getByRole("group", { name })

	it("highlights only the passes, without hiding the other plays", () => {
		renderMixed()
		fireEvent.click(within(group("Type")).getByRole("button", { name: "Passes" }))
		expect(screen.getByText("Highlighting 2 of 4 plays")).toBeTruthy()
		// Every play is still listed.
		expect(screen.getAllByText("ran").length).toBeGreaterThan(0)
		fireEvent.click(within(group("Down")).getByRole("button", { name: "3rd" }))
		expect(screen.getByText("Highlighting 1 of 4 plays")).toBeTruthy()
		fireEvent.click(screen.getByRole("button", { name: "Clear" }))
		expect(screen.queryByText(/Highlighting/)).toBeNull()
	})

	it("keeps the highlight when you change drives", () => {
		renderMixed()
		fireEvent.click(within(group("Type")).getByRole("button", { name: "Runs" }))
		fireEvent.click(screen.getAllByRole("tab")[1])
		expect(screen.getByText("Highlighting 1 of 4 plays")).toBeTruthy()
	})

	it("narrows the drive list by offense and by quarter", () => {
		renderMixed()
		expect(screen.getAllByRole("tab").length).toBe(5)
		fireEvent.click(within(group("Offense")).getByRole("button", { name: "Saints" }))
		expect(screen.getAllByRole("tab").length).toBe(3)
		fireEvent.click(within(group("Quarter")).getByRole("button", { name: "Q2" }))
		expect(screen.getAllByRole("tab").length).toBe(1)
		// The drive on screen moved to one that is still listed.
		expect(screen.getByText(/Saints drive 3/i)).toBeTruthy()
		// Raiders had no drive in Q4, so that quarter is not offered for them.
		fireEvent.click(within(group("Offense")).getByRole("button", { name: "Raiders" }))
		expect(within(group("Quarter")).getByRole("button", { name: "Q4" }).hasAttribute("disabled")).toBe(true)
	})

	it("does not show drive filters for a short list of drives", () => {
		render(<DriveReplay drives={drives} teamAbbr="LV" teamName="Raiders" oppName="Saints" />)
		expect(screen.queryByRole("group", { name: "Offense" })).toBeNull()
	})
})
