// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import GameLog from "../../components/lab/players/GameLog"
import LeaderTable from "../../components/lab/players/LeaderTable"
import { Headshot, TeamLogo } from "../../components/lab/players/Media"
import PercentileProfile from "../../components/lab/players/PercentileProfile"
import PlayerCard from "../../components/lab/players/PlayerCard"
import PlayerEmbed from "../../components/lab/players/PlayerEmbed"
import PlayerSearch from "../../components/lab/players/PlayerSearch"
import SnapStrip from "../../components/lab/players/SnapStrip"
import StatTile from "../../components/lab/players/StatTile"
import TeamLink from "../../components/lab/players/TeamLink"
import TrackView from "../../components/lab/players/TrackView"
import Yardstick from "../../components/lab/players/Yardstick"
import { getPlayers } from "../../lib/lab/data"
import { getPlayerLogs } from "../../lib/lab/playerData"
import { BOX, boards, gameLog, leaders, searchIndex, type PlayerRow } from "../../lib/lab/playersKit"
import { track } from "@vercel/analytics"

afterEach(cleanup)
const data = getPlayers()
const logs = getPlayerLogs()
const te = data.players.filter((p) => p.group === "te" && p.stats.length >= 4).sort((a, b) => b.games - a.games)[0]

describe("<Headshot /> and <TeamLogo />", () => {
	it("shows the image from the id, and falls back to initials when it fails to load", () => {
		render(<Headshot espn={4432665} name="Brock Bowers" size={56} />)
		const img = document.querySelector("img")!
		expect(img.getAttribute("src")).toBe("https://a.espncdn.com/i/headshots/nfl/players/full/4432665.png")
		act(() => {
			fireEvent.error(img)
		})
		expect(document.querySelector("img")).toBeNull()
		expect(screen.getByText("BB")).toBeTruthy()
	})

	it("shows initials straight away with no photo id, and the team code when a logo fails", () => {
		render(<Headshot name="Maxx Crosby" />)
		expect(screen.getByText("MC")).toBeTruthy()
		cleanup()
		render(<TeamLogo team="LV" size={20} />)
		const img = document.querySelector("img")!
		expect(img.getAttribute("src")).toContain("/lv.png")
		act(() => {
			fireEvent.error(img)
		})
		expect(screen.getByText("LV")).toBeTruthy()
	})
})

describe("<PercentileProfile />", () => {
	it("draws a bar per graded stat with its percentile in words for a screen reader", () => {
		render(<PercentileProfile data={data} player={te} />)
		const bars = screen.getAllByRole("img")
		expect(bars.length).toBeGreaterThan(2)
		// A stat that is still mostly luck is not given a percentile; it says so instead.
		for (const b of bars) expect(b.getAttribute("aria-label")).toMatch(/percentile|too early to rank/)
		expect(screen.getByText(/Left is the worst at his job/)).toBeTruthy()
	})
})

describe("<GameLog />", () => {
	it("lists each game with the opponent, how it ended with a letter as well as a color, and his box score", () => {
		const log = logs.logs[te.slug]?.te
		const rows = gameLog(data, te, log, logs.res)
		render(<GameLog name={te.name} group="te" rows={rows} boxKeys={Object.keys(BOX.te)} statKeys={["epaTgt"]} snaps />)
		const table = screen.getByRole("table", { name: /game by game/ })
		expect(within(table).getAllByRole("row")).toHaveLength(rows.length + 1)
		expect(within(table).getAllByText(/^[WL] \d+–\d+$/).length).toBeGreaterThan(0)
		expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toContain(BOX.te.tgt.short)
	})
})

describe("<StatTile />", () => {
	it("adds the line about winning when it has one, and none when it does not", () => {
		const stat = te.stats.find((s) => s.k === "epaTgt")!
		const { rerender } = render(<StatTile data={data} player={te} stat={stat} showBox win="Teams won 69% of the time." />)
		expect(screen.getByTestId("win-line").textContent).toMatch(/Does it show up in winning\? Teams won 69%/)
		rerender(<StatTile data={data} player={te} stat={stat} showBox win={null} />)
		expect(screen.queryByTestId("win-line")).toBeNull()
	})
})

