// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import PlayerPage from "../../app/(user)/lab/players/[slug]/page"
import { getPlayers } from "../../lib/lab/data"
import { getPlayerHistory } from "../../lib/lab/playerHistoryData"
import { statInfo } from "../../lib/lab/playersKit"
import { seasonData } from "../../lib/lab/seasonKit"

vi.setConfig({ testTimeout: 120_000 })
afterEach(cleanup)

// The players file the builder writes can carry stats a method's catalog has no entry for (the v1 file now holds the v2-only ones). A page for a
// local run on either method must show the stats it knows and skip the rest, never crash on them.
describe("player pages, on whichever method the site runs", () => {
	const data = getPlayers()

	it("has an entry in the catalog for every stat a player carries", () => {
		for (const p of data.players) for (const s of p.stats) expect(statInfo(p.group, s.k), `${p.group}.${s.k}`).toBeTruthy()
	})

	it("has the same for each past season on file", () => {
		for (const y of data.priorSeasons ?? []) {
			const d = seasonData(data, getPlayerHistory(), y)
			for (const p of d.players) for (const s of p.stats) expect(statInfo(p.group, s.k), `${y} ${p.group}.${s.k}`).toBeTruthy()
		}
	})

	it("renders a page for a spread of players across every job", async () => {
		const seen = new Set<string>()
		const sample = data.players.filter((p, i) => {
			const first = !seen.has(p.group)
			seen.add(p.group)
			return first || i % 25 === 0
		})
		for (const p of sample) {
			render(await PlayerPage({ params: Promise.resolve({ slug: p.slug }) }))
			expect(document.body.textContent, p.name).not.toMatch(/NaN|undefined|Infinity/)
			cleanup()
		}
	})
})
