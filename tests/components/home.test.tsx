// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import Countdown from "../../components/home/Countdown"
import FeaturedStories, { type FeaturedPost } from "../../components/home/FeaturedStories"
import FlagCard from "../../components/home/FlagCard"
import GameDayHub from "../../components/home/GameDayHub"
import HeroVote, { type HeroPick } from "../../components/home/HeroVote"
import StatStrip from "../../components/home/StatStrip"
import { hubState, playedGames } from "../../lib/home"
import { summarize, summarizeFlags, summarizeKeys, type FlagPlant, type GamePrediction } from "../../lib/predictions"
import { joinSchedule, scheduleRecord } from "../../lib/schedule"

afterEach(() => {
	cleanup()
	vi.useRealTimers()
	vi.unstubAllGlobals()
	window.localStorage.clear()
})

const NOW = new Date("2026-10-04T18:00:00Z").getTime()
const hours = (h: number) => new Date(NOW + h * 3600_000).toISOString()

describe("<Countdown />", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(NOW)
	})

	it("renders the clock from the browser time, with days only when there are some", () => {
		render(<Countdown kickoff={new Date(NOW + (2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000).toISOString()} />)
		const timer = screen.getByRole("timer")
		expect(timer.textContent).toContain("2days")
		expect(timer.textContent).toContain("03hrs")
		expect(timer.textContent).toContain("04min")
		expect(timer.textContent).toContain("05sec")
	})

	it("drops the days cell under 24 hours", () => {
		render(<Countdown kickoff={hours(5)} />)
		expect(screen.getByRole("timer").textContent).not.toContain("days")
	})

	it("ticks every second", () => {
		render(<Countdown kickoff={hours(1)} />)
		expect(screen.getByRole("timer").textContent).toBe("01hrs00min00sec")
		act(() => {
			vi.advanceTimersByTime(3000)
		})
		expect(screen.getByRole("timer").textContent).toBe("00hrs59min57sec")
	})

	it("switches to 'Game on' when kickoff passes", () => {
		render(<Countdown kickoff={new Date(NOW + 2000).toISOString()} />)
		expect(screen.queryByText("Game on")).toBeNull()
		act(() => {
			vi.advanceTimersByTime(3000)
		})
		expect(screen.getByText("Game on")).toBeTruthy()
		expect(screen.queryByRole("timer")).toBeNull()
	})

	it("shows 'Game on' immediately when told the game is live", () => {
		render(<Countdown kickoff={hours(-1)} live />)
		expect(screen.getByText("Game on")).toBeTruthy()
	})

	it("stops its timer on unmount", () => {
		const clear = vi.spyOn(window, "clearInterval")
		const { unmount } = render(<Countdown kickoff={hours(1)} />)
		unmount()
		expect(clear).toHaveBeenCalled()
	})
})

