// Turns ESPN's public JSON (site.api.espn.com) into the models in types.ts. The feed is unofficial
// and undocumented, so every read here is defensive: a missing or oddly shaped field becomes null
// or a default, never an exception. Pure, so it can be tested with saved samples.

import { TEAMS } from "@/lib/nfl"

import type { GameState, LiveDrive, LiveGame, LiveGameInfo, LiveOdds, LivePlay, LiveSituation, LiveTeam, PlayKind, TeamStat } from "./types"

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v)
const obj = (v: unknown): Obj => (isObj(v) ? v : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : typeof v === "number" ? String(v) : null)
const num = (v: unknown): number | null => {
	if (typeof v === "number" && Number.isFinite(v)) return v
	if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
	return null
}

/** ESPN uses a few abbreviations that differ from this site's. */
const ABBR_FIX: Record<string, string> = { WSH: "WAS", JAC: "JAX", LA: "LAR", OAK: "LV" }
export const siteAbbr = (a: string | null): string => {
	const up = (a ?? "").toUpperCase()
	return ABBR_FIX[up] ?? up
}

const nameOf = (abbr: string, fallback: string | null): string => TEAMS.find((t) => t.abbr === abbr)?.name ?? fallback ?? abbr

/** "3:32" -> 212. */
export function parseClock(v: unknown): number | null {
	if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.round(v))
	const s = str(v)
	if (!s) return null
	const m = /^(\d+):(\d{1,2})(?:\.\d+)?$/.exec(s.trim())
	if (m) return Number(m[1]) * 60 + Number(m[2])
	const n = Number(s)
	return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null
}

function teamFrom(c: Obj): LiveTeam {
	const t = obj(c.team)
	const abbr = siteAbbr(str(t.abbreviation))
	const rec = arr(c.records).map(obj).find((r) => str(r.type) === "total" || str(r.name) === "overall") ?? obj(arr(c.records)[0])
	return {
		abbr,
		name: nameOf(abbr, str(t.displayName)),
		score: num(c.score) ?? 0,
		record: str(rec.summary),
		espnId: str(t.id) ?? str(c.id),
	}
}

/** Home team's spread from ESPN's odds block, reading the "KC -3.5" text first. */
export function parseOdds(odds: unknown, home: string, away: string): LiveOdds | null {
	const o = obj(arr(odds)[0])
	if (Object.keys(o).length === 0) return null
	const label = str(o.details)
	const overUnder = num(o.overUnder)
	let homeSpread: number | null = null
	if (label) {
		if (/^(even|pk|pick)/i.test(label.trim())) homeSpread = 0
		else {
			const m = /^([A-Za-z]{2,4})\s+([+-]?\d+(?:\.\d+)?)/.exec(label.trim())
			if (m) {
				const who = siteAbbr(m[1])
				const pts = Math.abs(Number(m[2]))
				if (who === home) homeSpread = -pts
				else if (who === away) homeSpread = pts
			}
		}
	}
	if (homeSpread == null) {
		const sp = num(o.spread)
		const homeFav = obj(o.homeTeamOdds).favorite
		if (sp != null) homeSpread = homeFav === true ? -Math.abs(sp) : homeFav === false ? Math.abs(sp) : sp
	}
	if (homeSpread == null && overUnder == null && !label) return null
	return { homeSpread, overUnder, label }
}

const stateOf = (v: unknown): GameState => (v === "in" ? "in" : v === "post" ? "post" : "pre")

function situationFrom(sit: Obj): LiveSituation | null {
	if (Object.keys(sit).length === 0) return null
	const down = num(sit.down)
	const distance = num(sit.distance)
	// ESPN's yardLine is a spot on the field; yardsToEndzone, when present, is what we need.
	const toGoal = num(sit.yardsToEndzone)
	return {
		down: down != null && down > 0 ? down : null,
		distance,
		yardsToGoal: toGoal,
		text: str(sit.downDistanceText) ?? str(sit.shortDownDistanceText),
		redZone: sit.isRedZone === true,
	}
}

