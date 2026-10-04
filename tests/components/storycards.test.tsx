// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// urlFor builds Sanity image URLs; the cards only need *a* URL back.
vi.mock("../../lib/urlFor", () => ({
	cardImageUrl: (img: { id?: string } | undefined) => `https://cdn.example/card-${img?.id ?? "none"}.jpg`,
	thumbImageUrl: (img: { id?: string } | undefined) => `https://cdn.example/thumb-${img?.id ?? "none"}.jpg`,
	hotspotPosition: (img: { x?: number } | undefined) => (img?.x ? `${img.x}% 50%` : "50% 50%"),
}))

import BlogList from "../../components/BlogList"
import GameReportsTeaser from "../../components/GameReportsTeaser"
import RelatedGameReports from "../../components/RelatedGameReports"
import RelatedPosts from "../../components/RelatedPosts"
import StoryCard, { StoryMeta } from "../../components/StoryCard"

afterEach(cleanup)

describe("<StoryCard />", () => {
	const base = { href: "/post/x", imageUrl: "https://cdn.example/x.jpg", sizes: "100vw", title: "A title" }

	it("is one link to the story with the picture behind the text", () => {
		render(<StoryCard {...base} imagePosition="20% 30%" description="A blurb" badges={["Previews"]} meta={<p>Sep 20</p>} />)
		const link = screen.getByRole("link") as HTMLAnchorElement
		expect(link.getAttribute("href")).toBe("/post/x")
		const img = link.querySelector("img") as HTMLImageElement
		expect(img.getAttribute("src")).toBe("https://cdn.example/x.jpg")
		// Decorative: the link's name comes from the title, not a repeated alt.
		expect(img.getAttribute("alt")).toBe("")
		expect(img.style.objectPosition).toBe("20% 30%")
		expect(within(link).getByRole("heading", { level: 3 }).textContent).toBe("A title")
		expect(link.textContent).toContain("A blurb")
		expect(link.textContent).toContain("Previews")
		expect(link.textContent).toContain("Read")
	})

	it("has no separate text panel under the picture (text sits on the image)", () => {
		const { container } = render(<StoryCard {...base} description="d" meta={<p>m</p>} />)
		const link = container.querySelector("a") as HTMLElement
		// Everything is stacked inside the one image-backed link: the image and fade are absolutely positioned.
		expect(link.className).toContain("relative")
		expect(link.className).toContain("overflow-hidden")
		expect(link.className).not.toContain("bg-card")
		expect(link.querySelector("img")!.className).toContain("-z-10")
		expect(link.querySelector("[aria-hidden].bg-gradient-to-t")).toBeTruthy()
	})

	it("hides the arrow label when cta is empty and omits empty badge/description rows", () => {
		const { container } = render(<StoryCard {...base} cta="" />)
		expect(container.textContent).toBe("A title")
	})

	it("renders a corner overlay such as a W/L chip", () => {
		render(<StoryCard {...base} corner={<span>W 31-17</span>} />)
		expect(screen.getByText("W 31-17")).toBeTruthy()
	})

	it("StoryMeta dates in Pacific time and only shows read time when given", () => {
		const { rerender } = render(<StoryMeta date="2026-09-21T03:00:00Z" minutes={4} />)
		expect(screen.getByText("Sep 20, 2026", { exact: false })).toBeTruthy()
		expect(screen.getByText("4 min read", { exact: false })).toBeTruthy()
		rerender(<StoryMeta date="2026-09-21T03:00:00Z" />)
		expect(screen.queryByText("min read", { exact: false })).toBeNull()
	})
})

