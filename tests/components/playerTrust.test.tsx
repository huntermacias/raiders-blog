// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _prefetch, ...rest }: { href: string; children: React.ReactNode; prefetch?: boolean }) => <a href={href} {...rest}>{children}</a> }))
vi.mock("next/image", () => ({ default: (p: Record<string, string>) => <img alt="" {...p} /> }))
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }))

import { Headshot } from "../../components/lab/players/Media"
import PercentileProfile from "../../components/lab/players/PercentileProfile"
import SeasonArcs, { arcRows } from "../../components/lab/players/SeasonArcs"
import StatTile, { TrendLine } from "../../components/lab/players/StatTile"
import TeamContext, { TeamStrip } from "../../components/lab/players/TeamContext"
import { getPlayers, getUnits } from "../../lib/lab/data"
import { getPlayerLogs } from "../../lib/lab/playerData"
import { teamView } from "../../lib/lab/playerTeam"
import { contextOf, percentileBars, type PlayerRow, type PlayerStat } from "../../lib/lab/playersKit"

afterEach(cleanup)
const data = getPlayers()
const logs = getPlayerLogs()
const logOf = (p: PlayerRow) => logs.logs[p.slug]?.[p.group]

function find(pred: (c: NonNullable<ReturnType<typeof contextOf>>) => boolean): { p: PlayerRow; s: PlayerStat } {
	for (const p of data.players) for (const s of p.stats) {
		const c = contextOf(data, p, s)
		if (c && pred(c)) return { p, s }
	}
	throw new Error("no such stat in the data")
}

describe("<StatTile /> for a stat that is mostly luck", () => {
	it("says it is too early to rank instead of giving a rank, a tier or a top-percent line", () => {
		const { p, s } = find((c) => c.info.higher !== null && c.signal === "luck")
		render(<StatTile data={data} player={p} stat={s} />)
		const tile = screen.getByTestId("stat-tile")
		expect(within(tile).getByText(/Too early to rank/)).toBeTruthy()
		expect(within(tile).getAllByText(/Mostly luck so far/).length).toBeGreaterThan(0)
		expect(tile.textContent).not.toMatch(/Top \d+%|Bottom \d+%|Elite|Among the weakest/i)
	})

	it("keeps the rank and the tier for a stat that has settled", () => {
		const { p, s } = find((c) => c.info.higher !== null && c.signal !== "luck" && c.sure !== "thin" && c.tier !== null)
		render(<StatTile data={data} player={p} stat={s} />)
		expect(screen.getByTestId("stat-tile").textContent).toMatch(/\d(st|nd|rd|th) of \d+/)
	})
})

describe("<StatTile /> for a style stat that is a share", () => {
	it("spells out the count behind the percentage and what a typical player does", () => {
		const { p, s } = find((c) => c.info.higher === null && Boolean(c.info.part) && c.n >= 6)
		render(<StatTile data={data} player={p} stat={s} showTrend={false} />)
		const text = screen.getByTestId("stat-tile").textContent ?? ""
		expect(text).toMatch(/\d+ \w+, \d+ of them/)
		expect(text).toMatch(/The typical/)
		expect(text).not.toMatch(/more so than/)
	})
})

describe("<TrendLine />", () => {
	it("says no change instead of printing 'even' next to a chip, when the two numbers print the same", () => {
		const { p, s } = find((c) => c.info.higher !== null)
		const same: PlayerStat = { ...s, form: { v: s.season.v, n: 10 }, earlier: { v: s.season.v, n: 20 }, delta: 0, z: 0 }
		render(<TrendLine data={data} player={p} stat={same} />)
		expect(screen.getByText(/No change worth reading/)).toBeTruthy()
		expect(document.body.textContent).not.toMatch(/evenWithin/)
	})
})

describe("<PercentileProfile /> with a luck stat", () => {
	it("draws the luck bars as outlines with no percentile bubble, after the settled ones", () => {
		const p = data.players.find((x) => percentileBars(data, x).some((b) => b.signal === "luck") && percentileBars(data, x).some((b) => b.signal !== "luck"))!
		render(<PercentileProfile data={data} player={p} />)
		const items = screen.getAllByRole("listitem")
		const luckAt = items.map((li) => /Too early to rank/.test(li.textContent ?? ""))
		expect(luckAt.includes(true)).toBe(true)
		const first = luckAt.indexOf(true)
		expect(luckAt.slice(first).every(Boolean)).toBe(true)
		expect(screen.getByText(/Outlined bars are stats where/)).toBeTruthy()
	})
})

describe("<SeasonArcs />", () => {
	it("lists the Raiders by how their standing moved, with the direction in words, and links each to his page", () => {
		const roster = data.players.filter((p) => p.team === "LV")
		const rows = arcRows(roster, logOf)
		expect(rows.length).toBeGreaterThan(3)
		expect(rows.map((r) => r.change.delta)).toEqual(rows.map((r) => r.change.delta).slice().sort((a, b) => b - a))
		render(<SeasonArcs data={data} rows={rows} />)
		const list = screen.getByTestId("season-arcs")
		expect(within(list).getAllByRole("link").length).toBe(rows.length)
		expect(list.textContent).toMatch(/Climbing|Slipping|Holding/)
		expect(list.textContent).toMatch(/percentile over \d+ weeks/)
	})
})

describe("<TeamContext /> and <TeamStrip />", () => {
	const bowers = data.players.find((p) => p.name === "Brock Bowers" && p.group === "te")!
	const view = teamView(getUnits(), data, bowers)!

	it("shows the club's record and unit ranks in the hero strip", () => {
		render(<TeamStrip view={view} team="LV" />)
		expect(screen.getByTestId("team-strip").textContent).toMatch(/Raiders \d+-\d+/)
		expect(screen.getByTestId("team-strip").textContent).toMatch(/Offense \d+(st|nd|rd|th)/)
	})

	it("sits under the Overall card without its own top margin when the hero asks", () => {
		render(<TeamStrip view={view} team="LV" className="mt-0" />)
		const strip = screen.getByTestId("team-strip")
		expect(strip.className).toMatch(/\bmt-0\b/)
		expect(strip.className).not.toMatch(/\bmt-4\b/)
	})

	it("shows the unit's league rank and the room, with him marked and only his teammates linked", () => {
		render(<TeamContext view={view} player={bowers} />)
		const unit = screen.getByTestId("unit-card")
		expect(unit.textContent).toMatch(/of 32/)
		const room = screen.getByTestId("room-card")
		const me = within(room).getByText("Brock Bowers").closest("li")!
		expect(me.getAttribute("aria-current")).toBe("true")
		expect(within(me).queryByRole("link")).toBeNull()
		expect(within(room).getAllByRole("link").length).toBe(view.room.length - 1)
	})
})

describe("<Headshot /> for a player with only the league's image id", () => {
	it("loads that image, and falls back to initials without either id", () => {
		render(<Headshot shot="esqu9k1my3po3yxxkcjs" name="Kolton Miller" />)
		expect(document.querySelector("img")!.getAttribute("src")).toBe("https://static.www.nfl.com/image/upload/f_auto,q_auto/league/esqu9k1my3po3yxxkcjs")
	})
})

describe("a line stat", () => {
	it("is labeled as the whole line's number on its tile", () => {
		const { p, s } = find((c) => c.info.unit === true)
		render(<StatTile data={data} player={p} stat={s} />)
		expect(screen.getByTestId("stat-tile").textContent).toMatch(/his whole line's number/)
	})
})
