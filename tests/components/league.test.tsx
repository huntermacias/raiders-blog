// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import LeagueEntry from "../../components/league/LeagueEntry"
import Leaderboard from "../../components/league/Leaderboard"
import LeagueTeaser from "../../components/league/LeagueTeaser"
import YourRank from "../../components/league/YourRank"
import { clearCreds, loadCreds, saveCreds } from "../../lib/league.client"
import type { OpenGame, StandingRow } from "../../lib/league"

const NOW = new Date("2026-10-04T18:00:00Z").getTime()
const hours = (h: number) => new Date(NOW + h * 3600_000).toISOString()

const GAME: OpenGame = { _id: "game1", week: 5, awayTeam: "Las Vegas Raiders", homeTeam: "New England Patriots", kickoff: hours(48) }
const GAME2: OpenGame = { _id: "game2", week: 6, awayTeam: "Denver Broncos", homeTeam: "Las Vegas Raiders", kickoff: hours(200) }
const KEY = "ABCDE-FGHJK-MNPQR-STUVW"

type Route = (body: Record<string, unknown>) => { status?: number; body?: unknown } | Promise<never>
function fakeFetch(routes: Record<string, Route>) {
	const f = vi.fn(async (url: string, init?: RequestInit) => {
		const route = routes[url]
		if (!route) throw new Error(`unexpected ${url}`)
		const out = await route(JSON.parse((init?.body as string) ?? "{}"))
		return new Response(JSON.stringify(out.body ?? {}), { status: out.status ?? 200 })
	})
	vi.stubGlobal("fetch", f)
	return f
}
const bodies = (f: ReturnType<typeof fakeFetch>, url: string) =>
	f.mock.calls.filter((c) => c[0] === url).map((c) => JSON.parse((c[1] as RequestInit).body as string))

beforeEach(() => {
	window.localStorage.clear()
	vi.spyOn(Date, "now").mockReturnValue(NOW)
})
afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

describe("league.client storage", () => {
	it("round-trips credentials and clears them", () => {
		expect(loadCreds()).toBeNull()
		saveCreds({ handle: "Ann", key: KEY })
		expect(loadCreds()).toEqual({ handle: "Ann", key: KEY })
		clearCreds()
		expect(loadCreds()).toBeNull()
	})

	it.each(["not json", '{"handle":1,"key":2}', "null", '["x"]'])("ignores corrupt storage %s", (raw) => {
		window.localStorage.setItem("raiders-rundown:league", raw)
		expect(loadCreds()).toBeNull()
	})

	it("survives storage that throws", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("blocked")
		})
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("blocked")
		})
		expect(loadCreds()).toBeNull()
		expect(() => saveCreds({ handle: "A", key: KEY })).not.toThrow()
	})
})

