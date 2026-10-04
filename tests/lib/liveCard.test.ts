import satori from "satori"
import { Resvg } from "@resvg/resvg-js"
import { describe, expect, it, vi } from "vitest"

// The first render parses the embedded fonts, which can be slow on a cold machine.
vi.setConfig({ testTimeout: 90_000 })

import { parseScoreboard, parseSummary } from "../../lib/live/espn"
import type { LiveGame, LiveGameInfo } from "../../lib/live/types"
import { OG_HEIGHT, OG_WIDTH, renderCard } from "../../lib/og/cards"
import { ogFonts } from "../../lib/og/fonts"
import {
	RAIDERS_SILVER,
	buildLiveSpec,
	chartPaths,
	contrastOnBg,
	downsample,
	liftForDark,
	quarterAt,
	sideColors,
	storyLine,
	type LiveCardSpec,
} from "../../lib/og/liveCard"
import { scoreboard, summary } from "../stubs/liveFeed"


const board = parseScoreboard(scoreboard)
const info = (id: string): LiveGameInfo => board.find((g) => g.id === id)!
const LV_KC = "401872980"

function game(over: Partial<LiveGameInfo> = {}, id = LV_KC): LiveGame {
	const base = info(id)
	const merged = { ...base, ...over }
	const raw = id === LV_KC ? structuredClone(summary) : { boxscore: { teams: [] }, drives: { previous: [] } }
	return parseSummary(raw, merged)
}

describe("colors", () => {
	it("lifts a dark team color until it reads on the card's ground", () => {
		const navy = "#241773"
		expect(contrastOnBg(navy)).toBeLessThan(3.4)
		const lifted = liftForDark(navy)
		expect(contrastOnBg(lifted)).toBeGreaterThanOrEqual(3.4)
		expect(lifted).not.toBe(navy)
	})
	it("leaves a color that already reads alone", () => {
		expect(liftForDark("#FFB612")).toBe("#ffb612")
	})
	it("makes the Raiders silver and keeps two similar teams apart", () => {
		const lv = info(LV_KC).away
		const kc = info(LV_KC).home
		expect(sideColors(lv, kc).away).toBe(RAIDERS_SILVER)
		// Two reds: the home side is moved off the away side's color.
		const a = { ...kc, abbr: "KC" }
		const h = { ...kc, abbr: "SF" }
		const c = sideColors(a, h)
		expect(c.away).not.toBe(c.home)
	})
})

describe("small helpers", () => {
	it("names the quarter from elapsed seconds", () => {
		expect(quarterAt(0)).toBe("Q1")
		expect(quarterAt(899)).toBe("Q1")
		expect(quarterAt(900)).toBe("Q2")
		expect(quarterAt(3599)).toBe("Q4")
		expect(quarterAt(3700)).toBe("OT")
	})
	it("downsamples without losing the ends", () => {
		const xs = Array.from({ length: 1000 }, (_, i) => i)
		const out = downsample(xs, 300)
		expect(out).toHaveLength(300)
		expect(out[0]).toBe(0)
		expect(out[out.length - 1]).toBe(999)
		expect(downsample([1, 2, 3], 300)).toEqual([1, 2, 3])
	})
	it("tells the story from the winner's lowest point", () => {
		const comeback: [number, number][] = [[0, 0.5], [1200, 0.1], [2000, 0.6], [3600, 1]]
		expect(storyLine(comeback, 20, 27, "Chiefs")).toBe("Down to 10% in Q2, then the Chiefs took it back.")
		const wire: [number, number][] = [[0, 0.6], [1800, 0.8], [3600, 1]]
		expect(storyLine(wire, 10, 31, "Chiefs")).toBe("Never in doubt.")
		const close: [number, number][] = [[0, 0.5], [1800, 0.45], [3600, 1]]
		expect(storyLine(close, 20, 24, "Chiefs")).toBe("A one-score game to the end.")
		expect(storyLine(close, 10, 24, "Chiefs")).toBe("The Chiefs pulled away.")
		expect(storyLine([], 17, 17, "Chiefs")).toBe("Neither side could pull away.")
		// the away team won: their number is 1 - home
		const awayWin: [number, number][] = [[0, 0.5], [2700, 0.9], [3600, 0]]
		expect(storyLine(awayWin, 24, 10, "Raiders")).toBe("Down to 10% in Q4, then the Raiders took it back.")
	})
})

