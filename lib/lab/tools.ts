// The Lab's tools, in one list. The hub (/lab), the "More from the Lab" strip at the bottom of each tool page and the Lab menu
// in the site header all read it, so a new tool is added in one place and shows up in all three. Pure: no data, no clock.

export type LabGroupId = "start" | "raiders" | "league"

export type LabTool = {
	id: string
	href: string
	title: string
	/** One line, for the header menu and the "More from the Lab" strip. */
	short: string
	/** A sentence or two, for the hub's cards. */
	text: string
	group: LabGroupId
	/** Shows a "New" badge. Take it off when the tool has been out a few weeks. */
	isNew?: boolean
	/** The tool changes every week: "slate" follows the week being played, "results" follows the weeks already played. */
	weekly?: "slate" | "results"
}

export const LAB_GROUPS: { id: LabGroupId; title: string; blurb: string }[] = [
	{ id: "start", title: "Start here", blurb: "The ones you will probably come back to every week." },
	{ id: "raiders", title: "The Raiders", blurb: "This season's games, plays and opponents." },
	{ id: "league", title: "League and history", blurb: "How the Raiders compare with every team, now and since 1999." },
]

export const LAB_TOOLS: LabTool[] = [
	{
		id: "playoff-machine",
		href: "/lab/playoff-machine",
		title: "NFL Playoff Machine",
		short: "Pick every game left and watch the seeds, bracket and playoff odds move.",
		text: "Pick the winner of every game left, and watch the standings, seeds and bracket update with the real tiebreakers. See the playoff odds and what your team needs. Follow the Raiders or any team, and share your scenario.",
		group: "start",
		isNew: true,
		weekly: "results",
	},
	{
		id: "rooting-guide",
		href: "/lab/rooting-guide",
		title: "Sunday Rooting Guide",
		short: "Which games to root for, ranked by how much each moves your team's playoff odds.",
		text: "Pick any of the 32 teams and a goal (make the playoffs, win the division or get the No. 1 seed), and see every game still to play ranked by how much it changes your chances, with who to root for and why. Updated as final scores come in.",
		group: "start",
		isNew: true,
		weekly: "results",
	},
	{
		id: "matchups",
		href: "/lab/matchups",
		title: "This week's matchups",
		short: "Every game on the slate, position group by position group.",
		text: "Every game on the slate, position group by position group: who has the edge at quarterback, on the line and in coverage.",
		group: "start",
		weekly: "slate",
	},
	{
		id: "top-plays",
		href: "/lab/top-plays",
		title: "Top plays",
		short: "The snaps that moved the Raiders' chance to win the most.",
		text: "The snaps that moved the Raiders' chance to win the furthest this season.",
		group: "raiders",
	},
	{
		id: "scouting",
		href: "/lab/scouting",
		title: "Scouting reports",
		short: "Where the Raiders have the edge on every opponent.",
		text: "Where the Raiders have the edge on every opponent, and what to watch.",
		group: "raiders",
		weekly: "slate",
	},
	{
		id: "teams",
		href: "/lab/teams",
		title: "How all 32 teams stack up",
		short: "Quarterback, line, receivers and coverage, ranked across the league.",
		text: "Quarterback, line, receivers, run game, pass rush, run defense and coverage, ranked across the league.",
		group: "league",
	},
	{
		id: "will-it-last",
		href: "/lab/will-it-last",
		title: "Will it last?",
		short: "The Raiders' hottest and coldest stats, against teams since 1999.",
		text: "The Raiders' hottest and coldest stats, against every team since 1999 that started the same way.",
		group: "league",
	},
	{
		id: "season-twins",
		href: "/lab/season-twins",
		title: "Season twins",
		short: "The past teams that looked the most like these Raiders.",
		text: "The past teams that looked the most like the Raiders so far, laid over them stat by stat, and how their seasons ended.",
		group: "league",
	},
]

/** The tools in a group, in list order. */
export const toolsIn = (group: LabGroupId): LabTool[] => LAB_TOOLS.filter((t) => t.group === group)

/** Every tool except the page the reader is on. `current` is a path; a page under a tool (a matchup under /lab/matchups) counts as that tool. */
export function otherTools(current: string | null | undefined): LabTool[] {
	const here = current ?? ""
	return LAB_TOOLS.filter((t) => !(here === t.href || here.startsWith(`${t.href}/`)))
}

export type LabWeeks = {
	/** The week of the slate being previewed, or null when there is none. */
	slate: number | null
	/** The last week with results, or null when none are in. */
	results: number | null
}

/** The small tags on a tool's card: "New", then the week it is showing. */
export function toolBadges(tool: LabTool, weeks: LabWeeks): string[] {
	const out: string[] = []
	if (tool.isNew) out.push("New")
	if (tool.weekly === "slate" && weeks.slate) out.push(`Week ${weeks.slate}`)
	if (tool.weekly === "results" && weeks.results) out.push(`Through week ${weeks.results}`)
	return out
}
