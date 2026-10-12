import { describe, expect, it } from "vitest"

import { getPlayers } from "../../lib/lab/data"
import { getPlayerLogs } from "../../lib/lab/playerData"
import {
	BOX,
	GROUP_META,
	GROUP_ORDER,
	HEADLINE,
	STAT,
	type PlayerLog,
	type PlayerRow,
	ageOn,
	bioFacts,
	boardFor,
	boards,
	confidenceOf,
	contextOf,
	gameLog,
	heightText,
	initialsOf,
	leaders,
	logoUrl,
	headshotUrl,
	percentileBars,
	pctFromRank,
	rankPhrase,
	roleOf,
	rowsFor,
	search,
	searchIndex,
	seasonWord,
	snapsOutOf10,
	tierOf,
	topPhrase,
	trailLine,
	winSentence,
	yardPos,
} from "../../lib/lab/playersKit"

const data = getPlayers()
const logs = getPlayerLogs()

describe("saying where a number sits", () => {
	it("names ranks and tiers in plain words", () => {
		expect(rankPhrase(1, 38)).toBe("1st of 38")
		expect(rankPhrase(22, 40)).toBe("22nd of 40")
		expect(topPhrase(2, 40)).toBe("Top 5%")
		expect(topPhrase(39, 40)).toBe("Bottom 5%")
		expect(tierOf(95)).toBe("elite")
		expect(tierOf(50)).toBe("typical")
		expect(tierOf(5)).toBe("worst")
		expect(pctFromRank(1, 11)).toBe(100)
		expect(pctFromRank(11, 11)).toBe(0)
		expect(pctFromRank(1, 1)).toBe(50)
	})

	it("always puts better on the right of a strip, including for stats where lower is better", () => {
		const y = { n: 30, mean: 5, sd: 2, q: [2, 3.5, 5, 6.5, 8] as [number, number, number, number, number] }
		expect(yardPos(8, y, true)).toBeGreaterThan(yardPos(2, y, true))
		expect(yardPos(2, y, false)).toBeGreaterThan(yardPos(8, y, false))
		expect(yardPos(2, y, true)).toBe(0)
		expect(yardPos(8, y, true)).toBe(1)
	})

	it("calls a change clear only when it is well beyond the noise", () => {
		expect(confidenceOf(2.4)).toBe("clear")
		expect(confidenceOf(-2.4)).toBe("clear")
		expect(confidenceOf(1)).toBe("leaning")
		expect(confidenceOf(0.2)).toBe("noise")
		expect(confidenceOf(undefined)).toBe("noise")
	})

	it("describes the season-to-date trail as its own measure, not the recent form", () => {
		expect(trailLine([[1, 0, 1, null], [2, 0, 1, 80], [3, 0, 1, 30]])).toMatch(/^Season rank slipped: 80th to 30th percentile since Wk 2\.$/)
		expect(trailLine([[2, 0, 1, 40], [3, 0, 1, 44]])).toMatch(/holding near the 44th percentile/)
		expect(trailLine([[1, 0, 1, null]])).toBe("")
	})
})

describe("playing time in words", () => {
	const row = (form: [number, number, number] | null, earlier: [number, number, number] | null) => ({ snaps: { season: null, form, earlier } }) as unknown as PlayerRow

	it("tells a player back from a missed game from one whose role grew", () => {
		// Missed 2 of 2 earlier games, then played the one game since: back, not "a bigger role".
		const back = roleOf(row([0.8, 1, 1], [0, 0, 2]))
		expect(back?.kind).toBe("back")
		expect(back?.detail).toMatch(/missed 2 games earlier/)
		expect(back?.detail).toMatch(/about 8 of every 10 plays/)
		const out = roleOf(row([0, 0, 2], [0.9, 3, 3]))
		expect(out?.kind).toBe("out")
		expect(roleOf(row([0.9, 2, 2], [0.5, 3, 3]))?.kind).toBe("bigger")
		expect(roleOf(row([0.4, 2, 2], [0.8, 3, 3]))?.kind).toBe("smaller")
		expect(roleOf(row([0.82, 2, 2], [0.8, 3, 3]))).toBeNull()
	})

	it("turns a share into plays out of ten", () => {
		expect(snapsOutOf10(0.8)).toBe("about 8 of every 10 plays")
		expect(snapsOutOf10(0.99)).toBe("nearly every play")
		expect(snapsOutOf10(0.02)).toBe("almost no plays")
	})
})

