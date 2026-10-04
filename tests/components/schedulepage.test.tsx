// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const fetchMock = vi.fn()
vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: (...a: unknown[]) => fetchMock(...a) }, client: { fetch: (...a: unknown[]) => fetchMock(...a) } }))

import SchedulePage from "../../app/(user)/schedule/page"

const games = [
	{ week: 1, opponent: "Miami Dolphins", homeAway: "home", kickoff: "2026-09-13T20:25:00.000Z", network: "FOX", bye: false },
	{ week: 4, opponent: "Kansas City Chiefs", homeAway: "away", kickoff: "2026-10-04T20:25:00.000Z", network: "CBS", bye: false },
	{ week: 13, bye: true, opponent: null, kickoff: null },
]

async function html(): Promise<string> {
	return renderToStaticMarkup((await SchedulePage()) as never)
}

beforeEach(() => {
	fetchMock.mockReset()
	fetchMock.mockImplementation((q: string) => Promise.resolve(q.includes("raidersSchedule") ? { games } : []))
})

describe("/schedule page", () => {
	it("shows the calendar card above the game list when games have kickoff times", async () => {
		const out = await html()
		expect(out).toContain("Add the Raiders to your calendar")
		expect(out).toContain("All 2 kickoffs")
		expect(out).toContain("webcal://")
		expect(out.indexOf("Add the Raiders to your calendar")).toBeLessThan(out.indexOf('aria-label="Raiders schedule"'))
	})

	it("leaves the card off when nothing has a kickoff yet", async () => {
		fetchMock.mockImplementation((q: string) => Promise.resolve(q.includes("raidersSchedule") ? { games: [{ week: 1, opponent: "Miami Dolphins", kickoff: null }] } : []))
		expect(await html()).not.toContain("Add the Raiders to your calendar")
	})

	it("leaves the card off when there is no schedule at all", async () => {
		fetchMock.mockResolvedValue(undefined)
		expect(await html()).not.toContain("Add the Raiders to your calendar")
	})
})
