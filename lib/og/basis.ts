// Where the numbers on a card come from, in words short enough for a card's footer. A reader who sees a rank here
// next to one from another site should be able to tell what this one is made of.

export const SOURCES = {
	/** Grades, ranks and edges: built from the plays themselves. */
	grades: "nflverse play-by-play, FTN charting, Pro Football Reference",
	style: "nflverse play-by-play, FTN charting",
	coaches: "nflverse games file",
	injuries: "nflverse injury reports, snap counts",
} as const

/** What goes into each position group's grade, in the card's own words. Keyed like `GROUPS`. */
export const GROUP_BASIS: Record<string, string> = {
	qb: "points per dropback, completions over expected, interceptions, 20+ yard passes",
	ol: "sacks allowed, pressure allowed, yards before contact, runs stuffed",
	rec: "points per target, yards after the catch, drops, tackles broken",
	run: "points per run, success rate, yards after contact, runs of 10+",
	rush: "sacks, pressure, quarterback hits",
	rund: "points allowed per run, runs stuffed, runs of 10+ allowed, missed tackles",
	cov: "points allowed per throw, completions over expected, 20+ yard passes, interceptions, passer rating",
}

export const sourceLine = (source: string, season: number, through: number): string => `Data: ${source} · ${season} through Week ${through}`
