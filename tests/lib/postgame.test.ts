import { describe, expect, it, vi } from "vitest"

import { getGames } from "../../lib/lab/data"
import { KEY_PREFIX, block, buildDraft, dateText, descriptionFor, etDates, factsFrom, labPieces, matchLabGame, mergeBody, notifyText, pickRaidersFinal, pipelineBlocks, slugify, titleFor } from "../../lib/postgame/draft"
import { type Io, createDraft, enrichDrafts } from "../../lib/postgame/run"
import type { LiveGameInfo } from "../../lib/live/types"

const team = (abbr: string, name: string, score: number) => ({ abbr, name, score, record: null, espnId: null })
const game = (over: Partial<LiveGameInfo> & { home?: ReturnType<typeof team>; away?: ReturnType<typeof team> } = {}): LiveGameInfo => ({
	id: "401872976", state: "post", detail: "Final", shortDetail: "Final", period: 4, clockSeconds: 0, kickoff: "2026-10-04T20:25:00Z",
	home: team("LV", "Las Vegas Raiders", 27), away: team("KC", "Kansas City Chiefs", 30), odds: null, venue: "Allegiant Stadium", network: null, possession: null, situation: null, ...over,
})

describe("reading the scoreboard", () => {
	it("picks the newest final Raiders game and ignores live, upcoming and other games", () => {
		const board = [game({ id: "a", state: "in" }), game({ id: "b", kickoff: "2026-09-27T17:00:00Z" }), game({ id: "c" }), game({ id: "d", home: team("DEN", "Denver Broncos", 3), away: team("KC", "Kansas City Chiefs", 9) })]
		expect(pickRaidersFinal(board)?.id).toBe("c")
		expect(pickRaidersFinal([game({ state: "pre" })])).toBeNull()
		expect(pickRaidersFinal([])).toBeNull()
	})

	it("turns a final into the facts Studio stores, from either side of the field", () => {
		const home = factsFrom(game())
		expect(home).toMatchObject({ home: true, opponent: "Kansas City Chiefs", oppAbbr: "KC", raiders: 27, opp: 30, result: "L" })
		const away = factsFrom(game({ home: team("NO", "New Orleans Saints", 27), away: team("LV", "Las Vegas Raiders", 35) }))
		expect(away).toMatchObject({ home: false, opponent: "New Orleans Saints", raiders: 35, opp: 27, result: "W" })
	})

	it("asks for the last few Eastern days, so a late game that is already tomorrow in UTC is still found", () => {
		// 01:30 UTC on the 5th is still the evening of the 4th in New York.
		expect(etDates(new Date("2026-10-05T01:30:00Z"), 3)).toEqual(["20261004", "20261003", "20261002"])
		expect(etDates(new Date("2026-10-05T12:00:00Z"), 2)).toEqual(["20261005", "20261004"])
	})
})

