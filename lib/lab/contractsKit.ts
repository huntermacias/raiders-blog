import { type PlayerGroup, type PlayerRow, type PlayersData, GROUP_META, isEarly, ordinal, overall, rowsFor } from "./playersKit"

// Money for the Player Lab: what a player is paid, how that ranks at his job, and how his pay compares with how he has played.
// Pure functions over the two data files, so the profile, the compare page and the value board all say the same thing.
// Every figure is in millions of dollars. The numbers are kept by hand (see scripts/lab/build_contracts.py) and carry an "as of" date.

export type ContractTerms = {
	/** When it was signed: a year, or a full date. */
	signed?: string
	years?: number
	/** The last season the contract runs. */
	through?: number
	total?: number
	/** Fully guaranteed money at signing, as OverTheCap reports it. */
	guaranteed?: number
	rookie?: boolean
	capByYear?: Record<string, number>
	note?: string
	url?: string
}
export type ContractRow = { team: string; name: string; pos: string | null; apy: number | null; cap: number; terms?: ContractTerms }
export type ContractsData = {
	season: number
	asOf: string
	salaryCap: number
	teams: string[]
	sources: { name: string; url: string; for: string }[]
	players: ContractRow[]
}

export type Deal = {
	slug: string
	team: string
	row: ContractRow
	/** Average per year over the contract; null for a kicker, punter or snapper the source gives none for. */
	apy: number | null
	/** What he counts against his team's cap this season. */
	cap: number
	/** The yearly figure used to line players up: his APY when there is one, otherwise this year's cap hit. */
	pay: number
	/** This year's cap hit as a share of the league cap, 0 to 1. */
	capPct: number
	through: number | null
	total: number | null
	guaranteed: number | null
	guaranteedPct: number | null
}

/** A pool smaller than this is not ranked: "3rd of 4" says nothing. */
export const MIN_POOL = 6
/** The value read needs a bigger pool and a clear gap, or it says "about what he is paid". */
export const MIN_VALUE_POOL = 8
export const VALUE_GAP = 25

// ---------------------------------------------------------------------------------------------- formatting

/** "$35.5M", "$106.5M", "$448M", "$945K". The source rounds to $0.1M, so nothing is shown to the dollar. */
export function money(m: number): string {
	if (m < 1) return `$${Math.round(m * 1000)}K`
	const t = m.toFixed(1)
	return `$${m >= 100 ? t.replace(/\.0$/, "") : t}M`
}

export function sharePct(x: number): string {
	const v = x * 100
	return v < 0.1 ? "<0.1%" : `${v < 10 ? v.toFixed(1) : Math.round(v)}%`
}

// ---------------------------------------------------------------------------------------------- matching a contract to a player

const SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv", "v"])

/** A name with the things that differ between sources taken out: case, accents, dots, apostrophes, hyphens and Jr./III. */
/** Names the grades and the cap pages spell differently (a nickname on one side). Keys and values are already in nameKey form. */
const ALIASES: Record<string, string> = {
	"sauce gardner": "ahmad gardner",
	"riq woolen": "tariq woolen",
}

export function nameKey(name: string): string {
	const k = plainKey(name)
	return ALIASES[k] ?? k
}

