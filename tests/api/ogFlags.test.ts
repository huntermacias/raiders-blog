import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn() }, client: { fetch: vi.fn() } }))

import { getFlagFiles, getRoster } from "../../lib/lab/flagsData"
import { costliest, typeSlug } from "../../lib/lab/flagsKit"
import handler from "../../pages/api/og"
import { mockReq, mockRes } from "../helpers/http"

vi.setConfig({ testTimeout: 90_000 })
beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {})
	// No network in a test: every photo fetch fails, so the cards draw initials, which is what they do when a photo is slow.
	vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
})

const file = getFlagFiles()[0]
const worst = costliest(file.flags, 1)[0]
const named = costliest(file.flags.filter((f) => f.ck === "player"), 1)[0]
const team = costliest(file.flags.filter((f) => f.t === "LV"), 1)[0]
const slug = getRoster().byId[named.pid!].s
const type = worst.ty

const get = (query: Record<string, string>) => mockReq({ method: "GET", query })
const size = (png: Buffer) => ({ w: png.readUInt32BE(16), h: png.readUInt32BE(20) })

const VIEWS: [string, Record<string, string>][] = [
	["flag", { kind: "flag", id: worst.id }],
	["flag-team", { kind: "flag", id: file.flags.find((f) => f.ck === "team")!.id }],
	["team", { kind: "team", team: "LV" }],
	["player", { kind: "player", slug }],
	["compare", { kind: "compare", a: "LV", b: "KC" }],
	["board-players", { kind: "board", board: "players" }],
	["board-teams", { kind: "board", board: "teams" }],
	["board-types", { kind: "board", board: "types" }],
	["board-latest", { kind: "board", board: "latest" }],
	["board-worst", { kind: "board", board: "worst" }],
	["penalty", { kind: "penalty", ty: typeSlug(type) }],
	["situation", { kind: "situation", dim: "score" }],
	["situation-team", { kind: "situation", dim: "down", team: "LV" }],
	["situation-field", { kind: "situation", dim: "field", team: "KC" }],
]

describe("/api/og?type=flags", () => {
	it.each(VIEWS.flatMap(([n, q]) => (["wide", "tall"] as const).map((s) => [n, s, q] as const)))("draws the %s card, %s", async (name, sz, q) => {
		const res = mockRes()
		await handler(get({ type: "flags", size: sz, ...q }), res)
		if (res.statusCode !== 200) {
			const dbg = mockRes()
			await handler(get({ type: "flags", size: sz, debug: "1", ...q }), dbg)
			throw new Error(JSON.stringify(dbg.body))
		}
		expect(res.headers["Content-Type"]).toBe("image/png")
		const png = Buffer.from(res.rawBody as Uint8Array)
		expect(size(png)).toEqual(sz === "tall" ? { w: 1080, h: 1350 } : { w: 1200, h: 630 })
		const dir = process.env.FLAGS_CARD_DIR
		if (dir) {
			mkdirSync(dir, { recursive: true })
			writeFileSync(join(dir, `${name}-${sz}.png`), new Uint8Array(png))
		}
	})

	it.each([
		["no kind", {}],
		["an unknown kind", { kind: "nope" }],
		["a flag with a bad id", { kind: "flag", id: "../x" }],
		["a flag that is not on file", { kind: "flag", id: "2026_01_AAA_BBB-9" }],
		["a team that is not one", { kind: "team", team: "ZZ" }],
		["a player nobody knows", { kind: "player", slug: "nobody-here" }],
		["the same team twice", { kind: "compare", a: "LV", b: "LV" }],
		["a board that is not one", { kind: "board", board: "x" }],
		["a penalty that is not one", { kind: "penalty", ty: "not-a-penalty" }],
	])("redirects %s to the default card", async (_l, q) => {
		const res = mockRes()
		await handler(get({ type: "flags", ...q }), res)
		expect(res.statusCode).toBe(302)
		expect(res.redirectedTo).toBe("/og-default-v2.png")
	})

	it("falls back to the score for a situation that names no valid spot, and redirects a team that is not one", async () => {
		const ok = mockRes()
		await handler(get({ type: "flags", kind: "situation", dim: "nope" }), ok)
		expect(ok.statusCode).toBe(200)
		const bad = mockRes()
		await handler(get({ type: "flags", kind: "situation", team: "ZZ" }), bad)
		expect(bad.statusCode).toBe(302)
	})

	it("asks the other season for its own card", async () => {
		const res = mockRes()
		await handler(get({ type: "flags", kind: "team", team: "LV", season: "2025" }), res)
		expect(res.statusCode).toBe(200)
	})

	it("caches a flags card for a day", async () => {
		const res = mockRes()
		await handler(get({ type: "flags", kind: "team", team: "LV" }), res)
		expect(res.headers["Cache-Control"]).toContain("s-maxage=86400")
	})
})

void team
