import { beforeEach, describe, expect, it, vi } from "vitest"

const fetchMock = vi.fn()
vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: (...a: unknown[]) => fetchMock(...a) } }))

import { getServerSideProps } from "../../pages/schedule.ics"

function run(query: Record<string, string> = {}) {
	const headers: Record<string, string> = {}
	let body = ""
	const res = {
		statusCode: 200,
		setHeader: (k: string, v: string) => void (headers[k.toLowerCase()] = v),
		write: (s: string) => void (body += s),
		end: (s?: string) => void (body += s ?? ""),
	}
	return getServerSideProps({ res, query } as never).then(() => ({ res, headers, body }))
}

const games = [
	{ week: 1, opponent: "Miami Dolphins", homeAway: "home", kickoff: "2026-09-13T20:05:00Z", network: "CBS" },
	{ week: 2, bye: true },
	{ week: 4, opponent: "Kansas City Chiefs", homeAway: "away", kickoff: "2026-10-04T20:25:00Z" },
]

beforeEach(() => {
	fetchMock.mockReset()
	fetchMock.mockImplementation((q: string) => Promise.resolve(q.includes("raidersSchedule") ? { games } : []))
})

describe("/schedule.ics", () => {
	it("serves a calendar with the right type and a short shared cache", async () => {
		const { headers, body } = await run()
		expect(headers["content-type"]).toBe("text/calendar; charset=utf-8")
		expect(headers["content-disposition"]).toBe('inline; filename="raiders-2026.ics"')
		expect(headers["cache-control"]).toContain("s-maxage=900")
		expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(2)
		expect(body).not.toContain("VALARM")
	})

	it("honours alarm, week and download", async () => {
		const { headers, body } = await run({ alarm: "60", week: "4", download: "1" })
		expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(1)
		expect(body).toContain("TRIGGER:-PT1H")
		expect(headers["content-disposition"]).toBe('attachment; filename="raiders-2026-week-4.ics"')
	})

	it("ignores junk query values instead of failing", async () => {
		const { body } = await run({ alarm: "99999", week: "abc" })
		expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(2)
		expect(body).not.toContain("VALARM")
	})

	it("serves an empty calendar when Studio has no schedule, and tolerates undefined from the client", async () => {
		fetchMock.mockResolvedValue(undefined)
		const { res, body } = await run()
		expect(res.statusCode).toBe(200)
		expect(body).toContain("BEGIN:VCALENDAR")
		expect(body).not.toContain("VEVENT")
	})

	it("answers 503 when Sanity fails, so a subscribed calendar keeps its events", async () => {
		fetchMock.mockRejectedValue(new Error("down"))
		const { res, headers, body } = await run()
		expect(res.statusCode).toBe(503)
		expect(headers["retry-after"]).toBe("300")
		expect(body).not.toContain("BEGIN:VCALENDAR")
	})
})
