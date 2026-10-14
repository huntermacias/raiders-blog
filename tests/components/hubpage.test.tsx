// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn(async () => null) }, client: { fetch: vi.fn() } }))
vi.mock("next/navigation", async (importOriginal) => ({
	...(await importOriginal<typeof import("next/navigation")>()),
	useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
	usePathname: () => "/lab",
}))
const track = vi.fn()
vi.mock("../../lib/lab/track", () => ({ trackPlayers: (...a: unknown[]) => track(...a) }))

import LabHub, { generateMetadata } from "../../app/(user)/lab/page"
import HubPulse from "../../components/lab/hub/HubPulse"
import { getHub } from "../../lib/lab/hub"

const hub = getHub()
const KEY = "lab-hub-pulse-v1"

beforeEach(() => {
	window.localStorage.clear()
	track.mockClear()
})
afterEach(cleanup)

describe("the Lab hub's weekly findings", () => {
	it("shows each finding with its number, its line, a way in and a Share button", () => {
		render(<LabHub />)
		const list = screen.getByTestId("drops")
		const cards = within(list).getAllByRole("article")
		expect(cards).toHaveLength(hub.drops.length)
		for (const d of hub.drops) {
			const card = screen.getByTestId(`drop-${d.id}`)
			expect(within(card).getByRole("heading", { level: 3 }).textContent).toBe(d.headline)
			expect(card.textContent).toContain(d.detail)
			if (d.stat) expect(card.textContent).toContain(d.stat.value)
			expect(within(card).getByRole("link", { name: new RegExp(d.cta) }).getAttribute("href")).toBe(d.href)
			expect(within(card).getByRole("button", { name: /^Share:/ })).toBeTruthy()
		}
	})

	it("puts a face on a player's finding, and the initials when the photo is missing", () => {
		render(<LabHub />)
		const withFace = hub.drops.filter((d) => d.face)
		expect(withFace.length).toBeGreaterThan(0)
		for (const d of withFace) expect(within(screen.getByTestId(`drop-${d.id}`)).getByTestId("headshot")).toBeTruthy()
	})

	it("opens a card to post, linked to the page the finding comes from and stamped with the data's version", () => {
		render(<LabHub />)
		const d = hub.drops[0]
		fireEvent.click(within(screen.getByTestId(`drop-${d.id}`)).getByRole("button", { name: /^Share:/ }))
		const dialog = screen.getByRole("dialog")
		const img = within(dialog).getByRole("img") as HTMLImageElement
		expect(img.getAttribute("src")).toContain(`/api/og?type=${d.share.type}`)
		expect(img.getAttribute("src")).toContain(`v=${hub.input.stamp}`)
		expect(track).toHaveBeenCalledWith("lab_hub_share_opened", { drop: d.id })
	})

	it("has a whole-report card in the hero and a share button for it on phones", () => {
		render(<LabHub />)
		expect(screen.getByTestId("report-preview").getAttribute("src")).toBe(`/api/og?type=hub&v=${hub.input.stamp}`)
		expect(screen.getAllByRole("button", { name: /Share the report: The Lab Report/ }).length).toBe(2)
	})

	it("gives the page's link preview the Lab Report card, versioned", () => {
		const meta = generateMetadata() as { openGraph: { images: { url: string }[] }; twitter: { images: string[] }; other: Record<string, string> }
		const url = `https://www.raidersrundown.com/api/og?type=hub&v=${hub.input.stamp}`
		expect(meta.openGraph.images[0].url).toBe(url)
		expect(meta.twitter.images[0]).toBe(url)
		expect(meta.other["og:image"]).toBe(url)
	})
})

describe("tool cards", () => {
	it("say what is inside today", () => {
		render(<LabHub />)
		const lines = screen.getAllByTestId("tool-teaser").map((n) => n.textContent)
		expect(lines.length).toBe(Object.keys(hub.teasers).length)
		for (const line of Object.values(hub.teasers)) expect(lines).toContain(line)
	})
})