describe("<LeagueEntry /> signed out", () => {
	it("shows the join form first, with no storage and no request", async () => {
		const f = fakeFetch({})
		render(<LeagueEntry games={[GAME]} />)
		await screen.findByRole("heading", { name: /Pick a handle/ })
		expect(f).not.toHaveBeenCalled()
		expect(screen.queryByLabelText(/Raiders score/)).toBeNull()
	})

	it("claims a handle, shows the recovery key once, and stores it", async () => {
		const f = fakeFetch({ "/api/league/join": () => ({ body: { handle: "SilverFan", key: KEY } }) })
		render(<LeagueEntry games={[GAME]} />)
		fireEvent.change(await screen.findByLabelText("Handle"), { target: { value: "SilverFan" } })
		fireEvent.click(screen.getByRole("button", { name: "Claim my handle" }))

		expect(await screen.findByText(KEY)).toBeTruthy()
		expect(bodies(f, "/api/league/join")).toEqual([{ handle: "SilverFan" }])
		expect(loadCreds()).toEqual({ handle: "SilverFan", key: KEY })
		// the pick forms are already usable behind the key notice
		expect(screen.getByLabelText("Raiders score")).toBeTruthy()

		fireEvent.click(screen.getByRole("button", { name: /I.ve saved it/ }))
		expect(screen.queryByText(KEY)).toBeNull()
	})

	it("shows the server's message when a handle is taken", async () => {
		fakeFetch({ "/api/league/join": () => ({ status: 409, body: { message: "That handle is taken. Try another." } }) })
		render(<LeagueEntry games={[GAME]} />)
		fireEvent.change(await screen.findByLabelText("Handle"), { target: { value: "Taken" } })
		fireEvent.click(screen.getByRole("button", { name: "Claim my handle" }))
		await screen.findByText("That handle is taken. Try another.")
		expect(loadCreds()).toBeNull()
	})

	it("keeps the button disabled until a handle is typed", async () => {
		fakeFetch({})
		render(<LeagueEntry games={[GAME]} />)
		const btn = (await screen.findByRole("button", { name: "Claim my handle" })) as HTMLButtonElement
		expect(btn.disabled).toBe(true)
		fireEvent.change(screen.getByLabelText("Handle"), { target: { value: "abc" } })
		expect(btn.disabled).toBe(false)
	})

	it("signs in on a new device and pre-fills saved picks", async () => {
		const f = fakeFetch({
			"/api/league/signin": () => ({ body: { handle: "Ann", picks: [{ predictionId: "game1", awayScore: 20, homeScore: 24 }] } }),
		})
		render(<LeagueEntry games={[GAME]} />)
		fireEvent.click(await screen.findByRole("tab", { name: "I have a key" }))
		fireEvent.change(screen.getByLabelText("Handle"), { target: { value: "ann" } })
		fireEvent.change(screen.getByLabelText("Recovery key"), { target: { value: KEY } })
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

		await screen.findByText("Ann", { selector: "span" })
		expect((screen.getByLabelText("Raiders score") as HTMLInputElement).value).toBe("20")
		expect((screen.getByLabelText("Patriots score") as HTMLInputElement).value).toBe("24")
		expect(screen.getByRole("button", { name: /Locked in/ })).toBeTruthy()
		expect(bodies(f, "/api/league/signin")).toEqual([{ handle: "ann", key: KEY }])
		expect(loadCreds()).toEqual({ handle: "Ann", key: KEY })
		// signing in does not show the one-time key banner
		expect(screen.queryByRole("heading", { name: /Save your recovery key/ })).toBeNull()
	})

	it("shows an error for a wrong key and stays signed out", async () => {
		fakeFetch({ "/api/league/signin": () => ({ status: 401, body: { message: "That handle and key don't match" } }) })
		render(<LeagueEntry games={[GAME]} />)
		fireEvent.click(await screen.findByRole("tab", { name: "I have a key" }))
		fireEvent.change(screen.getByLabelText("Handle"), { target: { value: "ann" } })
		fireEvent.change(screen.getByLabelText("Recovery key"), { target: { value: "nope" } })
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
		await screen.findByText("That handle and key don't match")
		expect(loadCreds()).toBeNull()
	})
})