describe("<HeroVote />", () => {
	const pick: HeroPick = {
		_id: "pick1",
		week: 4,
		awayTeam: "Las Vegas Raiders",
		homeTeam: "Kansas City Chiefs",
		kickoff: hours(48),
		readerVotesAway: 3,
		readerVotesHome: 1,
	}
	beforeEach(() => {
		vi.spyOn(Date, "now").mockReturnValue(NOW)
	})
	const okFetch = (body: unknown = { readerVotesAway: 4, readerVotesHome: 1 }) =>
		vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))

	it("offers both teams before the game and posts the choice", async () => {
		const f = okFetch()
		vi.stubGlobal("fetch", f)
		render(<HeroVote pick={pick} />)
		fireEvent.click(screen.getByRole("button", { name: "Pick the Raiders to win" }))
		await waitFor(() => expect(f).toHaveBeenCalled())
		const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
		expect(url).toBe("/api/prediction-vote")
		expect(JSON.parse(init.body as string)).toEqual({ _id: "pick1", choice: "away" })
	})

	it("shows the results with the server's counts, and remembers the vote", async () => {
		vi.stubGlobal("fetch", okFetch())
		render(<HeroVote pick={pick} />)
		fireEvent.click(screen.getByRole("button", { name: "Pick the Raiders to win" }))
		await screen.findByText(/Thanks for weighing in/)
		expect(screen.getByRole("img", { name: /Raiders 80 percent, Chiefs 20 percent/ })).toBeTruthy()
		expect(screen.getByText("(you)")).toBeTruthy()
		expect(window.localStorage.getItem("raiders-rundown:voted:pick:pick1")).toBe("1")
		expect(window.localStorage.getItem("raiders-rundown:pick-choice:pick1")).toBe("away")
		expect(screen.queryByRole("button", { name: /to win/ })).toBeNull()
	})

	it("rolls back and shows an error when the server rejects the vote", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })))
		render(<HeroVote pick={pick} />)
		fireEvent.click(screen.getByRole("button", { name: "Pick the Chiefs to win" }))
		const alert = await screen.findByRole("alert")
		expect(alert.textContent).toMatch(/Couldn't save your pick/)
		expect(screen.getByRole("button", { name: "Pick the Chiefs to win" })).toBeTruthy()
		expect(window.localStorage.getItem("raiders-rundown:voted:pick:pick1")).toBeNull()
	})

	it("rolls back when the network fails", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))))
		render(<HeroVote pick={pick} />)
		fireEvent.click(screen.getByRole("button", { name: "Pick the Raiders to win" }))
		expect((await screen.findByRole("alert")).textContent).toMatch(/connection/)
	})

	it("locks voting on a 409 from the server", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 409 })))
		render(<HeroVote pick={pick} />)
		fireEvent.click(screen.getByRole("button", { name: "Pick the Raiders to win" }))
		await screen.findByText(/Picks are closed/)
		expect(screen.queryByRole("button", { name: /to win/ })).toBeNull()
	})

	it("is closed after kickoff", async () => {
		render(<HeroVote pick={{ ...pick, kickoff: hours(-1) }} />)
		await screen.findByText(/Picks are closed/)
		expect(screen.queryByRole("button", { name: /to win/ })).toBeNull()
	})

	it("doesn't let someone who already voted vote again", async () => {
		window.localStorage.setItem("raiders-rundown:voted:pick:pick1", "1")
		window.localStorage.setItem("raiders-rundown:pick-choice:pick1", "home")
		render(<HeroVote pick={pick} />)
		await screen.findByText(/Thanks for weighing in/)
		expect(screen.queryByRole("button", { name: /to win/ })).toBeNull()
		expect(screen.getByText("(you)")).toBeTruthy()
	})

	it("sends one request when the button is double-clicked", async () => {
		const f = okFetch()
		vi.stubGlobal("fetch", f)
		render(<HeroVote pick={pick} />)
		const btn = screen.getByRole("button", { name: "Pick the Raiders to win" })
		fireEvent.click(btn)
		fireEvent.click(btn)
		await screen.findByText(/Thanks for weighing in/)
		expect(f).toHaveBeenCalledTimes(1)
	})

	it("invites the first vote when there are none, and links to a tweet intent on the pick page", () => {
		render(<HeroVote pick={{ ...pick, readerVotesAway: 0, readerVotesHome: null }} />)
		expect(screen.getByText(/Be the first to pick/)).toBeTruthy()
		const share = screen.getByRole("link", { name: /Challenge a friend/ }) as HTMLAnchorElement
		expect(share.href).toContain("twitter.com/intent/tweet")
		expect(decodeURIComponent(share.href)).toContain("https://www.raidersrundown.com/predictions/pick/pick1")
		expect(share.rel).toContain("noopener")
	})
})


// --- fixtures for the hub -------------------------------------------------

const RAIDERS = "Las Vegas Raiders"
function pickDoc(over: Partial<GamePrediction> = {}): GamePrediction {
	return {
		_id: "p4",
		week: 4,
		awayTeam: RAIDERS,
		homeTeam: "Kansas City Chiefs",
		kickoff: hours(48),
		predictedAwayScore: 24,
		predictedHomeScore: 21,
		readerVotesAway: 0,
		readerVotesHome: 0,
		preview: { slug: "week-4-preview", title: "Preview" },
		keys: [
			{ _key: "a", text: "Protect Geno" },
			{ _key: "b", text: "  " },
			{ _key: "c", text: "Win the turnover battle" },
		],
		...over,
	}
}

