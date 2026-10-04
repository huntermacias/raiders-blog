// ESPN-shaped sample data for the live page's tests. Shapes follow the public feed as read on
// 2026-10-04; only the fields the site reads are here.

export const team = (id: string, abbreviation: string, displayName: string) => ({ id, abbreviation, displayName })
export const side = (homeAway: "home" | "away", t: ReturnType<typeof team>, score: string, rec = "2-1") => ({
	homeAway,
	id: t.id,
	team: t,
	score,
	records: [{ type: "total", summary: rec }],
})
export const event = (o: { id: string; date: string; state: "pre" | "in" | "post"; detail: string; period?: number; clock?: string; sit?: object; odds?: object[]; home: [string, string, string, string]; away: [string, string, string, string] }) => ({
	id: o.id,
	date: o.date,
	competitions: [
		{
			competitors: [
				side("home", team(o.home[0], o.home[1], o.home[2]), o.home[3]),
				side("away", team(o.away[0], o.away[1], o.away[2]), o.away[3]),
			],
			status: { period: o.period ?? 0, displayClock: o.clock ?? "0:00", type: { state: o.state, detail: o.detail, shortDetail: o.detail } },
			situation: o.sit,
			odds: o.odds,
			venue: { fullName: "Allegiant Stadium" },
			broadcasts: [{ names: ["CBS"] }],
		},
	],
})

export const KC = ["12", "KC", "Kansas City Chiefs"] as const
export const LV = ["13", "LV", "Las Vegas Raiders"] as const
export const WSH = ["28", "WSH", "Washington Commanders"] as const

export const scoreboard = {
	events: [
		event({ id: "401872965", date: "2026-10-04T13:30Z", state: "pre", detail: "Sun 6:30 AM", home: [...WSH, "0"], away: ["11", "IND", "Indianapolis Colts", "0"] }),
		event({
			id: "401872980",
			date: "2026-10-04T20:25Z",
			state: "in",
			detail: "3rd Quarter",
			period: 3,
			clock: "4:12",
			sit: { down: 2, distance: 7, yardsToEndzone: 38, possession: "13", isRedZone: false, downDistanceText: "2nd & 7 at KC 38" },
			odds: [{ details: "KC -3.5", overUnder: 47.5, spread: -3.5, homeTeamOdds: { favorite: true } }],
			home: [...KC, "17"],
			away: [...LV, "20"],
		}),
		event({ id: "401872964", date: "2026-10-02T00:15Z", state: "post", detail: "Final", period: 4, home: ["5", "CLE", "Cleveland Browns", "27"], away: ["23", "PIT", "Pittsburgh Steelers", "24"] }),
	],
}

// A summary shaped like ESPN's: drives.previous plus drives.current, each with plays.
export const play = (id: string, seq: number, o: Record<string, unknown>) => ({
	id,
	sequenceNumber: String(seq),
	type: { text: "Rush" },
	text: "play",
	period: { number: 1 },
	clock: { displayValue: "14:00" },
	awayScore: 0,
	homeScore: 0,
	scoringPlay: false,
	isPenalty: false,
	isTurnover: false,
	statYardage: 0,
	start: { down: 1, distance: 10, yardsToEndzone: 75, team: { id: "13" } },
	end: { down: 2, distance: 8, yardsToEndzone: 73, team: { id: "13" } },
	...o,
})

export const summary = {
	boxscore: {
		teams: [
			{ team: { id: "12" }, statistics: [{ name: "totalYards", displayValue: "250" }, { name: "firstDowns", displayValue: "14" }, { name: "possessionTime", displayValue: "28:10" }] },
			{ team: { id: "13" }, statistics: [{ name: "totalYards", displayValue: "301" }, { name: "firstDowns", displayValue: "17" }, { name: "possessionTime", displayValue: "31:50" }] },
		],
	},
	drives: {
		previous: [
			{
				id: "d1",
				description: "9 plays, 75 yards",
				team: { abbreviation: "LV" },
				displayResult: "Touchdown",
				yards: 75,
				plays: [
					play("p0", 1, { type: { text: "Kickoff" }, text: "kickoff", statYardage: 0 }),
					play("p1", 2, { text: "Run up the middle for 3 yards", statYardage: 3, clock: { displayValue: "13:30" } }),
					play("p2", 3, { type: { text: "Pass Reception" }, text: "Pass deep right for 32 yards 1st down", statYardage: 32, clock: { displayValue: "13:00" }, start: { down: 2, distance: 7, yardsToEndzone: 72, team: { id: "13" } }, end: { down: 1, distance: 10, yardsToEndzone: 40, team: { id: "13" } } }),
					play("p3", 4, { type: { text: "Timeout" }, text: "Timeout #1 by LV" }),
					play("p4", 5, { type: { text: "Passing Touchdown" }, text: "Touchdown pass for 40 yards", statYardage: 40, scoringPlay: true, awayScore: 7, homeScore: 0, clock: { displayValue: "12:10" }, start: { down: 1, distance: 10, yardsToEndzone: 40, team: { id: "13" } }, end: { down: 0, distance: 0, yardsToEndzone: 0, team: { id: "13" } } }),
				],
			},
			{
				id: "d2",
				description: "3 plays, 5 yards",
				team: { abbreviation: "KC" },
				displayResult: "Interception",
				yards: 5,
				plays: [
					play("p5", 6, { type: { text: "Pass Interception Return" }, text: "Pass intercepted", isTurnover: true, awayScore: 7, homeScore: 0, clock: { displayValue: "11:00" }, start: { down: 2, distance: 5, yardsToEndzone: 70, team: { id: "12" } }, end: { down: 1, distance: 10, yardsToEndzone: 60, team: { id: "13" } } }),
				],
			},
		],
		current: {
			id: "d3",
			description: "1 play",
			team: { abbreviation: "LV" },
			displayResult: "",
			yards: 4,
			plays: [play("p6", 7, { text: "Rush for 4 yards", statYardage: 4, period: { number: 3 }, clock: { displayValue: "4:12" }, awayScore: 20, homeScore: 17 })],
		},
	},
}

