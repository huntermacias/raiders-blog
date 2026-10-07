// "Will it last?" without the data attached: types, formatting and the analysis itself, all plain functions
// of the numbers they are handed. The chart component runs `analyze` in the browser (so a fan can filter by
// team and playoff result), and the server runs the same function for the page's first paint, the share
// cards and the tests. This file must not import anything: the history data stays on the server (a test
// guards that).

export type Fmt = "epa" | "pct" | "pct1" | "per" | "pts" | "diff"

export function formatStat(def: { fmt: Fmt }, v: number): string {
	switch (def.fmt) {
		case "epa":
			return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`
		case "pct":
			return `${Math.round(v * 100)}%`
		case "pct1":
			return `${(v * 100).toFixed(1)}%`
		case "per":
			return v.toFixed(2)
		case "pts":
			return v.toFixed(1)
		case "diff":
			return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`
	}
}

export function ordinalOf(n: number): string {
	const mod100 = n % 100
	if (mod100 >= 11 && mod100 <= 13) return `${n}th`
	return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`
}

/** Regular-season games in a year: 17 from 2021, 16 before. */
export function seasonGames(season: number): number {
	return season >= 2021 ? 17 : 16
}

export const pctText = (v: number): string => `${Math.round(v * 100)}%`

/** Team nicknames by the abbreviation the data uses, which is the modern one in every season. */
export const TEAM_NAMES: Record<string, string> = {
	ARI: "Cardinals", ATL: "Falcons", BAL: "Ravens", BUF: "Bills", CAR: "Panthers", CHI: "Bears", CIN: "Bengals", CLE: "Browns",
	DAL: "Cowboys", DEN: "Broncos", DET: "Lions", GB: "Packers", HOU: "Texans", IND: "Colts", JAX: "Jaguars", KC: "Chiefs",
	LAC: "Chargers", LAR: "Rams", LV: "Raiders", MIA: "Dolphins", MIN: "Vikings", NE: "Patriots", NO: "Saints", NYG: "Giants",
	NYJ: "Jets", PHI: "Eagles", PIT: "Steelers", SEA: "Seahawks", SF: "49ers", TB: "Buccaneers", TEN: "Titans", WAS: "Commanders",
}

export const teamName = (abbr: string): string => TEAM_NAMES[abbr === "OAK" ? "LV" : abbr] ?? abbr

/** "2007 Patriots": the season and the team's nickname. The Raiders are LV in every season of the data. */
export function teamLabel(row: string): string {
	const [season, abbr = ""] = row.split(" ")
	return `${season} ${teamName(abbr)}`
}

export const abbrOf = (row: string): string => row.split(" ")[1] ?? ""
export const seasonOf = (row: string): number => Number(row.split(" ")[0])
export function isRaiders(row: string): boolean {
	const a = abbrOf(row)
	return a === "LV" || a === "OAK"
}

/** "3-1", or "3-1-1" with a tie. */
export function recordText(wins: number, losses: number, games: number): string {
	const ties = games - wins - losses
	return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`
}

/** Every team-season measured, with the records that go with it. Lists share one index. */
export type Meta = {
	/** Games played, which is where every team's season is cut in two. */
	n: number
	first: number
	last: number
	/** "2016 LV". */
	teams: string[]
	po: number[]
	wins: number[]
	losses: number[]
	startWins: number[]
	startLosses: number[]
}

export type Table = {
	key: string
	label: string
	short: string
	unit: string
	fmt: Fmt
	higherIsBetter: boolean
	/** Where the stat sits in the picker. */
	family: "off" | "def" | "net"
	/** The Raiders' number so far this season, and its rank of 32 (1 is best). */
	value: number
	rank: number
	/** Per team-season: the stat over the first games and over the rest of the season; null when it could not be measured. */
	start: (number | null)[]
	rest: (number | null)[]
}