describe("<PlayerCard />", () => {
	it("is one link to his page, shows his grade and his rank, and never shows a grade word that repeats the tier", () => {
		render(<PlayerCard data={data} player={te} log={logs.logs[te.slug]?.te} note="A line of my own." />)
		const card = screen.getByTestId("player-card")
		const links = within(card).getAllByRole("link")
		expect(links).toHaveLength(1)
		expect(links[0].getAttribute("href")).toBe(`/lab/players/${te.slug}`)
		expect(within(card).getByText("A line of my own.")).toBeTruthy()
		expect(within(card).getByText(/^Grade$/)).toBeTruthy()
		expect(card.textContent).toMatch(/\d+(st|nd|rd|th) of \d+/)
	})

	it("can point its link somewhere else, so posts can tag their visits", () => {
		render(<PlayerCard data={data} player={te} href={`/lab/players/${te.slug}?ref=post`} />)
		expect(within(screen.getByTestId("player-card")).getByRole("link").getAttribute("href")).toBe(`/lab/players/${te.slug}?ref=post`)
	})
})

describe("<PlayerEmbed />", () => {
	it("renders a live card for a post and tags the link", () => {
		render(<PlayerEmbed slug={te.slug} note="Why he matters." />)
		const link = within(screen.getByTestId("player-embed")).getByRole("link")
		expect(link.getAttribute("href")).toBe(`/lab/players/${te.slug}?ref=post`)
		expect(screen.getByText("Why he matters.")).toBeTruthy()
	})

	it("renders nothing for a missing or unknown player, so an old post never breaks", () => {
		const a = render(<PlayerEmbed slug="nobody-by-this-name" />)
		expect(a.container.innerHTML).toBe("")
		const b = render(<PlayerEmbed />)
		expect(b.container.innerHTML).toBe("")
	})
})

describe("<PlayerSearch />", () => {
	it("finds a player by name, shows a thumbnail, opens his page on a pick and records the pick", () => {
		const index = searchIndex(data)
		const target = index.find((e) => e.name === te.name)!
		render(<PlayerSearch index={index} />)
		const input = screen.getByRole("combobox")
		fireEvent.change(input, { target: { value: target.name } })
		const option = screen.getAllByRole("option").find((o) => o.textContent?.includes(target.name))!
		expect(within(option).getByTestId("headshot")).toBeTruthy()
		fireEvent.click(within(option).getByRole("button"))
		const router = (globalThis as unknown as { __router: { push: ReturnType<typeof vi.fn> } }).__router
		expect(router.push).toHaveBeenCalledWith(`/lab/players/${target.slug}`)
		expect(track).toHaveBeenCalledWith("player_search_pick", expect.objectContaining({ slug: target.slug }))
	})
})

describe("<TrackView />", () => {
	it("records one view with only names, and nothing personal", () => {
		render(<TrackView event="player_view" props={{ slug: "x", group: "te", team: "LV" }} />)
		expect(track).toHaveBeenCalledWith("player_view", { slug: "x", group: "te", team: "LV" })
	})
})

describe("<LeaderTable />", () => {
	const board = boards("te")[0]
	const rows = leaders(data, board).map((r) => ({ slug: r.player.slug, name: r.player.name, team: r.player.team, pos: r.player.pos, espn: r.player.espn, v: r.value, rank: r.rank, n: r.volume, d: r.delta, z: r.z, box: r.player.box }))
	const yard = data.yard.te![board.key]
	const teams = Array.from(new Set(rows.map((r) => r.team))).sort()
	const props = { group: "te" as const, statKey: board.key, kind: "stat" as const, yard, rows, boxCols: Object.entries(BOX.te).map(([key, b]) => ({ key, short: b.short, label: b.label })), higher: true, teams, valueLabel: board.label, perLabel: "targets" }

	it("lists everyone best first and filters by name, keeping the league rank", () => {
		render(<LeaderTable {...props} />)
		const first = screen.getAllByTestId("leader-row")
		expect(first.length).toBeGreaterThan(5)
		const pick = rows[4]
		fireEvent.change(screen.getByPlaceholderText("Filter by name"), { target: { value: pick.name.split(" ").slice(-1)[0] } })
		const shown = screen.getAllByTestId("leader-row")
		const mine = shown.find((r) => r.textContent?.includes(pick.name))!
		expect(within(mine).getAllByRole("cell")[0].textContent).toBe(String(pick.rank))
	})

	it("shows a thumbnail per row and the box score on request", () => {
		render(<LeaderTable {...props} />)
		expect(screen.getAllByTestId("headshot").length).toBe(screen.getAllByTestId("leader-row").length)
		fireEvent.click(screen.getByLabelText(/Show the box score/))
		expect(screen.getAllByRole("columnheader").some((h) => /TGT|Targets/i.test(h.textContent ?? ""))).toBe(true)
	})
})