/** One event from the scoreboard feed. Returns null when it is missing the pieces a game needs. */
export function parseEvent(event: unknown): LiveGameInfo | null {
	const e = obj(event)
	const comp = obj(arr(e.competitions)[0])
	const sides = arr(comp.competitors).map(obj)
	const homeRaw = sides.find((c) => c.homeAway === "home")
	const awayRaw = sides.find((c) => c.homeAway === "away")
	const id = str(e.id)
	if (!id || !homeRaw || !awayRaw) return null
	const home = teamFrom(homeRaw)
	const away = teamFrom(awayRaw)
	if (!home.abbr || !away.abbr) return null

	const status = obj(comp.status ?? e.status)
	const type = obj(status.type)
	const possId = str(obj(comp.situation).possession)
	const possAbbr = possId ? [home, away].find((t) => t.espnId === possId)?.abbr ?? null : null
	const broadcast = arr(comp.broadcasts).map(obj).flatMap((b) => arr(b.names).map(str)).find(Boolean) ?? null

	return {
		id,
		state: stateOf(type.state),
		detail: str(type.detail) ?? str(type.shortDetail) ?? "",
		shortDetail: str(type.shortDetail) ?? str(type.detail) ?? "",
		period: num(status.period) ?? 0,
		clockSeconds: parseClock(status.displayClock ?? status.clock),
		kickoff: str(e.date) ?? str(comp.date),
		home,
		away,
		odds: parseOdds(comp.odds, home.abbr, away.abbr),
		venue: str(obj(comp.venue).fullName),
		network: broadcast,
		possession: possAbbr,
		situation: situationFrom(obj(comp.situation)),
	}
}

export function parseScoreboard(json: unknown): LiveGameInfo[] {
	return arr(obj(json).events)
		.map(parseEvent)
		.filter((g): g is LiveGameInfo => g != null)
		.sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? ""))
}

function kindOf(typeText: string, text: string, penalty: boolean): PlayKind {
	const t = typeText.toLowerCase()
	const x = text.toLowerCase()
	if (penalty || t.includes("penalty")) return "penalty"
	if (t.includes("sack") || /\bsacked\b/.test(x)) return "sack"
	if (t.includes("punt")) return "punt"
	if (t.includes("field goal") || t.includes("extra point")) return "fg"
	if (t.includes("kickoff")) return "kick"
	if (t.includes("pass") || t.includes("interception")) return "pass"
	if (t.includes("rush") || t.includes("run") || t.includes("fumble") || /\bup the middle\b|\bleft end\b|\bright end\b|\bleft tackle\b|\bright tackle\b|\bleft guard\b|\bright guard\b/.test(x)) return "run"
	return "other"
}

const BIG_YARDS = 20
/** Things that are not plays from scrimmage: skip them in the feed. */
const NOT_A_PLAY = /timeout|end period|end of (game|half|quarter)|two-minute warning|coin toss|official timeout|^start/i

function parsePlay(raw: unknown, teamAbbr: string | null, order: number): LivePlay | null {
	const p = obj(raw)
	const id = str(p.id)
	const text = str(p.text) ?? str(p.shortText)
	if (!id || !text) return null
	const typeText = str(obj(p.type).text) ?? ""
	if (NOT_A_PLAY.test(typeText)) return null

	const start = obj(p.start)
	const end = obj(p.end)
	const toGoalStart = num(start.yardsToEndzone)
	const toGoalEnd = num(end.yardsToEndzone)
	const sameTeam = !end.team || !start.team || str(obj(start.team).id) === str(obj(end.team).id)
	const down = num(start.down)
	const penalty = p.isPenalty === true
	const kind = kindOf(typeText, text, penalty)
	const scoring = p.scoringPlay === true
	const turnover = p.isTurnover === true || /interception|fumble recovery \(opponent\)|fumble.*recovered by/i.test(typeText + " " + text)
	const yards = num(p.statYardage) ?? 0
	const clock = obj(p.clock)
	const touchdown = scoring && /touchdown/i.test(typeText + " " + text)
	const distance = num(start.distance)
	const clockText = str(clock.displayValue) ?? ""
	const firstDown = !turnover && !penalty && (kind === "run" || kind === "pass") && ((distance != null && yards >= distance && yards > 0) || /1st down/i.test(text))

	return {
		id,
		seq: num(p.sequenceNumber) ?? order,
		period: num(obj(p.period).number) ?? 0,
		clock: clockText,
		clockSeconds: parseClock(clockText),
		text,
		kind,
		team: teamAbbr,
		down: down != null && down > 0 ? down : null,
		distance,
		from: toGoalStart != null ? 100 - toGoalStart : null,
		to: toGoalEnd != null && sameTeam ? 100 - toGoalEnd : null,
		yards,
		away: num(p.awayScore) ?? 0,
		home: num(p.homeScore) ?? 0,
		scoring,
		touchdown,
		turnover,
		penalty,
		big: scoring || turnover || ((kind === "run" || kind === "pass") && yards >= BIG_YARDS),
		firstDown,
	}
}