describe("the draft", () => {
	const f = factsFrom(game())

	it("matches how the published reports are stored, winner first in the description", () => {
		expect(descriptionFor(f)).toBe("Kansas City Chiefs 30, Las Vegas Raiders 27 — Allegiant Stadium, October 4, 2026")
		const win = factsFrom(game({ home: team("LV", "Las Vegas Raiders", 35), away: team("KC", "Kansas City Chiefs", 27) }))
		expect(descriptionFor(win)).toBe("Las Vegas Raiders 35, Kansas City Chiefs 27 — Allegiant Stadium, October 4, 2026")
		expect(dateText("2026-09-27T04:44:00.000Z")).toBe("September 27, 2026")
	})

	it("is plainly a draft, with a usable slug", () => {
		expect(titleFor(f, 4)).toBe("DRAFT Week 4: Chiefs 30, Raiders 27")
		expect(titleFor(f, null)).toBe("DRAFT: Chiefs 30, Raiders 27")
		expect(slugify("DRAFT Week 4: Chiefs 30, Raiders 27")).toBe("draft-week-4-chiefs-30-raiders-27")
	})

	it("creates a draft document with the scores, the ESPN id and automatic stats on", () => {
		const doc = buildDraft(f, 4, null, { author: "auth-1", categories: ["cat-a", "cat-b"] }, "uuid-1")
		expect(doc._id).toBe("drafts.uuid-1")
		expect(doc).toMatchObject({ _type: "gameReport", opponent: "Kansas City Chiefs", homeAway: "home", raidersScore: 27, opponentScore: 30, autoStats: true, espnGameId: "401872976" })
		expect(doc.author).toEqual({ _type: "reference", _ref: "auth-1" })
		expect(doc.categories?.map((c) => c._ref)).toEqual(["cat-a", "cat-b"])
		expect(buildDraft(f, 4, null, { author: null, categories: [] }, "u").author).toBeUndefined()
	})

	it("opens the body with a section that says to delete it, and owns only its own blocks", () => {
		const blocks = pipelineBlocks(f, null)
		expect(blocks[0].children[0].text).toMatch(/delete this section before publishing/i)
		expect(blocks.every((b) => b._key.startsWith(KEY_PREFIX))).toBe(true)
		expect(new Set(blocks.map((b) => b._key)).size).toBe(blocks.length)
	})

	it("adds the Lab's pieces once the game is in the Lab, with real links", () => {
		const lab = labPieces(getGames().find((g) => g.week === 3), "LV")!
		const blocks = pipelineBlocks(factsFrom(game({ home: team("NO", "New Orleans Saints", 27), away: team("LV", "Las Vegas Raiders", 35) })), lab)
		const text = blocks.map((b) => b.children.map((c) => c.text).join("")).join("\n")
		expect(text).toMatch(/Lab page: Week 3/)
		expect(text).toMatch(/Play of the game: /)
		expect(text).toMatch(/Fourth downs: /)
		const hrefs = blocks.flatMap((b) => b.markDefs.map((m) => m.href))
		expect(hrefs).toContain("https://www.raidersrundown.com/lab/week-3")
		expect(hrefs.some((h) => h.includes("view=play&rank=1"))).toBe(true)
		expect(hrefs.every((h) => h.startsWith("https://www.raidersrundown.com/"))).toBe(true)
		// Every link mark points at a defined annotation.
		for (const b of blocks) for (const c of b.children) for (const m of c.marks) if (m !== "strong") expect(b.markDefs.some((d) => d._key === m)).toBe(true)
	})

	it("builds a block with a link, bold text and a bullet", () => {
		const b = block("x", ["a ", { text: "b", href: "https://e.com" }, { text: "c", strong: true }], { list: true })
		expect(b.listItem).toBe("bullet")
		expect(b.markDefs).toHaveLength(1)
		expect(b.children[2].marks).toEqual(["strong"])
	})

	it("matches a report to its Lab game by opponent and date", () => {
		const games = getGames()
		expect(matchLabGame(games, "KC", "2026-10-04T20:25:00Z")?.week).toBe(4)
		expect(matchLabGame(games, "KC", "2026-12-20T20:25:00Z")).toBeUndefined()
		expect(matchLabGame(games, "DEN", "2026-10-04T20:25:00Z")).toBeUndefined()
	})

	it("replaces only the pipeline's blocks when it updates a body", () => {
		const mine = (k: string) => ({ _key: `${KEY_PREFIX}${k}` })
		const hunters = [{ _key: "a" }, { _key: "b" }]
		const merged = mergeBody([mine("old1"), ...hunters, mine("old2")], [mine("new1"), mine("new2")])
		expect(merged.map((b) => b._key)).toEqual([`${KEY_PREFIX}new1`, `${KEY_PREFIX}new2`, "a", "b"])
		expect(mergeBody(null, [mine("n")])).toEqual([mine("n")])
	})

	it("says what happened in one line", () => {
		expect(notifyText(f, "created", "https://x/studio", null)).toMatch(/Raiders 27, Kansas City Chiefs 30 \(loss\): final\. A draft game report is waiting in Studio: https:\/\/x\/studio/)
		expect(notifyText(f, "lab", null, labPieces(getGames()[0], "LV"))).toMatch(/Lab pieces are added/)
	})
})

function fakeIo(over: Partial<Io> & { board?: unknown; exists?: boolean; drafts?: unknown[] } = {}) {
	const notify = vi.fn(async () => {})
	const mutate = vi.fn(async () => {})
	const io: Io = {
		now: () => new Date("2026-10-05T03:00:00Z"),
		getJson: async () => over.board ?? { events: [] },
		query: (async (q: string) => {
			if (q.includes("count(")) return over.exists ?? false
			if (q.includes("author")) return { author: "auth-1", categories: ["cat-a"] }
			return over.drafts ?? []
		}) as Io["query"],
		mutate,
		notify,
		log: () => {},
		...over,
	}
	return { io, notify, mutate }
}

const espnBoard = (state: string) => ({
	events: [
		{
			id: "401872976", date: "2026-10-04T20:25Z",
			competitions: [{ status: { type: { state, detail: "Final" } }, venue: { fullName: "Allegiant Stadium" }, competitors: [{ homeAway: "home", score: "27", team: { id: "13", abbreviation: "LV", displayName: "Las Vegas Raiders" } }, { homeAway: "away", score: "30", team: { id: "12", abbreviation: "KC", displayName: "Kansas City Chiefs" } }] }],
		},
	],
})

