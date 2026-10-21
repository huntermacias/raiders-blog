// Comparing players who do not play the same position, without comparing numbers that mean different things.
//
// A comparison across positions is only honest on stats both jobs are measured on the same way. This file lists those, by family:
//
//   receiving   wide receiver and tight end: the same catalog, defined the same for both
//   production  running back against a receiver: only the receiving work (a back's carries have no counterpart)
//   passrush    edge rusher and interior lineman: pressures, sacks and tackles for loss per 100 snaps
//   coverage    cornerback and safety: what happens when the ball is thrown at him
//
// Nothing here makes a number up. A shared stat is a list of catalog keys (one per position) that the catalog itself describes as the same
// measurement; a stat is only used when both positions have it and agree on which way is better. The percentile for a cross-position pair is
// read off one pool of everybody in the family who is graded on the stat, so a tight end and a receiver sit on one scale; each man's rank among
// his own position is kept beside it, because that is how a position is judged. Pure: no site imports.

import { type PlayerGroup, type PlayersData, type StatInfo, type Yard, statInfo, statOf } from "./playersKit"

export type FamilyId = "receiving" | "production" | "passrush" | "coverage"

/** One measurement that two positions share: the catalog key each of them keeps it under. */
export type SharedStat = {
	/** The id used in the address (`m=`) and on the page; for most stats it is the catalog key. */
	id: string
	keys: Partial<Record<PlayerGroup, string>>
	/** The position whose catalog entry words it (label, explanation); the same whichever side a man is on. */
	from: PlayerGroup
}

export type Family = {
	id: FamilyId
	title: string
	/** A word or two for a tight space (a card's heading). */
	short: string
	/** "receiving", for "how they compare as ...". */
	topic: string
	groups: PlayerGroup[]
	stats: SharedStat[]
	/** What is true of the jobs themselves, in plain words: the limits of reading these numbers side by side. */
	caveats: string[]
	/** What is deliberately left out, and why. */
	skipped: string[]
}

const same = (id: string, groups: PlayerGroup[]): SharedStat => ({ id, keys: Object.fromEntries(groups.map((g) => [g, id])) as SharedStat["keys"], from: groups[0] })

export const FAMILIES: Family[] = [
	{
		id: "receiving",
		title: "Receiving",
		short: "Receiving",
		topic: "receiving",
		groups: ["wr", "te"],
		stats: ["epaTgt", "success", "firstDown", "croe", "yacOe", "drop", "share", "catchRate", "adot", "deepRate", "contested", "screen", "sep", "cushion"].map((k) => same(k, ["wr", "te"])),
		caveats: [
			"Wide receivers and tight ends are asked to do different jobs. Tight ends block more and run shorter routes, so depth, deep-target and screen numbers describe a role more than a quality.",
			"Each stat is defined the same way for both, but it is measured on each man's own targets, and those are not the same kind of throw.",
		],
		skipped: [],
	},
	{
		id: "production",
		title: "Offensive production",
		short: "Production",
		topic: "production as a receiver",
		groups: ["rb", "wr", "te"],
		stats: [
			{ id: "epaTgt", keys: { rb: "recEpaTgt", wr: "epaTgt", te: "epaTgt" }, from: "wr" },
			{ id: "share", keys: { rb: "tgtShare", wr: "share", te: "share" }, from: "wr" },
		],
		caveats: [
			"A running back earns most of his value on carries, which a receiver never has. Only the receiving side lines up, so that is all that is compared here.",
			"Backs are often targeted on short check-downs and screens, receivers further downfield, so the same EPA per target is not earned the same way.",
		],
		skipped: ["His carries (EPA per carry, rushing success, explosive runs and the rest) are not compared: a receiver has nothing to set them against.", "Success rate is counted per carry for a back and per target for a receiver, so the two are different measurements and are not compared."],
	},
	{
		id: "passrush",
		title: "Pass rush",
		short: "Pass rush",
		topic: "rushing the passer",
		groups: ["edge", "idl"],
		stats: ["pressRate", "sackRate", "tflRate"].map((k) => same(k, ["edge", "idl"])),
		caveats: [
			"Edge rushers and interior linemen face different blocking. Interior rushers go against guards and centers and are doubled more often, so an inside pressure is usually harder to get.",
			"Every rate is per 100 snaps, run downs included, for both. A man who plays more run snaps spreads the same pressures over more of them.",
		],
		skipped: ["Missed tackle rate is left out: it measures tackling, not rushing the passer."],
	},
	{
		id: "coverage",
		title: "Coverage",
		short: "Coverage",
		topic: "pass coverage",
		groups: ["cb", "saf"],
		stats: ["yardsTgt", "rating", "compPct", "pbuRate", "intRate", "adotAgainst", "tgtRate"].map((k) => same(k, ["cb", "saf"])),
		caveats: [
			"Cornerbacks usually cover receivers in space; safeties play deeper and closer to the line and are thrown at differently. Read yards, completions and passer rating allowed as two jobs, not one.",
			"Every stat counts passes thrown at him, so the mix of throws (how deep, what down, who he covers) is not the same for the two.",
		],
		skipped: ["Missed tackle rate is left out: it measures tackling, not coverage."],
	},
]

