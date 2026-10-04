import { describe, expect, it } from "vitest"

import { TEAM_NAMES } from "../../lib/nfl"
import { schemaTypes } from "../../schemas"
import flagPlant from "../../schemas/flagPlant"
import gamePrediction from "../../schemas/gamePrediction"
import powerRankings from "../../schemas/powerRankings"
import raidersSchedule from "../../schemas/raidersSchedule"
import seasonPredictions from "../../schemas/seasonPredictions"

type AnyField = { name: string; validation?: (rule: unknown) => unknown; type?: string; initialValue?: unknown }
type Schema = { name: string; initialValue?: () => Record<string, unknown>; fields?: AnyField[] }
type Validator = (value: unknown, context?: unknown) => true | string

/**
 * Runs a field's `validation: (Rule) => Rule.a().b().custom(fn)` against a
 * stand-in Rule and hands back every custom() function, so the rules written
 * for Studio can be called directly with sample values.
 */
function customRules(schema: Schema, fieldName: string): Validator[] {
	const field = schema.fields?.find((f) => f.name === fieldName)
	if (!field?.validation) throw new Error(`${schema.name}.${fieldName} has no validation`)
	const customs: Validator[] = []
	const rule: Record<string, unknown> = new Proxy(
		{},
		{
			get(_t, prop) {
				if (prop === "custom") {
					return (fn: Validator) => {
						customs.push(fn)
						return rule
					}
				}
				return () => rule
			},
		}
	)
	field.validation(rule)
	return customs
}

const field = (schema: Schema, name: string) => schema.fields?.find((f) => f.name === name)

describe("schema registry", () => {
	it("registers every document and object type once", () => {
		const names = (schemaTypes as Schema[]).map((s) => s.name)
		expect(new Set(names).size).toBe(names.length)
		for (const expected of ["post", "gameReport", "liveEvent", "gamePrediction", "seasonPredictions", "flagPlant", "powerRankings", "raidersSchedule", "author", "category", "blockContent", "comment"]) {
			expect(names, `${expected} missing from schemas/index.ts`).toContain(expected)
		}
	})
})

describe("powerRankings", () => {
	const schema = powerRankings as unknown as Schema

	it("starts a new document with all 32 teams, once each, in a stable order", () => {
		const init = schema.initialValue!() as { season: number; teams: { _key: string; team: string; _type: string }[] }
		expect(init.season).toBe(2026)
		expect(init.teams.map((t) => t.team)).toEqual(TEAM_NAMES)
		expect(new Set(init.teams.map((t) => t._key)).size).toBe(32)
		expect(init.teams.every((t) => t._type === "rankedTeam")).toBe(true)
	})

	describe("teams validation", () => {
		const [validate] = customRules(schema, "teams")
		const teams = (n: number) => TEAM_NAMES.slice(0, n).map((team) => ({ team }))

		it("accepts exactly 32 distinct teams", () => {
			expect(validate(teams(32))).toBe(true)
		})

		it("accepts an empty field (required-ness is handled elsewhere)", () => {
			expect(validate(undefined)).toBe(true)
		})

		it("rejects a list that isn't 32 long", () => {
			expect(validate(teams(31))).toBe("Rank all 32 teams (currently 31)")
			expect(validate([...teams(32), { team: "Extra" }])).toBe("Rank all 32 teams (currently 33)")
		})

		it("rejects a team listed twice, naming it", () => {
			const list = [...teams(31), { team: TEAM_NAMES[0] }]
			expect(validate(list)).toBe(`${TEAM_NAMES[0]} is listed more than once`)
		})
	})
})

describe("seasonPredictions", () => {
	const schema = seasonPredictions as unknown as Schema

	it("starts a new document with all 32 teams at 0-0-0", () => {
		const init = schema.initialValue!() as { teams: { team: string; wins: number; losses: number; ties: number }[]; throughWeek: number; isFinal: boolean }
		expect(init.teams.map((t) => t.team)).toEqual(TEAM_NAMES)
		expect(init.teams.every((t) => t.wins === 0 && t.losses === 0 && t.ties === 0)).toBe(true)
		expect(init.throughWeek).toBe(0)
		expect(init.isFinal).toBe(false)
	})

	it("rejects a team listed twice", () => {
		const [validate] = customRules(schema, "teams")
		expect(validate([{ team: "A" }, { team: "B" }])).toBe(true)
		expect(validate([{ team: "A" }, { team: "A" }])).toBe("A is listed more than once")
		expect(validate(undefined)).toBe(true)
	})
})

