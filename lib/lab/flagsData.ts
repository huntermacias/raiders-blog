import { TEAMS } from "@/lib/nfl"

import { type TypeRow, typeRows } from "./flagsSituations"
import { type Flag, type FlagFile, type FlagPlayer, type Row, type TeamRow, type Totals, costliest, latestCostly, playerRows, teamRows, totals, typeSlug } from "./flagsKit"

// The flags files, read at build time by the server pages. A new season is one more line here and one more file from build_flags.py.
/* eslint-disable @typescript-eslint/no-require-imports */
const FILES = [require("../../data/lab/flags-2026.json"), require("../../data/lab/flags-2025.json")] as FlagFile[]

/** The seasons that have a file, newest first. */
export function getFlagFiles(): FlagFile[] {
	return [...FILES].filter((f) => f && Array.isArray(f.flags)).sort((a, b) => b.season - a.season)
}

export const flagSeason = (season: number): FlagFile | undefined => getFlagFiles().find((f) => f.season === season)

export type Roster = {
	/** Every player who got a flag in any season, the newest team and position winning, with a page name that is unique. */
	byId: Record<string, FlagPlayer>
	/** Page name to player id. */
	bySlug: Record<string, string>
}

let roster: Roster | null = null

/** Everyone who has a flag in any season. A page name two different players share keeps the first and gives the second his id's last digits. */
export function getRoster(): Roster {
	if (roster) return roster
	const byId: Record<string, FlagPlayer> = {}
	const bySlug: Record<string, string> = {}
	// Oldest season first, so the newest team and position are the ones that stay.
	for (const file of [...getFlagFiles()].reverse()) {
		for (const [id, p] of Object.entries(file.players)) {
			const had = byId[id]
			let s = had?.s ?? p.s
			if (!had) {
				if (bySlug[s] && bySlug[s] !== id) s = `${s}-${id.replace(/\D/g, "").slice(-4)}`
				bySlug[s] = id
			}
			const e = p.e ?? had?.e
			const h = p.h ?? had?.h
			byId[id] = { n: p.n, t: p.t, p: p.p ?? had?.p ?? null, s, ...(e ? { e } : h ? { h } : {}) }
		}
	}
	roster = { byId, bySlug }
	return roster
}

export const playerIdOf = (slug: string): string | undefined => getRoster().bySlug[slug]

export type SeasonSlice = {
	season: number
	week: number
	generatedAt: string
	turnoverCost: number
	totals: Totals
	teams: TeamRow[]
	players: Row[]
	/** The newest turnover-like flags in the league. */
	latest: Flag[]
	/** The costliest flags of the season. */
	worst: Flag[]
	/** Every penalty name that season, the costliest in total first. */
	types: TypeRow[]
}

const TEAM_ABBRS = TEAMS.map((t) => t.abbr)

/** What the hub shows for a season, small enough to hand the browser: the team table, the top players and two short feeds. */
export function hubSlice(file: FlagFile, roster: Record<string, FlagPlayer> = getRoster().byId, topPlayers = 150): SeasonSlice {
	return {
		season: file.season,
		week: file.week,
		generatedAt: file.generatedAt,
		turnoverCost: file.turnoverCost,
		totals: totals(file.flags),
		teams: teamRows(file.flags, TEAM_ABBRS),
		players: playerRows(file.flags, roster).slice(0, topPlayers),
		latest: latestCostly(file.flags, 30),
		worst: costliest(file.flags, 30),
		types: typeRows(file.flags),
	}
}

/** A team's flags in one season, oldest first. */
export const flagsOfTeam = (file: FlagFile, abbr: string): Flag[] => file.flags.filter((f) => f.t === abbr)

/** The names and page names of the players in a list of flags, for the browser: the pages hand it only the players it draws. */
export function rosterFor(flags: readonly Flag[], from: Record<string, FlagPlayer> = getRoster().byId): Record<string, FlagPlayer> {
	const out: Record<string, FlagPlayer> = {}
	for (const f of flags) if (f.pid && from[f.pid] && !out[f.pid]) out[f.pid] = from[f.pid]
	return out
}

export const flagsOfPlayer = (file: FlagFile, pid: string): Flag[] => file.flags.filter((f) => f.pid === pid)

/** Seconds since the epoch of the newest file, for a share card's cache stamp: a new card is fetched whenever the data changes. */
export function flagsStamp(): number {
	return Math.max(0, ...getFlagFiles().map((f) => Math.floor(Date.parse(f.generatedAt) / 1000) || 0))
}

/** Every penalty name that appears in any season, by page name. */
export function penaltyPages(): Record<string, string> {
	const out: Record<string, string> = {}
	for (const f of getFlagFiles()) for (const fl of f.flags) out[typeSlug(fl.ty)] ??= fl.ty
	return out
}