describe("who he is", () => {
	it("makes the image addresses from ids and team codes", () => {
		expect(headshotUrl(4432665)).toBe("https://a.espncdn.com/i/headshots/nfl/players/full/4432665.png")
		expect(logoUrl("LV")).toBe("https://a.espncdn.com/i/teamlogos/nfl/500/lv.png")
		expect(logoUrl("WAS")).toBe("https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png")
	})

	it("works out age, height and the season of his career", () => {
		expect(ageOn("2002-12-13", new Date(Date.UTC(2026, 9, 12)))).toBe(23)
		expect(ageOn("2002-12-13", new Date(Date.UTC(2026, 11, 13)))).toBe(24)
		expect(ageOn("nope", new Date())).toBeNull()
		expect(heightText(75)).toBe(`6'3"`)
		expect(heightText(undefined)).toBeNull()
		expect(seasonWord(0)).toBe("Rookie")
		expect(seasonWord(2)).toBe("3rd NFL season")
		expect(initialsOf("Brock Bowers")).toBe("BB")
		expect(initialsOf("T.J. Hockenson")).toBe("TH")
		expect(initialsOf("Cher")).toBe("C")
	})

	it("lists only the facts the roster file has", () => {
		const facts = bioFacts({ ht: 75, wt: 235, college: "Georgia", draft: ["LV", 13, 2024], exp: 2 }, new Date(Date.UTC(2026, 9, 12)))
		expect(facts.map((f) => f.label)).toEqual(["Height", "Weight", "College", "Drafted", "Experience"])
		expect(facts.find((f) => f.label === "Drafted")?.value).toBe("2024, No. 13 overall (LV)")
		expect(bioFacts({ exp: 1 }, new Date()).find((f) => f.label === "Drafted")?.value).toBe("Not drafted")
		expect(bioFacts(undefined, new Date())).toEqual([])
	})

	it("has a bio and a headshot id for nearly everyone it ranks", () => {
		const slugs = Array.from(new Set(data.players.map((p) => p.slug)))
		const withBio = slugs.filter((s) => logs.bio[s])
		expect(withBio.length / slugs.length).toBeGreaterThan(0.9)
		const withPhoto = data.players.filter((p) => p.espn)
		expect(withPhoto.length / data.players.length).toBeGreaterThan(0.9)
	})
})

describe("does it show up in winning?", () => {
	it("says so only when the best games really went with winning, and says when they did not", () => {
		const strong = winSentence({ n: 150, t: [0.28, 0.41, 0.84] }, "Quarterback", "EPA per dropback")
		expect(strong).toMatch(/teams won 84% of the time/)
		expect(strong).toMatch(/28% when he was in the worst third/)
		expect(strong).toMatch(/EPA per dropback/)
		expect(winSentence({ n: 150, t: [0.46, 0.5, 0.52] }, "Tight end", "Drop rate")).toMatch(/has not lined up much/)
		expect(winSentence({ n: 10, t: [0, 0.5, 1] }, "Tight end", "x")).toBeNull()
		expect(winSentence(undefined, "Tight end", "x")).toBeNull()
	})

	it("is built from real league games: more wins when the number is better, never a made-up share", () => {
		for (const [g, byStat] of Object.entries(logs.win)) {
			expect(GROUP_ORDER).toContain(g)
			for (const [k, w] of Object.entries(byStat ?? {})) {
				expect(STAT[g as keyof typeof STAT][k], `${g}.${k}`).toBeTruthy()
				expect(w.n).toBeGreaterThanOrEqual(30)
				for (const share of w.t) {
					expect(share).toBeGreaterThanOrEqual(0)
					expect(share).toBeLessThanOrEqual(1)
				}
			}
		}
		// Quarterbacks are the clearest case in football: the best third of games should win more than the worst.
		const qb = logs.win.qb?.epaDb
		if (qb) expect(qb.t[2]).toBeGreaterThan(qb.t[0])
	})
})