function plainKey(name: string): string {
	const base = name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[.'’`]/g, "")
		.replace(/-/g, " ")
		.split(/\s+/)
		.filter(Boolean)
	while (base.length > 1 && SUFFIX.has(base[base.length - 1])) base.pop()
	return base.join(" ")
}

function shortKey(name: string): string {
	const parts = nameKey(name).split(" ")
	return parts.length > 1 ? `${parts[0][0]} ${parts[parts.length - 1]}` : parts[0]
}

const cache = new WeakMap<PlayersData, WeakMap<ContractsData, Map<string, Deal>>>()

function toDeal(slug: string, row: ContractRow, season: number, salaryCap: number): Deal {
	const t = row.terms
	const total = t?.total ?? null
	const guaranteed = t?.guaranteed ?? null
	return {
		slug,
		team: row.team,
		row,
		apy: row.apy,
		cap: row.cap,
		pay: row.apy ?? row.cap,
		capPct: row.cap / salaryCap,
		through: t?.through ?? null,
		total,
		guaranteed,
		guaranteedPct: total && guaranteed !== null ? Math.min(1, guaranteed / total) : null,
	}
}

/** Every contract we hold, keyed by the player's slug. A contract with no player in the grades (a rookie not yet on the field, a practice-squad name) is left out. */
export function dealsBySlug(data: PlayersData, contracts: ContractsData): Map<string, Deal> {
	let inner = cache.get(data)
	if (!inner) cache.set(data, (inner = new WeakMap()))
	const hit = inner.get(contracts)
	if (hit) return hit

	const byTeam = new Map<string, Map<string, string>>()
	const byShort = new Map<string, Map<string, string[]>>()
	for (const p of data.players) {
		const k = nameKey(p.name)
		if (!byTeam.has(p.team)) byTeam.set(p.team, new Map())
		byTeam.get(p.team)!.set(k, p.slug)
		const sk = shortKey(p.name)
		if (!byShort.has(p.team)) byShort.set(p.team, new Map())
		const m = byShort.get(p.team)!
		m.set(sk, [...(m.get(sk) ?? []), p.slug])
	}

	const out = new Map<string, Deal>()
	for (const row of contracts.players) {
		let slug = byTeam.get(row.team)?.get(nameKey(row.name))
		if (!slug) {
			// "D.J." and "DJ", "Chris" and "Christopher": fall back to first initial and last name, but only when that is unambiguous on his team.
			const c = Array.from(new Set(byShort.get(row.team)?.get(shortKey(row.name)) ?? []))
			if (c.length === 1) slug = c[0]
		}
		if (slug && !out.has(slug)) out.set(slug, toDeal(slug, row, contracts.season, contracts.salaryCap))
	}
	inner.set(contracts, out)
	return out
}

export function dealFor(data: PlayersData, contracts: ContractsData, slug: string): Deal | null {
	return dealsBySlug(data, contracts).get(slug) ?? null
}

// ---------------------------------------------------------------------------------------------- pools and ranks

/** "all 32 teams", or how many we hold while the file is partial. */
export function coverageWords(contracts: ContractsData): string {
	const n = contracts.teams.length
	return n >= 32 ? "all 32 teams" : `${n} teams so far`
}

/** The row that stands for a player when money is compared: his main job, not a return role. */
export function mainRow(data: PlayersData, slug: string): PlayerRow | null {
	const rows = rowsFor(data, slug)
	return rows.find((r) => r.group !== "kr" && r.group !== "pr") ?? rows[0] ?? null
}

type PoolEntry = { p: PlayerRow; deal: Deal }

/** Everyone at one job we hold a contract for. */
export function payPool(data: PlayersData, contracts: ContractsData, group: PlayerGroup): PoolEntry[] {
	const deals = dealsBySlug(data, contracts)
	const out: PoolEntry[] = []
	const seen = new Set<string>()
	for (const p of data.players) {
		if (p.group !== group || seen.has(p.slug)) continue
		const main = mainRow(data, p.slug)
		if (!main || main.group !== group) continue
		const deal = deals.get(p.slug)
		if (!deal) continue
		seen.add(p.slug)
		out.push({ p: main, deal })
	}
	return out
}

export type PayRank = { rank: number; of: number; byCap: boolean }

/** How his yearly pay ranks among the players at his job we track (1 is the highest paid); null when too few are tracked to mean anything. */
export function payRank(data: PlayersData, contracts: ContractsData, slug: string): PayRank | null {
	const main = mainRow(data, slug)
	const deal = dealFor(data, contracts, slug)
	if (!main || !deal) return null
	const pool = payPool(data, contracts, main.group)
	if (pool.length < MIN_POOL) return null
	const better = pool.filter((e) => e.deal.pay > deal.pay).length
	return { rank: better + 1, of: pool.length, byCap: deal.apy === null }
}

export type ValueVerdict = "underpaid" | "fair" | "overpaid"
export type Value = {
	/** His rank by overall grade among the tracked players at his job who have both a grade and a contract (1 is best). */
	gradeRank: number
	/** His rank by yearly pay among the same players (1 is the highest paid). */
	payRank: number
	of: number
	/** Grade percentile minus pay percentile, in points: above zero means he has played better than his pay ranks. */
	gap: number
	verdict: ValueVerdict | null
	early: boolean
}

/**
 * Grade against pay, among the same group of players: the tracked players at his job who have both a grade and a contract.
 * A player whose grade is still an early read gets the ranks but no verdict.
 */
export function valueFor(data: PlayersData, contracts: ContractsData, slug: string): Value | null {
	const main = mainRow(data, slug)
	if (!main) return null
	const pool = payPool(data, contracts, main.group)
		.map((e) => ({ ...e, o: overall(e.p) }))
		.filter((e): e is PoolEntry & { o: number } => e.o !== null)
	if (pool.length < MIN_POOL) return null
	const me = pool.find((e) => e.p.slug === slug)
	if (!me) return null
	const n = pool.length
	const gradeRank = pool.filter((e) => e.o > me.o).length + 1
	const payRankV = pool.filter((e) => e.deal.pay > me.deal.pay).length + 1
	const pct = (r: number) => (n > 1 ? ((n - r) / (n - 1)) * 100 : 50)
	const gap = pct(gradeRank) - pct(payRankV)
	const early = isEarly(data, me.p)
	const verdict: ValueVerdict | null = early || n < MIN_VALUE_POOL ? null : gap >= VALUE_GAP ? "underpaid" : gap <= -VALUE_GAP ? "overpaid" : "fair"
	return { gradeRank, payRank: payRankV, of: n, gap, verdict, early }
}

export const VERDICT_WORD: Record<ValueVerdict, string> = {
	underpaid: "Playing above his pay",
	fair: "About what he is paid",
	overpaid: "Paid above his play so far",
}

/** Every player at one job with a grade and a contract, the biggest bargain first and the early reads last. */
export function valueBoard(data: PlayersData, contracts: ContractsData, group: PlayerGroup): { p: PlayerRow; deal: Deal; value: Value }[] {
	const out: { p: PlayerRow; deal: Deal; value: Value }[] = []
	for (const e of payPool(data, contracts, group)) {
		if (overall(e.p) === null) continue
		const value = valueFor(data, contracts, e.p.slug)
		if (value) out.push({ p: e.p, deal: e.deal, value })
	}
	// Players with a settled grade come first; an early read follows, since its gap says little yet.
	return out.sort((a, b) => Number(a.value.early) - Number(b.value.early) || b.value.gap - a.value.gap)
}

// ---------------------------------------------------------------------------------------------- words

/** The sentence that opens a player's money section. */
export function dealSentence(name: string, d: Deal): string {
	const t = d.row.terms
	const parts: string[] = []
	if (d.apy !== null) {
		const through = d.through ? `, through ${d.through}` : ""
		const size = t?.total && t.years ? `${t.years} years and ${money(t.total)}` : t?.total ? `${money(t.total)} in all` : null
		parts.push(size ? `${name}'s deal is ${size}${through}, ${money(d.apy)} a year.` : `${name} is paid ${money(d.apy)} a year${through}.`)
	} else {
		parts.push(`${name} counts ${money(d.cap)} against the cap this season.`)
	}
	if (d.guaranteed !== null && d.guaranteed > 0) parts.push(`${money(d.guaranteed)} of it is guaranteed${d.guaranteedPct !== null ? `, ${Math.round(d.guaranteedPct * 100)}% of the total` : ""}.`)
	if (t?.rookie) parts.push("It is a rookie contract, so the pay is set by where he was drafted.")
	return parts.join(" ")
}

/** "3rd-highest paid of 12 quarterbacks we track". */
export function payRankPhrase(group: PlayerGroup, r: PayRank): string {
	const peers = GROUP_META[group].peers
	return r.rank === 1 ? `Highest paid of the ${r.of} ${peers} we track` : `${ordinal(r.rank)}-highest paid of the ${r.of} ${peers} we track`
}

export function valueSentence(name: string, group: PlayerGroup, v: Value): string {
	const peers = GROUP_META[group].peers
	const base = `Among the ${v.of} ${peers} we have a grade and a contract for, ${name} is ${ordinal(v.gradeRank)} on the field and ${ordinal(v.payRank)} in pay.`
	if (v.early) return `${base} His grade is still an early read, so this says nothing yet about whether his pay is fair.`
	if (!v.verdict) return `${base} That pool is too small to call it a bargain or a bust.`
	if (v.verdict === "underpaid") return `${base} He has played better than his pay ranks.`
	if (v.verdict === "overpaid") return `${base} His pay ranks higher than his play has so far.`
	return `${base} Those are close, so his pay is about right for how he has played.`
}

// ---------------------------------------------------------------------------------------------- compare

export type MoneyRow = {
	key: string
	label: string
	a: string
	b: string
	/** The two numbers behind the text, for drawing bars; null where one side has none. */
	an: number | null
	bn: number | null
	/** Whether the two sizes are worth drawing as bars (a dollar amount, yes; a year, no). */
	bars: boolean
	note?: string
}

/** The money rows of a comparison. A row is left out when neither player has the number. */
export function moneyRows(a: Deal | null, b: Deal | null, ra: PayRank | null, rb: PayRank | null): MoneyRow[] {
	const rows: MoneyRow[] = []
	const add = (key: string, label: string, av: number | null, bv: number | null, fmt: (n: number) => string, note?: string, bars = true) => {
		if (av === null && bv === null) return
		rows.push({ key, label, a: av === null ? (a ? "not on file" : "not tracked") : fmt(av), b: bv === null ? (b ? "not on file" : "not tracked") : fmt(bv), an: av, bn: bv, bars, note })
	}
	add("apy", "Average per year", a?.apy ?? null, b?.apy ?? null, money, "What the contract pays on average each year.")
	add("cap", "Cap hit this season", a?.cap ?? null, b?.cap ?? null, money, "What he counts against his team's cap in 2026. It can be far from the average year on a deal that is backloaded.")
	add("capPct", "Share of the cap", a?.capPct ?? null, b?.capPct ?? null, sharePct, "This season's cap hit as a share of the league cap.")
	add("total", "Total value", a?.total ?? null, b?.total ?? null, money)
	add("guaranteed", "Guaranteed money", a?.guaranteed ?? null, b?.guaranteed ?? null, money, "Fully guaranteed at signing, as OverTheCap reports it.")
	add("through", "Under contract through", a?.through ?? null, b?.through ?? null, (n) => String(n), undefined, false)
	if (ra || rb) {
		rows.push({
			key: "rank",
			label: "Pay rank at his job",
			a: ra ? `${ra.rank} of ${ra.of}` : "not ranked",
			b: rb ? `${rb.rank} of ${rb.of}` : "not ranked",
			an: ra ? ra.of - ra.rank + 1 : null,
			bn: rb ? rb.of - rb.rank + 1 : null,
			bars: false,
			note: "Among the players at that job we hold a contract for, 1 is the highest paid.",
		})
	}
	return rows
}
