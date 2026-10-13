// @vitest-environment node
import { writeFileSync } from "node:fs"

import { Resvg } from "@resvg/resvg-js"
import satori from "satori"
import { describe, expect, it, vi } from "vitest"

import { getPlayers } from "../../lib/lab/data"
import { getPlayerLogs } from "../../lib/lab/playerData"
import { OG_HEIGHT, OG_WIDTH, cardSize, renderCard } from "../../lib/og/cards"
import { ogFonts } from "../../lib/og/fonts"
import { insightSpec } from "../../lib/og/insightSpecs"
import { buildPlayerSpec } from "../../lib/og/playerCard"
import { GROUP_ORDER, statInfo } from "../../lib/lab/playersKit"

vi.setConfig({ testTimeout: 60_000 })

const data = getPlayers()
const bios = getPlayerLogs().bio
const query = (slug: string, pos = "") => ({ type: "player", slug, view: "", rank: "", opp: "", week: "", pos })

describe("the player share card spec", () => {
	it("holds a plain summary of one player, with only real numbers", () => {
		const slug = data.players.find((p) => p.group === "te" && p.stats.length >= 4)!.slug
		const s = buildPlayerSpec(data, slug, bios[slug])!
		expect(s.type).toBe("player")
		expect(s.bars.length).toBeLessThanOrEqual(5)
		for (const b of s.bars) {
			expect(b.pct).toBeGreaterThanOrEqual(1)
			expect(b.pct).toBeLessThanOrEqual(99)
			expect(b.rank).toMatch(/^\d+(st|nd|rd|th) of \d+$/)
		}
		const bars = s.bars.map((b) => b.label)
		const p = data.players.find((x) => x.slug === slug)!
		for (const st of p.stats) if (statInfo(p.group, st.k)?.counts === false) expect(bars).not.toContain(statInfo(p.group, st.k)!.label)
		expect(s.badges.length).toBeLessThanOrEqual(3)
		expect(s.color).toMatch(/^#[0-9a-f]{6}$/i)
	})

	it("answers null for someone who is not in the data, and builds one for every player", () => {
		expect(buildPlayerSpec(data, "nobody-here", undefined)).toBeNull()
		for (const g of GROUP_ORDER) {
			const p = data.players.find((x) => x.group === g)
			if (p) expect(buildPlayerSpec(data, p.slug, bios[p.slug], p.group)?.single).toBeTruthy()
		}
	})

	it("is chosen by /api/og only for a clean slug, and is a normal wide card", () => {
		const slug = data.players[0].slug
		expect(insightSpec(query(slug) as never)?.type).toBe("player")
		expect(insightSpec(query("Not A Slug!") as never)).toBeNull()
		expect(insightSpec(query("../etc") as never)).toBeNull()
		expect(cardSize(buildPlayerSpec(data, slug, bios[slug])!)).toEqual({ width: OG_WIDTH, height: OG_HEIGHT })
	})
})

describe("drawing the player card", () => {
	it("renders to a PNG for a star, for a player with a small sample and for one with no photo or bio", async () => {
		const picks = [data.players.find((p) => p.name === "Brock Bowers") ?? data.players[0], data.players.slice().sort((a, b) => a.games - b.games)[0], data.players.find((p) => !bios[p.slug]) ?? data.players[1]]
		for (const p of picks) {
			const spec = buildPlayerSpec(data, p.slug, bios[p.slug], p.group)!
			const svg = await satori(renderCard(spec), { width: OG_WIDTH, height: OG_HEIGHT, fonts: ogFonts() })
			const png = new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } }).render().asPng()
			expect(png.length).toBeGreaterThan(20_000)
		}
	})
})

describe("the player's photo on the share card", () => {
	it("names where the photo is without fetching it, and only for a player who has one", () => {
		const withEspn = data.players.find((p) => p.espn)!
		const spec = buildPlayerSpec(data, withEspn.slug, bios[withEspn.slug], withEspn.group)!
		expect(spec.headshot).toBe(`https://a.espncdn.com/i/headshots/nfl/players/full/${withEspn.espn}.png`)
		expect(spec.photo).toBeUndefined()
		const bare = data.players.find((p) => !p.espn && !p.shot)
		if (bare) expect(buildPlayerSpec(data, bare.slug, bios[bare.slug], bare.group)!.headshot).toBeNull()
		const nfl = data.players.find((p) => !p.espn && p.shot)
		if (nfl) expect(buildPlayerSpec(data, nfl.slug, bios[nfl.slug], nfl.group)!.headshot).toMatch(/f_png/)
	})

	it("draws the photo in a ring when the route supplies it, and draws the same card without it", async () => {
		const p = data.players.find((x) => x.name === "Brock Bowers") ?? data.players[0]
		const spec = buildPlayerSpec(data, p.slug, bios[p.slug], p.group)!
		const face = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="350" height="254"><rect width="350" height="254" fill="#c7c9cc"/><circle cx="175" cy="105" r="62" fill="#a77b5a"/><rect x="85" y="165" width="180" height="89" rx="40" fill="#222"/></svg>').render().asPng()
		const photo = `data:image/png;base64,${Buffer.from(face as unknown as Uint8Array).toString("base64")}`
		const render = async (sp: typeof spec) => {
			const svg = await satori(renderCard(sp), { width: OG_WIDTH, height: OG_HEIGHT, fonts: ogFonts() })
			return new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } }).render().asPng()
		}
		const without = await render(spec)
		const withPhoto = await render({ ...spec, photo })
		expect(withPhoto.length).toBeGreaterThan(20_000)
		expect(withPhoto.length).not.toBe(without.length)
		if (process.env.OG_OUT) writeFileSync(process.env.OG_OUT, withPhoto as unknown as Uint8Array)
	})
})
