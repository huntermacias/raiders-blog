// @vitest-environment jsdom
// The v2 Player Lab pages, rendered with the flag ON on the staged v2 data (loaded fresh in every run, so the default `vitest run`
// covers them): profile, leaderboards (three views), comparison, index copy, the static routes and the URLs v1 already had.
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

type Any = any // eslint-disable-line @typescript-eslint/no-explicit-any
let profile: Any, statPage: Any, groupPage: Any, comparePage: Any, indexPage: Any, data: Any, kit: Any, pk: Any

beforeAll(async () => {
	vi.stubEnv("NEXT_PUBLIC_LAB_METHOD", "v2")
	vi.resetModules()
	profile = await import("../../app/(user)/lab/players/[slug]/page")
	statPage = await import("../../app/(user)/lab/players/leaders/[group]/[stat]/page")
	groupPage = await import("../../app/(user)/lab/players/leaders/[group]/page")
	comparePage = await import("../../app/(user)/lab/players/compare/page")
	indexPage = await import("../../app/(user)/lab/players/page")
	data = (await import("../../lib/lab/data")).getPlayers()
	kit = await import("../../lib/lab/v2/kit")
	pk = await import("../../lib/lab/playersKit")
})
afterAll(() => {
	vi.unstubAllEnvs()
	vi.resetModules()
})
afterEach(cleanup)

const named = (n: string) => data.players.find((p: Any) => p.name === n)
const renderProfile = async (slug: string) => render(await profile.default({ params: Promise.resolve({ slug }) }))
const renderStat = async (group: string, stat: string) => render(await statPage.default({ params: Promise.resolve({ group, stat }) }))

describe("a player's page", () => {
	it("leads with this season, then contribution, then the projection, kept apart", async () => {
		await renderProfile(named("Bryce Young").slug)
		const s = screen.getByTestId("v2-summary")
		const order = ["v2-season", "v2-contribution", "v2-projection"].map((id) => within(s).getByTestId(id))
		for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
		expect(within(s).getByTestId("v2-season-rank").textContent).toMatch(/10th of 40/)
		expect(within(s).getByTestId("v2-contrib-total").textContent).toMatch(/EPA/)
		expect(within(s).getByTestId("v2-proj-grade").textContent).toMatch(/45/)
		expect(within(s).getByTestId("v2-proj-range").textContent).toMatch(/likely \d+ to \d+/)
	})

	it("explains the gap for Young right on the page, in one sentence, not in a methodology page", async () => {
		await renderProfile(named("Bryce Young").slug)
		expect(screen.getByTestId("v2-why").textContent).toMatch(/10th on what he has done this season but 33rd on the projection/)
		expect(screen.getByTestId("v2-share").textContent).toMatch(/14% of this projection is this season/)
	})

	it("explains Nacua and Kittle: first on the projection, lower this season", async () => {
		for (const n of ["Puka Nacua", "George Kittle"]) {
			await renderProfile(named(n).slug)
			expect(screen.getByTestId("v2-why").textContent).toMatch(/1st on the projection/)
			expect(screen.getByTestId("v2-why").textContent).toMatch(/earlier seasons were better/)
			cleanup()
		}
	})

	it("flags a thin sample on the player's own page, and only there", async () => {
		await renderProfile(named("Drew Lock").slug)
		expect(screen.getByTestId("v2-small-sample").textContent).toMatch(/small sample: a typical quarterback has \d+ dropbacks/)
		cleanup()
		await renderProfile(named("Bryce Young").slug)
		expect(screen.queryByTestId("v2-small-sample")).toBeNull()
	})

	it("warns about a new team and says it adjusts nothing", async () => {
		const moved = data.players.find((p: Any) => p.grade && p.teamChanged)
		await renderProfile(moved.slug)
		expect(screen.getByTestId("v2-env").textContent).toMatch(/New team/)
		expect(screen.getByTestId("v2-env").textContent).toMatch(/not adjusted/)
	})

	it("gives a running back components, not one grade, with the tracking coverage said plainly", async () => {
		const rb = data.players.find((p: Any) => p.group === "rb" && p.tracked && p.tracked.of > 0 && kit.componentsOf(data, p).some((c: Any) => c.covered))
		await renderProfile(rb.slug)
		expect(screen.getByTestId("v2-component-grades").textContent).toMatch(/Explosive/i)
		expect(screen.getByTestId("v2-covered").textContent).toMatch(/Tracking data covers \d+ of his \d+ carries \(\d+%\)\. Observed, not graded\./)
		expect(screen.queryByTestId("v2-proj-grade")).toBeNull()
	})

	it("still draws a page for a player who has almost nothing, without a zero where a number is missing", async () => {
		const thin = [...data.players].sort((a: Any, b: Any) => a.games - b.games).find((p: Any) => !p.grade && p.group !== "ol")
		await renderProfile(thin.slug)
		expect(screen.getByTestId("v2-summary")).toBeTruthy()
		expect(document.body.textContent).not.toMatch(/NaN|undefined/)
	})

	it("every v2 player's page renders", async () => {
		const sample = data.players.filter((_: Any, i: number) => i % 12 === 0)
		for (const p of sample) {
			await renderProfile(p.slug)
			expect(document.body.textContent, p.name).not.toMatch(/NaN|undefined|Infinity/)
			cleanup()
		}
	})
})

