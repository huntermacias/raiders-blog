import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { hourStamp, stampedUrl } from "../../lib/shareStamp"
import { pagePath } from "../../lib/math/share"
import { shareUrl } from "../../components/live/ShareGame"

describe("stampedUrl", () => {
	it("adds the stamp to a plain address, to one with a query, and ahead of a fragment", () => {
		expect(stampedUrl("https://x.test/a", 7)).toBe("https://x.test/a?v=7")
		expect(stampedUrl("https://x.test/a?b=1&c=2", 7)).toBe("https://x.test/a?b=1&c=2&v=7")
		expect(stampedUrl("https://x.test/a#flags", 7)).toBe("https://x.test/a?v=7#flags")
		expect(stampedUrl("https://x.test/a?b=1#flag-9", "7")).toBe("https://x.test/a?b=1&v=7#flag-9")
	})
	it("replaces an older stamp instead of stacking them", () => {
		expect(stampedUrl("https://x.test/a?v=1&b=2", 9)).toBe("https://x.test/a?b=2&v=9")
		expect(stampedUrl(stampedUrl("https://x.test/a", 1), 2)).toBe("https://x.test/a?v=2")
	})
	it("leaves the address alone when there is no stamp", () => {
		for (const none of [null, undefined, 0, ""]) expect(stampedUrl("https://x.test/a#f", none)).toBe("https://x.test/a#f")
	})
	it("changes once an hour", () => {
		expect(hourStamp(0)).toBe(0)
		expect(hourStamp(3_599_999)).toBe(0)
		expect(hourStamp(3_600_000)).toBe(1)
	})
})

describe("the other share links carry a stamp too", () => {
	it("the Blogger vs. the Math page link", () => {
		expect(pagePath({ team: "LV", week: 4 }, 99)).toBe("/rankings/math?team=LV&week=4&v=99")
		expect(pagePath({}, 99)).toBe("/rankings/math?v=99")
		expect(pagePath({ team: "LV" })).toBe("/rankings/math?team=LV")
	})
	it("a live game link", () => {
		expect(shareUrl("https://x.test", "g1", 60_000 * 5)).toBe("https://x.test/live?game=g1&v=5")
	})
})

// Every place that sends a link out of the site (a post on X, a copied link, the phone's share sheet) has to put a version on it, or X keeps
// showing the first card it saw for that address, which is how a playoff card from 3-1 showed up after the team was 3-2. New share buttons
// have to be added here on purpose.
describe("every share button stamps its link", () => {
	const root = join(__dirname, "..", "..")
	const read = (f: string) => readFileSync(join(root, f), "utf8")
	const files: Record<string, RegExp> = {
		"components/lab/ShareCard.tsx": /v=\$\{stamp\}/,
		"components/ShareOnX.tsx": /stampedUrl\(url, v\)/,
		"components/lab/WinProbabilityReplay.tsx": /stampedUrl\(/,
		"components/league/ChallengeLink.tsx": /stampedUrl\(challengeUrl/,
		"components/lab/players/CompareShare.tsx": /stampedUrl\(`\$\{SITE_URL\}\/lab\/players\/compare/,
		"components/live/ShareGame.tsx": /&v=\$\{/,
		"components/math/ShareMenu.tsx": /pagePath\(view, stamp\)/,
		"components/rankings/RankingsShare.tsx": /stampedUrl\(url, stamp\)/,
	}
	for (const [file, token] of Object.entries(files)) {
		it(`${file} puts the stamp on the link`, () => {
			expect(read(file)).toMatch(token)
		})
	}

	it("sends no post to X from anywhere else", () => {
		const walk = (dir: string): string[] => {
			const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs")
			return readdirSync(join(root, dir)).flatMap((n: string) => {
				const rel = `${dir}/${n}`
				return statSync(join(root, rel)).isDirectory() ? walk(rel) : /\.(ts|tsx)$/.test(n) ? [rel] : []
			})
		}
		const hits = ["components", "app", "lib", "pages"]
			.flatMap(walk)
			.filter((f) => /intent\/tweet/.test(read(f)))
			.sort()
		// ShareOnX stamps the link it is given; the math xIntent is only ever given ShareMenu's stamped address.
		expect(hits).toEqual(["components/ShareOnX.tsx", "components/lab/ShareCard.tsx", "components/lab/WinProbabilityReplay.tsx", "components/lab/players/CompareShare.tsx", "lib/math/share.ts"])
	})
})