describe("raidersSchedule", () => {
	const schema = raidersSchedule as unknown as Schema

	it("starts a new document with 18 numbered weeks", () => {
		const init = schema.initialValue!() as { season: number; games: { week: number; _key: string; bye: boolean }[] }
		expect(init.games).toHaveLength(18)
		expect(init.games.map((g) => g.week)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1))
		expect(new Set(init.games.map((g) => g._key)).size).toBe(18)
		expect(init.games.every((g) => g.bye === false)).toBe(true)
	})

	it("rejects the same week twice", () => {
		const [validate] = customRules(schema, "games")
		expect(validate([{ week: 1 }, { week: 2 }])).toBe(true)
		expect(validate([{ week: 1 }, { week: 1 }])).toBe("Week 1 appears more than once")
		expect(validate(undefined)).toBe(true)
	})

	it("offers every team except the Raiders as an opponent", () => {
		const games = field(schema, "games") as unknown as { of: { fields: { name: string; options?: { list: string[] } }[] }[] }
		const opponent = games.of[0].fields.find((f) => f.name === "opponent")!
		expect(opponent.options!.list).toHaveLength(31)
		expect(opponent.options!.list).not.toContain("Las Vegas Raiders")
	})
})

describe("gamePrediction", () => {
	const schema = gamePrediction as unknown as Schema

	it("won't let a team play itself", () => {
		const [validate] = customRules(schema, "homeTeam")
		const ctx = (away: string) => ({ document: { awayTeam: away } })
		expect(validate("Las Vegas Raiders", ctx("Kansas City Chiefs"))).toBe(true)
		expect(validate("Las Vegas Raiders", ctx("Las Vegas Raiders"))).toBe("Home and away team must be different")
		expect(validate(undefined, ctx("Las Vegas Raiders"))).toBe(true)
		expect(validate("Las Vegas Raiders", { document: {} })).toBe(true)
	})

	it("won't accept a tied predicted score, because a pick has to name a winner", () => {
		const [validate] = customRules(schema, "predictedHomeScore")
		expect(validate(24, { document: { predictedAwayScore: 20 } })).toBe(true)
		expect(validate(20, { document: { predictedAwayScore: 20 } })).toBe("Pick a winner: predicted scores cannot be tied")
		expect(validate(0, { document: { predictedAwayScore: 0 } })).toBe("Pick a winner: predicted scores cannot be tied")
		expect(validate(20, { document: {} })).toBe(true)
	})

	it("requires both final scores or neither", () => {
		const [validate] = customRules(schema, "actualHomeScore")
		expect(validate(undefined, { document: {} })).toBe(true)
		expect(validate(24, { document: { actualAwayScore: 17 } })).toBe(true)
		expect(validate(24, { document: {} })).toBe("Enter both final scores (or neither)")
		expect(validate(undefined, { document: { actualAwayScore: 17 } })).toBe("Enter both final scores (or neither)")
		expect(validate(0, { document: { actualAwayScore: 0 } })).toBe(true)
	})

	it("keeps reader votes read-only so only the vote route can change them", () => {
		for (const name of ["readerVotesAway", "readerVotesHome"]) {
			expect((field(schema, name) as unknown as { readOnly: boolean }).readOnly).toBe(true)
		}
	})
})

describe("flagPlant", () => {
	it("is registered with the fields the scoreboard reads", () => {
		const names = ((flagPlant as unknown as Schema).fields ?? []).map((f) => f.name)
		for (const n of ["season", "week", "text", "result"]) expect(names).toContain(n)
	})
})

// guards the test helper itself: if it silently found no rules, the tests above would prove nothing
describe("customRules helper", () => {
	it("fails loudly when a field has no validation", () => {
		expect(() => customRules({ name: "x", fields: [{ name: "a" }] }, "a")).toThrow()
	})
})
