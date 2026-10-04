// Builds the schedule as an iCalendar (.ics) feed from the same rows the schedule page shows.
// Pure functions of those rows and a clock: no React, no Sanity client, no network.
//
// Written to RFC 5545 closely enough for Apple Calendar, Google Calendar and Outlook:
// CRLF line endings, lines folded at 75 octets without splitting a character, TEXT escaping,
// UTC times, and a stable UID per week so a subscribed calendar updates an event instead of
// duplicating it when a kickoff time changes or a score comes in.

import { teamInfo } from "./nfl"
import type { ScheduleRow } from "./schedule"

export const SITE_URL = "https://www.raidersrundown.com"
export const HOME_VENUE = "Allegiant Stadium, 3333 Al Davis Way, Las Vegas, NV 89118"

/** NFL games run about three hours; a half hour of padding keeps the block honest on a calendar. */
export const GAME_MINUTES = 210

/** Reminder choices offered on the page, in minutes before kickoff. 0 is "at kickoff". */
export const ALARM_CHOICES = [0, 15, 30, 60, 1440] as const

const CRLF = "\r\n"

/** Escape a TEXT value: backslash, semicolon, comma and newlines. */
export function escapeText(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n")
}

/**
 * Fold a content line to at most 75 octets per physical line. Continuation lines start with one
 * space, so they carry 74 octets of content. Never splits a multi-byte character.
 */
export function foldLine(line: string): string {
	const enc = new TextEncoder()
	if (enc.encode(line).length <= 75) return line

	const out: string[] = []
	let cur = ""
	let curBytes = 0
	let limit = 75
	for (const ch of line) {
		const n = enc.encode(ch).length
		if (curBytes + n > limit) {
			out.push(cur)
			cur = ""
			curBytes = 0
			limit = 74
		}
		cur += ch
		curBytes += n
	}
	if (cur) out.push(cur)
	return out.join(CRLF + " ")
}

