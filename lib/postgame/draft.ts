// The postgame draft: once ESPN says a Raiders game is final, a draft game report is created in Studio with the
// facts already filled in, and later (when the Lab has the game) the Lab's pieces are added to its body.
// Nothing here publishes anything. The draft is Hunter's to edit and publish.
//
// Pure functions of plain data: scripts/postgame/run.ts does the network and Sanity calls around them.

import { clipFor } from "../lab/clips"
import { type TopPlay, helped, playWord, swingText, topPlaysFor, whenText } from "../lab/topPlays"
import type { LabGame } from "../lab/types"
import type { LiveGameInfo } from "../live/types"
import { RAIDERS, TEAMS, teamByAbbr } from "../nfl"

export const SITE_URL = "https://www.raidersrundown.com"
/** Marks the blocks the pipeline owns, so a re-run replaces them and never touches what Hunter wrote. */
export const KEY_PREFIX = "pg-"

/** The newest final Raiders game on a scoreboard, or null. */
export function pickRaidersFinal(board: LiveGameInfo[]): LiveGameInfo | null {
	const finals = board.filter((g) => g.state === "post" && (g.home.abbr === "LV" || g.away.abbr === "LV"))
	finals.sort((a, b) => (b.kickoff ?? "").localeCompare(a.kickoff ?? ""))
	return finals[0] ?? null
}

/** `YYYYMMDD` for today and the days before it, in Eastern time (ESPN's scoreboard days are Eastern). */
export function etDates(now: Date, days = 3): string[] {
	const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
	const out: string[] = []
	for (let i = 0; i < days; i++) out.push(fmt.format(new Date(now.getTime() - i * 86_400_000)).replace(/-/g, ""))
	return out
}

export type Facts = {
	espnId: string
	kickoff: string
	venue: string | null
	home: boolean
	opponent: string
	oppAbbr: string
	raiders: number
	opp: number
	result: "W" | "L" | "T"
}

export function factsFrom(g: LiveGameInfo): Facts {
	const home = g.home.abbr === "LV"
	const us = home ? g.home : g.away
	const them = home ? g.away : g.home
	const info = teamByAbbr(them.abbr)
	return {
		espnId: g.id,
		kickoff: g.kickoff ?? "",
		venue: g.venue,
		home,
		// Studio stores the full team name ("Kansas City Chiefs"), the same as the existing reports.
		opponent: info.name !== them.abbr ? info.name : them.name,
		oppAbbr: info.abbr,
		raiders: us.score,
		opp: them.score,
		result: us.score > them.score ? "W" : us.score < them.score ? "L" : "T",
	}
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** "October 4, 2026", the day in Eastern time. */
export function dateText(iso: string): string {
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return ""
	const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(d)
	const get = (t: string) => Number(p.find((x) => x.type === t)?.value)
	return `${MONTHS[get("month") - 1]} ${get("day")}, ${get("year")}`
}

/** The line under every report's headline: winner first, like the published ones. */
export function descriptionFor(f: Facts): string {
	const nick = (n: string) => n
	const lv = `${RAIDERS} ${f.raiders}`
	const them = `${nick(f.opponent)} ${f.opp}`
	const line = f.result === "L" ? `${them}, ${lv}` : `${lv}, ${them}`
	return `${line}${f.venue ? ` — ${f.venue}` : ""}${f.kickoff ? `, ${dateText(f.kickoff)}` : ""}`
}

export const slugify = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 96)

/** The working title: obviously a draft, with the score and the week when known. */
export function titleFor(f: Facts, week: number | null): string {
	const nick = TEAMS.find((t) => t.abbr === f.oppAbbr)?.nick ?? f.opponent
	const score = f.result === "L" ? `${nick} ${f.opp}, Raiders ${f.raiders}` : `Raiders ${f.raiders}, ${nick} ${f.opp}`
	return `DRAFT${week ? ` Week ${week}` : ""}: ${score}`
}

// ---- body blocks -----------------------------------------------------------------------------------------------

type Part = string | { text: string; href: string } | { text: string; strong: true }

let counter = 0
const k = (name: string) => `${KEY_PREFIX}${name}`
const nextKey = (name: string) => `${KEY_PREFIX}${name}-${++counter}`

/** One Portable Text block. Keys start with KEY_PREFIX so the pipeline can find its own blocks again. */
export function block(name: string, parts: Part[], opts: { style?: "normal" | "h2" | "h3"; list?: boolean } = {}) {
	const markDefs: { _key: string; _type: "link"; href: string }[] = []
	const children = parts.map((p, i) => {
		if (typeof p === "string") return { _key: `${name}-s${i}`, _type: "span", text: p, marks: [] as string[] }
		if ("href" in p) {
			const key = `${name}-l${i}`
			markDefs.push({ _key: key, _type: "link", href: p.href })
			return { _key: `${name}-s${i}`, _type: "span", text: p.text, marks: [key] }
		}
		return { _key: `${name}-s${i}`, _type: "span", text: p.text, marks: ["strong"] }
	})
	return { _key: name, _type: "block", style: opts.style ?? "normal", markDefs, children, ...(opts.list ? { listItem: "bullet", level: 1 } : {}) }
}

export type LabPieces = {
	game: LabGame
	plays: TopPlay[]
	clip: ReturnType<typeof clipFor>
}

