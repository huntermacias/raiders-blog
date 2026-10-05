// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import DriveReplay from "../../components/lab/DriveReplay"
import type { Drive } from "../../lib/lab/types"

afterEach(cleanup)
vi.setConfig({ testTimeout: 15000 })
const slow = { timeout: 8000 }

const drive: Drive = {
	n: 1,
	team: "LV",
	q: 1,
	clock: "9:00",
	result: "Field goal",
	start: 55,
	yards: 12,
	top: "3:10",
	plays: [
		{ n: 1, dn: 1, ytg: 10, x: 55, xe: 67, yds: 12, type: "run", fd: true, td: false, text: "A.Jeanty right guard to NO 33 for 12 yards.", loc: "R", gap: "G", q: 1, clk: "9:00", el: 360, w0: 0.5, wpa: 0.03 },
		{ n: 2, dn: 4, ytg: 8, x: 67, xe: null, yds: 0, type: "field_goal", fd: false, td: false, text: "M.Gay 47 yard field goal is GOOD, Center-A.Ward, Holder-A.Cole.", q: 1, clk: "6:10", el: 530, w0: 0.53, wpa: 0.02 },
	],
}
const scores: [number, number, number][] = [[530, 3, 0]]

function renderDrive(withScores = true) {
	return render(<DriveReplay drives={[drive]} teamAbbr="LV" teamName="Raiders" oppName="Saints" scores={withScores ? scores : undefined} />)
}
const slider = () => screen.getByRole("slider")

describe("the field overlay", () => {
	it("shows the score, the clock and the win chance, hidden from screen readers", () => {
		const { container } = renderDrive()
		const hud = container.querySelector('div[aria-hidden="true"].pointer-events-none')!
		expect(hud).toBeTruthy()
		expect(hud.textContent).toContain("RAIDERS")
		expect(hud.textContent).toContain("SAINTS")
		expect(hud.textContent).toContain("Q1 9:00")
		expect(hud.textContent).toContain("50%")
	})

	it("moves the score and win chance when a scoring drive finishes", async () => {
		const { container } = renderDrive()
		fireEvent.keyDown(slider(), { key: "End" })
		await waitFor(() => expect(slider().getAttribute("aria-valuenow")).toBe("2"), slow)
		const hud = container.querySelector('div[aria-hidden="true"].pointer-events-none')!
		await waitFor(() => expect(hud.textContent).toContain("55%"), slow)
		// Raiders 3, Saints 0, and the last play added two points of win probability.
		expect(hud.textContent).toMatch(/RAIDERS\s*3/)
		expect(hud.textContent).toContain("▲ 2.0")
	})

	it("leaves the score bug out when the game has no score data", () => {
		const { container } = renderDrive(false)
		const hud = container.querySelector('div[aria-hidden="true"].pointer-events-none')
		expect(hud?.textContent ?? "").not.toContain("SAINTS")
	})
})

describe("kicks on the field", () => {
	it("draws the goalposts and lights them when the kick is good", async () => {
		const { container } = renderDrive()
		expect(container.querySelector("svg path[stroke-linecap='round']")).toBeTruthy()
		fireEvent.keyDown(slider(), { key: "End" })
		await waitFor(() => expect(slider().getAttribute("aria-valuenow")).toBe("2"), slow)
		await waitFor(() => expect(container.querySelector("svg .lab-flash")).toBeTruthy(), slow)
	})

	it("says how long the field goal was", async () => {
		renderDrive()
		fireEvent.keyDown(slider(), { key: "End" })
		await waitFor(() => expect(screen.getAllByText("47-YARD FIELD GOAL").length).toBeGreaterThan(0), slow)
	})

	it("flags a first down on the play that earns it", async () => {
		renderDrive()
		fireEvent.keyDown(slider(), { key: "ArrowRight" })
		await waitFor(() => expect(screen.getAllByText(/FIRST DOWN/).length).toBeGreaterThan(0), slow)
	})
})
