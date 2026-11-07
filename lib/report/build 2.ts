// Puts a Game Report together: the Studio document, the box score ESPN sent, the Lab's play-by-play for the game, the scouting file and the
// Player Lab roster, turned into the plain pieces the page and the share cards draw. Server side only (it reads the Lab's data files).
// Every Lab-backed part is optional: a report for a game the Lab has not built yet still gets a page, just without those sections.

import type { AutoStats } from "../live/gamestats"
import { getGames, getPlayers, getScouting } from "../lab/data"
import { opponentAbbr } from "../lab/match"
import { gameStory } from "../lab/wp"
import type { LabGame } from "../lab/types"
import { teamByAbbr } from "../nfl"
import { type Finding, type HeadRow, findings, headToHead } from "./stats"
import { type Performer, type Standout, buildRoster, sidePerformers, standout, type Roster } from "./players"
import { type DriveBar, type DriveSummary, type FinalScore, type Heading, type QuarterCell, type TurningPoint, driveBars, driveSummary, finalScore, halftimeLine, headings, quarterLine, trimLead, turningPoints } from "./story"

export type ReportInput = {
	_id: string
	title: string
	description?: string
	opponent: string
	homeAway: "home" | "away"
	gameDate: string
	raidersScore: number
	opponentScore: number
	body?: unknown[]
}

export type ReportView = {
	slug: string
	title: string
	description: string | null
	/** "Sunday, October 25, 2026", in Pacific time because that is where the Raiders play. */
	dateLabel: string
	week: number | null
	venue: string
	opp: { abbr: string | null; name: string; nick: string; color: string }
	score: FinalScore
	result: "W" | "L" | "T"
	/** The Raiders' record after this game, from the Lab's file, e.g. "3–4". */
	record: string | null
	quarters: QuarterCell[]
	halftime: string | null
	lab: LabGame | null
	head: HeadRow[]
	findings: Finding[]
	turning: TurningPoint[]
	drives: DriveBar[]
	driveTotals: { me: DriveSummary; opp: DriveSummary } | null
	performers: { me: Performer[]; opp: Performer[]; standout: Standout | null }
	headings: Heading[]
	body: unknown[]
}

let rosterCache: Roster | null = null
function roster(): Roster {
	if (!rosterCache) {
		rosterCache = buildRoster(getPlayers().players.map((p) => ({ id: p.id, name: p.name, pos: p.pos, slug: p.slug, team: p.team, espn: p.espn, shot: p.shot })))
	}
	return rosterCache
}

function scout(abbr: string, side: "off", key: string) {
	const m = getScouting().teams[abbr]?.[side]?.[key]
	return m ? { v: m.v, rank: m.rank } : null
}

export function dateLabel(iso: string): string {
	return new Date(iso).toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Los_Angeles" })
}

export function recordAfter(game: LabGame, games: LabGame[]): string {
	const upto = games.filter((g) => g.week <= game.week)
	const w = upto.filter((g) => g.result === "W").length
	const l = upto.filter((g) => g.result === "L").length
	const t = upto.filter((g) => g.result === "T").length
	return t ? `${w}–${l}–${t}` : `${w}–${l}`
}

/** Pure part of the build, with the Lab's games, the roster and the box score passed in, so a test can feed it. */
export function composeReport(slug: string, input: ReportInput, lab: LabGame | null, games: LabGame[], auto: AutoStats | null, rosterIn: Roster, scoutIn = scout, team = "LV"): ReportView {
	const abbr = opponentAbbr(input.opponent)
	const info = abbr ? teamByAbbr(abbr) : null
	const score = finalScore({ raiders: input.raidersScore, opponent: input.opponentScore }, lab, auto?.quarterScores?.map((q) => ({ raiders: q.raiders ?? 0, opponent: q.opponent ?? 0 })))
	const result: ReportView["result"] = score.raiders > score.opponent ? "W" : score.raiders < score.opponent ? "L" : "T"
	const nick = info?.nick ?? input.opponent
	const body = trimLead(input.body as unknown[])

	const bars = lab ? driveBars(lab.drives, team) : []
	const players = lab?.box
	const me = players ? sidePerformers(players.players.me, "me", rosterIn) : []
	const opp = players ? sidePerformers(players.players.opp, "opp", rosterIn) : []

	return {
		slug,
		title: input.title,
		description: input.description?.trim() || null,
		dateLabel: dateLabel(input.gameDate),
		week: lab?.week ?? null,
		venue: input.homeAway === "home" ? "Allegiant Stadium" : `at ${info?.name ?? input.opponent}`,
		opp: { abbr, name: info?.name ?? input.opponent, nick, color: info?.color ?? "#71717a" },
		score,
		result,
		record: lab ? recordAfter(lab, games) : null,
		quarters: lab ? quarterLine(lab) : auto?.quarterScores?.length ? auto.quarterScores.map((q) => ({ label: q.quarter, me: q.raiders ?? 0, opp: q.opponent ?? 0 })) : [],
		halftime: lab ? halftimeLine(lab) : null,
		lab,
		head: lab && abbr ? headToHead(lab, games, abbr, scoutIn, team) : [],
		findings: lab ? findings(lab, games, nick) : [],
		turning: lab ? turningPoints(lab) : [],
		drives: bars,
		driveTotals: lab ? { me: driveSummary(bars, true), opp: driveSummary(bars, false) } : null,
		performers: { me, opp, standout: standout([...me, ...opp]) },
		headings: headings(body),
		body,
	}
}

export function reportStory(view: ReportView) {
	return view.lab ? gameStory(view.lab.wp, view.lab.keyPlays, view.lab.scores) : null
}

export { getGames, roster }