describe("chartPaths", () => {
	it("is empty for no data and otherwise starts and ends on the series", () => {
		expect(chartPaths([], 3600).line).toBe("")
		const p = chartPaths([[0, 0.5], [1800, 0.9], [3600, 0.1]], 3600)
		expect(p.line.startsWith("M")).toBe(true)
		expect(p.line.match(/L/g)).toHaveLength(2)
		expect(p.area.endsWith("Z")).toBe(true)
		// the last point is inside the card with room for the dot
		expect(p.endX).toBeLessThan(1056)
		expect(p.endX).toBeGreaterThan(1000)
	})
	it("puts a higher win probability higher on the card", () => {
		const hi = chartPaths([[0, 0.9]], 3600).endY
		const lo = chartPaths([[0, 0.1]], 3600).endY
		expect(hi).toBeLessThan(lo)
	})
	it("stretches the axis for overtime without leaving the card", () => {
		const p = chartPaths([[0, 0.5], [4200, 0.7]], 4200)
		expect(p.endX).toBeLessThan(1056)
	})
})

describe("buildLiveSpec", () => {
	it("builds a live card: score, clock, situation and the leader's number", () => {
		const s = buildLiveSpec(game())
		expect(s.state).toBe("in")
		expect(s.chip.text).toBe("Live")
		expect(s.away.abbr).toBe("LV")
		expect(s.away.nick).toBe("Raiders")
		expect(s.away.score).toBe(20)
		expect(s.home.score).toBe(17)
		expect(s.center.kicker).toBe("Q3")
		expect(s.center.main).toBe("4:12")
		expect(s.bottom.label).toBe("Now")
		expect(s.bottom.text).toMatch(/2nd & 7/)
		expect(s.series.length).toBeGreaterThan(1)
		expect(s.series[0][0]).toBe(0)
		for (const [, wp] of s.series) {
			expect(wp).toBeGreaterThanOrEqual(0)
			expect(wp).toBeLessThanOrEqual(1)
		}
		expect(s.right.value).toMatch(/^\d+%$/)
	})

	it("names the side that leads in the right-hand block", () => {
		const s = buildLiveSpec(game())
		const leader = s.homeWp >= 0.5 ? s.home : s.away
		expect(s.right.label).toBe(`${leader.abbr} win probability`)
	})

	it("builds a pregame card from the line, with no chart data", () => {
		const s = buildLiveSpec(game({ state: "pre", home: { ...info(LV_KC).home, score: 0 }, away: { ...info(LV_KC).away, score: 0 } }))
		expect(s.state).toBe("pre")
		expect(s.series).toEqual([])
		expect(s.swing).toBeNull()
		expect(s.chip.text).toBe("Kickoff")
		expect(s.bottom.label).toBe("The line")
		expect(s.bottom.text).toContain("KC -3.5")
		expect(s.bottom.text).toContain("O/U 47.5")
		expect(s.homeWp).toBeGreaterThan(0.5) // KC is the favorite at home
	})

	it("falls back to plain words with no odds", () => {
		const s = buildLiveSpec(game({ state: "pre", odds: null }))
		expect(s.bottom.text).toMatch(/Win probability and every play/)
	})

	it("builds a final card with a winner, a story and the end of the line at 0 or 100", () => {
		const s = buildLiveSpec(game({ state: "post", period: 4, clockSeconds: 0, detail: "Final", away: { ...info(LV_KC).away, score: 24 }, home: { ...info(LV_KC).home, score: 27 } }))
		expect(s.state).toBe("post")
		expect(s.winner).toBe("home")
		expect(s.chip.text).toBe("Final")
		expect(s.center.main).toBe("Final")
		expect(s.bottom.label).toBe("The story")
		expect(s.bottom.text.length).toBeGreaterThan(5)
		expect(s.series[s.series.length - 1][1]).toBe(1)
	})

	it("marks a tied final without a winner and an overtime final as such", () => {
		const tie = buildLiveSpec(game({ state: "post", period: 5, away: { ...info(LV_KC).away, score: 20 }, home: { ...info(LV_KC).home, score: 20 } }))
		expect(tie.winner).toBeNull()
		expect(tie.center.main).toBe("Final/OT")
	})

	it("only marks a swing that's big, and never a two-point try or a flag", () => {
		const s = buildLiveSpec(game({ state: "post", period: 4, away: { ...info(LV_KC).away, score: 24 }, home: { ...info(LV_KC).home, score: 27 } }))
		if (s.swing) {
			expect(s.swing.label).toMatch(/^(TOUCHDOWN|TURNOVER|FIELD GOAL|SACK|BIG PLAY) · Q[1-4]|OT · [+−]\d+$/)
			expect(s.swing.wp).toBeGreaterThanOrEqual(0)
			expect(s.swing.wp).toBeLessThanOrEqual(1)
		}
	})

	it("handles a game with no plays yet without throwing", () => {
		const s = buildLiveSpec(game({}, "401872964"))
		expect(s.type).toBe("live")
		expect(Array.isArray(s.series)).toBe(true)
	})
})