/** Which team-seasons to highlight. `years` is the seasons to keep; empty means every season. */
export type Filter = { scope: "like" | "all"; team: string | null; playoffs: "any" | "made" | "missed"; years: number[] }
export const DEFAULT_FILTER: Filter = { scope: "like", team: null, playoffs: "any", years: [] }

/** "in 2016", "from 2010 to 2019", "in 2016 and 2021", or "in 5 chosen seasons"; empty for no filter. */
export function yearsText(years: number[]): string {
	if (!years.length) return ""
	const ys = [...years].sort((a, b) => a - b)
	if (ys.length === 1) return `in ${ys[0]}`
	if (ys.every((y, i) => i === 0 || y === ys[i - 1] + 1)) return `from ${ys[0]} to ${ys[ys.length - 1]}`
	if (ys.length <= 3) return `in ${ys.slice(0, -1).join(", ")} and ${ys[ys.length - 1]}`
	return `in ${ys.length} chosen seasons`
}

export type VerdictId = "fade" | "improve" | "hold" | "linger" | "mixed"

export type Row = {
	/** Index into the Meta lists. */
	i: number
	start: number
	rest: number
	/** In the group the cards and the headline are about. */
	inGroup: boolean
	toward: boolean
	po: boolean
	raiders: boolean
}

/** What happened to a group of teams in wins and playoffs, against every team measured. */
export type Outcomes = {
	startWin: number
	restWin: number
	restWins: number
	restGames: number
	playoffs: number
	allRestWin: number
	allPlayoffs: number
	avgWins: number
}

export type Fifth = { rate: number; teams: number; lo: number; hi: number }

export type Analysis = {
	key: string
	label: string
	short: string
	unit: string
	fmt: Fmt
	higherIsBetter: boolean
	n: number
	value: number
	valueText: string
	rank: number
	/** The Raiders sit on the good side of average for this stat. */
	good: boolean
	base: number
	rows: Row[]
	/** How the group was chosen: "atLeast" (as extreme as the Raiders), "closest" (the nearest ones), "all". */
	kind: "atLeast" | "closest" | "all"
	filter: Filter
	groupSize: number
	avgStart: number
	avgRest: number
	toward: number
	band: [number, number]
	typical: number
	kept: number
	verdict: { id: VerdictId; text: string }
	earlier: { count: number; toward: number }
	outcomes: Outcomes
	winsLine: string
	/** Playoff rate by fifth of the league on this stat, best fifth first, and the fifth the Raiders are in (0 to 4). */
	fifths: Fifth[]
	raidersFifth: number
	domain: [number, number]
	headline: string
	sub: string
	startText: string
	restText: string
	baseText: string
	typicalText: string
}

/** How teams with a given record after n games finished. */
export type StartRecord = { wins: number; losses: number; teams: number; playoffs: number; avgWins: number }

/** Fewer similar teams than this and the group is the closest ones instead. */
export const MIN_SIMILAR = 30
/** More than this and it is trimmed to the closest, so the chart stays readable. */
export const MAX_SIMILAR = 250