describe("Settle it", () => {
	const first = hub.takes[0]

	it("keeps the Lab's answer back until the reader has picked", () => {
		render(<LabHub />)
		const card = screen.getByTestId(`take-${first.id}`)
		expect(within(card).getByTestId("verdict").textContent).toMatch(/Pick one first/)
		expect(card.textContent).not.toContain(first.verdict.text)
		expect(within(card).queryByRole("button", { name: /^Share:/ })).toBeNull()
	})

	it("answers a pick, scores the reader against the Lab, and offers the pick as a card", async () => {
		render(<LabHub />)
		const card = screen.getByTestId(`take-${first.id}`)
		fireEvent.click(within(card).getByTestId("pick-a"))
		const verdict = within(card).getByTestId("verdict")
		expect(verdict.textContent).toContain(`You picked ${first.a.name}.`)
		expect(verdict.textContent).toContain(first.verdict.text)
		expect(within(card).getByTestId("pick-a").getAttribute("aria-pressed")).toBe("true")
		expect((within(card).getByTestId("pick-b") as HTMLButtonElement).disabled).toBe(true)
		expect(screen.getByTestId("score").textContent).toMatch(/agree on [01] of 1/)
		expect(within(card).getByRole("button", { name: /^Share my pick/ })).toBeTruthy()
		expect(track).toHaveBeenCalledWith("lab_hub_pick", { take: first.id, agree: first.verdict.lead === "a" })
	})

	it("remembers a pick in this browser and cannot be changed after the answer is seen", async () => {
		const { unmount } = render(<LabHub />)
		fireEvent.click(within(screen.getByTestId(`take-${first.id}`)).getByTestId("pick-b"))
		fireEvent.click(within(screen.getByTestId(`take-${first.id}`)).getByTestId("pick-a"))
		expect(within(screen.getByTestId(`take-${first.id}`)).getByTestId("pick-b").getAttribute("aria-pressed")).toBe("true")
		unmount()
		render(<LabHub />)
		await waitFor(() => expect(within(screen.getByTestId(`take-${first.id}`)).getByTestId("pick-b").getAttribute("aria-pressed")).toBe("true"))
	})

	it("links to the full comparison", () => {
		render(<LabHub />)
		expect(within(screen.getByTestId(`take-${first.id}`)).getByRole("link", { name: /Full comparison/ }).getAttribute("href")).toBe(first.href)
	})
})

describe("Since you were last here", () => {
	const stored = (p: Partial<typeof hub.pulse>) => window.localStorage.setItem(KEY, JSON.stringify({ baseline: null, seenAt: Date.UTC(2026, 9, 7), current: { ...hub.pulse, stamp: 1, ...p } }))

	it("tells a first-time reader what it will do", async () => {
		render(<HubPulse pulse={hub.pulse} />)
		await waitFor(() => expect(screen.getByTestId("hub-pulse").textContent).toMatch(/Visit again and this box tells you/))
		expect(JSON.parse(window.localStorage.getItem(KEY)!).current.stamp).toBe(hub.pulse.stamp)
	})

	it("reports what changed since the numbers this browser last saw", async () => {
		stored({ week: 4, record: "3-1", odds: 0.71, drops: ["odds:71%"] })
		render(<HubPulse pulse={hub.pulse} />)
		const box = screen.getByTestId("hub-pulse")
		await waitFor(() => expect(box.textContent).toContain("Since you were last here"))
		expect(box.textContent).toContain("Week 5 numbers are in")
		expect(box.textContent).toMatch(/went from 3-1 to/)
		expect(box.textContent).toMatch(/new findings below/)
	})

	it("shows the same news on a reload, and moves on only when the Lab's numbers change again", async () => {
		stored({ week: 4, record: "3-1", odds: 0.71, drops: [] })
		const a = render(<HubPulse pulse={hub.pulse} />)
		await waitFor(() => expect(screen.getByTestId("hub-pulse").textContent).toContain("Week 5 numbers are in"))
		a.unmount()
		render(<HubPulse pulse={hub.pulse} />)
		await waitFor(() => expect(screen.getByTestId("hub-pulse").textContent).toContain("Week 5 numbers are in"))
		cleanup()
		render(<HubPulse pulse={{ ...hub.pulse, stamp: hub.pulse.stamp + 1 }} />)
		await waitFor(() => expect(screen.getByTestId("hub-pulse").textContent).toMatch(/Nothing has moved/))
	})

	it("survives storage that throws", async () => {
		const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("blocked")
		})
		const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("blocked")
		})
		render(<HubPulse pulse={hub.pulse} />)
		await waitFor(() => expect(screen.getByTestId("hub-pulse").textContent).toMatch(/Visit again/))
		get.mockRestore()
		set.mockRestore()
	})
})