const sched = (...games: Parameters<typeof joinSchedule>[0]) => games

describe("<GameDayHub />", () => {
	const week3Pick = pickDoc({
		_id: "p3",
		week: 3,
		awayTeam: "New Orleans Saints",
		homeTeam: RAIDERS,
		kickoff: hours(-150),
		predictedAwayScore: 17,
		predictedHomeScore: 24,
		actualAwayScore: 10,
		actualHomeScore: 20,
		keys: null,
	})

	function setup(opts: { now?: number; picks?: GamePrediction[]; games?: Parameters<typeof joinSchedule>[0] } = {}) {
		const picks = opts.picks ?? [week3Pick, pickDoc()]
		const games = opts.games ?? [
			{ week: 3, opponent: "New Orleans Saints", homeAway: "home" as const, kickoff: hours(-150) },
			{ week: 4, opponent: "Kansas City Chiefs", homeAway: "away" as const, kickoff: hours(48), network: "CBS" },
		]
		const rows = joinSchedule(games, picks)
		return render(
			<GameDayHub
				state={hubState(rows, opts.now ?? NOW)}
				picks={picks}
				played={playedGames(rows)}
				record={scheduleRecord(rows)}
				latestReport={{ slug: "week-3-recap", title: "Raiders handle the Saints" }}
			/>
		)
	}

	beforeEach(() => {
		vi.spyOn(Date, "now").mockReturnValue(NOW)
	})

	it("headlines the next game with the right preposition", () => {
		setup()
		const h = screen.getByRole("heading", { level: 2 })
		expect(h.textContent).toBe("Raiders at Chiefs")
		expect(screen.getByText("Week 4")).toBeTruthy()
		expect(screen.getByText("Next game")).toBeTruthy()
		expect(screen.getByText("CBS")).toBeTruthy()
	})

	it("says 'vs.' for a home game", () => {
		setup({
			picks: [pickDoc({ awayTeam: "Kansas City Chiefs", homeTeam: RAIDERS })],
			games: [{ week: 4, opponent: "Kansas City Chiefs", homeAway: "home", kickoff: hours(48) }],
		})
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Raiders vs. Chiefs")
	})

	it("shows my pick, the keys (blank ones skipped), the preview link and the vote card", () => {
		setup()
		expect(screen.getByText("My pick, on the record")).toBeTruthy()
		expect(screen.getByText("Protect Geno")).toBeTruthy()
		expect(screen.getByText("Win the turnover battle")).toBeTruthy()
		expect(screen.getAllByRole("listitem").some((li) => li.textContent === "")).toBe(false)
		const preview = screen.getByRole("link", { name: /Read the Week 4 preview/ }) as HTMLAnchorElement
		expect(preview.getAttribute("href")).toBe("/post/week-4-preview")
		expect(screen.getByRole("button", { name: "Pick the Raiders to win" })).toBeTruthy()
	})

	it("shows the record and finished games with results", () => {
		setup()
		expect(screen.getByText("Raiders record")).toBeTruthy()
		const chip = screen.getByRole("link", { name: /Wk 3 vs NO/ })
		expect(chip.textContent).toContain("Win")
		expect(chip.textContent).toContain("20–10")
	})

	it("links the latest recap", () => {
		setup()
		const link = screen.getByRole("link", { name: /Raiders handle the Saints/ }) as HTMLAnchorElement
		expect(link.getAttribute("href")).toBe("/games/week-3-recap")
	})

	it("says 'Game day' while a game is live", () => {
		setup({ now: NOW + 48 * 3600_000 + 30 * 60_000 })
		expect(screen.getByText("Game day")).toBeTruthy()
		expect(screen.queryByText("Next game")).toBeNull()
	})

	it("promises a pick when none is on the record yet, and shows no vote card", () => {
		setup({ picks: [week3Pick] })
		expect(screen.getByText(/goes on the record before kickoff/)).toBeTruthy()
		expect(screen.queryByText("Who wins? Lock in your pick.")).toBeNull()
	})

	it("falls back to the season view when there is nothing upcoming", () => {
		setup({
			picks: [week3Pick],
			games: [{ week: 3, opponent: "New Orleans Saints", homeAway: "home", kickoff: hours(-150) }],
		})
		expect(screen.getByText("Every pick on the record")).toBeTruthy()
		expect(screen.getByRole("link", { name: /See the scoreboard/ }).getAttribute("href")).toBe("/predictions")
	})

	it("handles a brand-new season (no games at all)", () => {
		setup({ picks: [], games: [] })
		expect(screen.getByText("Every pick on the record")).toBeTruthy()
		expect(screen.getByText("0–0")).toBeTruthy()
		expect(screen.getByText(/season hasn.t started/)).toBeTruthy()
	})
})

