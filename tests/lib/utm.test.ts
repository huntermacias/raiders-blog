import { describe, expect, it } from "vitest"

import { UTM_STORAGE_KEY, UTM_TTL_MS, captureUtm, cleanValue, isEmptyUtm, loadUtm, parseUtm, sanitizeUtm } from "../../lib/utm"

function memoryStore(initial: Record<string, string> = {}) {
	const data = { ...initial }
	return {
		data,
		getItem: (k: string) => (k in data ? data[k] : null),
		setItem: (k: string, v: string) => {
			data[k] = v
		},
	}
}

const NOW = new Date("2026-10-04T18:00:00Z").getTime()

describe("cleanValue", () => {
	it.each([
		["x", "x"],
		["  X  ", "x"],
		["Week 4 League", "week-4-league"],
		["week4+league", "week4-league"],
		["r/raiders", "rraiders"],
		["<script>alert(1)</script>", "scriptalert1script"],
		["--edge--", "edge"],
		["a.b_c-d", "a.b_c-d"],
		["émoji🔥", "moji"],
	])("%j -> %j", (input, out) => expect(cleanValue(input)).toBe(out))

	it.each([undefined, null, 5, {}, [], "", "   ", "!!!", "💥"])("rejects %j", (v) => expect(cleanValue(v)).toBeUndefined())

	it("caps length at 64", () => expect(cleanValue("a".repeat(500))).toHaveLength(64))
})

describe("parseUtm", () => {
	it("reads all four tags", () => {
		expect(parseUtm("?utm_source=x&utm_medium=social&utm_campaign=week4-league&utm_content=scoring")).toEqual({
			source: "x",
			medium: "social",
			campaign: "week4-league",
			content: "scoring",
		})
	})

	it("works without the leading ? and ignores unrelated params", () => {
		expect(parseUtm("foo=1&utm_source=reddit")).toEqual({ source: "reddit" })
	})

	it("normalizes messy values", () => {
		expect(parseUtm("?utm_source=X&utm_campaign=Week%204%20League")).toEqual({ source: "x", campaign: "week-4-league" })
	})

	it("returns null for untagged links, empty values and utm_content alone", () => {
		expect(parseUtm("")).toBeNull()
		expect(parseUtm("?ref=abc")).toBeNull()
		expect(parseUtm("?utm_source=&utm_campaign=")).toBeNull()
		expect(parseUtm("?utm_content=thread-1")).toBeNull()
	})

	it("ignores utm_term (not tracked) and survives malformed encodings", () => {
		expect(parseUtm("?utm_term=raiders&utm_source=x")).toEqual({ source: "x" })
		expect(() => parseUtm("?utm_source=%E0%A4%A")).not.toThrow()
	})
})

describe("sanitizeUtm / isEmptyUtm", () => {
	it("keeps only known fields, cleaned", () => {
		expect(sanitizeUtm({ source: "X", medium: "Social", campaign: "A B", content: "c", admin: true, __proto__: { source: "evil" } })).toEqual({
			source: "x",
			medium: "social",
			campaign: "a-b",
			content: "c",
		})
	})

	it.each([null, undefined, "x", 5, []])("returns {} for %j", (v) => expect(sanitizeUtm(v)).toEqual({}))

	it("isEmptyUtm", () => {
		expect(isEmptyUtm(null)).toBe(true)
		expect(isEmptyUtm({})).toBe(true)
		expect(isEmptyUtm({ campaign: "x" })).toBe(false)
	})
})

describe("captureUtm / loadUtm (first touch)", () => {
	it("remembers the first tagged landing", () => {
		const store = memoryStore()
		expect(captureUtm("?utm_source=x&utm_campaign=week4", NOW, store)).toEqual({ source: "x", campaign: "week4" })
		expect(loadUtm(NOW + 1000, store)).toEqual({ source: "x", campaign: "week4" })
		expect(JSON.parse(store.data[UTM_STORAGE_KEY])).toEqual({ utm: { source: "x", campaign: "week4" }, at: NOW })
	})

	it("keeps the first campaign when a later link is tagged differently", () => {
		const store = memoryStore()
		captureUtm("?utm_source=x&utm_campaign=first", NOW, store)
		const second = captureUtm("?utm_source=newsletter&utm_campaign=second", NOW + 86_400_000, store)
		expect(second).toEqual({ source: "x", campaign: "first" })
		expect(loadUtm(NOW + 86_400_000, store)).toEqual({ source: "x", campaign: "first" })
	})

	it("an untagged landing never overwrites or clears what's remembered", () => {
		const store = memoryStore()
		captureUtm("?utm_source=x", NOW, store)
		expect(captureUtm("", NOW + 1000, store)).toEqual({ source: "x" })
		expect(loadUtm(NOW + 2000, store)).toEqual({ source: "x" })
	})

	it("forgets after 30 days and lets a new campaign replace it", () => {
		const store = memoryStore()
		captureUtm("?utm_source=x", NOW, store)
		expect(loadUtm(NOW + UTM_TTL_MS - 1, store)).toEqual({ source: "x" })
		expect(loadUtm(NOW + UTM_TTL_MS, store)).toBeNull()
		expect(captureUtm("?utm_source=reddit", NOW + UTM_TTL_MS + 5, store)).toEqual({ source: "reddit" })
	})

	it("returns null when nothing is tagged or remembered", () => {
		expect(captureUtm("", NOW, memoryStore())).toBeNull()
		expect(loadUtm(NOW, memoryStore())).toBeNull()
	})

	it("ignores corrupt, tampered or future-dated storage", () => {
		expect(loadUtm(NOW, memoryStore({ [UTM_STORAGE_KEY]: "{nope" }))).toBeNull()
		expect(loadUtm(NOW, memoryStore({ [UTM_STORAGE_KEY]: JSON.stringify({ utm: { source: "x" } }) }))).toBeNull()
		expect(loadUtm(NOW, memoryStore({ [UTM_STORAGE_KEY]: JSON.stringify({ utm: { source: "x" }, at: NOW + 99999 }) }))).toBeNull()
		expect(loadUtm(NOW, memoryStore({ [UTM_STORAGE_KEY]: JSON.stringify({ utm: "<b>", at: NOW }) }))).toBeNull()
		// Stored values are cleaned on the way out too.
		expect(loadUtm(NOW, memoryStore({ [UTM_STORAGE_KEY]: JSON.stringify({ utm: { source: "X Y" }, at: NOW }) }))).toEqual({ source: "x-y" })
	})

	it("still attributes the visit when storage is unavailable or throws", () => {
		expect(captureUtm("?utm_source=x", NOW, null)).toEqual({ source: "x" })
		const broken = {
			getItem: () => {
				throw new Error("denied")
			},
			setItem: () => {
				throw new Error("denied")
			},
		}
		expect(captureUtm("?utm_source=x", NOW, broken)).toEqual({ source: "x" })
		expect(loadUtm(NOW, broken)).toBeNull()
	})
})
