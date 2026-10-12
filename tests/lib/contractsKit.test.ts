import { describe, expect, it } from "vitest"

import { getContracts } from "@/lib/lab/contractData"
import { getPlayers } from "@/lib/lab/data"
import {
	MIN_POOL,
	dealFor,
	dealsBySlug,
	money,
	moneyRows,
	nameKey,
	payPool,
	payRank,
	sharePct,
	valueBoard,
	valueFor,
} from "@/lib/lab/contractsKit"

const data = getPlayers()
const contracts = getContracts()

describe("money and names", () => {
	it("shows $0.1M precision, K below a million, and no false cents", () => {
		expect(money(35.5)).toBe("$35.5M")
		expect(money(106.5)).toBe("$106.5M")
		expect(money(448)).toBe("$448M")
		expect(money(0.945)).toBe("$945K")
		expect(sharePct(0.1186)).toBe("12%")
		expect(sharePct(0.0089)).toBe("0.9%")
	})
	it("treats D.J. / DJ, Jr. / III and accents as the same name", () => {
		expect(nameKey("D.J. Moore")).toBe(nameKey("DJ Moore"))
		expect(nameKey("Kenneth Walker III")).toBe("kenneth walker")
		expect(nameKey("Dont'e Thornton Jr.")).toBe("donte thornton")
		expect(nameKey("Josué Doe")).toBe("josue doe")
	})
})

describe("matching contracts to players", () => {
	const deals = dealsBySlug(data, contracts)
	it("gives a contract to nearly every graded player on the teams we track", () => {
		const graded = Array.from(new Map(data.players.filter((p) => contracts.teams.includes(p.team)).map((p) => [p.slug, p])).values())
		const missing = graded.filter((p) => !deals.has(p.slug))
		// What is left is a practice-squad name or a returner the cap page does not list.
		expect(graded.length).toBeGreaterThan(900)
		expect(missing.length / graded.length).toBeLessThan(0.03)
	})
	it("holds a full cap page for every one of the 32 teams", () => {
		expect(contracts.teams).toHaveLength(32)
		for (const t of contracts.teams) {
			const rows = contracts.players.filter((r) => r.team === t)
			expect(rows.length, t).toBeGreaterThanOrEqual(50)
			const cap = rows.reduce((n, r) => n + r.cap, 0)
			// A team's listed cap hits sit under the cap; a total near zero or far over means a bad read.
			expect(cap, t).toBeGreaterThan(90)
			expect(cap, t).toBeLessThan(contracts.salaryCap + 10)
		}
	})
	it("matches nicknames between the grades and the cap pages", () => {
		for (const slug of ["sauce-gardner", "riq-woolen"]) expect(dealFor(data, contracts, slug), slug).not.toBeNull()
	})
	it("finds the Raiders who matter", () => {
		for (const slug of ["maxx-crosby", "brock-bowers", "kolton-miller", "tyler-linderbaum", "ashton-jeanty"]) {
			const d = dealFor(data, contracts, slug)
			expect(d, slug).not.toBeNull()
			expect(d!.team).toBe("LV")
			expect(d!.pay).toBeGreaterThan(0)
		}
	})
	it("never assigns one contract to two players or two contracts to one player", () => {
		const rows = new Set<unknown>()
		for (const d of Array.from(deals.values())) {
			expect(rows.has(d.row)).toBe(false)
			rows.add(d.row)
		}
	})
	it("uses a kicker's cap hit when the source gives him no average per year", () => {
		const gay = dealFor(data, contracts, "matt-gay")
		if (gay) {
			expect(gay.apy).toBeNull()
			expect(gay.pay).toBe(gay.cap)
		}
	})
})

describe("ranks and value", () => {
	it("ranks pay only where enough players are tracked", () => {
		for (const g of ["qb", "wr", "cb", "edge", "ol"] as const) {
			const pool = payPool(data, contracts, g)
			for (const e of pool) {
				const r = payRank(data, contracts, e.p.slug)
				if (pool.length < MIN_POOL) expect(r).toBeNull()
				else {
					expect(r!.of).toBe(pool.length)
					expect(r!.rank).toBeGreaterThanOrEqual(1)
					expect(r!.rank).toBeLessThanOrEqual(pool.length)
				}
			}
		}
	})
	it("never calls a bargain or a bust on an early read or a small pool", () => {
		for (const g of ["qb", "rb", "wr", "te", "ol", "edge", "idl", "lb", "cb", "saf"] as const) {
			for (const { value } of valueBoard(data, contracts, g)) {
				if (value.early || value.of < 8) expect(value.verdict).toBeNull()
				else expect(["underpaid", "fair", "overpaid"]).toContain(value.verdict)
				expect(value.gradeRank).toBeGreaterThanOrEqual(1)
				expect(value.payRank).toBeLessThanOrEqual(value.of)
			}
		}
	})
	it("sorts the board with the biggest bargain first", () => {
		const board = valueBoard(data, contracts, "wr")
		for (let i = 1; i < board.length; i++) {
			const [p, q] = [board[i - 1].value, board[i].value]
			// Settled grades first, then early reads; within each, the biggest gap in the player's favor first.
			expect(Number(p.early)).toBeLessThanOrEqual(Number(q.early))
			if (p.early === q.early) expect(p.gap).toBeGreaterThanOrEqual(q.gap)
		}
	})
	it("has a value read for a player who has a grade and a contract", () => {
		const any = valueBoard(data, contracts, "wr")[0] ?? valueBoard(data, contracts, "qb")[0]
		expect(any).toBeTruthy()
		expect(valueFor(data, contracts, any.p.slug)).not.toBeNull()
	})
})

describe("compare rows", () => {
	it("leaves a row out when neither side has the number, and says 'not tracked' when only one does", () => {
		const a = dealFor(data, contracts, "brock-bowers")!
		const rows = moneyRows(a, null, null, null)
		expect(rows.map((r) => r.key)).toContain("apy")
		expect(rows.find((r) => r.key === "apy")!.b).toBe("not tracked")
		expect(moneyRows(null, null, null, null)).toEqual([])
		// A tracked player missing one number says so, instead of looking like he is not tracked at all.
		const tucker = dealFor(data, contracts, "marvin-harrison-jr")!
		expect(moneyRows(a, tucker, null, null).find((r) => r.key === "guaranteed")!.b).toBe("not on file")
	})
})
