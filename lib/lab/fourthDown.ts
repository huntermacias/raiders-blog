// Fourth-down decisions, graded against what happens in similar spots. The numbers come from
// scripts/lab/build_fourth_down.py: for each fourth down, the typical win probability afterwards for
// going for it, punting and kicking a field goal, from 2019 to last season. They are estimates, and
// every page that shows them says so.

import { getFourthDown } from "./data"

export type Choice = "go" | "punt" | "fg"
export type Verdict = "best" | "toss-up" | "questionable" | "costly"

export type Option = { wp: number; n: number; p?: number }

export type Decision = {
	q: number
	clk: string
	el: number
	ytg: number
	/** Yards from the opponent's goal line. */
	yl: number
	/** Score difference from the Raiders' side. */
	sd: number
	wp: number | null
	text: string
	chosen: Choice
	result: "converted" | "failed" | "punted" | "made" | "missed"
	options: Partial<Record<Choice, Option>>
	best: Choice | null
	cost: number | null
	verdict: Verdict | null
}

export type FourthGame = {
	id: string
	week: number
	opp: string
	decisions: Decision[]
	summary: { decisions: number; graded: number; bestOrClose: number; leftOnTable: number }
}

export type FourthDownData = {
	season: number
	team: string
	generatedAt: string
	source: string
	history: { from: number; to: number; plays: number }
	games: FourthGame[]
}

export const CAVEAT =
	"These are estimates. They compare each choice with what happened after similar fourth downs in 2019 to last season, weighted by distance, field position, score and time left. Teams mostly go for it when things look good, so going for it can look a little better than it really is. Spots with too little history behind them are not graded, and a gap of a point or two is a coin flip."

export function fourthGameFor(week: number): FourthGame | null {
	return getFourthDown().games.find((g) => g.week === week) ?? null
}

/** "4th & 2 at the opp 29" / "4th & 11 at own 35". */
export function spotText(d: Pick<Decision, "ytg" | "yl">): string {
	const side = d.yl > 50 ? `own ${100 - d.yl}` : d.yl === 50 ? "midfield" : `opp ${d.yl}`
	return `4th & ${d.ytg} · ${side}`
}

export function choiceText(c: Choice, result?: Decision["result"]): string {
	if (c === "go") return result === "converted" ? "Went for it, converted" : result === "failed" ? "Went for it, failed" : "Went for it"
	if (c === "fg") return result === "missed" ? "Field goal, missed" : result === "made" ? "Field goal, made" : "Field goal"
	return "Punted"
}

/** The choice in a phrase that fits "would have been better": "going for it". */
export function choicePhrase(c: Choice): string {
	return c === "go" ? "going for it" : c === "fg" ? "kicking a field goal" : "punting"
}

export const VERDICTS: Record<Verdict, { label: string; short: string; tone: "good" | "even" | "warn" | "bad" }> = {
	best: { label: "Best call", short: "Best", tone: "good" },
	"toss-up": { label: "Toss-up", short: "Toss-up", tone: "even" },
	questionable: { label: "Questionable", short: "Questionable", tone: "warn" },
	costly: { label: "Costly", short: "Costly", tone: "bad" },
}

/** Points of win probability, one decimal below ten: "3.5 pts". */
export function ptsText(fraction: number): string {
	const v = Math.abs(fraction) * 100
	return `${v < 10 ? v.toFixed(1) : Math.round(v)} pts`
}

/** The sentence under a decision. */
export function explain(d: Decision): string {
	if (!d.verdict) return "Not graded: too few similar situations, or the game was already decided."
	if (d.verdict === "best") return "This was the best option the history supports."
	if (!d.best) return ""
	const chosen = d.options[d.chosen]
	const best = d.options[d.best]
	if (!chosen || !best) return ""
	const base = `Similar teams did about ${ptsText(best.wp - chosen.wp)} better ${choicePhrase(d.best)}`
	if (d.verdict === "toss-up") return `${base}. That is inside the noise, so call it a toss-up.`
	return `${base} (${Math.round(best.wp * 100)}% vs ${Math.round(chosen.wp * 100)}% win probability afterwards).`
}

/** Headline numbers for one game. */
export function gameLine(g: FourthGame): string {
	const s = g.summary
	if (s.graded === 0) return "No graded fourth downs"
	if (s.leftOnTable <= 0) return `${s.bestOrClose} of ${s.graded} fourth downs were the best call or a toss-up`
	return `${ptsText(s.leftOnTable)} of win probability left on the table`
}

/** The decisions most worth showing, costliest first. */
export function costliest(g: FourthGame, count = 3): Decision[] {
	return g.decisions
		.filter((d) => d.verdict === "questionable" || d.verdict === "costly")
		.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))
		.slice(0, count)
}

/** The decisions worth showing on a card when nothing was wrong: the boldest graded ones (going for it). */
export function boldest(g: FourthGame, count = 3): Decision[] {
	return g.decisions.filter((d) => d.verdict && d.chosen === "go").slice(0, count)
}

export type SeasonTotals = { games: number; decisions: number; graded: number; bestOrClose: number; leftOnTable: number; wentFor: number; converted: number }

export function seasonTotals(games: FourthGame[]): SeasonTotals {
	const all = games.flatMap((g) => g.decisions)
	const go = all.filter((d) => d.chosen === "go")
	return {
		games: games.length,
		decisions: all.length,
		graded: games.reduce((n, g) => n + g.summary.graded, 0),
		bestOrClose: games.reduce((n, g) => n + g.summary.bestOrClose, 0),
		leftOnTable: games.reduce((n, g) => n + g.summary.leftOnTable, 0),
		wentFor: go.length,
		converted: go.filter((d) => d.result === "converted").length,
	}
}