describe("the leaderboards", () => {
	it("keep every URL v1 had, add contribution and projection, and add nothing for a job without them", async () => {
		const params = statPage.generateStaticParams() as { group: string; stat: string }[]
		for (const g of pk.GROUP_ORDER) for (const b of pk.boards(g)) expect(params, `${g}/${b.path}`).toContainEqual({ group: g, stat: b.path })
		expect(params).toContainEqual({ group: "qb", stat: "projection" })
		expect(params).toContainEqual({ group: "qb", stat: "contribution-so-far" })
		expect(params).not.toContainEqual({ group: "rb", stat: "projection" })
		expect(params).toContainEqual({ group: "rb", stat: "contribution-so-far" })
		expect(groupPage.generateStaticParams().length).toBe(pk.GROUP_ORDER.length)
	})

	it("make this season the default view, with the three leaders side by side", async () => {
		render(await groupPage.default({ params: Promise.resolve({ group: "qb" }) }))
		const tabs = screen.getByTestId("v2-view-tabs")
		const links = within(tabs).getAllByRole("link")
		expect(links.map((l) => l.textContent)).toEqual([
			expect.stringContaining("This season"),
			expect.stringContaining("Contribution so far"),
			expect.stringContaining("Projection"),
		])
		expect(links[0].getAttribute("aria-current")).toBe("page")
		expect(links[0].getAttribute("href")).toBe("/lab/players/leaders/qb/epa-per-dropback")
		expect(links[1].getAttribute("href")).toBe("/lab/players/leaders/qb/contribution-so-far")
		expect(links[2].getAttribute("href")).toBe("/lab/players/leaders/qb/projection")
		expect(within(tabs).getByTestId("v2-leaders-differ").textContent).toMatch(/not a mistake/)
		expect(within(tabs).getByTestId("v2-leader-note-season").textContent).toMatch(/\d+ dropbacks, a small sample/)
	})

	it("show contribution so far with low-volume players marked and unlinked", async () => {
		await renderStat("qb", "contribution-so-far")
		const t = screen.getByTestId("v2-contribution-table")
		expect(within(t).getAllByTestId("v2-low-volume").length).toBeGreaterThan(0)
		expect(screen.getByTestId("v2-board-note").textContent).toMatch(/not who is playing best/)
		const rows = within(t).getAllByRole("row").slice(1)
		const first = within(rows[0]).getAllByRole("cell")[2].textContent!
		expect(first).toMatch(/^\+/)
	})

	it("show the projection with a range and how much of each number is this season, and flag a new team", async () => {
		await renderStat("wr", "projection")
		const t = screen.getByTestId("v2-projection-table")
		const rows = within(t).getAllByRole("row").slice(1)
		expect(rows[0].textContent).toMatch(/Puka Nacua/)
		expect(rows[0].textContent).toMatch(/\d+ to \d+/)
		expect(screen.getByTestId("v2-board-note").textContent).toMatch(/not who is playing best/)
		expect(screen.getAllByTestId("v2-board-env").length).toBeGreaterThan(0)
	})

	it("do not exist for a job the method does not project", async () => {
		await expect(renderStat("rb", "projection")).rejects.toThrow()
	})
})

describe("the comparison page", () => {
	const qbs = () => data.players.filter((p: Any) => p.group === "qb" && p.games >= 4)
	const page = (q: Record<string, string>) => comparePage.default({ searchParams: Promise.resolve(q) })

	it("answers the three questions for two quarterbacks and shows a chance only where one is published", async () => {
		const q = qbs()
		let pair: [Any, Any] | null = null
		for (const a of q) for (const b of q) if (!pair && a.id < b.id && kit.pairChance(data, a, b).kind === "chance") pair = [a, b]
		render(await page({ a: pair![0].slug, b: pair![1].slug }))
		const c = screen.getByTestId("v2-compare")
		for (const id of ["season", "contribution", "projection"]) expect(within(c).getByTestId(`v2-compare-${id}`)).toBeTruthy()
		expect(within(c).getByTestId("v2-compare-contribution-lead").textContent).toMatch(/Shown, not scored/)
		expect(within(c).getByTestId("v2-compare-chance").textContent).toMatch(/not a chance that he is the better quarterback/)
	})

	it("shows no chance for receivers", async () => {
		const w = data.players.filter((p: Any) => p.group === "wr").slice(0, 2)
		render(await page({ a: w[0].slug, b: w[1].slug }))
		expect(screen.queryByTestId("v2-compare-chance")).toBeNull()
		expect(screen.getByTestId("v2-compare-nochance").textContent).toMatch(/No chance of beating the other is shown/)
	})

	it("is absent when a past season or another stretch is chosen, so v2 never mixes seasons", async () => {
		const q = qbs()
		render(await page({ a: q[0].slug, b: q[1].slug, r: "form" }))
		expect(screen.queryByTestId("v2-compare")).toBeNull()
	})
})

describe("the players index", () => {
	it("explains the three views where readers land, not only in a methodology page", () => {
		render(indexPage.default())
		const cards = screen.getByTestId("v2-cards")
		expect(cards.textContent).toMatch(/Who is playing best right now\?/)
		expect(cards.textContent).toMatch(/Who has added the most\?/)
		expect(cards.textContent).toMatch(/Who is likely best going forward\?/)
		const how = screen.getByTestId("v2-how").textContent!
		expect(how).toMatch(/quarterback-only EPA/)
		expect(how).toMatch(/never above 80%/)
		expect(how).toMatch(/Running backs get no single grade/)
		expect(how).toMatch(/new team or a new head coach is flagged/i)
	})
})