describe("the percentile profile and the game log", () => {
	const star = data.players.filter((p) => p.group === "te").sort((a, b) => b.stats.length - a.stats.length)[0]

	it("lists every graded stat best first, each between 0 and 100", () => {
		const bars = percentileBars(data, star)
		expect(bars.length).toBeGreaterThan(2)
		for (const b of bars) {
			expect(b.pct).toBeGreaterThanOrEqual(0)
			expect(b.pct).toBeLessThanOrEqual(100)
		}
		expect(bars.map((b) => b.pct)).toEqual(bars.map((b) => b.pct).sort((a, b) => b - a))
		// A style stat is never graded, so it is not a bar.
		expect(bars.every((b) => STAT.te[b.k].higher !== null)).toBe(true)
	})

	it("builds one row per game with the opponent, how it ended and his numbers that game", () => {
		const log = logs.logs[star.slug]?.te as PlayerLog
		const rows = gameLog(data, star, log, logs.res)
		expect(rows.length).toBeGreaterThan(0)
		expect(rows.map((r) => r.week)).toEqual(rows.map((r) => r.week).sort((a, b) => a - b))
		for (const r of rows) {
			if (r.result) expect(r.result).toMatch(/^[WLT] \d+–\d+$/)
			expect(r.won === null || typeof r.won === "boolean").toBe(true)
		}
		expect(gameLog(data, star, undefined, logs.res)).toEqual([])
	})

	it("agrees with the box totals: the game by game adds up to the season", () => {
		let checked = 0
		for (const p of data.players) {
			const b = logs.logs[p.slug]?.[p.group]?.b
			if (!b) continue
			for (const [k, pts] of Object.entries(b)) {
				if (p.box[k] === undefined) continue
				const sum = pts.reduce((a, x) => a + x[1], 0)
				expect(Math.abs(sum - p.box[k]), `${p.name} ${p.group} ${k}`).toBeLessThan(0.51)
				checked++
			}
		}
		expect(checked).toBeGreaterThan(100)
	})
})

describe("the catalog matches the data", () => {
	it("has a label, a unique url and a headline for every stat the build writes", () => {
		for (const g of GROUP_ORDER) {
			const yard = data.yard[g] ?? {}
			for (const k of Object.keys(yard)) expect(STAT[g][k], `${g}.${k} is in the data but not in the catalog`).toBeTruthy()
			if (data.players.some((p) => p.group === g)) expect(HEADLINE[g] in yard, `${g} headline`).toBe(true)
			const paths = boards(g).map((b) => b.path)
			expect(new Set(paths).size, `${g} paths`).toBe(paths.length)
			for (const b of boards(g)) expect(boardFor(g, b.path)).toEqual(b)
			expect(GROUP_META[g].peers).toBeTruthy()
		}
	})

	it("only grades a stat the catalog says is graded, and every player's stat is in his group's catalog", () => {
		for (const p of data.players) for (const s of p.stats) expect(STAT[p.group][s.k], `${p.name} ${p.group}.${s.k}`).toBeTruthy()
		for (const b of Object.keys(BOX)) expect(GROUP_ORDER).toContain(b)
	})

	it("ranks a board by the stat and says 'league rank' even when filtered to a team", () => {
		const board = boards("te")[0]
		const all = leaders(data, board)
		expect(all[0].rank).toBe(1)
		const team = all[3].player.team
		const filtered = leaders(data, board, { team })
		expect(filtered.every((r) => r.player.team === team)).toBe(true)
		expect(filtered.find((r) => r.player.slug === all[3].player.slug)?.rank).toBe(all[3].rank)
	})
})

describe("finding people", () => {
	const index = searchIndex(data)

	it("has one entry per person and finds by full name, last name and misspelled-free prefix", () => {
		expect(new Set(index.map((e) => e.slug)).size).toBe(index.length)
		const e = index.find((x) => x.name.includes(" "))!
		const last = e.name.split(" ").slice(-1)[0]
		expect(search(index, e.name).map((x) => x.slug)).toContain(e.slug)
		expect(search(index, last.slice(0, 4)).length).toBeGreaterThan(0)
		expect(search(index, "")).toEqual([])
		expect(search(index, "zzzzqq")).toEqual([])
	})

	it("opens the same person under every role he plays", () => {
		const multi = Array.from(new Set(data.players.map((p) => p.slug))).find((s) => rowsFor(data, s).length > 1)
		if (multi) expect(new Set(rowsFor(data, multi).map((r) => r.group)).size).toBeGreaterThan(1)
	})
})

describe("context on one number", () => {
	it("gives a rank, a tier and a range for a graded stat, and no grade for a style stat", () => {
		const p = data.players.find((x) => x.group === "qb" && x.stats.length)!
		for (const s of p.stats) {
			const c = contextOf(data, p, s)!
			if (STAT.qb[s.k].higher === null) {
				expect(c.tier).toBeNull()
				expect(c.stylePct).not.toBeNull()
			} else {
				expect(c.rank).toBeGreaterThan(0)
				expect(c.of).toBeGreaterThanOrEqual(c.rank!)
				expect(c.tier).not.toBeNull()
			}
		}
	})
})