/** 20261004T203000Z */
export function icsDate(d: Date): string {
	const p = (n: number, w = 2) => String(n).padStart(w, "0")
	return `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}

/** Read the `alarm` query value: a number of minutes from ALARM_CHOICES, otherwise no reminder. */
export function parseAlarm(v: string | string[] | undefined | null): number | null {
	const raw = Array.isArray(v) ? v[0] : v
	if (raw == null || raw === "") return null
	if (!/^\d{1,4}$/.test(raw)) return null
	const n = Number(raw)
	return (ALARM_CHOICES as readonly number[]).includes(n) ? n : null
}

/** Read the `week` query value: a whole number from 1 to 30, otherwise null. */
export function parseWeek(v: string | string[] | undefined | null): number | null {
	const raw = Array.isArray(v) ? v[0] : v
	if (raw == null || !/^\d{1,2}$/.test(raw)) return null
	const n = Number(raw)
	return n >= 1 && n <= 30 ? n : null
}

/** Whether a row can become a calendar event: a real opponent and a kickoff that parses. */
export function isScheduled(r: ScheduleRow): r is ScheduleRow & { opponent: string; kickoff: string } {
	return !r.bye && !!r.opponent && !!r.kickoff && !Number.isNaN(new Date(r.kickoff).getTime())
}

export function eventTitle(r: ScheduleRow): string {
	const opp = teamInfo(r.opponent)
	return r.homeAway === "away" ? `Raiders at ${opp.nick}` : `Raiders vs. ${opp.nick}`
}

function outcomeText(r: ScheduleRow): string | null {
	const o = r.outcome
	if (!o) return null
	return `Final: ${o.result} ${o.raiders}\u2013${o.opponent}`
}

/** The event body: network, my pick, the result once it's in, and links to the preview and recap. */
export function eventDescription(r: ScheduleRow, siteUrl = SITE_URL): string {
	const opp = teamInfo(r.opponent)
	const lines: string[] = [`Week ${r.week}`]
	if (r.network) lines.push(`TV: ${r.network}`)
	if (r.pick) lines.push(`My pick: Raiders ${r.pick.raiders}, ${opp.nick} ${r.pick.opponent}`)
	const out = outcomeText(r)
	if (out) lines.push(out)
	if (r.preview) lines.push(`Preview: ${siteUrl}/post/${r.preview.slug}`)
	if (r.report) lines.push(`Recap: ${siteUrl}/games/${r.report.slug}`)
	if (r.pick && !r.outcome) lines.push(`Make your own pick: ${siteUrl}/predictions/pick/${r.pick.id}`)
	lines.push(`Full schedule: ${siteUrl}/schedule`)
	return lines.join("\n")
}

export function eventUid(season: number, week: number): string {
	return `raiders-${season}-w${String(week).padStart(2, "0")}@raidersrundown.com`
}

function eventEnd(r: { kickoff: string }): Date {
	return new Date(new Date(r.kickoff).getTime() + GAME_MINUTES * 60_000)
}

export type CalendarOptions = {
	season: number
	/** Minutes before kickoff for a reminder, or null for none. */
	alarmMinutes?: number | null
	/** "Now", for DTSTAMP and LAST-MODIFIED. Injected so output is testable. */
	now?: Date
	siteUrl?: string
	/** Only this week, for the per-game "Add" links. */
	week?: number | null
}

function alarmWords(minutes: number): string {
	if (minutes === 1440) return "tomorrow"
	if (minutes === 60) return "in an hour"
	return `in ${minutes} minutes`
}

/** iCalendar durations put days before the "T": -P1D, not -PT1D. */
export function alarmTrigger(minutes: number): string {
	if (minutes === 0) return "PT0S"
	if (minutes % 1440 === 0) return `-P${minutes / 1440}D`
	if (minutes % 60 === 0) return `-PT${minutes / 60}H`
	return `-PT${minutes}M`
}

export function eventLines(r: ScheduleRow & { opponent: string; kickoff: string }, o: CalendarOptions): string[] {
	const now = o.now ?? new Date()
	const siteUrl = o.siteUrl ?? SITE_URL
	const title = eventTitle(r)
	const lines = [
		"BEGIN:VEVENT",
		`UID:${eventUid(o.season, r.week)}`,
		`DTSTAMP:${icsDate(now)}`,
		`LAST-MODIFIED:${icsDate(now)}`,
		`DTSTART:${icsDate(new Date(r.kickoff))}`,
		`DTEND:${icsDate(eventEnd(r))}`,
		`SUMMARY:${escapeText(r.outcome ? `${title} (${r.outcome.result} ${r.outcome.raiders}\u2013${r.outcome.opponent})` : title)}`,
		`DESCRIPTION:${escapeText(eventDescription(r, siteUrl))}`,
		`URL:${siteUrl}/schedule`,
		"TRANSP:TRANSPARENT",
		"CATEGORIES:Raiders",
	]
	if (r.homeAway !== "away") lines.push(`LOCATION:${escapeText(HOME_VENUE)}`)
	if (o.alarmMinutes != null) {
		lines.push(
			"BEGIN:VALARM",
			"ACTION:DISPLAY",
			`DESCRIPTION:${escapeText(o.alarmMinutes === 0 ? `${title} kicks off now` : `${title} kicks off ${alarmWords(o.alarmMinutes)}`)}`,
			`TRIGGER:${alarmTrigger(o.alarmMinutes)}`,
			"END:VALARM"
		)
	}
	lines.push("END:VEVENT")
	return lines
}

/** The whole feed. Byes and games with no kickoff yet are left out until Studio has them. */
export function buildCalendar(rows: ScheduleRow[], o: CalendarOptions): string {
	const siteUrl = o.siteUrl ?? SITE_URL
	const picked = rows.filter(isScheduled).filter((r) => o.week == null || r.week === o.week)
	const name = o.week != null ? `Raiders ${o.season}, Week ${o.week}` : `Raiders ${o.season} Schedule`

	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Raiders Rundown//Schedule//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		`X-WR-CALNAME:${escapeText(name)}`,
		`X-WR-CALDESC:${escapeText(`Las Vegas Raiders ${o.season} games, with picks and recaps from ${siteUrl}`)}`,
		"X-WR-TIMEZONE:America/Los_Angeles",
		"REFRESH-INTERVAL;VALUE=DURATION:PT6H",
		"X-PUBLISHED-TTL:PT6H",
		...picked.flatMap((r) => eventLines(r, o)),
		"END:VCALENDAR",
	]
	return lines.map(foldLine).join(CRLF) + CRLF
}

/** Filename for a download: raiders-2026.ics or raiders-2026-week-4.ics. */
export function calendarFilename(season: number, week?: number | null): string {
	return week != null ? `raiders-${season}-week-${week}.ics` : `raiders-${season}.ics`
}

/** A "create this event" link for Google Calendar, for one game. */
export function googleEventUrl(r: ScheduleRow, siteUrl = SITE_URL): string | null {
	if (!isScheduled(r)) return null
	const start = new Date(r.kickoff)
	const p = new URLSearchParams({
		action: "TEMPLATE",
		text: eventTitle(r),
		dates: `${icsDate(start)}/${icsDate(eventEnd(r))}`,
		details: eventDescription(r, siteUrl),
	})
	if (r.homeAway !== "away") p.set("location", HOME_VENUE)
	return `https://calendar.google.com/calendar/render?${p.toString()}`
}

/** Where a per-game or whole-season file lives. `alarm` is optional minutes before kickoff. */
export function feedPath(opts: { week?: number | null; alarm?: number | null; download?: boolean } = {}): string {
	const p = new URLSearchParams()
	if (opts.week != null) p.set("week", String(opts.week))
	if (opts.alarm != null) p.set("alarm", String(opts.alarm))
	if (opts.download) p.set("download", "1")
	const q = p.toString()
	return `/schedule.ics${q ? `?${q}` : ""}`
}