describe("createDraft", () => {
	it("creates one draft and tells Hunter when the game is final and has no report", async () => {
		const { io, notify, mutate } = fakeIo({ board: espnBoard("post") })
		expect(await createDraft(io, "https://site")).toBe("created")
		expect(mutate).toHaveBeenCalledTimes(1)
		const [[muts]] = mutate.mock.calls as unknown as [[{ createIfNotExists: { _id: string; _type: string; author: { _ref: string } } }[]]]
		expect(muts).toHaveLength(1)
		expect(muts[0].createIfNotExists._id).toMatch(/^drafts\./)
		expect(muts[0].createIfNotExists.author._ref).toBe("auth-1")
		expect(notify).toHaveBeenCalledTimes(1)
		expect(String((notify.mock.calls[0] as unknown[])[0])).toContain("https://site/studio/desk/gameReport;")
	})

	it("does nothing before the game is final", async () => {
		for (const state of ["pre", "in"]) {
			const { io, notify, mutate } = fakeIo({ board: espnBoard(state) })
			expect(await createDraft(io, "https://site")).toBe("none")
			expect(mutate).not.toHaveBeenCalled()
			expect(notify).not.toHaveBeenCalled()
		}
	})

	it("does nothing when a report already exists, draft or published, so it never doubles up", async () => {
		const { io, notify, mutate } = fakeIo({ board: espnBoard("post"), exists: true })
		expect(await createDraft(io, "https://site")).toBe("exists")
		expect(mutate).not.toHaveBeenCalled()
		expect(notify).not.toHaveBeenCalled()
	})

	it("writes nothing on a dry run", async () => {
		const { io, notify, mutate } = fakeIo({ board: espnBoard("post"), dryRun: true })
		await createDraft(io, "https://site")
		expect(mutate).not.toHaveBeenCalled()
		expect(notify).not.toHaveBeenCalled()
	})

	it("survives an ESPN day that fails", async () => {
		let n = 0
		const { io } = fakeIo({ getJson: async () => { if (n++ === 0) throw new Error("boom"); return espnBoard("post") } })
		expect(await createDraft(io, "https://site")).toBe("created")
	})
})

describe("enrichDrafts", () => {
	const draft = (body: unknown) => ({ _id: "drafts.u1", espnGameId: "1", opponent: "Kansas City Chiefs", gameDate: "2026-10-04T20:25:00Z", homeAway: "home", raidersScore: 27, opponentScore: 30, body })

	it("adds the Lab's pieces, keeps what Hunter wrote, and notifies once", async () => {
		const hunter = { _key: "h1", _type: "block", children: [] }
		const { io, notify, mutate } = fakeIo({ drafts: [draft([{ _key: `${KEY_PREFIX}head` }, hunter])] })
		expect(await enrichDrafts(io, "https://site")).toBe(1)
		const [[muts]] = mutate.mock.calls as unknown as [[{ patch: { id: string; set: { body: { _key: string }[] } } }[]]]
		expect(muts[0].patch.id).toBe("drafts.u1")
		const keys = muts[0].patch.set.body.map((b) => b._key)
		expect(keys[keys.length - 1]).toBe("h1")
		expect(keys.filter((k) => k.startsWith(KEY_PREFIX)).length).toBeGreaterThan(3)
		expect(notify).toHaveBeenCalledTimes(1)
	})

	it("does nothing the second time, when the body is already current", async () => {
		const first = fakeIo({ drafts: [draft(null)] })
		await enrichDrafts(first.io, "https://site")
		const body = (first.mutate.mock.calls as unknown as { patch: { set: { body: unknown } } }[][][])[0][0][0].patch.set.body
		const second = fakeIo({ drafts: [draft(JSON.parse(JSON.stringify(body)))] })
		expect(await enrichDrafts(second.io, "https://site")).toBe(0)
		expect(second.mutate).not.toHaveBeenCalled()
		expect(second.notify).not.toHaveBeenCalled()
	})

	it("skips drafts for games the Lab does not have yet, and drafts it cannot place", async () => {
		const { io, mutate } = fakeIo({ drafts: [{ ...draft(null), gameDate: "2026-12-20T20:25:00Z" }, { ...draft(null), opponent: "Nobody" }, { ...draft(null), gameDate: null }] })
		expect(await enrichDrafts(io, "https://site")).toBe(0)
		expect(mutate).not.toHaveBeenCalled()
	})
})
