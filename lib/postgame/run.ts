// The two jobs of the postgame pipeline, with every outside call handed in so they can be tested:
//
//   createDraft  runs every half hour on game days. If ESPN has a final Raiders game that has no report yet, it
//                creates a draft in Studio and tells Hunter.
//   enrichDrafts runs after the Lab data and clips are built. It adds the Lab's pieces to the draft's pipeline
//                section, replacing only the blocks it owns, and tells Hunter once when something was added.
//
// Neither job publishes, deletes or overwrites anything Hunter wrote.

import { randomUUID } from "node:crypto"

import { getGames, getSeason } from "../lab/data"
import { parseScoreboard } from "../live/espn"
import type { LiveGameInfo } from "../live/types"
import { TEAMS } from "../nfl"
import { type Defaults, type Facts, buildDraft, etDates, factsFrom, labPieces, matchLabGame, mergeBody, notifyText, pickRaidersFinal, pipelineBlocks } from "./draft"

export type Io = {
	now: () => Date
	/** GET a JSON document (the ESPN scoreboard). */
	getJson: (url: string) => Promise<unknown>
	/** Run a GROQ query with the write token and return `result`. */
	query: <T>(groq: string, params?: Record<string, string>) => Promise<T>
	/** Apply Sanity mutations. */
	mutate: (mutations: unknown[]) => Promise<void>
	/** Tell Hunter. Must never throw. */
	notify: (text: string) => Promise<void>
	log: (line: string) => void
	dryRun?: boolean
}

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates="
const DAY = 86_400_000

export const studioLink = (siteUrl: string, id: string) => `${siteUrl}/studio/desk/gameReport;${id.replace(/^drafts\./, "")}`

async function finalRaidersGame(io: Io): Promise<LiveGameInfo | null> {
	const days = etDates(io.now(), 3)
	const boards = await Promise.all(days.map((d) => io.getJson(`${SCOREBOARD}${d}`).then(parseScoreboard).catch(() => [] as LiveGameInfo[])))
	return pickRaidersFinal(boards.flat())
}

const reportExists = `count(*[_type == "gameReport" && (espnGameId == $id || (opponent == $opp && gameDate > $from && gameDate < $to))]) > 0`

export async function createDraft(io: Io, siteUrl: string): Promise<"created" | "none" | "exists"> {
	const game = await finalRaidersGame(io)
	if (!game) {
		io.log("No final Raiders game on the scoreboard.")
		return "none"
	}
	const f = factsFrom(game)
	const t = Date.parse(f.kickoff)
	const around = Number.isNaN(t) ? [new Date(0).toISOString(), new Date(8.64e15).toISOString()] : [new Date(t - 3 * DAY).toISOString(), new Date(t + 3 * DAY).toISOString()]
	const exists = await io.query<boolean>(reportExists, { id: f.espnId, opp: f.opponent, from: around[0], to: around[1] })
	if (exists) {
		io.log(`A report for ${f.opponent} (${f.espnId}) already exists.`)
		return "exists"
	}
	const defaults = (await io.query<Defaults | null>(`*[_type == "gameReport" && defined(author)] | order(gameDate desc)[0]{ "author": author._ref, "categories": categories[]._ref }`)) ?? { author: null, categories: [] }
	const lab = labPieces(matchLabGame(getGames(), f.oppAbbr, f.kickoff), getSeason().team)
	const id = randomUUID()
	const doc = buildDraft(f, lab?.game.week ?? null, lab, { author: defaults.author ?? null, categories: (defaults.categories ?? []).filter(Boolean) }, id)
	if (io.dryRun) {
		io.log(`[dry run] would create ${doc._id}: ${doc.title}`)
		return "created"
	}
	await io.mutate([{ createIfNotExists: doc }])
	io.log(`Created draft ${doc._id}: ${doc.title}`)
	await io.notify(notifyText(f, "created", studioLink(siteUrl, doc._id), lab))
	return "created"
}

type DraftRow = { _id: string; espnGameId: string; opponent: string; gameDate: string | null; homeAway: string; raidersScore: number; opponentScore: number; body: { _key?: string }[] | null }

export async function enrichDrafts(io: Io, siteUrl: string): Promise<number> {
	const drafts = await io.query<DraftRow[]>(`*[_type == "gameReport" && _id in path("drafts.**") && defined(espnGameId)]{ _id, espnGameId, opponent, gameDate, homeAway, raidersScore, opponentScore, body }`)
	let changed = 0
	for (const d of drafts ?? []) {
		const team = TEAMS.find((x) => x.name === d.opponent)
		if (!team || !d.gameDate) continue
		const lab = labPieces(matchLabGame(getGames(), team.abbr, d.gameDate), getSeason().team)
		if (!lab) continue
		const raiders = d.raidersScore
		const opp = d.opponentScore
		const f: Facts = { espnId: d.espnGameId, kickoff: d.gameDate, venue: null, home: d.homeAway === "home", opponent: d.opponent, oppAbbr: team.abbr, raiders, opp, result: raiders > opp ? "W" : raiders < opp ? "L" : "T" }
		const merged = mergeBody(d.body, pipelineBlocks(f, lab))
		if (JSON.stringify(merged) === JSON.stringify(d.body ?? [])) continue
		if (io.dryRun) {
			io.log(`[dry run] would update ${d._id}`)
			changed++
			continue
		}
		await io.mutate([{ patch: { id: d._id, set: { body: merged } } }])
		io.log(`Added the Lab pieces to ${d._id}`)
		await io.notify(notifyText(f, "lab", studioLink(siteUrl, d._id), lab))
		changed++
	}
	if (!changed) io.log("No drafts needed the Lab pieces.")
	return changed
}
