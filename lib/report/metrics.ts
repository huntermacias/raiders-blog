// The measures a game report sets side by side, and how each one is read: which way is better, how it is written, and what it is
// called when a game is the best or worst of the Raiders' season. One list feeds the head-to-head rows, the "what stands out"
// findings and the share card, so a number is worded the same wherever it appears. Pure: no imports from the site.

import type { BoxTeam } from "../lab/types"

export type MetricKey =
	| "epa"
	| "success"
	| "earlySuccess"
	| "epaRush"
	| "epaPass"
	| "explosive"
	| "rushYds"
	| "passYds"
	| "ypp"
	| "yards"
	| "third"
	| "redZone"
	| "giveaways"
	| "sacks"
	| "penalties"
	| "earlyRunShare"

export type Metric = {
	key: MetricKey
	label: string
	/** One plain line on what the number is. */
	help: string
	/** true: a higher number is better for the offense; false: lower is better; null: neither (style). */
	higherBetter: boolean | null
	/** The number used for ranking and bars. null when the game has too few plays to say. */
	value: (b: BoxTeam) => number | null
	/** How it is written on the page. */
	text: (b: BoxTeam) => string
	/** "signed": can be negative, drawn as a dot on a line. "share": a part of 100%. "count": a pile that grows. */
	kind: "signed" | "share" | "count"
	/** The scouting-file key the season rank comes from, when there is one. */
	season?: "epa" | "epaPass" | "epaRush" | "success" | "explosive" | "third" | "redZone" | "sackRate" | "turnovers"
}

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null)
export const signed = (v: number, digits = 2): string => `${v < 0 ? "−" : v > 0 ? "+" : ""}${Math.abs(v).toFixed(digits)}`
export const percent = (v: number): string => `${Math.round(v * 100)}%`

export const METRICS: Metric[] = [
	{
		key: "epa",
		label: "Points added per play",
		help: "Expected points added (EPA): how much each snap moved the scoreboard compared with an average snap from the same spot. Above zero is good.",
		higherBetter: true,
		value: (b) => b.epa,
		text: (b) => (b.epa == null ? "—" : signed(b.epa)),
		kind: "signed",
		season: "epa",
	},
	{
		key: "success",
		label: "Success rate",
		help: "The share of plays that gained what the down needed: 40% of the yards on 1st down, 60% on 2nd, all of it on 3rd or 4th.",
		higherBetter: true,
		value: (b) => b.success,
		text: (b) => (b.success == null ? "—" : percent(b.success)),
		kind: "share",
		season: "success",
	},
	{
		key: "earlySuccess",
		label: "Early-down success",
		help: "Success rate on first and second down, before the defense knows what is coming.",
		higherBetter: true,
		value: (b) => b.earlySuccess,
		text: (b) => (b.earlySuccess == null ? "—" : percent(b.earlySuccess)),
		kind: "share",
	},
	{
		key: "epaRush",
		label: "Rushing, per carry",
		help: "Expected points added on each designed run and scramble.",
		higherBetter: true,
		value: (b) => (b.rushAtt >= 5 ? b.epaRush : null),
		text: (b) => (b.epaRush == null ? "—" : signed(b.epaRush)),
		kind: "signed",
		season: "epaRush",
	},
	{
		key: "epaPass",
		label: "Passing, per dropback",
		help: "Expected points added on each pass play, sacks included.",
		higherBetter: true,
		value: (b) => (b.dropbacks >= 10 ? b.epaPass : null),
		text: (b) => (b.epaPass == null ? "—" : signed(b.epaPass)),
		kind: "signed",
		season: "epaPass",
	},
	{
		key: "explosive",
		label: "Explosive plays",
		help: "Runs of 10 yards or more and passes of 20 or more.",
		higherBetter: true,
		value: (b) => b.explosive,
		text: (b) => String(b.explosive),
		kind: "count",
		season: "explosive",
	},
	{
		key: "rushYds",
		label: "Rushing yards",
		help: "Yards on runs, scrambles included, counted from the play-by-play.",
		higherBetter: true,
		value: (b) => b.rushYds,
		text: (b) => `${b.rushYds} on ${b.rushAtt}`,
		kind: "count",
	},
	{
		key: "passYds",
		label: "Passing yards",
		help: "Net yards on pass plays, sacks taken out.",
		higherBetter: true,
		value: (b) => b.passYds,
		text: (b) => String(b.passYds),
		kind: "count",
	},
	{
		key: "ypp",
		label: "Yards per play",
		help: "Net yards divided by plays from scrimmage.",
		higherBetter: true,
		value: (b) => b.ypp,
		text: (b) => (b.ypp == null ? "—" : b.ypp.toFixed(1)),
		kind: "count",
	},
	{
		key: "yards",
		label: "Total yards",
		help: "Net yards from scrimmage, counted from the play-by-play, so it can sit a few yards off the official box score.",
		higherBetter: true,
		value: (b) => b.yards,
		text: (b) => String(b.yards),
		kind: "count",
	},
	{
		key: "third",
		label: "3rd down",
		help: "Third downs converted.",
		higherBetter: true,
		value: (b) => ratio(b.thirdConv, b.thirdAtt),
		text: (b) => `${b.thirdConv} of ${b.thirdAtt}`,
		kind: "share",
		season: "third",
	},
	{
		key: "redZone",
		label: "Red zone",
		help: "Drives that reached the opponent's 20 and ended in a touchdown.",
		higherBetter: true,
		value: (b) => ratio(b.redZoneTds, b.redZoneTrips),
		text: (b) => `${b.redZoneTds} of ${b.redZoneTrips}`,
		kind: "share",
		season: "redZone",
	},
	{
		key: "giveaways",
		label: "Giveaways",
		help: "Interceptions thrown and fumbles lost.",
		higherBetter: false,
		value: (b) => b.giveaways,
		text: (b) => String(b.giveaways),
		kind: "count",
		season: "turnovers",
	},
	{
		key: "sacks",
		label: "Sacks taken",
		help: "Times the quarterback went down behind the line.",
		higherBetter: false,
		value: (b) => b.sacks,
		text: (b) => String(b.sacks),
		kind: "count",
		season: "sackRate",
	},
	{
		key: "penalties",
		label: "Penalty yards",
		help: "Yards lost to flags on this team, accepted penalties only.",
		higherBetter: false,
		value: (b) => b.penaltyYards,
		text: (b) => `${b.penalties} for ${b.penaltyYards}`,
		kind: "count",
	},
	{
		key: "earlyRunShare",
		label: "Early-down runs",
		help: "The share of first- and second-down plays that were runs. Neither high nor low is better; it shows how the game went.",
		higherBetter: null,
		value: (b) => b.earlyRunShare,
		text: (b) => (b.earlyRunShare == null ? "—" : percent(b.earlyRunShare)),
		kind: "share",
	},
]

export const METRIC: Record<MetricKey, Metric> = Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<MetricKey, Metric>

/** The rows of the head-to-head, in the order they are read: how the offense played, then how it moved, then what hurt it. */
export const HEAD_TO_HEAD: MetricKey[] = ["epa", "success", "earlySuccess", "epaRush", "epaPass", "explosive", "rushYds", "ypp", "third", "redZone", "giveaways", "sacks", "penalties", "earlyRunShare"]

/** Which side a row favors. Equal, missing or style rows favor no one. */
export function winner(m: Metric, me: number | null, opp: number | null): "me" | "opp" | null {
	if (m.higherBetter === null || me == null || opp == null || me === opp) return null
	return (me > opp) === m.higherBetter ? "me" : "opp"
}