/** The Lab's pieces for a game, or null when the Lab has not got it yet. */
export function labPieces(game: LabGame | undefined, team: string): LabPieces | null {
	if (!game) return null
	return { game, plays: topPlaysFor(game, team, 3), clip: clipFor(game.week) }
}

/** The Lab game that is this report's game: same opponent, within three days of the report's date. */
export function matchLabGame(games: LabGame[], oppAbbr: string, kickoff: string): LabGame | undefined {
	const t = Date.parse(kickoff)
	return games.find((g) => g.opp === oppAbbr && (Number.isNaN(t) || Math.abs(Date.parse(`${g.date}T12:00:00Z`) - t) < 3 * 86_400_000))
}

const abs = (path: string) => `${SITE_URL}${path}`

/**
 * The blocks the pipeline owns. They open the body under a clear "delete before publishing" heading so a draft
 * can never go out with them by accident, and they hold links and numbers Hunter can lift into the recap.
 */
export function pipelineBlocks(f: Facts, lab: LabPieces | null) {
	counter = 0
	const out = [
		block(k("head"), [`DRAFT NOTES (delete this section before publishing)`], { style: "h2" }),
		block(nextKey("intro"), [
			lab
				? `Everything below comes from the numbers. The box score on the published page fills itself in from ESPN. Write the recap under this section.`
				: `The score and box score are filled in. The Lab replay, top plays, share cards and clip arrive once the play-by-play data posts (usually Monday morning); this section updates itself then.`,
		]),
	]
	if (!lab) return out
	const slug = `week-${lab.game.week}`
	out.push(block(nextKey("lab"), [{ text: `Lab page: Week ${lab.game.week}`, href: abs(`/lab/${slug}`) }, " (win probability replay, drive replays, top plays)"], { list: true }))
	for (const p of lab.plays) {
		out.push(block(nextKey("play"), [{ text: `${p.rank === 1 ? "Play of the game" : `Play #${p.rank}`}: `, strong: true }, `${playWord(p)}${whenText(p) ? `, ${whenText(p)}` : ""}, ${swingText(p)} for the ${helped(p)}. `, { text: "Share card", href: abs(`/api/og?type=lab&slug=${slug}&view=play&rank=${p.rank}`) }], { list: true }))
	}
	out.push(block(nextKey("story"), [{ text: "Win probability story card: ", strong: true }, { text: "image", href: abs(`/api/og?type=lab&slug=${slug}`) }], { list: true }))
	if (lab.clip) {
		out.push(block(nextKey("clip"), [{ text: "Clips: ", strong: true }, { text: "landscape", href: abs(lab.clip.files.landscape) }, ", ", { text: "vertical", href: abs(lab.clip.files.vertical) }, ", ", { text: "square", href: abs(lab.clip.files.square) }, ", ", { text: "GIF", href: abs(lab.clip.files.gif) }], { list: true }))
	}
	out.push(block(nextKey("scout"), [{ text: "Scouting reports for the next opponent: ", strong: true }, { text: "all teams", href: abs("/lab/scouting") }], { list: true }))
	return out
}

/** Studio's Raiders-report defaults, found once by the script from the existing reports. */
export type Defaults = { author: string | null; categories: string[] }

export function buildDraft(f: Facts, week: number | null, lab: LabPieces | null, defaults: Defaults, id: string) {
	const title = titleFor(f, week)
	return {
		_id: `drafts.${id}`,
		_type: "gameReport",
		title,
		slug: { _type: "slug", current: slugify(title) },
		description: descriptionFor(f),
		opponent: f.opponent,
		gameDate: f.kickoff || undefined,
		homeAway: f.home ? "home" : "away",
		raidersScore: f.raiders,
		opponentScore: f.opp,
		autoStats: true,
		espnGameId: f.espnId,
		...(defaults.author ? { author: { _type: "reference", _ref: defaults.author } } : {}),
		...(defaults.categories.length ? { categories: defaults.categories.map((r, i) => ({ _key: `cat${i}`, _type: "reference", _ref: r })) } : {}),
		body: pipelineBlocks(f, lab),
	}
}

/** Replaces the pipeline's blocks in an existing body, leaving everything else exactly as it is. */
export function mergeBody(existing: { _key?: string }[] | null | undefined, fresh: { _key?: string }[]): { _key?: string }[] {
	const mine = (b: { _key?: string }) => typeof b._key === "string" && b._key.startsWith(KEY_PREFIX)
	const rest = (existing ?? []).filter((b) => !mine(b))
	return [...fresh, ...rest]
}

/** The message sent to Hunter. */
export function notifyText(f: Facts, kind: "created" | "lab", studioUrl: string | null, lab: LabPieces | null): string {
	const head = `Raiders ${f.raiders}, ${f.opponent} ${f.opp} (${f.result === "W" ? "win" : f.result === "L" ? "loss" : "tie"})`
	if (kind === "created") return `${head}: final. A draft game report is waiting in Studio${studioUrl ? `: ${studioUrl}` : ""}. The Lab pieces follow when the data posts.`
	const bits = [lab?.plays.length ? "top plays" : null, lab?.clip ? "clips" : null, "share cards"].filter(Boolean)
	return `${head}: the Lab pieces are added to your draft (${bits.join(", ")}).${studioUrl ? ` ${studioUrl}` : ""}`
}