describe("<BlogList />", () => {
	const post = (n: number, over: Record<string, unknown> = {}) =>
		({
			_id: `p${n}`,
			title: `Post ${n}`,
			description: `About ${n}`,
			slug: { current: `post-${n}` },
			_createdAt: "2026-09-20T19:00:00Z",
			mainImage: { id: n },
			readMinutes: n + 1,
			categories: [
				{ _id: "c1", title: "Previews" },
				{ _id: "c2", title: "Analysis" },
				{ _id: "c3", title: "Extra" },
			],
			body: [],
			...over,
		}) as unknown as Post

	it("shows every story as an image card linking to its post, with read time", () => {
		render(<BlogList posts={[post(1), post(2)]} />)
		for (const n of [1, 2]) {
			const link = screen.getByRole("link", { name: new RegExp(`Post ${n}`) }) as HTMLAnchorElement
			expect(link.getAttribute("href")).toBe(`/post/post-${n}`)
			expect(link.textContent).toContain(`${n + 1} min read`)
			expect(link.querySelector("img")!.getAttribute("src")).toBe(`https://cdn.example/card-${n}.jpg`)
		}
	})

	it("keeps stories already featured out of the unfiltered list, but searchable", () => {
		render(<BlogList posts={[post(1), post(2)]} featuredIds={["p1"]} />)
		expect(screen.queryByRole("link", { name: /Post 1/ })).toBeNull()
		fireEvent.change(screen.getByLabelText("Search articles"), { target: { value: "post 1" } })
		expect(screen.getByRole("link", { name: /Post 1/ })).toBeTruthy()
	})

	it("limits each card to two category badges", () => {
		render(<BlogList posts={[post(1)]} />)
		const link = screen.getByRole("link", { name: /Post 1/ })
		expect(within(link).getByText("Previews")).toBeTruthy()
		expect(within(link).getByText("Analysis")).toBeTruthy()
		expect(within(link).queryByText("Extra")).toBeNull()
	})

	it("filters by category and shows the empty state", () => {
		render(<BlogList posts={[post(1, { categories: [{ _id: "c9", title: "Recaps" }] }), post(2)]} />)
		fireEvent.click(screen.getByRole("button", { name: "Recaps" }))
		expect(screen.getByRole("link", { name: /Post 1/ })).toBeTruthy()
		expect(screen.queryByRole("link", { name: /Post 2/ })).toBeNull()
		fireEvent.click(screen.getByRole("button", { name: "All" }))
		fireEvent.change(screen.getByLabelText("Search articles"), { target: { value: "zzz" } })
		expect(screen.getByText(/No articles match/)).toBeTruthy()
	})

	it("tolerates a post with no categories or image", () => {
		render(<BlogList posts={[post(1, { categories: undefined, mainImage: undefined })]} />)
		expect(screen.getByRole("link", { name: /Post 1/ })).toBeTruthy()
	})
})

describe("<GameReportsTeaser />", () => {
	const game = (n: number, mine: number, theirs: number) =>
		({ _id: `g${n}`, title: `Recap ${n}`, slug: { current: `g-${n}` }, opponent: `Team${n}`, gameDate: "2026-09-14T20:00:00Z", raidersScore: mine, opponentScore: theirs, mainImage: { id: n } }) as unknown as GameReport

	it("renders nothing without games", () => {
		const { container } = render(<GameReportsTeaser games={[]} />)
		expect(container.innerHTML).toBe("")
	})

	it("shows each game as an image card with its W/L result", () => {
		render(<GameReportsTeaser games={[game(1, 31, 17), game(2, 10, 20)]} />)
		const w = screen.getByRole("link", { name: /vs Team1/ })
		expect(w.getAttribute("href")).toBe("/games/g-1")
		expect(w.textContent).toContain("W 31-17")
		const l = screen.getByRole("link", { name: /vs Team2/ })
		expect(l.textContent).toContain("L 10-20")
		expect(screen.getByRole("link", { name: /View all/ }).getAttribute("href")).toBe("/games")
	})
})

describe("related cards", () => {
	it("RelatedPosts links each story and shows read time only when it has a word count", () => {
		const posts = [
			{ _id: "a", title: "With words", slug: { current: "with-words" }, mainImage: { id: 1 }, _createdAt: "2026-09-20T19:00:00Z", words: 2250 },
			{ _id: "b", title: "No words", slug: { current: "no-words" }, mainImage: { id: 2 }, _createdAt: "2026-09-20T19:00:00Z" },
		]
		render(<RelatedPosts posts={posts} />)
		const a = screen.getByRole("link", { name: /With words/ }) as HTMLAnchorElement
		expect(a.getAttribute("href")).toBe("/post/with-words")
		expect(a.textContent).toContain("10 min read")
		expect(screen.getByRole("link", { name: /No words/ }).textContent).not.toContain("min read")
		expect(a.querySelector("img")!.getAttribute("src")).toBe("https://cdn.example/thumb-1.jpg")
	})

	it("RelatedPosts renders nothing when empty", () => {
		const { container } = render(<RelatedPosts posts={[]} />)
		expect(container.innerHTML).toBe("")
	})

	it("RelatedGameReports shows vs/at, the result and the date", () => {
		const games = [
			{ _id: "a", title: "Home win", slug: { current: "home-win" }, opponent: "Saints", homeAway: "home" as const, gameDate: "2026-09-21T20:00:00Z", raidersScore: 24, opponentScore: 20, mainImage: { id: 1 } },
			{ _id: "b", title: "Road loss", slug: { current: "road-loss" }, opponent: "Chiefs", homeAway: "away" as const, gameDate: "2026-09-28T20:00:00Z", raidersScore: 3, opponentScore: 27, mainImage: { id: 2 } },
		]
		render(<RelatedGameReports games={games} />)
		const home = screen.getByRole("link", { name: /Home win/ })
		expect(home.getAttribute("href")).toBe("/games/home-win")
		expect(home.textContent).toContain("vs Saints")
		expect(home.textContent).toContain("W 24-20")
		const away = screen.getByRole("link", { name: /Road loss/ })
		expect(away.textContent).toContain("at Chiefs")
		expect(away.textContent).toContain("L 3-27")
	})
})