describe("<StatStrip />", () => {
	const empty = summarize([])
	const noKeys = summarizeKeys([])

	it("invites people to the board when there are no rankings", () => {
		render(<StatStrip rank={null} summary={empty} keys={noKeys} />)
		expect(screen.getByText("See the board")).toBeTruthy()
		expect(screen.getByText("First final starts the clock")).toBeTruthy()
		expect(screen.getByText("Graded after each final")).toBeTruthy()
		expect(screen.getByText("Starts with the first final")).toBeTruthy()
	})

	it("shows the rank, the move and words for screen readers", () => {
		render(<StatStrip rank={{ rank: 22, change: 3, week: 4, history: [28, 25, 22] }} summary={empty} keys={noKeys} />)
		const tile = screen.getByRole("link", { name: /Power rank/ })
		expect(within(tile).getByText("Week 4", { exact: false })).toBeTruthy()
		expect(tile.textContent).toContain("22")
		expect(tile.textContent).toContain("3")
		expect(within(tile).getByRole("img", { name: "Rank by week: 28, 25, 22" })).toBeTruthy()
		expect(tile.getAttribute("href")).toBe("/rankings")
	})

	it("treats the first week as having no change", () => {
		render(<StatStrip rank={{ rank: 10, change: null, week: 1, history: [10] }} summary={empty} keys={noKeys} />)
		expect(screen.getByText("First rankings of the season")).toBeTruthy()
		expect(screen.queryByRole("img", { name: /Rank by week/ })).toBeNull() // one point is not a trend
	})

	it("shows a flat move as a dash", () => {
		render(<StatStrip rank={{ rank: 10, change: 0, week: 3, history: [10, 10, 10] }} summary={empty} keys={noKeys} />)
		expect(screen.getByRole("link", { name: /Power rank/ }).textContent).toContain("—")
	})

	it("renders accuracy, streak and keys from graded picks", () => {
		const picks = [
			pickDoc({ _id: "a", week: 1, kickoff: hours(-500), actualAwayScore: 27, actualHomeScore: 20, keys: [{ text: "k1", result: "hit" }, { text: "k2", result: "miss" }] }),
			pickDoc({ _id: "b", week: 2, kickoff: hours(-300), actualAwayScore: 30, actualHomeScore: 10, keys: [{ text: "k3", result: "hit" }] }),
		]
		render(<StatStrip rank={null} summary={summarize(picks)} keys={summarizeKeys(picks)} />)
		expect(screen.getByText("100%")).toBeTruthy() // pick accuracy
		expect(screen.getByText("2–0 on the winner", { exact: false })).toBeTruthy()
		expect(screen.getByText("Hit streak")).toBeTruthy()
		expect(screen.getByText("2 picks in a row")).toBeTruthy()
		expect(screen.getByText("67%")).toBeTruthy() // 2 of 3 keys
		expect(screen.getByText("2 of 3 hit across 2 games")).toBeTruthy()
	})

	it("calls a losing run a miss streak", () => {
		const picks = [pickDoc({ _id: "a", week: 1, kickoff: hours(-500), actualAwayScore: 10, actualHomeScore: 20 })]
		render(<StatStrip rank={null} summary={summarize(picks)} keys={noKeys} />)
		expect(screen.getByText("Miss streak")).toBeTruthy()
		expect(screen.getByText("1 pick in a row")).toBeTruthy()
	})
})