describe("<LeagueEntry /> returning player", () => {
	beforeEach(() => saveCreds({ handle: "Ann", key: KEY }))

	it("re-validates stored credentials on load", async () => {
		const f = fakeFetch({ "/api/league/signin": () => ({ body: { handle: "Ann", picks: [] } }) })
		render(<LeagueEntry games={[GAME, GAME2]} />)
		await screen.findByText("Ann", { selector: "span" })
		expect(bodies(f, "/api/league/signin")).toEqual([{ handle: "Ann", key: KEY }])
		expect(screen.getAllByRole("form")).toHaveLength(2)
	})

	it("clears bad credentials and says why", async () => {
		fakeFetch({ "/api/league/signin": () => ({ status: 401, body: { message: "x" } }) })
		render(<LeagueEntry games={[GAME]} />)
		await screen.findByText(/You were signed out/)
		expect(loadCreds()).toBeNull()
	})

	it("keeps credentials when the network is down and offers a retry", async () => {
		let up = false
		fakeFetch({
			"/api/league/signin": () => {
				if (!up) return Promise.reject(new Error("offline")) as never
				return { body: { handle: "Ann", picks: [] } }
			},
		})
		render(<LeagueEntry games={[GAME]} />)
		await screen.findByText(/Couldn.t reach the league/)
		expect(loadCreds()).not.toBeNull()
		up = true
		fireEvent.click(screen.getByRole("button", { name: "Try again" }))
		await screen.findByText("Ann", { selector: "span" })
	})

	it("signs out", async () => {
		fakeFetch({ "/api/league/signin": () => ({ body: { handle: "Ann", picks: [] } }) })
		render(<LeagueEntry games={[GAME]} />)
		fireEvent.click(await screen.findByRole("button", { name: /Sign out/ }))
		await screen.findByRole("heading", { name: /Pick a handle/ })
		expect(loadCreds()).toBeNull()
	})

	it("says so when no games are open", async () => {
		fakeFetch({ "/api/league/signin": () => ({ body: { handle: "Ann", picks: [] } }) })
		render(<LeagueEntry games={[]} />)
		await screen.findByText(/No games are open for picks/)
	})

	describe("entering a pick", () => {
		async function open(extra: Record<string, Route> = {}) {
			const f = fakeFetch({ "/api/league/signin": () => ({ body: { handle: "Ann", picks: [] } }), ...extra })
			render(<LeagueEntry games={[GAME]} />)
			await screen.findByText("Ann", { selector: "span" })
			return f
		}
		const type = (label: string, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } })
		const submit = () => fireEvent.click(screen.getByRole("button", { name: /Lock in pick|Update pick/ }))

		it("sends the score with the player's credentials and confirms", async () => {
			const f = await open({ "/api/league/pick": () => ({ body: { ok: true } }) })
			type("Raiders score", "27")
			type("Patriots score", "17")
			submit()
			await screen.findByText(/Locked in\. You can change it until kickoff/)
			expect(bodies(f, "/api/league/pick")).toEqual([{ handle: "Ann", key: KEY, predictionId: "game1", awayScore: 27, homeScore: 17 }])
			// saved and unchanged -> button says so and is disabled
			const btn = screen.getByRole("button", { name: /Locked in/ }) as HTMLButtonElement
			expect(btn.disabled).toBe(true)
			// editing re-enables it as an update
			type("Raiders score", "28")
			expect((screen.getByRole("button", { name: "Update pick" }) as HTMLButtonElement).disabled).toBe(false)
		})

		it("blocks ties and blanks without calling the server", async () => {
			const f = await open()
			type("Raiders score", "17")
			type("Patriots score", "17")
			submit()
			expect(screen.getByText(/can.t be tied/)).toBeTruthy()
			type("Patriots score", "")
			submit()
			expect(screen.getByText(/whole numbers from 0 to 99/)).toBeTruthy()
			type("Patriots score", "150")
			submit()
			expect(screen.getByText(/whole numbers from 0 to 99/)).toBeTruthy()
			expect(bodies(f, "/api/league/pick")).toEqual([])
		})

		it("locks the card on a 409 from the server", async () => {
			await open({ "/api/league/pick": () => ({ status: 409, body: { message: "closed" } }) })
			type("Raiders score", "27")
			type("Patriots score", "17")
			submit()
			await screen.findByText("Picks closed")
			expect((screen.getByLabelText("Raiders score") as HTMLInputElement).disabled).toBe(true)
		})

		it("signs the player out when the server rejects their key", async () => {
			await open({ "/api/league/pick": () => ({ status: 401, body: { message: "x" } }) })
			type("Raiders score", "27")
			type("Patriots score", "17")
			submit()
			await screen.findByText(/You were signed out/)
			expect(loadCreds()).toBeNull()
		})

		it("shows other server errors and leaves the pick unsaved", async () => {
			await open({ "/api/league/pick": () => ({ status: 500, body: { message: "The league is temporarily unavailable." } }) })
			type("Raiders score", "27")
			type("Patriots score", "17")
			submit()
			await screen.findByText("The league is temporarily unavailable.")
			expect(screen.getByRole("button", { name: "Lock in pick" })).toBeTruthy()
		})

		it("shows a game as closed when kickoff has already passed", async () => {
			fakeFetch({ "/api/league/signin": () => ({ body: { handle: "Ann", picks: [] } }) })
			render(<LeagueEntry games={[{ ...GAME, kickoff: hours(-1) }]} />)
			await screen.findByText("Picks closed")
			expect((screen.getByLabelText("Raiders score") as HTMLInputElement).disabled).toBe(true)
		})

		it("shows kickoff in Pacific time", async () => {
			await open()
			expect(screen.getByText(/Tue, Oct 6.*11:00 AM PDT/)).toBeTruthy()
		})
	})
})

const row = (over: Partial<StandingRow> = {}): StandingRow => ({
	rank: 1,
	handle: "Ann",
	lower: "ann",
	points: 41,
	games: 2,
	correct: 2,
	exact: 1,
	avgMarginError: 1.5,
	vsBlogger: { w: 1, l: 0, t: 1 },
	bloggerPoints: 16,
	delta: 25,
	...over,
})
const blogger = { games: 3, points: 30, correct: 2, avgMarginError: 4 }

