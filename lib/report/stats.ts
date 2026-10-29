// The numbers section of a game report: every measure set side by side with where each team's game sits against its own season
// (the Raiders' other games for the Raiders, the Raiders' other opponents for the opponent, and each offense's rank in the league),
// plus the few findings that stand out most. Pure, so tests can feed it made-up games.

import type { BoxTeam, LabGame } from "../lab/types"
import { HEAD_TO_HEAD, METRIC, type Metric, type MetricKey, percent, signed, winner } from "./metrics"

export type Season = { v: number; rank: number } | null
/** Where this game sits among the games compared. place 1 is the best for that offense, `of` is how many games there are. */
export type Place = { place: number; of: number }

export type Cell = {
	value: number | null
	text: string
	/** Against the Raiders' season (me) or the other teams that played the Raiders (opp). null when there are fewer than four games to compare. */
	place: Place | null
	/** The team's offense in the league this season, from the scouting file. */
	league: Season
}

export type HeadRow = {
	key: MetricKey
	label: string
	help: string
	kind: Metric["kind"]
	higherBetter: boolean | null
	me: Cell
	opp: Cell
	edge: "me" | "opp" | null
	/** The line the dots and bars are drawn on. */
	min: number
	max: number
}

export type Finding = {
	key: MetricKey
	side: "me" | "opp"
	tone: "good" | "bad"
	headline: string
	detail: string
}

/** Fewest games before "best of the season" means anything. */
export const MIN_GAMES = 4

export function fmtValue(m: Metric, v: number): string {
	if (m.kind === "signed") return signed(v)
	if (m.kind === "share") return percent(v)
	return m.key === "ypp" ? v.toFixed(1) : String(Math.round(v))
}

/** 1 for the best value in the list (given which way is better), ties sharing the better place. */
export function placeOf(values: (number | null)[], index: number, higherBetter: boolean): Place | null {
	const mine = values[index]
	if (mine == null) return null
	const known = values.filter((v): v is number => v != null)
	if (known.length < MIN_GAMES) return null
	const ahead = known.filter((v) => (higherBetter ? v > mine : v < mine)).length
	return { place: ahead + 1, of: known.length }
}

type Scout = (abbr: string, side: "off", key: NonNullable<Metric["season"]>) => Season

function seasonOf(scout: Scout | undefined, abbr: string, m: Metric): Season {
	return scout && m.season ? scout(abbr, "off", m.season) : null
}

function boxes(games: LabGame[], side: "me" | "opp"): BoxTeam[] {
	return games.flatMap((g) => (g.box ? [g.box.teams[side]] : []))
}

/**
 * Every measure for one game, both teams, with their places. `games` is every game in the Lab file (it must include `game`);
 * `scout` looks up a team's season rank from the scouting file.
 */
export function headToHead(game: LabGame, games: LabGame[], oppAbbr: string, scout?: Scout, team = "LV"): HeadRow[] {
	if (!game.box) return []
	const withBox = games.filter((g) => g.box)
	const at = withBox.findIndex((g) => g.id === game.id)
	return HEAD_TO_HEAD.map((key) => {
		const m = METRIC[key]
		const cell = (side: "me" | "opp"): Cell => {
			const b = game.box!.teams[side]
			const list = boxes(withBox, side).map((x) => m.value(x))
			const value = m.value(b)
			return {
				value,
				text: m.text(b),
				place: at >= 0 && m.higherBetter !== null ? placeOf(list, at, m.higherBetter) : null,
				league: seasonOf(scout, side === "me" ? team : oppAbbr, m),
			}
		}
		const me = cell("me")
		const opp = cell("opp")
		const known = [me.value, opp.value].filter((v): v is number => v != null)
		let min = 0
		let max = 1
		if (m.kind === "signed") {
			// A fixed line, so two rows with the same dots mean the same thing: from half a point lost to half a point gained per play.
			const reach = Math.max(0.5, ...known.map((v) => Math.abs(v)))
			min = -reach
			max = reach
		} else if (m.kind === "count") {
			max = Math.max(1, ...known) * 1.1
		}
		return { key, label: m.label, help: m.help, kind: m.kind, higherBetter: m.higherBetter, me, opp, edge: winner(m, me.value, opp.value), min, max }
	}).filter((r) => r.me.value != null || r.opp.value != null)
}

// ---------------------------------------------------------------------------------------------------------- what stands out