describe("<FeaturedStories />", () => {
	const post = (n: number, over: Partial<FeaturedPost> = {}): FeaturedPost => ({
		_id: `id${n}`,
		slug: `post-${n}`,
		title: `Story ${n}`,
		description: `Desc ${n}`,
		createdAt: "2026-09-20T19:00:00Z",
		categories: ["Previews", "Analysis", "Third"],
		minutes: n + 2,
		imageUrl: `https://cdn.example/${n}.jpg`,
		imagePosition: "50% 50%",
		...over,
	})

	it("renders nothing without stories", () => {
		const { container } = render(<FeaturedStories posts={[]} />)
		expect(container.innerHTML).toBe("")
	})

	it("renders a lead and up to two side stories, each linking to its post with read time", () => {
		render(<FeaturedStories posts={[post(1), post(2), post(3), post(4)]} />)
		for (const n of [1, 2, 3]) {
			const link = screen.getByRole("link", { name: new RegExp(`Story ${n}`) }) as HTMLAnchorElement
			expect(link.getAttribute("href")).toBe(`/post/post-${n}`)
			expect(link.textContent).toContain(`${n + 2} min read`)
		}
		expect(screen.queryByText("Story 4")).toBeNull()
	})

	it("shows dates in Pacific time so a Sunday-night post isn't dated Monday", () => {
		render(<FeaturedStories posts={[post(1, { createdAt: "2026-09-21T03:00:00Z" })]} />)
		expect(screen.getByText("Sep 20, 2026", { exact: false })).toBeTruthy()
	})

	it("limits the lead's badges to two", () => {
		render(<FeaturedStories posts={[post(1)]} />)
		expect(screen.getByText("Previews")).toBeTruthy()
		expect(screen.getByText("Analysis")).toBeTruthy()
		expect(screen.queryByText("Third")).toBeNull()
	})

	// Regression: next/link doesn't scroll to hash-only hrefs on Next 13.2.
	it("'More stories' is a plain in-page anchor", () => {
		render(<FeaturedStories posts={[post(1)]} />)
		const a = screen.getByText("More stories") as HTMLAnchorElement
		expect(a.getAttribute("href")).toBe("#latest")
	})
})

describe("<FlagCard />", () => {
	const flag = (over: Partial<FlagPlant> = {}): FlagPlant => ({ _id: "f1", week: 4, text: "Raiders run for 150", detail: "Because", result: null, ...over }) as FlagPlant

	it("frames an open flag as a dare", () => {
		render(<FlagCard flag={flag()} summary={summarizeFlags([flag()])} />)
		expect(screen.getByText(/Open: graded after the game/)).toBeTruthy()
		expect(screen.getByText(/Raiders run for 150/)).toBeTruthy()
		const share = screen.getByRole("link", { name: /Share this flag/ }) as HTMLAnchorElement
		expect(decodeURIComponent(share.href.replace(/\+/g, " "))).toContain("I'm planting a flag: Raiders run for 150")
	})

	it("marks a delivered flag and shows the season record", () => {
		const f = flag({ result: "hit", resultNote: "Ran for 171" })
		const all = [f, flag({ _id: "f0", week: 3, result: "miss" }), flag({ _id: "fz", week: 2 })]
		render(<FlagCard flag={f} summary={summarizeFlags(all)} />)
		expect(screen.getByText("Delivered")).toBeTruthy()
		expect(screen.getByText("Ran for 171")).toBeTruthy()
		expect(screen.getByText(/Season: 1.0*1, 1 open/)).toBeTruthy()
	})

	it("owns up to a miss", () => {
		const f = flag({ result: "miss" })
		render(<FlagCard flag={f} summary={summarizeFlags([f])} />)
		expect(screen.getByText("Missed")).toBeTruthy()
		const share = screen.getByRole("link", { name: /Share this flag/ }) as HTMLAnchorElement
		expect(decodeURIComponent(share.href.replace(/\+/g, " "))).toContain("missed")
	})

	it("links to the ledger", () => {
		render(<FlagCard flag={flag()} summary={summarizeFlags([flag()])} />)
		expect(screen.getByRole("link", { name: /The full ledger/ }).getAttribute("href")).toBe("/predictions#flags")
	})
})
