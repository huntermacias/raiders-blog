// Trimmed from ESPN's summary for Chiefs 30, Raiders 27 (event 401872976, Raiders at home).
const ath = (name: string, stats: string[]) => ({ athlete: { displayName: name }, stats })
const group = (name: string, labels: string[], athletes: ReturnType<typeof ath>[]) => ({ name, labels, athletes, totals: [] })

export const finalBox = {
	header: {
		id: "401872976",
		competitions: [
			{
				status: { type: { completed: true, state: "post" } },
				competitors: [
					{ homeAway: "home", team: { id: "13", abbreviation: "LV" }, score: "27", linescores: [{ displayValue: "7" }, { displayValue: "6" }, { displayValue: "0" }, { displayValue: "14" }] },
					{ homeAway: "away", team: { id: "12", abbreviation: "KC" }, score: "30", linescores: [{ displayValue: "7" }, { displayValue: "3" }, { displayValue: "0" }, { displayValue: "20" }] },
				],
			},
		],
	},
	boxscore: {
		teams: [
			{ team: { id: "12" }, statistics: [{ name: "totalYards", displayValue: "399" }, { name: "netPassingYards", displayValue: "210" }, { name: "rushingYards", displayValue: "189" }, { name: "turnovers", displayValue: "0" }, { name: "possessionTime", displayValue: "24:18" }] },
			{ team: { id: "13" }, statistics: [{ name: "totalYards", displayValue: "437" }, { name: "netPassingYards", displayValue: "365" }, { name: "rushingYards", displayValue: "72" }, { name: "turnovers", displayValue: "2" }, { name: "possessionTime", displayValue: "35:42" }] },
		],
		players: [
			{ team: { id: "12" }, statistics: [group("passing", ["C/ATT", "YDS", "AVG", "TD", "INT", "SACKS", "QBR", "RTG"], [ath("Patrick Mahomes", ["15/30", "225", "7.5", "2", "0", "2-15", "65.1", "97.2"])])] },
			{
				team: { id: "13" },
				statistics: [
					group("passing", ["C/ATT", "YDS", "AVG", "TD", "INT", "SACKS", "QBR", "RTG"], [ath("Kirk Cousins", ["31/52", "365", "7.0", "2", "1", "0-0", "76.6", "85.8"])]),
					group("rushing", ["CAR", "YDS", "AVG", "TD", "LONG"], [ath("Ashton Jeanty", ["15", "58", "3.9", "0", "19"]), ath("Dylan Laube", ["2", "9", "4.5", "0", "6"])]),
					group("receiving", ["REC", "YDS", "AVG", "TD", "LONG", "TGTS"], [ath("Brock Bowers", ["6", "86", "14.3", "1", "21", "11"]), ath("Jack Bech", ["4", "70", "17.5", "0", "28", "6"])]),
					group("defensive", ["TOT", "SOLO", "SACKS", "TFL", "PD", "QB HTS", "TD"], [ath("Hezekiah Masses", ["7", "3", "0", "0", "2", "0", "0"]), ath("Maxx Crosby", ["5", "4", "2", "2", "0", "4", "0"]), ath("Practice Squad Guy", ["0", "0", "0", "0", "0", "0", "0"])]),
					group("interceptions", ["INT", "YDS", "TD"], []),
					group("kickReturns", ["NO", "YDS", "AVG", "LONG", "TD"], [ath("Dylan Laube", ["2", "76", "38.0", "53", "0"])]),
					group("puntReturns", ["NO", "YDS", "AVG", "LONG", "TD"], [ath("Malik Benson", ["1", "4", "4.0", "4", "0"])]),
					group("kicking", ["FG", "PCT", "LONG", "XP", "PTS"], [ath("Matt Gay", ["4/4", "100.0", "48", "1/1", "13"])]),
					group("punting", ["NO", "YDS", "AVG", "TB", "In 20", "LONG"], [ath("AJ Cole", ["3", "142", "47.3", "0", "1", "50"])]),
				],
			},
		],
	},
}