function parseDrive(raw: unknown, index: number, byId: Map<string, string>): LiveDrive | null {
	const d = obj(raw)
	const team = obj(d.team)
	const abbr = siteAbbr(str(team.abbreviation)) || (str(team.id) ? byId.get(str(team.id) as string) ?? "" : "")
	const plays = arr(d.plays)
		.map((p, i) => parsePlay(p, abbr || null, index * 100 + i))
		.filter((p): p is LivePlay => p != null)
	if (plays.length === 0) return null
	return {
		id: str(d.id) ?? `drive-${index}`,
		team: abbr || null,
		description: str(d.description) ?? "",
		result: str(d.displayResult) ?? str(d.result) ?? "",
		yards: num(d.yards) ?? 0,
		plays,
	}
}

const STAT_ORDER: [string, string][] = [
	["totalYards", "Total yards"],
	["netPassingYards", "Passing yards"],
	["rushingYards", "Rushing yards"],
	["yardsPerPlay", "Yards per play"],
	["firstDowns", "First downs"],
	["thirdDownEff", "3rd down"],
	["turnovers", "Turnovers"],
	["totalPenaltiesYards", "Penalties"],
	["possessionTime", "Time of possession"],
]

function parseStats(box: Obj, home: LiveTeam, away: LiveTeam): TeamStat[] {
	const teams = arr(box.teams).map(obj)
	const find = (t: LiveTeam) => teams.find((x) => str(obj(x.team).id) === t.espnId || siteAbbr(str(obj(x.team).abbreviation)) === t.abbr)
	const h = find(home)
	const a = find(away)
	if (!h || !a) return []
	const value = (team: Obj, name: string) => {
		const s = arr(team.statistics).map(obj).find((x) => str(x.name) === name)
		return s ? str(s.displayValue) : null
	}
	return STAT_ORDER.flatMap(([name, label]) => {
		const av = value(a, name)
		const hv = value(h, name)
		return av != null && hv != null ? [{ label, away: av, home: hv }] : []
	})
}

/**
 * The drives and stats from a game summary, joined with the game's info from the scoreboard (the
 * summary feed carries no scores or teams of its own). Drives come back oldest first, the current
 * drive last.
 */
export function parseSummary(json: unknown, info: LiveGameInfo): LiveGame {
	const root = obj(json)
	const drivesObj = obj(root.drives)
	const byId = new Map<string, string>()
	for (const t of [info.home, info.away]) if (t.espnId) byId.set(t.espnId, t.abbr)
	const rawDrives = [...arr(drivesObj.previous), ...(isObj(drivesObj.current) ? [drivesObj.current] : [])]
	const drives = rawDrives.map((d, i) => parseDrive(d, i, byId)).filter((d): d is LiveDrive => d != null)

	// If the scoreboard has no situation for a live game, read it off the last play.
	let withSituation = info
	if (info.state === "in" && !info.situation) {
		const last = drives[drives.length - 1]?.plays.slice(-1)[0]
		if (last && last.to != null) {
			withSituation = { ...info, situation: { down: null, distance: null, yardsToGoal: 100 - last.to, text: null, redZone: 100 - last.to <= 20 }, possession: info.possession ?? last.team }
		}
	}
	return { info: withSituation, drives, stats: parseStats(obj(root.boxscore), info.home, info.away) }
}
