import { existsSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { getHub } from "../../lib/lab/hub"
import { type Drop, type HubInput, type Pulse, buildDrops, buildPulse, buildTakes, pickLine, sinceLast, toolTeasers, unitRanks } from "../../lib/lab/hubKit"
import { buildComparison } from "../../lib/lab/compareKit"
import { GROUP_META, gradeScore } from "../../lib/lab/playersKit"
import { LAB_TOOLS } from "../../lib/lab/tools"

const hub = getHub()
const root = join(__dirname, "../..")

describe("the week's drops", () => {
	it("are written from the data and say something in every field", () => {
		expect(hub.drops.length).toBeGreaterThanOrEqual(5)
		for (const d of hub.drops) {
			for (const text of [d.kicker, d.headline, d.detail, d.cta, d.share.text, d.share.alt]) {
				expect(text.length, d.id).toBeGreaterThan(8)
				expect(text, d.id).not.toMatch(/undefined|NaN|null|\[object/)
			}
			expect(d.href.startsWith("/lab"), d.id).toBe(true)
			expect(LAB_TOOLS.some((t) => t.id === d.toolId), d.id).toBe(true)
		}
	})

	it("lead with the playoff race, and never repeat a finding or a player", () => {
		expect(hub.drops[0].kind).toBe("odds")
		const ids = hub.drops.map((d) => d.id)
		expect(new Set(ids).size).toBe(ids.length)
		const faces = hub.drops.filter((d) => d.face).map((d) => d.face!.name)
		expect(new Set(faces).size).toBe(faces.length)
	})

	it("only call a player a riser or faller when he started and the change is more than noise", () => {
		for (const d of hub.drops.filter((x) => x.kind === "riser" || x.kind === "faller")) {
			const p = hub.input.players.players.find((x) => x.slug === d.href.split("/").pop())!
			expect(p.snaps.form?.[0] ?? 0, d.id).toBeGreaterThanOrEqual(0.5)
			expect(Math.abs(p.mover?.z ?? 0), d.id).toBeGreaterThanOrEqual(0.75)
			expect(Math.sign(p.mover!.score), d.id).toBe(d.kind === "riser" ? 1 : -1)
			expect(d.detail).toMatch(/A clear change|Leaning that way/)
		}
	})

	it("share the card the tool itself shares, to a page that exists", () => {
		const pages: Record<string, (d: Drop) => string> = {
			rooting: () => "app/(user)/lab/rooting-guide/page.tsx",
			player: (d) => (d.share.sharePath.startsWith("/lab/players/") ? "app/(user)/lab/players/[slug]/page.tsx" : "?"),
			board: () => "app/(user)/lab/teams/share/page.tsx",
			twins: () => "app/(user)/lab/season-twins/share/page.tsx",
			lab: () => "app/(user)/lab/top-plays/page.tsx",
		}
		for (const d of hub.drops) {
			const page = pages[d.share.type]
			expect(page, `${d.id}: ${d.share.type}`).toBeTruthy()
			expect(existsSync(join(root, page(d))), `${d.id}: ${page(d)}`).toBe(true)
			expect(d.share.query).not.toMatch(/\s/)
		}
	})

	it("leave out what has no data instead of padding", () => {
		const bare: HubInput = { ...hub.input, odds: null, play: null, twin: null }
		const drops = buildDrops(bare)
		expect(drops.some((d) => d.kind === "odds" || d.kind === "play" || d.kind === "twin")).toBe(false)
		expect(drops.length).toBeGreaterThan(0)
		const empty = buildDrops({ ...bare, units: { ...hub.input.units, teams: {} } })
		expect(empty.some((d) => d.kind === "units")).toBe(false)
	})

	it("say a clinched or eliminated Raiders team in words, with no percent to chase", () => {
		const base = hub.input.odds!
		const clinched = buildDrops({ ...hub.input, odds: { ...base, status: "clinched", pct: "Clinched" } })[0]
		expect(clinched.headline).toMatch(/clinched/i)
		expect(clinched.stat).toBeNull()
		const out = buildDrops({ ...hub.input, odds: { ...base, status: "out", pct: "Out" } })[0]
		expect(out.headline).toMatch(/out of the playoff race/)
	})

	it("name the Raiders' best and worst unit from their ranks", () => {
		const ranks = unitRanks(hub.input.units).sort((a, b) => a.rank - b.rank)
		const d = hub.drops.find((x) => x.kind === "units")!
		expect(d.headline).toContain(`No. ${ranks[0].rank}`)
		expect(d.headline).toContain(`No. ${ranks[ranks.length - 1].rank}`)
		expect(d.headline.toLowerCase()).toContain(ranks[0].label.toLowerCase())
	})
})

describe("the pulse and what changed since a reader's last visit", () => {
	const pulse = (extra: Partial<Pulse> = {}): Pulse => ({ week: 5, record: "3-2", odds: 0.5, oddsText: "50%", drops: ["odds:50%", "riser:a"], stamp: 5, ...extra })

	it("holds the week, the record, the odds and one id per drop", () => {
		expect(hub.pulse.week).toBe(hub.input.players.week)
		expect(hub.pulse.record).toMatch(/^\d+-\d+/)
		expect(hub.pulse.drops).toHaveLength(hub.drops.length)
		expect(buildPulse({ ...hub.input, odds: null }, hub.drops).odds).toBeNull()
	})

	it("says nothing is known on a first visit", () => {
		expect(sinceLast(null, pulse())).toEqual({ lines: [], fresh: 0, first: true })
	})

	it("says nothing moved when nothing did, rather than inventing news", () => {
		const s = sinceLast(pulse(), pulse())
		expect(s.first).toBe(false)
		expect(s.lines).toEqual([])
	})

	it("reports the week, the record, the odds in points and how many findings are new", () => {
		const s = sinceLast(pulse({ week: 4, record: "3-1", odds: 0.71, drops: ["odds:71%", "riser:old"] }), pulse())
		expect(s.lines).toEqual(["Week 5 numbers are in (you last saw Week 4).", "The Raiders went from 3-1 to 3-2.", "Playoff odds down 21 points, from 71% to 50%.", "2 new findings below."])
		expect(s.fresh).toBe(2)
		expect(sinceLast(pulse({ odds: 0.49 }), pulse()).lines[0]).toBe("Playoff odds up 1 point, from 49% to 50%.")
	})

	it("skips the odds once the race is settled", () => {
		expect(sinceLast(pulse({ odds: 0.7 }), pulse({ odds: null, oddsText: "Clinched" })).lines.some((l) => /odds/.test(l))).toBe(false)
	})
})

describe("the takes", () => {
	it("are at most three, between different players", () => {
		expect(hub.takes.length).toBeGreaterThanOrEqual(2)
		expect(hub.takes.length).toBeLessThanOrEqual(3)
		const slugs = hub.takes.flatMap((t) => [t.a.slug, t.b.slug])
		expect(new Set(slugs).size).toBe(slugs.length)
	})

	it("give the Lab's answer from the same comparison the Compare page shows", () => {
		for (const t of hub.takes) {
			const c = buildComparison(hub.input.players, { a: t.a.slug, b: t.b.slug, range: "season", metrics: null, group: null, sa: null, sb: null })!
			expect(t.verdict.lead, t.id).toBe(c.overall.lead ?? "even")
			expect(t.href).toBe(`/lab/players/compare?a=${t.a.slug}&b=${t.b.slug}`)
			expect(t.query).toBe(`a=${t.a.slug}&b=${t.b.slug}`)
		}
	})

	it("the box-score trap really is one: the yardage leader is the lower grade, and the Lab says so", () => {
		const t = hub.takes.find((x) => x.id === "trap")
		expect(t, "a trap exists in the data").toBeTruthy()
		const pa = hub.input.players.players.find((p) => p.slug === t!.a.slug)!
		const pb = hub.input.players.players.find((p) => p.slug === t!.b.slug)!
		expect(pa.box.yds).toBeGreaterThan(pb.box.yds)
		expect(gradeScore(hub.input.players, pb)! - gradeScore(hub.input.players, pa)!).toBeGreaterThanOrEqual(8)
		expect(t!.verdict.lead).toBe("b")
		expect(t!.because).toContain(pa.name)
		expect(t!.question.toLowerCase()).toContain(GROUP_META[pa.group].single.toLowerCase())
	})

	it("tell a reader whether the Lab agrees with the side they took", () => {
		const t = { ...hub.takes[0], verdict: { lead: "a" as const, text: "x" } }
		expect(pickLine(t, "a")).toEqual({ agree: true, text: `You picked ${t.a.name}. The Lab agrees.` })
		expect(pickLine(t, "b")).toEqual({ agree: false, text: `You picked ${t.b.name}. The Lab disagrees.` })
		const even = { ...t, verdict: { lead: "even" as const, text: "x" } }
		expect(pickLine(even, "b").agree).toBe(true)
		expect(pickLine(even, "b").text).toMatch(/can't separate them/)
	})
})

describe("the tools' live lines", () => {
	it("belong to real tools and say something", () => {
		const ids = new Set(LAB_TOOLS.map((t) => t.id))
		for (const [id, line] of Object.entries(hub.teasers)) {
			expect(ids.has(id), id).toBe(true)
			expect(line.length).toBeGreaterThan(10)
			expect(line).not.toMatch(/undefined|NaN/)
		}
		// The matchups line is about the Raiders' next game, so it is there only while they have one (not on a bye or after the last game).
		expect(Object.keys(hub.teasers)).toEqual(expect.arrayContaining(["playoff-machine", "players", ...(hub.input.next ? ["matchups"] : [])]))
		expect("matchups" in hub.teasers).toBe(Boolean(hub.input.next))
	})

	it("drop the playoff lines once the race is settled", () => {
		const t = toolTeasers({ ...hub.input, odds: { ...hub.input.odds!, status: "clinched" } }, hub.drops)
		expect(t["playoff-machine"]).toBeUndefined()
	})
})
