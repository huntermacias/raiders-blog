import { GROUPS, GROUP_ORDER, type GroupKey, type InjuryPlayer, type UnitTeam, type UnitsData } from "../../lib/lab/unitsKit"

export const ABBRS = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH"]

/**
 * A made-up league. Team i is the (i+1)th best at every stat, unless `rank` says otherwise, so AAA is first at
 * everything and HHH is last. `rank(team, group, stat)` can return another place.
 */
export function fakeUnits(opts: { rank?: (abbr: string, group: GroupKey, stat: string) => number | undefined; abbrs?: string[] } = {}): UnitsData {
	const abbrs = opts.abbrs ?? ABBRS
	const teams: Record<string, UnitTeam> = {}
	abbrs.forEach((abbr, i) => {
		const groups = {} as UnitTeam["groups"]
		for (const g of GROUP_ORDER) {
			const stats: UnitTeam["groups"][GroupKey]["stats"] = {}
			for (const key of Object.keys(GROUPS[g].stats)) {
				const rank = opts.rank?.(abbr, g, key) ?? i + 1
				stats[key] = { v: 1 - rank / 100, rank }
			}
			groups[g] = { score: 100 - i * 10, rank: i + 1, stats, leaders: [{ name: `${abbr} ${g} star`, pos: "XX", stat: "epaDb", v: 0.1, n: 30 }] }
		}
		teams[abbr] = {
			g: 4,
			w: 3,
			l: 1,
			t: 0,
			pf: 100,
			pa: 80,
			overall: { off: { v: 0.1, rank: i + 1 }, def: { v: -0.1, rank: i + 1 } },
			groups,
			style: {
				off: { proe: { v: 1, rank: i + 1 }, playAction: { v: 0.2, rank: i + 1 }, motion: { v: 0.5, rank: i + 1 }, noHuddle: { v: 0.05, rank: i + 1 }, shotgun: { v: 0.6, rank: i + 1 } },
				def: { blitz: { v: 0.3, rank: i + 1 }, rushers: { v: 4.2, rank: i + 1 }, loadedBox: { v: 0.1, rank: i + 1 } },
			},
			coach: {
				name: `Coach ${abbr}`,
				career: { w: 10, l: 5, t: 0, n: 15 },
				withTeam: { w: 8, l: 4, t: 0, since: 2024 },
				ats: { season: { w: 3, l: 1, p: 0 }, career: { w: 8, l: 6, p: 1 }, favorite: { w: 4, l: 3, p: 0 }, underdog: { w: 4, l: 3, p: 1 } },
				bye: { w: 1, l: 0, t: 0 },
				vs: Object.fromEntries(
					abbrs
						.filter((o) => o !== abbr)
						.map((o) => [o, { coach: `Coach ${o}`, coachMeet: { w: 1, l: 2, t: 0, n: 3 }, teamMeet: { w: 5, l: 6, t: 0, n: 11 }, recent: [{ season: 2025, week: 3, pf: 20, pa: 17 }] }]),
				),
			},
			injuries: { week: 4, players: [] },
		}
	})
	return {
		season: 2026,
		week: 4,
		generatedAt: "2026-10-08T00:00:00Z",
		source: "nflverse data, CC BY 4.0.",
		teams,
		slate: { week: 5, games: [{ away: abbrs[0], home: abbrs[1], day: "2026-10-11", time: "13:00", spread: 3.5, total: 44.5 }] },
	}
}

export const hurt = (over: Partial<InjuryPlayer> = {}): InjuryPlayer => ({ name: "Hurt Harry", pos: "G", group: "ol", status: "Out", injury: "Knee", starter: true, snap: 0.95, ...over })
