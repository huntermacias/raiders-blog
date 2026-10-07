// The parts of "Will it last?" that are plain values and formatting, with no data attached. The chart
// component imports this file (and only this one), so the history data never ships to the browser.

export type Fmt = "epa" | "pct" | "pct1" | "per"

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
	}
}

export function ordinalOf(n: number): string {
	const mod100 = n % 100
	if (mod100 >= 11 && mod100 <= 13) return `${n}th`
	return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`
}

const OLD_RAIDERS = new Set(["OAK", "LV"])

/** "2007 NE" for display. The Raiders were the Oakland team until 2019, so both names mean "Raiders". */
export function teamLabel(row: string): string {
	const [season, abbr = ""] = row.split(" ")
	return `${season} ${OLD_RAIDERS.has(abbr) ? "Raiders" : abbr}`
}

export function isRaiders(row: string): boolean {
	return OLD_RAIDERS.has(row.split(" ")[1] ?? "")
}

export type Dot = { team: string; start: number; rest: number; toward: boolean; raiders: boolean }

export type VerdictId = "fade" | "improve" | "hold" | "linger" | "mixed"

export type StartRecord = { wins: number; losses: number; teams: number; playoffs: number; avgWins: number }

export type Story = {
	key: string
	label: string
	short: string
	unit: string
	fmt: Fmt
	/** Games played, which is also where the history is cut. */
	n: number
	value: number
	valueText: string
	rank: number
	/** The Raiders sit on the good side of average for this stat. */
	good: boolean
	base: number
	dots: Dot[]
	/** "atLeast": every team that started at least this extreme. "closest": the nearest ones, because there were too few or too many. */
	kind: "atLeast" | "closest"
	avgStart: number
	avgRest: number
	/** Share of the dots that finished closer to average than they started, 0 to 1. */
	toward: number
	/** The middle half of where those teams ended up. */
	band: [number, number]
	/** Where a typical team that starts at the Raiders' number finishes, from every team since the start of the history. */
	typical: number
	/** How much of a team's distance from average carried over to the rest of the season, 0 to 1. */
	kept: number
	verdict: { id: VerdictId; text: string }
	earlier: { count: number; toward: number }
	domain: [number, number]
	headline: string
	sub: string
	startText: string
	restText: string
	baseText: string
	typicalText: string
}
