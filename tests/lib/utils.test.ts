// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"

import { cn, hasVoted, markVoted } from "../../lib/utils"

describe("cn", () => {
	it("joins class names and drops falsy values", () => {
		expect(cn("a", false && "b", undefined, null, "c")).toBe("a c")
	})

	it("lets the later Tailwind class win a conflict", () => {
		expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4")
		expect(cn("text-sm", { "text-lg": true })).toBe("text-lg")
	})
})

describe("vote guard", () => {
	afterEach(() => {
		window.localStorage.clear()
		vi.restoreAllMocks()
	})

	it("remembers a vote per key", () => {
		expect(hasVoted("pick:1")).toBe(false)
		markVoted("pick:1")
		expect(hasVoted("pick:1")).toBe(true)
		expect(hasVoted("pick:2")).toBe(false)
	})

	it("treats blocked storage as 'not voted' instead of throwing", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("denied")
		})
		expect(hasVoted("pick:1")).toBe(false)
	})

	it("does not throw when it can't save", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("quota")
		})
		expect(() => markVoted("pick:1")).not.toThrow()
	})
})
