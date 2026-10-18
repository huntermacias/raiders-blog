// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import MyPicksStrip from "../../components/league/MyPicksStrip"
import MyTeamBar from "../../components/league/MyTeamBar"
import { DISMISS_KEY, TEAM_KEY } from "../../lib/league2/myTeam"

type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []

const player = (over: Record<string, unknown> = {}) => ({ signedIn: true, handle: "SilverFan", favoriteTeam: null, next: { kind: "pick", title: "Pick Raiders at Chiefs", detail: "Locks in 2 days.", lockAt: null }, rank: { rank: 3, of: 40, points: 21 }, ...over })

/** A fake site: `strip` is what GET /strip says (404 = accounts off); team saves are recorded and succeed. */
function site(strip: unknown | 404) {
	calls = []
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
			calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined })
			if (url.endsWith("/strip")) return strip === 404 ? new Response("Not found", { status: 404 }) : new Response(JSON.stringify(strip), { status: 200 })
			return new Response(JSON.stringify({ ok: true }), { status: 200 })
		})
	)
}
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))))

beforeEach(() => {
	localStorage.clear()
	sessionStorage.clear()
})
afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

describe("MyTeamBar", () => {
	it("works without accounts: choose a team, it is remembered in this browser, and nothing is sent", async () => {
		site(404)
		render(<MyTeamBar abbr="KC" />)
		await settle()
		fireEvent.click(screen.getByRole("button", { name: "Make the Chiefs my team" }))
		await settle()
		expect(localStorage.getItem(TEAM_KEY)).toBe("KC")
		expect(screen.getByText("The Chiefs are your team")).toBeTruthy()
		expect(screen.queryByText(/Sign in to keep it/)).toBeNull()
		expect(calls.filter((c) => c.method === "POST")).toEqual([])
	})

	it("offers to switch when another team's page is open, with a link back to the chosen team", async () => {
		site(404)
		localStorage.setItem(TEAM_KEY, "DEN")
		render(<MyTeamBar abbr="KC" />)
		await settle()
		expect(screen.getByText("Broncos")).toBeTruthy()
		expect(screen.getByRole("link", { name: "See the Broncos" }).getAttribute("href")).toBe("/lab/will-it-last/den")
		fireEvent.click(screen.getByRole("button", { name: "Make the Chiefs my team" }))
		await settle()
		expect(localStorage.getItem(TEAM_KEY)).toBe("KC")
	})

	it("links the Raiders page to /lab/will-it-last, not /lv", async () => {
		site(404)
		localStorage.setItem(TEAM_KEY, "LV")
		render(<MyTeamBar abbr="KC" />)
		await settle()
		expect(screen.getByRole("link", { name: "See the Raiders" }).getAttribute("href")).toBe("/lab/will-it-last")
	})

	it("lets you choose from the list of all 32 teams", async () => {
		site(404)
		render(<MyTeamBar abbr="LV" />)
		await settle()
		const select = screen.getByLabelText("Choose your team") as HTMLSelectElement
		expect(select.options.length).toBe(33)
		fireEvent.change(select, { target: { value: "GB" } })
		await settle()
		expect(localStorage.getItem(TEAM_KEY)).toBe("GB")
	})

	it("invites a visitor to sign in once a team is chosen, and comes back to this page afterwards", async () => {
		site({ signedIn: false })
		localStorage.setItem(TEAM_KEY, "KC")
		render(<MyTeamBar abbr="KC" />)
		await settle()
		expect(screen.getByRole("link", { name: "Sign in to keep it on every device" }).getAttribute("href")).toBe("/league/sign-in?next=%2Flab%2Fwill-it-last%2Fkc")
	})

	it("saves a team chosen before signing in to the account, once, when the account has none", async () => {
		site(player())
		localStorage.setItem(TEAM_KEY, "DEN")
		render(<MyTeamBar abbr="KC" />)
		await settle()
		await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1))
		expect(calls.find((c) => c.method === "POST")).toMatchObject({ url: "/api/league/account/team", body: { favoriteTeam: "DEN" } })
		expect(screen.getByText("Saved to your account")).toBeTruthy()
	})

	it("uses the account's team over this browser's, and does not overwrite the account", async () => {
		site(player({ favoriteTeam: "BUF" }))
		localStorage.setItem(TEAM_KEY, "DEN")
		render(<MyTeamBar abbr="KC" />)
		await settle()
		expect(screen.getByText("Bills")).toBeTruthy()
		expect(localStorage.getItem(TEAM_KEY)).toBe("BUF")
		expect(calls.filter((c) => c.method === "POST")).toEqual([])
	})

	it("saves a new choice to the account when signed in, and shows it straight away", async () => {
		site(player({ favoriteTeam: "BUF" }))
		render(<MyTeamBar abbr="KC" />)
		await settle()
		fireEvent.click(screen.getByRole("button", { name: "Make the Chiefs my team" }))
		await settle()
		expect(calls.filter((c) => c.method === "POST").map((c) => c.body)).toEqual([{ favoriteTeam: "KC" }])
		expect(screen.getByText("The Chiefs are your team")).toBeTruthy()
	})
})

describe("MyPicksStrip", () => {
	it("shows nothing while accounts are off", async () => {
		site(404)
		const { container } = render(<MyPicksStrip />)
		await settle()
		expect(container.textContent).toBe("")
	})

	it("shows nothing before the browser has asked, so the static page is unchanged", () => {
		site({ signedIn: false })
		const { container } = render(<MyPicksStrip />)
		expect(container.textContent).toBe("")
	})

	it("invites a visitor to join or sign in, and stays hidden for a week once dismissed", async () => {
		site({ signedIn: false })
		const { container, unmount } = render(<MyPicksStrip />)
		await settle()
		expect(screen.getByRole("link", { name: /Join/ }).getAttribute("href")).toBe("/league/register")
		expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/league/sign-in")
		fireEvent.click(screen.getByRole("button", { name: "Hide this for a week" }))
		expect(container.textContent).toBe("")
		expect(Number(localStorage.getItem(DISMISS_KEY))).toBeGreaterThan(0)
		unmount()
		sessionStorage.clear()
		const again = render(<MyPicksStrip />)
		await settle()
		expect(again.container.textContent).toBe("")
	})

	it("shows a signed-in player where they stand, what to do next, and a link to their team", async () => {
		site(player({ favoriteTeam: "KC" }))
		render(<MyPicksStrip />)
		await settle()
		const region = screen.getByRole("region", { name: "Your picks" })
		expect(region.textContent).toContain("SilverFan")
		expect(region.textContent).toContain("#3 of 40")
		expect(screen.getByRole("link", { name: /Pick Raiders at Chiefs/ }).getAttribute("href")).toBe("/league")
		expect(screen.getByRole("link", { name: "Will the Chiefs last?" }).getAttribute("href")).toBe("/lab/will-it-last/kc")
	})

	it("sends an account with no player yet to finish setting up", async () => {
		site(player({ handle: null, next: null, rank: null }))
		render(<MyPicksStrip />)
		await settle()
		expect(screen.getByRole("link", { name: /Finish setting up/ }).getAttribute("href")).toBe("/league")
	})

	it("leaves out the rank before any game has been graded", async () => {
		site(player({ rank: null }))
		render(<MyPicksStrip />)
		await settle()
		expect(screen.getByRole("region", { name: "Your picks" }).textContent).not.toContain("pts")
	})
})