function quantile(sorted: number[], q: number): number {
	if (!sorted.length) return NaN
	const pos = (sorted.length - 1) * q
	const lo = Math.floor(pos)
	const hi = Math.ceil(pos)
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** Least-squares slope of the rest of the season on the first games, across every team that has both. */
function slopeOf(start: number[], rest: number[]): number {
	const mx = mean(start)
	const my = mean(rest)
	let sxy = 0
	let sxx = 0
	for (let i = 0; i < start.length; i++) {
		sxy += (start[i] - mx) * (rest[i] - my)
		sxx += (start[i] - mx) ** 2
	}
	return sxx > 0 ? sxy / sxx : 0
}

function verdictFor(kept: number, good: boolean): Analysis["verdict"] {
	if (kept < 0.5) return good ? { id: "fade", text: "Likely to fade" } : { id: "improve", text: "Likely to improve" }
	if (kept >= 0.75) return good ? { id: "hold", text: "Likely to hold" } : { id: "linger", text: "Likely to linger" }
	return { id: "mixed", text: "Part real, part luck" }
}

export function outcomesFor(meta: Meta, group: number[], everyone: number[]): Outcomes {
	const rest = (i: number) => ({ wins: meta.wins[i] - meta.startWins[i], games: seasonGames(seasonOf(meta.teams[i])) - meta.n })
	const restWin = (idx: number[]) => sum(idx.map((i) => rest(i).wins)) / sum(idx.map((i) => rest(i).games))
	if (!group.length) return { startWin: NaN, restWin: NaN, restWins: NaN, restGames: NaN, playoffs: NaN, allRestWin: restWin(everyone), allPlayoffs: mean(everyone.map((i) => meta.po[i])), avgWins: NaN }
	return {
		startWin: sum(group.map((i) => meta.startWins[i])) / (meta.n * group.length),
		restWin: restWin(group),
		restWins: mean(group.map((i) => rest(i).wins)),
		restGames: mean(group.map((i) => rest(i).games)),
		playoffs: mean(group.map((i) => meta.po[i])),
		allRestWin: restWin(everyone),
		allPlayoffs: mean(everyone.map((i) => meta.po[i])),
		avgWins: mean(group.map((i) => meta.wins[i])),
	}
}

export function winsLine(o: Outcomes, n: number): string {
	if (!Number.isFinite(o.restWin)) return "No team-seasons match these filters."
	const move = o.startWin - o.restWin
	const first = move > 0.05 ? `Their win rate fell from ${pctText(o.startWin)} in the first ${n} games to ${pctText(o.restWin)} after` : move < -0.05 ? `Their win rate rose from ${pctText(o.startWin)} in the first ${n} games to ${pctText(o.restWin)} after` : `Their win rate stayed near ${pctText(o.restWin)}`
	const diff = o.restWin - o.allRestWin
	const vs = diff >= 0.03 ? `, still above the average team's ${pctText(o.allRestWin)}` : diff <= -0.03 ? `, still below the average team's ${pctText(o.allRestWin)}` : `, about what the average team does`
	return `${first}${vs}. ${pctText(o.playoffs)} made the playoffs, against ${pctText(o.allPlayoffs)} of all teams.`
}

/**
 * Playoff rate for each fifth of the league on a stat, best fifth first, and which fifth `value` lands in. This
 * is the "what are the Raiders' chances" view: how often teams that stood where the Raiders stand made the playoffs.
 */
export function fifthsOf(meta: Meta, t: Pick<Table, "start" | "higherIsBetter">, value: number): { fifths: Fifth[]; raidersFifth: number } {
	const rows: { s: number; po: number }[] = []
	for (let i = 0; i < t.start.length; i++) {
		const s = t.start[i]
		if (s !== null) rows.push({ s, po: meta.po[i] })
	}
	rows.sort((a, b) => (t.higherIsBetter ? b.s - a.s : a.s - b.s))
	const size = rows.length / 5
	const fifths: Fifth[] = []
	for (let k = 0; k < 5; k++) {
		const chunk = rows.slice(Math.round(k * size), Math.round((k + 1) * size))
		fifths.push({ rate: mean(chunk.map((r) => r.po)), teams: chunk.length, lo: Math.min(...chunk.map((r) => r.s)), hi: Math.max(...chunk.map((r) => r.s)) })
	}
	const better = rows.filter((r) => (t.higherIsBetter ? r.s > value : r.s < value)).length
	return { fifths, raidersFifth: Math.min(4, Math.floor(better / size)) }
}

const FIFTH_NAMES = ["best fifth", "second fifth", "middle fifth", "fourth fifth", "worst fifth"]
export const fifthName = (k: number): string => FIFTH_NAMES[k] ?? ""

/** One stat, the Raiders' number against the history, for the group the filter picks. Null with too little data. */
export function analyze(meta: Meta, t: Table, season: number, filter: Filter = DEFAULT_FILTER): Analysis | null {
	const n = meta.n
	const measured: number[] = []
	for (let i = 0; i < t.start.length; i++) if (t.start[i] !== null && t.rest[i] !== null) measured.push(i)
	if (measured.length < 100) return null
	const S = (i: number) => t.start[i] as number
	const Rr = (i: number) => t.rest[i] as number

	const base = mean(measured.map(S))
	const kept = slopeOf(measured.map(S), measured.map(Rr))
	const value = t.value
	const above = value >= base
	const good = t.higherIsBetter ? above : !above

	// "Like the Raiders": at least as far from average on the same side, or the closest ones.
	const byDistance = (a: number, b: number) => Math.abs(S(a) - value) - Math.abs(S(b) - value)
	let like = measured.filter((i) => (above ? S(i) >= value : S(i) <= value)).sort(byDistance)
	let kind: Analysis["kind"] = "atLeast"
	if (like.length < MIN_SIMILAR) {
		like = measured.slice().sort(byDistance).slice(0, MIN_SIMILAR)
		kind = "closest"
	} else if (like.length > MAX_SIMILAR) {
		like = like.slice(0, MAX_SIMILAR)
		kind = "closest"
	}
	const likeSet = new Set(like)

	let group = filter.scope === "all" ? measured : measured.filter((i) => likeSet.has(i))
	if (filter.scope === "all") kind = "all"
	if (filter.team) group = group.filter((i) => abbrOf(meta.teams[i]) === filter.team)
	if (filter.playoffs !== "any") group = group.filter((i) => (meta.po[i] === 1) === (filter.playoffs === "made"))
	if (filter.years.length) {
		const keep = new Set(filter.years)
		group = group.filter((i) => keep.has(seasonOf(meta.teams[i])))
	}
	const inGroup = new Set(group)

	const rows: Row[] = measured.map((i) => ({
		i,
		start: S(i),
		rest: Rr(i),
		inGroup: inGroup.has(i),
		toward: Math.abs(Rr(i) - base) < Math.abs(S(i) - base),
		po: meta.po[i] === 1,
		raiders: isRaiders(meta.teams[i]),
	}))
	const members = rows.filter((r) => r.inGroup)
	const toward = members.length ? members.filter((r) => r.toward).length / members.length : NaN
	const avgStart = mean(members.map((r) => r.start))
	const avgRest = mean(members.map((r) => r.rest))
	const restSorted = members.map((r) => r.rest).sort((a, b) => a - b)
	const band: [number, number] = [quantile(restSorted, 0.25), quantile(restSorted, 0.75)]
	const typical = base + kept * (value - base)
	const outcomes = outcomesFor(meta, group, measured)
	const { fifths, raidersFifth } = fifthsOf(meta, { start: t.start, higherIsBetter: t.higherIsBetter }, value)

	// Keep the axis to the bulk of the data so one freak season does not squash everything else.
	const all = rows.flatMap((r) => [r.start, r.rest]).sort((a, b) => a - b)
	const lo = Math.min(quantile(all, 0.004), value, base, typical)
	const hi = Math.max(quantile(all, 0.996), value, base, typical)
	const pad = (hi - lo) * 0.05 || 0.01
	const domain: [number, number] = [lo - pad, hi + pad]

	const fmt = (v: number) => formatStat(t, v)
	const earlierRows = members.filter((r) => r.raiders)
	const how = good ? "well" : "poorly"
	const filtered = filter.scope === "all" || !!filter.team || filter.playoffs !== "any" || filter.years.length > 0
	const when = filter.years.length ? yearsText(filter.years) : `since ${meta.first}`
	const who =
		(filter.team ? `${teamName(filter.team)} team-seasons` : "teams") +
		(filter.playoffs === "made" ? " that made the playoffs" : filter.playoffs === "missed" ? " that missed the playoffs" : "")
	const headline = !filtered
		? kind === "atLeast"
			? `${members.length} teams since ${meta.first} started at least as ${how} as the ${season} Raiders at ${t.short} through ${n} games. ${pctText(toward)} finished the year closer to average.`
			: `The ${members.length} teams since ${meta.first} closest to the ${season} Raiders' ${t.short} through ${n} games. ${pctText(toward)} finished the year closer to average.`
		: members.length
			? `${members.length} ${who} ${when}${filter.scope === "like" ? `, among those that started ${kind === "closest" ? "closest to" : `at least as ${how} as`} the Raiders at ${t.short}` : ""}. They averaged ${fmt(avgStart)} through ${n} games and ${fmt(avgRest)} after.`
			: `No ${who}${filter.years.length ? ` ${when}` : ""} match these filters. Try widening them.`
	const sub = `Each dot is one team in one season: its ${t.unit} through its first ${n} games, then over the rest of that season. The Raiders are at ${fmt(value)}, ${ordinalOf(t.rank)} of 32 teams.`

	return {
		key: t.key,
		label: t.label,
		short: t.short,
		unit: t.unit,
		fmt: t.fmt,
		higherIsBetter: t.higherIsBetter,
		n,
		value,
		valueText: fmt(value),
		rank: t.rank,
		good,
		base,
		rows,
		kind,
		filter,
		groupSize: members.length,
		avgStart,
		avgRest,
		toward,
		band,
		typical,
		kept: Math.min(1, Math.max(0, kept)),
		verdict: verdictFor(kept, good),
		earlier: { count: earlierRows.length, toward: earlierRows.filter((r) => r.toward).length },
		outcomes,
		winsLine: winsLine(outcomes, n),
		fifths,
		raidersFifth,
		domain,
		headline,
		sub,
		startText: fmt(avgStart),
		restText: fmt(avgRest),
		baseText: fmt(base),
		typicalText: fmt(typical),
	}
}

/** One row of the Raiders' playoff checklist: where they stand on a stat and how teams standing there did. */
export type CheckRow = { key: string; label: string; rank: number; valueText: string; fifth: number; rate: number; teams: number; spread: number; /** Playoff rate of the best fifth of teams on this stat and of the worst. */ best: number; worst: number; family: Table["family"] }

/**
 * Every stat, sorted by how much it has mattered for making the playoffs (the playoff rate of the best fifth of
 * teams minus the worst fifth), with the playoff rate of the fifth the Raiders are in.
 */
export function checklist(meta: Meta, tables: Table[]): CheckRow[] {
	return tables
		.flatMap((t) => {
			const { fifths, raidersFifth } = fifthsOf(meta, t, t.value)
			if (fifths.some((f) => !Number.isFinite(f.rate))) return []
			return [{ key: t.key, label: t.label, rank: t.rank, valueText: formatStat(t, t.value), fifth: raidersFifth, rate: fifths[raidersFifth].rate, teams: fifths[raidersFifth].teams, spread: fifths[0].rate - fifths[4].rate, best: fifths[0].rate, worst: fifths[4].rate, family: t.family }]
		})
		.sort((a, b) => b.spread - a.spread)
}

/** How a team-season looked, in a line for a tooltip or a table. */
export function seasonLine(meta: Meta, i: number, t: Pick<Table, "fmt" | "start" | "rest">): string {
	const g = seasonGames(seasonOf(meta.teams[i]))
	const s = t.start[i]
	const r = t.rest[i]
	const rec = recordText(meta.startWins[i], meta.startLosses[i], meta.n)
	const fin = recordText(meta.wins[i], meta.losses[i], g)
	return `${teamLabel(meta.teams[i])}: ${s === null ? "n/a" : formatStat(t, s)} through ${meta.n} games (${rec}), ${r === null ? "n/a" : formatStat(t, r)} after. Finished ${fin}${meta.po[i] ? ", made the playoffs" : ", missed the playoffs"}.`
}
