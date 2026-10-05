// The plays that moved a game the most, ranked by win probability added.
//
// Every scrimmage play in the Lab data carries `wpa`, the win probability it added for the team with the
// ball. From the Raiders' side that is +wpa on their own snaps and -wpa on the opponent's. A play that
// helped the Raiders ranks the same as one that hurt them if it moved the game as far, so the list is
// the plays that decided the game, whoever they favored.

import { gameSlug } from "./data"
import type { Drive, DrivePlay, LabGame } from "./types"
import { clockAt, formatSwing } from "./wp"

export type TopPlay = {
	rank: number
	week: number
	slug: string
	oppName: string
	/** Drive number and play number within the drive. */
	drive: number
	playN: number
	/** True when the Raiders had the ball. */
	byRaiders: boolean
	/** Win probability added for the Raiders, as a fraction: positive helped them. */
	swing: number
	/** The Raiders' win probability before and after the play, as fractions. */
	before: number | null
	after: number | null
	q: string | null
	clock: string | null
	el: number | null
	type: string
	td: boolean
	yards: number
	/** Where the play started, yards from the offense's own goal line. */
	x: number
	xe: number | null
	text: string
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

function build(game: LabGame, drive: Drive, play: DrivePlay, team: string): Omit<TopPlay, "rank"> | null {
	if (typeof play.wpa !== "number") return null
	const byRaiders = drive.team === team
	const swing = byRaiders ? play.wpa : -play.wpa
	const before = typeof play.w0 === "number" ? play.w0 : null
	const when = typeof play.el === "number" ? clockAt(play.el) : null
	return {
		week: game.week,
		slug: gameSlug(game),
		oppName: game.oppName,
		drive: drive.n,
		playN: play.n,
		byRaiders,
		swing,
		before,
		after: before === null ? null : clamp01(before + swing),
		q: when ? when.q : null,
		clock: when ? when.clock : typeof play.clk === "string" ? play.clk : null,
		el: typeof play.el === "number" ? play.el : null,
		type: play.type,
		td: play.td,
		yards: play.yds,
		x: play.x,
		xe: play.xe,
		text: play.text,
	}
}

/** The most important plays of one game, biggest first (ties: earlier first). */
export function topPlaysFor(game: LabGame, team: string, count = 5): TopPlay[] {
	const all: Omit<TopPlay, "rank">[] = []
	for (const d of game.drives) for (const p of d.plays) {
		const b = build(game, d, p, team)
		if (b) all.push(b)
	}
	all.sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing) || (a.el ?? 0) - (b.el ?? 0))
	return all.slice(0, count).map((p, i) => ({ ...p, rank: i + 1 }))
}

/** The single biggest play of a game, or null when the data has no win probability added. */
export function playOfTheGame(game: LabGame, team: string): TopPlay | null {
	return topPlaysFor(game, team, 1)[0] ?? null
}

/** The biggest plays across several games. */
export function seasonTopPlays(games: LabGame[], team: string, count = 10): TopPlay[] {
	const all = games.flatMap((g) => topPlaysFor(g, team, 5))
	all.sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing) || a.week - b.week || (a.el ?? 0) - (b.el ?? 0))
	return all.slice(0, count).map((p, i) => ({ ...p, rank: i + 1 }))
}

/** Whole points of win probability, signed from the Raiders' side: "+29 pts". */
export function swingText(p: Pick<TopPlay, "swing">): string {
	return formatSwing(Math.round(p.swing * 100))
}

/** What kind of play it was, in a word or two. */
export function playWord(p: Pick<TopPlay, "type" | "text" | "td" | "yards">): string {
	const t = p.text.toLowerCase()
	if (p.type === "field_goal") return /no good|blocked/.test(t) ? "Missed field goal" : "Field goal"
	if (p.type === "punt") return /blocked/.test(t) ? "Blocked punt" : "Punt"
	if (/intercepted/.test(t)) return p.td ? "Pick-six" : "Interception"
	if (/fumbles/.test(t) && /recovered by/.test(t)) return p.td ? "Fumble return TD" : "Fumble"
	if (/sacked/.test(t)) return "Sack"
	if (p.td) return p.type === "run" ? "Rushing TD" : "Passing TD"
	if (/incomplete/.test(t)) return "Incomplete pass"
	if (p.type === "pass") return `${Math.abs(p.yards)}-yard pass`
	if (p.type === "run") return `${Math.abs(p.yards)}-yard run`
	return "Play"
}

/** "Q4 · 11:53", or "" when the play has no time. */
export function whenText(p: Pick<TopPlay, "q" | "clock">): string {
	return p.q && p.clock ? `${p.q} · ${p.clock}` : ""
}

/** "Who it helped", for text next to the swing. */
export function helped(p: Pick<TopPlay, "swing" | "oppName">): string {
	return p.swing >= 0 ? "Raiders" : p.oppName
}

/** A one-line sentence for the share text: "Interception, Q4 · 11:53: +29 pts for the Raiders." */
export function playSentence(p: TopPlay): string {
	const when = whenText(p)
	return `${playWord(p)}${when ? `, ${when}` : ""}: ${swingText(p)} for the ${p.swing >= 0 ? "Raiders" : p.oppName}.`
}