/** The label used for a position in a tag or a sentence ("TE", "EDGE", "DT"). */
export const GROUP_TAG: Partial<Record<PlayerGroup, string>> = { rb: "RB", wr: "WR", te: "TE", edge: "EDGE", idl: "DT", cb: "CB", saf: "S" }

export const familyById = (id: string | null | undefined): Family | null => FAMILIES.find((f) => f.id === id) ?? null

/** The stats a pair of positions can be compared on: present in both catalogs, and agreeing on which way is better. */
export function sharedFor(f: Family, ga: PlayerGroup, gb: PlayerGroup): { stat: SharedStat; info: StatInfo }[] {
	const out: { stat: SharedStat; info: StatInfo }[] = []
	for (const stat of f.stats) {
		const ka = stat.keys[ga]
		const kb = stat.keys[gb]
		if (!ka || !kb) continue
		const ia = statInfo(ga, ka)
		const ib = statInfo(gb, kb)
		if (!ia || !ib || ia.higher !== ib.higher || !!ia.unit || !!ib.unit) continue
		const own = stat.keys[stat.from] ? statInfo(stat.from, stat.keys[stat.from] as string) : null
		out.push({ stat, info: own ?? ia })
	}
	return out
}

/** The family two different positions are compared in, or null when they have nothing they are measured on in common. The first family listed wins. */
export function familyFor(ga: PlayerGroup, gb: PlayerGroup): Family | null {
	if (ga === gb) return null
	return FAMILIES.find((f) => f.groups.includes(ga) && f.groups.includes(gb) && sharedFor(f, ga, gb).length > 0) ?? null
}

/** The key a position keeps a shared stat under. */
export const keyOf = (stat: SharedStat, group: PlayerGroup): string | null => stat.keys[group] ?? null

// ---- the pool ------------------------------------------------------------------------------------------------------------------

export type Pool = { y: Yard; values: number[]; higher: boolean | null; n: number }

const quantile = (sorted: number[], q: number) => {
	const i = (sorted.length - 1) * q
	const lo = Math.floor(i)
	const hi = Math.ceil(i)
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}

const cache = new WeakMap<PlayersData, Map<string, Pool | null>>()
const MIN_POOL = 8

/**
 * Everyone in the two positions who is graded on a shared stat (he has a season rank on it), as one spread. The same ranked men a position's
 * own yardstick is made of, so a man who did not play enough to be graded is not in it.
 */
export function poolOf(data: PlayersData, stat: SharedStat, ga: PlayerGroup, gb: PlayerGroup): Pool | null {
	const groups = Array.from(new Set([ga, gb])).sort()
	const id = `${stat.id}|${groups.join(",")}`
	let m = cache.get(data)
	if (!m) cache.set(data, (m = new Map()))
	if (m.has(id)) return m.get(id) ?? null
	const values: number[] = []
	let higher: boolean | null = null
	for (const g of groups) {
		const k = stat.keys[g]
		const info = k ? statInfo(g, k) : null
		if (!k || !info) continue
		higher = info.higher
		for (const p of data.players) {
			if (p.group !== g) continue
			const s = statOf(p, k)
			if (s && s.season.r !== null && s.season.r !== undefined && Number.isFinite(s.season.v)) values.push(s.season.v)
		}
	}
	let pool: Pool | null = null
	if (values.length >= MIN_POOL) {
		values.sort((x, y) => x - y)
		const n = values.length
		const mean = values.reduce((t, v) => t + v, 0) / n
		const sd = Math.sqrt(values.reduce((t, v) => t + (v - mean) ** 2, 0) / n)
		pool = { y: { n, mean, sd, q: [quantile(values, 0.1), quantile(values, 0.25), quantile(values, 0.5), quantile(values, 0.75), quantile(values, 0.9)] }, values, higher, n }
	}
	m.set(id, pool)
	return pool
}

/** Where a value ranks in the pool, 1 being best, the way a position's own season rank is counted. */
export function rankIn(pool: Pool, v: number): number {
	let better = 0
	for (const x of pool.values) if (pool.higher === false ? x < v : x > v) better += 1
	return better + 1
}

/** "wide receivers and tight ends" for the two positions of a pair. */
export function poolWords(peers: (g: PlayerGroup) => string, ga: PlayerGroup, gb: PlayerGroup): string {
	return `${peers(ga)} and ${peers(gb)}`
}
