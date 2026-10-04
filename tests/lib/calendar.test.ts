import { describe, expect, it } from "vitest"

import {
	ALARM_CHOICES,
	GAME_MINUTES,
	alarmTrigger,
	buildCalendar,
	calendarFilename,
	escapeText,
	eventDescription,
	eventTitle,
	eventUid,
	feedPath,
	foldLine,
	googleEventUrl,
	icsDate,
	parseAlarm,
	parseWeek,
} from "../../lib/calendar"
import type { ScheduleRow } from "../../lib/schedule"

const NOW = new Date("2026-10-03T12:00:00Z")

function row(over: Partial<ScheduleRow> = {}): ScheduleRow {
	return {
		week: 4,
		opponent: "Kansas City Chiefs",
		homeAway: "away",
		kickoff: "2026-10-04T20:25:00Z",
		network: "CBS",
		pick: null,
		outcome: null,
		...over,
	}
}

const lines = (ics: string) => ics.split("\r\n")
/** Undo folding so assertions can read whole lines. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "")

describe("escapeText", () => {
	it("escapes backslash, semicolon, comma and newlines", () => {
		expect(escapeText("a, b; c\\d\ne")).toBe("a\\, b\\; c\\\\d\\ne")
	})
	it("turns CRLF into one escaped newline", () => {
		expect(escapeText("a\r\nb")).toBe("a\\nb")
	})
})

describe("foldLine", () => {
	it("leaves short lines alone", () => {
		expect(foldLine("SUMMARY:Raiders at Chiefs")).toBe("SUMMARY:Raiders at Chiefs")
	})
	it("folds at 75 octets and continues with a space", () => {
		const line = "DESCRIPTION:" + "x".repeat(200)
		const out = foldLine(line).split("\r\n")
		expect(out[0]).toHaveLength(75)
		for (const l of out.slice(1)) {
			expect(l.startsWith(" ")).toBe(true)
			expect(l.length).toBeLessThanOrEqual(75)
		}
		expect(out.join("").replace(/ /g, "")).toBe(line.replace(/ /g, ""))
	})
	it("never splits a multi-byte character and keeps every physical line within 75 octets", () => {
		const line = "SUMMARY:" + "–".repeat(60) // en dash, 3 bytes each
		const out = foldLine(line).split("\r\n")
		const enc = new TextEncoder()
		for (const l of out) expect(enc.encode(l).length).toBeLessThanOrEqual(75)
		expect(out.map((l, i) => (i === 0 ? l : l.slice(1))).join("")).toBe(line)
	})
})

describe("icsDate", () => {
	it("formats UTC as basic ISO", () => {
		expect(icsDate(new Date("2026-10-04T20:25:00Z"))).toBe("20261004T202500Z")
	})
	it("zero pads", () => {
		expect(icsDate(new Date("2026-01-02T03:04:05Z"))).toBe("20260102T030405Z")
	})
})

describe("query parsing", () => {
	it("accepts only the offered reminder lengths", () => {
		for (const m of ALARM_CHOICES) expect(parseAlarm(String(m))).toBe(m)
		expect(parseAlarm("45")).toBeNull()
		expect(parseAlarm("-5")).toBeNull()
		expect(parseAlarm("abc")).toBeNull()
		expect(parseAlarm("")).toBeNull()
		expect(parseAlarm(undefined)).toBeNull()
		expect(parseAlarm(["30", "60"])).toBe(30)
	})
	it("treats a missing reminder as none, but 0 as at kickoff", () => {
		expect(parseAlarm("0")).toBe(0)
	})
	it("accepts weeks 1 to 30 only", () => {
		expect(parseWeek("4")).toBe(4)
		expect(parseWeek("18")).toBe(18)
		expect(parseWeek("0")).toBeNull()
		expect(parseWeek("31")).toBeNull()
		expect(parseWeek("x")).toBeNull()
		expect(parseWeek("1; DROP")).toBeNull()
		expect(parseWeek(undefined)).toBeNull()
	})
})

describe("alarmTrigger", () => {
	it("uses days before the T and hours or minutes after it", () => {
		expect(alarmTrigger(0)).toBe("PT0S")
		expect(alarmTrigger(15)).toBe("-PT15M")
		expect(alarmTrigger(30)).toBe("-PT30M")
		expect(alarmTrigger(60)).toBe("-PT1H")
		expect(alarmTrigger(1440)).toBe("-P1D")
	})
})

describe("event content", () => {
	it("titles away and home games", () => {
		expect(eventTitle(row())).toBe("Raiders at Chiefs")
		expect(eventTitle(row({ homeAway: "home", opponent: "New Orleans Saints" }))).toBe("Raiders vs. Saints")
	})
	it("makes a stable per-week UID", () => {
		expect(eventUid(2026, 4)).toBe("raiders-2026-w04@raidersrundown.com")
		expect(eventUid(2026, 12)).toBe("raiders-2026-w12@raidersrundown.com")
	})
	it("describes network, pick, links and the schedule", () => {
		const d = eventDescription(
			row({
				pick: { id: "abc", raiders: 24, opponent: 27, result: "pending" },
				preview: { slug: "week-4-preview", title: "Preview" },
			})
		)
		expect(d).toContain("Week 4")
		expect(d).toContain("TV: CBS")
		expect(d).toContain("My pick: Raiders 24, Chiefs 27")
		expect(d).toContain("Preview: https://www.raidersrundown.com/post/week-4-preview")
		expect(d).toContain("/predictions/pick/abc")
		expect(d).toContain("Full schedule: https://www.raidersrundown.com/schedule")
		expect(d).not.toContain("Recap:")
	})
	it("shows the result and recap once played, and drops the vote link", () => {
		const d = eventDescription(
			row({
				pick: { id: "abc", raiders: 24, opponent: 27, result: "miss" },
				outcome: { raiders: 35, opponent: 27, result: "W" },
				report: { slug: "wk3", title: "Recap" },
			})
		)
		expect(d).toContain("Final: W 35–27")
		expect(d).toContain("Recap: https://www.raidersrundown.com/games/wk3")
		expect(d).not.toContain("Make your own pick")
	})
})

describe("buildCalendar", () => {
	const rows: ScheduleRow[] = [
		row({ week: 1, opponent: "Miami Dolphins", homeAway: "home", kickoff: "2026-09-13T20:05:00Z", outcome: { raiders: 27, opponent: 13, result: "W" } }),
		row({ week: 4 }),
		row({ week: 5, bye: true, opponent: null, kickoff: null }),
		row({ week: 6, opponent: "Denver Broncos", kickoff: null }),
		row({ week: 7, opponent: null }),
		row({ week: 8, kickoff: "not a date" }),
	]
	const ics = buildCalendar(rows, { season: 2026, now: NOW })

	it("is a CRLF calendar with the required header and footer", () => {
		expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true)
		expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true)
		expect(ics).not.toMatch(/[^\r]\n/)
		expect(ics).toContain("PRODID:-//Raiders Rundown//Schedule//EN")
		expect(ics).toContain("X-WR-CALNAME:Raiders 2026 Schedule")
		expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT6H")
	})
	it("makes one event for each game that has an opponent and a real kickoff", () => {
		expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
		expect(ics.match(/END:VEVENT/g)).toHaveLength(2)
		expect(ics).toContain("UID:raiders-2026-w01@raidersrundown.com")
		expect(ics).toContain("UID:raiders-2026-w04@raidersrundown.com")
		expect(ics).not.toContain("w05")
		expect(ics).not.toContain("w06")
		expect(ics).not.toContain("w07")
		expect(ics).not.toContain("w08")
	})
	it("writes UTC start and end, a stamp and the result", () => {
		const t = unfold(ics)
		expect(t).toContain("DTSTART:20261004T202500Z")
		const end = new Date(new Date("2026-10-04T20:25:00Z").getTime() + GAME_MINUTES * 60_000)
		expect(t).toContain(`DTEND:${icsDate(end)}`)
		expect(t).toContain("DTSTAMP:20261003T120000Z")
		expect(t).toContain("SUMMARY:Raiders vs. Dolphins (W 27–13)")
		expect(t).toContain("SUMMARY:Raiders at Chiefs\r\n")
	})
	it("gives home games a location and leaves away games without one", () => {
		const events = unfold(ics).split("BEGIN:VEVENT").slice(1)
		expect(events[0]).toContain("LOCATION:Allegiant Stadium")
		expect(events[1]).not.toContain("LOCATION")
	})
	it("keeps every physical line within 75 octets", () => {
		const enc = new TextEncoder()
		for (const l of lines(ics)) expect(enc.encode(l).length).toBeLessThanOrEqual(75)
	})
	it("adds no reminder by default and one per event when asked", () => {
		expect(ics).not.toContain("VALARM")
		const withAlarm = buildCalendar(rows, { season: 2026, now: NOW, alarmMinutes: 30 })
		expect(withAlarm.match(/BEGIN:VALARM/g)).toHaveLength(2)
		expect(withAlarm).toContain("TRIGGER:-PT30M")
		expect(unfold(buildCalendar(rows, { season: 2026, now: NOW, alarmMinutes: 0 }))).toContain("TRIGGER:PT0S")
	})
	it("can be limited to one week", () => {
		const one = buildCalendar(rows, { season: 2026, now: NOW, week: 4 })
		expect(one.match(/BEGIN:VEVENT/g)).toHaveLength(1)
		expect(one).toContain("w04")
		expect(one).toContain("X-WR-CALNAME:Raiders 2026\\, Week 4")
	})
	it("is a valid empty calendar when nothing is scheduled", () => {
		const empty = buildCalendar([], { season: 2026, now: NOW })
		expect(empty).toContain("BEGIN:VCALENDAR")
		expect(empty).not.toContain("VEVENT")
	})
	it("is stable: the same rows and clock give identical output", () => {
		expect(buildCalendar(rows, { season: 2026, now: NOW })).toBe(ics)
	})
})

describe("links", () => {
	it("builds a Google Calendar template link", () => {
		const u = new URL(googleEventUrl(row())!)
		expect(u.origin + u.pathname).toBe("https://calendar.google.com/calendar/render")
		expect(u.searchParams.get("action")).toBe("TEMPLATE")
		expect(u.searchParams.get("text")).toBe("Raiders at Chiefs")
		expect(u.searchParams.get("dates")).toMatch(/^20261004T202500Z\/\d{8}T\d{6}Z$/)
		expect(u.searchParams.get("details")).toContain("TV: CBS")
		expect(u.searchParams.get("location")).toBeNull()
	})
	it("adds the stadium to a home game and refuses a game with no kickoff", () => {
		expect(new URL(googleEventUrl(row({ homeAway: "home" }))!).searchParams.get("location")).toContain("Allegiant")
		expect(googleEventUrl(row({ kickoff: null }))).toBeNull()
		expect(googleEventUrl(row({ bye: true }))).toBeNull()
	})
	it("builds feed paths", () => {
		expect(feedPath()).toBe("/schedule.ics")
		expect(feedPath({ alarm: 30 })).toBe("/schedule.ics?alarm=30")
		expect(feedPath({ week: 4, alarm: 0, download: true })).toBe("/schedule.ics?week=4&alarm=0&download=1")
	})
	it("names downloads", () => {
		expect(calendarFilename(2026)).toBe("raiders-2026.ics")
		expect(calendarFilename(2026, 4)).toBe("raiders-2026-week-4.ics")
	})
})