describe("<Yardstick /> and <SnapStrip />", () => {
	it("describes where the dot sits in words, not just in pixels", () => {
		const y = data.yard.te!.epaTgt
		render(<Yardstick marks={[{ v: y.q[3], name: "Test" }]} yard={y} higher fmt={(v) => v.toFixed(2)} peers="tight ends" />)
		expect(document.body.textContent).toMatch(/worse to better/)
	})

	it("marks a missed game 'Out' and a game without counts yet with a question mark", () => {
		render(<SnapStrip weeks={[1, 2, 3, 4]} shares={[[1, 0], [2, 0.8], [3, 0.9]]} formWeeks={[3, 4]} opp={{ "1": "MIA", "2": "LAC", "3": "NO", "4": "KC" }} />)
		expect(screen.getByText("out")).toBeTruthy()
		expect(screen.getByText("80%")).toBeTruthy()
		expect(screen.getByText("?")).toBeTruthy()
	})
})

describe("the page data holds together", () => {
	it("has a Raiders row for the hub", () => {
		expect(data.players.some((p: PlayerRow) => p.team === "LV")).toBe(true)
	})
})

describe("the team filter on a leaderboard", () => {
	const board = boards("te")[0]
	const rows = leaders(data, board).map((r) => ({ slug: r.player.slug, name: r.player.name, team: r.player.team, pos: r.player.pos, espn: r.player.espn, v: r.value, rank: r.rank, n: r.volume, d: r.delta, z: r.z, box: r.player.box }))
	const teams = Array.from(new Set(rows.map((r) => r.team))).sort()
	const props = { group: "te" as const, statKey: board.key, kind: "stat" as const, yard: data.yard.te![board.key], rows, boxCols: [], higher: true, teams, valueLabel: board.label, perLabel: "targets" }
	const team = rows[0].team

	it("is read from the address and kept in it, so another stat opens on the same team", () => {
		window.history.replaceState(null, "", `/lab/players/leaders/te/x?team=${team}`)
		const { unmount } = render(<LeaderTable {...props} />)
		const shown = screen.getAllByTestId("leader-row")
		expect(shown.length).toBe(rows.filter((r) => r.team === team).length)
		unmount()
		// A link to another stat carries it.
		render(<TeamLink href="/lab/players/leaders/te/other">Other stat</TeamLink>)
		expect(screen.getByRole("link", { name: "Other stat" }).getAttribute("href")).toBe(`/lab/players/leaders/te/other?team=${team}`)
		window.history.replaceState(null, "", "/")
	})

	it("writes the choice to the address when it changes, and removes it for All teams", () => {
		window.history.replaceState(null, "", "/lab/players/leaders/te/x")
		render(<LeaderTable {...props} />)
		const select = screen.getByLabelText("Team")
		act(() => {
			fireEvent.change(select, { target: { value: team } })
		})
		expect(window.location.search).toBe(`?team=${team}`)
		act(() => {
			fireEvent.change(select, { target: { value: "" } })
		})
		expect(window.location.search).toBe("")
	})

	it("ignores anything in the address that is not a team code, and says so when a team has nobody on this board", () => {
		window.history.replaceState(null, "", "/x?team=%3Cscript%3E")
		render(<LeaderTable {...props} />)
		expect(screen.getAllByTestId("leader-row").length).toBeGreaterThan(5)
		cleanup()
		window.history.replaceState(null, "", "/x?team=ZZZ")
		render(<LeaderTable {...props} />)
		expect(screen.getByText(/qualify for this stat yet/)).toBeTruthy()
		window.history.replaceState(null, "", "/")
	})
})
