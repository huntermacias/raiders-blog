import { describe, expect, it } from "vitest"

import { getFlagFiles, getRoster } from "../../lib/lab/flagsData"
import { totals, typeSlug } from "../../lib/lab/flagsKit"
import { buildFlagsSpec } from "../../lib/og/flagsSpec"

const file = getFlagFiles()[0]
const lv = file.flags.filter((f) => f.t === "LV")

describe("buildFlagsSpec", () => {
	it("draws a team card from that team's flags", () => {
		const spec = buildFlagsSpec({ kind: "team", team: "LV" }, "wide")
		expect(spec?.kind).toBe("team")
		if (spec?.kind !== "team") return
		expect(spec.season).toBe(file.season)
		expect(spec.stats.flags).toBe(String(totals(lv).flags))
		expect(spec.name.length).toBeGreaterThan(0)
		expect(spec.bars.length).toBeGreaterThan(0)
		for (const f of spec.faces) expect(spec.heads[f.head]).toBeTruthy()
	})

	it("is null for a team, flag, player or penalty that is not on file", () => {
		expect(buildFlagsSpec({ kind: "team", team: "ZZ" }, "wide")).toBeNull()
		expect(buildFlagsSpec({ kind: "flag", id: "2026_01_AA_BB-1" }, "wide")).toBeNull()
		expect(buildFlagsSpec({ kind: "player", slug: "nobody-here" }, "wide")).toBeNull()
		expect(buildFlagsSpec({ kind: "penalty", ty: "not-a-penalty" }, "wide")).toBeNull()
	})

	it("draws a single flag with the culprit's photo address when the roster has one", () => {
		const f = file.flags.find((x) => x.pid && getRoster().byId[x.pid]?.e) ?? file.flags[0]
		const spec = buildFlagsSpec({ kind: "flag", id: f.id }, "tall")
		expect(spec?.kind).toBe("flag")
		if (spec?.kind !== "flag") return
		expect(spec.size).toBe("tall")
		expect(spec.ty).toBe(f.ty)
		if (f.ck !== "team" && f.pid) expect(spec.heads[spec.head ?? 0]?.url ?? "").toMatch(/^https:/)
	})

	it("gives a team penalty a team badge in place of a face", () => {
		const f = file.flags.find((x) => x.ck === "team")
		if (!f) return
		const spec = buildFlagsSpec({ kind: "flag", id: f.id }, "wide")
		if (spec?.kind !== "flag") throw new Error("no flag spec")
		expect(spec.heads[0]?.name).toBe(f.t)
		expect(spec.heads[0]?.url).toBeNull()
	})

	it("compares two teams on the same measures, and quotes the biggest gaps", () => {
		const spec = buildFlagsSpec({ kind: "compare", a: "LV", b: "KC" }, "wide")
		expect(spec?.kind).toBe("compare")
		if (spec?.kind !== "compare") return
		expect(spec.a.team).toBe("LV")
		expect(spec.b.team).toBe("KC")
		expect(spec.pairs.length).toBeGreaterThanOrEqual(4)
		for (const p of spec.pairs) {
			expect(p.fa).toBeGreaterThanOrEqual(0)
			expect(p.fa).toBeLessThanOrEqual(1)
			expect(p.fb).toBeGreaterThanOrEqual(0)
			expect(p.fb).toBeLessThanOrEqual(1)
		}
	})

	it("draws every board", () => {
		for (const board of ["latest", "worst", "players", "teams", "types"] as const) {
			const spec = buildFlagsSpec({ kind: "board", board }, "wide")
			expect(spec?.kind, board).toBe("board")
			if (spec?.kind === "board") expect(spec.rows.length, board).toBeGreaterThan(0)
		}
	})

	it("draws a penalty card and a situation card for the league and for a team", () => {
		const ty = typeSlug(file.flags[0].ty)
		expect(buildFlagsSpec({ kind: "penalty", ty }, "wide")?.kind).toBe("penalty")
		const lg = buildFlagsSpec({ kind: "situation", dim: "down" }, "wide")
		expect(lg?.kind).toBe("situation")
		const t = buildFlagsSpec({ kind: "situation", dim: "score", team: "LV" }, "tall")
		expect(t?.kind).toBe("situation")
		if (lg?.kind === "situation") expect(lg.rows.length).toBeGreaterThan(2)
	})

	it("reads an older season when the view names one", () => {
		const old = getFlagFiles()[1]
		if (!old) return
		const spec = buildFlagsSpec({ kind: "team", team: "LV", season: old.season }, "wide")
		expect(spec?.season).toBe(old.season)
	})
})
