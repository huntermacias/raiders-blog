import type { GetServerSideProps } from "next"
import { groq } from "next-sanity"

import { buildCalendar, calendarFilename, parseAlarm, parseWeek } from "../lib/calendar"
import { type GamePrediction, SEASON } from "../lib/predictions"
import { withEspnFinals } from "../lib/live/service"
import { type ScheduleGame, joinSchedule } from "../lib/schedule"
import { readClient as client } from "../lib/sanity.client"

// Same queries as the schedule page, so the calendar and the page never disagree.
const scheduleQuery = groq`
	*[_type == 'raidersSchedule' && season == $season && !(_id in path('drafts.**'))] | order(_updatedAt desc)[0] {
		games[]{ _key, week, bye, opponent, homeAway, kickoff, network }
	}
`

const picksQuery = groq`
	*[_type == 'gamePrediction' && season == $season && !(_id in path('drafts.**'))] {
		_id, week, awayTeam, homeTeam, kickoff,
		predictedAwayScore, predictedHomeScore,
		actualAwayScore, actualHomeScore,
		"report": gameReport->{ "slug": slug.current, title },
		"preview": previewPost->{ "slug": slug.current, title }
	}
`

// No UI: getServerSideProps writes the file directly, like rss.xml and sitemap.xml.
function ScheduleCalendar() {
	return null
}

export const getServerSideProps: GetServerSideProps = async ({ res, query }) => {
	let doc: { games?: ScheduleGame[] } | null
	let picks: GamePrediction[] | null
	try {
		;[doc, picks] = await Promise.all([client.fetch(scheduleQuery, { season: SEASON }), client.fetch(picksQuery, { season: SEASON }).then((p: GamePrediction[] | null) => withEspnFinals(p ?? []))])
	} catch {
		// Better no answer than an empty calendar: a subscribed app keeps the events it already has
		// when a refresh fails, but it would delete them all on a valid empty feed.
		res.statusCode = 503
		res.setHeader("Retry-After", "300")
		res.setHeader("Content-Type", "text/plain; charset=utf-8")
		res.end("The schedule is temporarily unavailable. Try again in a few minutes.")
		return { props: {} }
	}

	const rows = joinSchedule(Array.isArray(doc?.games) ? doc!.games! : [], Array.isArray(picks) ? picks : [])
	const week = parseWeek(query.week)
	const body = buildCalendar(rows, { season: SEASON, alarmMinutes: parseAlarm(query.alarm), week })
	const download = query.download === "1"

	res.setHeader("Content-Type", "text/calendar; charset=utf-8")
	res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${calendarFilename(SEASON, week)}"`)
	// Calendar apps poll on their own schedule; a short shared cache keeps that cheap and a corrected
	// kickoff time still reaches a subscriber within the quarter hour.
	res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600")
	res.write(body)
	res.end()

	return { props: {} }
}

export default ScheduleCalendar