describe("<Leaderboard />", () => {
	it("pins the blogger as a benchmark and links each player to their profile", () => {
		render(<Leaderboard rows={[row(), row({ rank: 2, handle: "Bo", lower: "bo", points: 25, delta: -3, vsBlogger: { w: 0, l: 1, t: 0 } })]} blogger={blogger} scope="Season" />)
		const rows = screen.getAllByRole("row")
		expect(within(rows[1]).getByText("The Blogger")).toBeTruthy()
		expect(within(rows[1]).getByText("30")).toBeTruthy()
		expect((screen.getByRole("link", { name: "Ann" }) as HTMLAnchorElement).getAttribute("href")).toBe("/league/Ann")
		expect(screen.getByRole("table", { name: "Season standings" })).toBeTruthy()
	})

	it("shows the record against the blogger with the signed point gap", () => {
		render(<Leaderboard rows={[row(), row({ rank: 2, handle: "Bo", lower: "bo", delta: -3, vsBlogger: { w: 0, l: 2, t: 0 } })]} blogger={blogger} scope="Season" />)
		expect(screen.getByText("1–0–1")).toBeTruthy()
		expect(screen.getByText("+25")).toBeTruthy()
		expect(screen.getByText("0–2")).toBeTruthy() // no ties -> no third number
		expect(screen.getByText("-3")).toBeTruthy()
	})

	it("is honest when nobody is on the board", () => {
		render(<Leaderboard rows={[]} blogger={{ games: 0, points: 0, correct: 0, avgMarginError: null }} scope="Week 1" />)
		expect(screen.getByText(/Nobody is on the board yet/)).toBeTruthy()
	})

	it("caps the table at 100 rows and says how many there are", () => {
		const many = Array.from({ length: 120 }, (_, i) => row({ rank: i + 1, handle: `P${i}`, lower: `p${i}` }))
		render(<Leaderboard rows={many} blogger={blogger} scope="Season" />)
		expect(screen.getAllByRole("link")).toHaveLength(100)
		expect(screen.getByText(/top 100 of 120/)).toBeTruthy()
	})
})

describe("<YourRank />", () => {
	const rows = [
		{ lower: "ann", handle: "Ann", rank: 3, points: 41, delta: 25 },
		{ lower: "bo", handle: "Bo", rank: 4, points: 20, delta: -6 },
	]

	it("renders nothing for visitors who haven't joined", () => {
		const { container } = render(<YourRank rows={rows} total={2} />)
		expect(container.innerHTML).toBe("")
	})

	it("shows the signed-in player's place", async () => {
		saveCreds({ handle: "ann", key: KEY })
		render(<YourRank rows={rows} total={9} />)
		await screen.findByText("#3 of 9")
		expect(screen.getByText("41 pts")).toBeTruthy()
		expect(screen.getByText("+25 on me")).toBeTruthy()
		expect((screen.getByRole("link", { name: "Ann" }) as HTMLAnchorElement).getAttribute("href")).toBe("/league/Ann")
	})

	it("describes being behind the blogger", async () => {
		saveCreds({ handle: "Bo", key: KEY })
		render(<YourRank rows={rows} total={9} />)
		await screen.findByText("-6 behind me")
	})

	it("welcomes a player who has no graded game yet", async () => {
		saveCreds({ handle: "Newbie", key: KEY })
		render(<YourRank rows={rows} total={9} />)
		await screen.findByText(/you.re in/)
	})
})

describe("<LeagueTeaser />", () => {
	it("shows players, last week's result and the leaders", () => {
		render(<LeagueTeaser players={87} top={[row(), row({ rank: 2, handle: "Bo", lower: "bo", points: 25, delta: -3 })]} lastWeek={{ week: 3, entrants: 40, beat: 12, tied: 3, lost: 25, bloggerPoints: 16, topPoints: 41 }} open={1} />)
		expect(screen.getByText("87")).toBeTruthy()
		expect(screen.getByText("Beat me, Week 3")).toBeTruthy()
		expect(screen.getByText("12")).toBeTruthy()
		expect((screen.getByRole("link", { name: /Ann/ }) as HTMLAnchorElement).getAttribute("href")).toBe("/league/Ann")
		expect((screen.getByRole("link", { name: /Make your pick/ }) as HTMLAnchorElement).getAttribute("href")).toBe("/league#play")
	})

	it("invites people to join when no game is open, and handles an empty board", () => {
		render(<LeagueTeaser players={0} top={[]} lastWeek={null} open={0} />)
		expect(screen.getByRole("link", { name: /Join the league/ })).toBeTruthy()
		expect(screen.getByText(/No one is on the board yet/)).toBeTruthy()
		expect(screen.queryByText(/Beat me, Week/)).toBeNull()
	})

	it("shows at most three leaders", () => {
		const top = Array.from({ length: 6 }, (_, i) => row({ rank: i + 1, handle: `P${i}`, lower: `p${i}` }))
		render(<LeagueTeaser players={6} top={top} lastWeek={null} open={0} />)
		expect(screen.getAllByRole("listitem")).toHaveLength(3)
	})
})