type Words = { meMax?: string; meMin?: string; oppMax?: string; oppMin?: string }
/** How each extreme is said. "Max" is the biggest number of the season, whichever way that is for the team. */
const WORDS: Partial<Record<MetricKey, Words>> = {
	epa: { meMax: "The best offensive day of the season", meMin: "The worst offensive day of the season", oppMax: "The most efficient offense the Raiders have faced", oppMin: "The best defensive day of the season" },
	success: { meMax: "The highest success rate of the season", meMin: "The lowest success rate of the season", oppMax: "The most plays the defense has let succeed", oppMin: "The fewest plays the defense has let succeed" },
	earlySuccess: { meMax: "The best first and second downs of the season", meMin: "The worst first and second downs of the season", oppMax: "The opponent owned early downs like no one else has", oppMin: "The defense won early downs like never before" },
	epaRush: { meMax: "The best rushing game of the season", meMin: "The worst rushing game of the season", oppMax: "The most efficient run game the defense has allowed", oppMin: "The best run defense of the season" },
	epaPass: { meMax: "The best passing game of the season", meMin: "The worst passing game of the season", oppMax: "The most efficient passing day the defense has allowed", oppMin: "The best pass defense of the season" },
	explosive: { meMax: "The most explosive plays of the season", meMin: "The fewest explosive plays of the season", oppMax: "The most explosive plays the defense has allowed", oppMin: "The fewest explosive plays the defense has allowed" },
	rushYds: { meMax: "The most rushing yards of the season", meMin: "The fewest rushing yards of the season", oppMax: "The most rushing yards the defense has allowed", oppMin: "The fewest rushing yards the defense has allowed" },
	ypp: { meMax: "The most yards per play of the season", meMin: "The fewest yards per play of the season", oppMax: "The most yards per play the defense has allowed", oppMin: "The fewest yards per play the defense has allowed" },
	third: { meMax: "The best third-down day of the season", meMin: "The worst third-down day of the season", oppMax: "The most third downs the defense has let convert", oppMin: "The best third-down defense of the season" },
	redZone: { meMax: "The best red zone day of the season", meMin: "The worst red zone day of the season", oppMax: "The best red zone day any opponent has had against the Raiders", oppMin: "The best red zone defense of the season" },
	giveaways: { meMax: "The most giveaways of the season", oppMax: "The most takeaways of the season" },
	sacks: { meMax: "The most sacks taken this season", oppMax: "The best pass rush day of the season" },
	penalties: { meMax: "The most penalty yards of the season", oppMax: "The opponent's most penalty yards against the Raiders" },
}

/** How much a kind of finding matters when choosing which few to show. */
const WEIGHT: Partial<Record<MetricKey, number>> = { epa: 3, epaRush: 2.6, epaPass: 2.6, success: 2.2, earlySuccess: 2, rushYds: 2, explosive: 1.6, third: 1.5, redZone: 1.3, giveaways: 1.5, sacks: 1.2, penalties: 1.1, ypp: 1.2 }

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = (xs: number[]) => {
	const mu = mean(xs)
	return Math.sqrt(mean(xs.map((x) => (x - mu) ** 2)))
}

/**
 * The few things about this game that are most out of line with the season: for each measure, a value that is strictly the highest
 * or lowest of every game compared, weighted by how much the measure matters and how far it sits from the rest. At most four,
 * at most two about each team, each measure once.
 */
export function findings(game: LabGame, games: LabGame[], oppNick: string): Finding[] {
	if (!game.box) return []
	const withBox = games.filter((g) => g.box)
	if (withBox.length < MIN_GAMES) return []
	const out: (Finding & { score: number })[] = []
	for (const key of Object.keys(WORDS) as MetricKey[]) {
		const m = METRIC[key]
		const words = WORDS[key]!
		for (const side of ["me", "opp"] as const) {
			const all = withBox.map((g) => m.value(g.box!.teams[side]))
			const mine = m.value(game.box.teams[side])
			if (mine == null) continue
			const others = withBox.filter((g) => g.id !== game.id).map((g) => m.value(g.box!.teams[side])).filter((v): v is number => v != null)
			if (others.length < MIN_GAMES - 1 || all.filter((v) => v != null).length < MIN_GAMES) continue
			const isMax = others.every((v) => mine > v)
			const isMin = others.every((v) => mine < v)
			if (!isMax && !isMin) continue
			const phrase = side === "me" ? (isMax ? words.meMax : words.meMin) : isMax ? words.oppMax : words.oppMin
			if (!phrase) continue
			const spread = sd(others) || 1
			const z = Math.abs(mine - mean(others)) / spread
			// A good day for the Raiders: their own offense high on a higher-is-better measure, or the opponent's offense low on one.
			const higherIsGood = m.higherBetter === true
			const good = side === "me" ? (isMax ? higherIsGood : !higherIsGood) : isMax ? !higherIsGood : higherIsGood
			const norm = fmtValue(m, mean(others))
			const now = side === "me" ? m.text(game.box.teams.me) : m.text(game.box.teams.opp)
			const who = side === "me" ? "the Raiders" : `the ${oppNick}`
			out.push({
				key,
				side,
				tone: good ? "good" : "bad",
				headline: phrase,
				detail: `${now} for ${who}, against ${norm} on average in ${side === "me" ? "their other" : "the Raiders' other"} ${others.length} games.`,
				score: (WEIGHT[key] ?? 1) * Math.min(3, z) * (others.length >= 5 ? 1 : 0.7),
			})
		}
	}
	out.sort((a, b) => b.score - a.score)
	const picked: Finding[] = []
	const perSide = { me: 0, opp: 0 }
	const used = new Set<string>()
	for (const f of out) {
		const family = f.key === "epaRush" || f.key === "rushYds" ? "rush" : f.key === "epaPass" ? "pass" : f.key === "epa" || f.key === "success" || f.key === "earlySuccess" || f.key === "ypp" ? "eff" : f.key
		const slot = `${f.side}:${family}`
		if (used.has(slot) || perSide[f.side] >= 2) continue
		used.add(slot)
		perSide[f.side]++
		const { score: _score, ...rest } = f
		void _score
		picked.push(rest)
		if (picked.length === 4) break
	}
	return picked
}