// ---- rendering ---------------------------------------------------------------------------

async function png(spec: LiveCardSpec): Promise<{ width: number; height: number; bytes: number }> {
	const svg = await satori(renderCard(spec), { width: OG_WIDTH, height: OG_HEIGHT, fonts: ogFonts() })
	const img = new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } }).render()
	return { width: img.width, height: img.height, bytes: img.asPng().length }
}

const base = (): LiveCardSpec => buildLiveSpec(game())

describe("renderLiveCard", () => {
	const specs: [string, () => LiveCardSpec][] = [
		["live", base],
		["pregame", () => buildLiveSpec(game({ state: "pre" }))],
		["final", () => buildLiveSpec(game({ state: "post", period: 4, away: { ...info(LV_KC).away, score: 35 }, home: { ...info(LV_KC).home, score: 27 } }))],
		["final in overtime", () => buildLiveSpec(game({ state: "post", period: 5, away: { ...info(LV_KC).away, score: 30 }, home: { ...info(LV_KC).home, score: 27 } }))],
		["a tie", () => buildLiveSpec(game({ state: "post", away: { ...info(LV_KC).away, score: 17 }, home: { ...info(LV_KC).home, score: 17 } }))],
		["a game with neither the Raiders", () => ({ ...base(), away: { ...base().away, abbr: "IND", nick: "Colts", color: "#7aa7e6" }, home: { ...base().home, abbr: "WAS", nick: "Commanders", color: "#e0a4a4" } })],
		["a swing at the far left and a long situation", () => ({ ...base(), swing: { el: 30, wp: 0.95, label: "TOUCHDOWN · Q1 · +40", color: "#cfd3d6" }, bottom: { label: "Now", text: "1st & Goal at the opponent 2 yard line with a very long description that keeps going and going" } })],
		["a swing at the far right in the lower half", () => ({ ...base(), swing: { el: 3590, wp: 0.05, label: "TURNOVER · Q4 · −45", color: "#d9c28f" } })],
		["three-digit scores and a long nickname", () => ({ ...base(), away: { ...base().away, nick: "Commanders", score: 101 }, home: { ...base().home, nick: "Buccaneers", score: 100 } })],
	]
	it.each(specs)("draws a 1200x630 PNG for %s", async (_label, make) => {
		const out = await png(make())
		expect(out.width).toBe(1200)
		expect(out.height).toBe(630)
		expect(out.bytes).toBeGreaterThan(20_000)
	})

	it("draws different cards for different states", async () => {
		const a = await png(base())
		const b = await png(buildLiveSpec(game({ state: "pre" })))
		expect(a.bytes).not.toBe(b.bytes)
	})
})
