import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Reads sources, so it runs in the plain node environment.
const root = join(__dirname, "..", "..")
const read = (f: string) => readFileSync(join(root, f), "utf8")
const PAGES = ["page.tsx", "[slug]/page.tsx", "leaders/[group]/page.tsx", "leaders/[group]/[stat]/page.tsx", "compare/page.tsx"].map((f) => `app/(user)/lab/players/${f}`)
const COMPONENTS = readdirSync(join(root, "components/lab/players")).map((f) => `components/lab/players/${f}`)

describe("the Player Lab", () => {
	it("is a Lab tool, listed on the hub and in the sitemap with every profile, board and the comparison", () => {
		expect(read("lib/lab/tools.ts")).toContain('href: "/lab/players"')
		const sitemap = read("pages/sitemap.xml.tsx")
		expect(sitemap).toContain("/lab/players")
		expect(sitemap).toMatch(/leaders/)
		expect(sitemap).toMatch(/compare/)
	})

	it("is built from the JSON in the repo, so every page stays static", () => {
		for (const f of PAGES) {
			const src = read(f)
			expect(src, f).not.toMatch(/export const revalidate/)
			expect(src, f).not.toMatch(/force-dynamic/)
		}
		expect(read("app/(user)/lab/players/[slug]/page.tsx")).toContain("dynamicParams = false")
		expect(read("app/(user)/lab/players/[slug]/page.tsx")).toContain("generateStaticParams")
	})

	it("says when the numbers changed on the pages with numbers, and credits nflverse and Pro Football Reference's charting", () => {
		for (const f of ["app/(user)/lab/players/page.tsx", "app/(user)/lab/players/[slug]/page.tsx", "components/lab/players/BoardPage.tsx"]) {
			expect(read(f), f).toContain('<UpdatedStamp at={data.generatedAt} kind="grades"')
		}
		expect(read("components/lab/UnitsCredit.tsx")).toMatch(/Pro Football Reference/)
		expect(read("scripts/lab/build_players.py")).toMatch(/CC BY 4\.0/)
	})

	it("tells the reader that a small sample is a reason to watch, not a verdict", () => {
		expect(read("app/(user)/lab/players/page.tsx")).toMatch(/Small samples move fast/)
	})

	it("has no dark-only colors, so it works in both Lab themes", () => {
		for (const f of [...PAGES, ...COMPONENTS]) {
			const src = read(f)
			expect(src, f).not.toMatch(/\b(text|bg|border|divide|outline|accent)-white\b/)
			expect(src, f).not.toMatch(/bg-\[#0/)
			expect(src, f).not.toMatch(/rgba\(255,\s*255,\s*255/)
			// Good and bad colors come in a light and a dark shade.
			if (/emerald-/.test(src)) expect(src, f).toMatch(/dark:text-emerald/)
			if (/rose-/.test(src)) expect(src, f).toMatch(/dark:text-rose/)
		}
	})
})

describe("photos and logos", () => {
	const media = read("components/lab/players/Media.tsx")

	it("fall back to the team's color and initials, so a failed image never leaves a hole", () => {
		expect(media).toContain("onError")
		expect(media).toContain("naturalWidth")
		expect(media).toContain("initialsOf")
	})

	it("do not send the reader's address to the image host", () => {
		expect(media).toContain('referrerPolicy="no-referrer"')
	})

	it("load lazily, so a hub of fifty cards does not fetch fifty photos up front", () => {
		expect(media).toContain('loading="lazy"')
	})
})

describe("what the site learns about readers", () => {
	const track = read("lib/lab/track.ts")

	it("sends only names of players, stats and teams, and is safe when analytics is blocked", () => {
		expect(track).toContain("try")
		expect(track).not.toMatch(/localStorage|document\.cookie|navigator\.|userAgent|email/i)
	})

	it("is wired to the page views, searches, comparisons, boards and stat tabs", () => {
		expect(read("app/(user)/lab/players/[slug]/page.tsx")).toContain('event="player_view"')
		expect(read("components/lab/players/BoardPage.tsx")).toContain('event="board_view"')
		expect(read("app/(user)/lab/players/compare/page.tsx")).toContain('event="player_compare"')
		expect(read("components/lab/players/PlayerSearch.tsx")).toContain("player_search_pick")
		expect(read("components/lab/players/ProgressExplorer.tsx")).toContain("player_stat_tab")
	})
})

describe("player cards in posts", () => {
	it("has a card block and a name link in the editor, picked by name from the same data the pages use", () => {
		const block = read("schemas/blockContent.ts")
		expect(block).toContain("name: 'playerCard'")
		expect(block).toContain("name: 'playerLink'")
		expect(block).toContain("PlayerSlugInput")
		const input = read("schemas/playerSlugInput.tsx")
		expect(input).toContain("data/lab/players.json")
		expect(input).toContain("searchIndex")
	})

	it("renders them in the post body, tagging the visit so posts can be told apart in analytics", () => {
		const rich = read("components/RichTextComponents.tsx")
		expect(rich).toContain("playerCard:")
		expect(rich).toContain("playerLink:")
		expect(rich).toContain("?ref=post")
		expect(read("components/lab/players/PlayerEmbed.tsx")).toContain("?ref=post")
	})
})

describe("the player data script", () => {
	const py = read("scripts/lab/build_players.py")

	it("has tests that run before it does in the refresh job, and commits both of its files", () => {
		expect(existsSync(join(root, "scripts/lab/test_build_players.py"))).toBe(true)
		const wf = read(".github/workflows/units.yml")
		expect(wf.indexOf("test_build_players.py")).toBeGreaterThan(-1)
		expect(wf.indexOf("test_build_players.py")).toBeLessThan(wf.indexOf("build_players.py --season"))
		expect(wf).toContain("data/lab/players.json data/lab/player-logs.json")
	})

	it("counts a game only once its last play is in, and keeps PFR rates to games PFR has posted", () => {
		expect(py).toContain("END GAME")
		expect(py).toContain("pfr_ok")
	})

	it("writes the file only when the numbers changed", () => {
		expect(py).toContain("data unchanged")
	})

	it("writes the bios, the game results and the win splits beside the logs", () => {
		expect(py).toContain('"bio": people')
		expect(py).toContain('"res"')
		expect(py).toContain('"win": win')
	})
})
