import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ client: { getDocument: vi.fn() } }))

import { client } from "../../lib/sanity.client"
import { authenticate, generateKey, hashKey, keyMatches, normalizeKey } from "../../lib/league.server"

const getDocument = client.getDocument as unknown as ReturnType<typeof vi.fn>

describe("generateKey", () => {
	it("makes 20 unambiguous characters in four dashed groups", () => {
		for (let i = 0; i < 50; i++) {
			const k = generateKey()
			expect(k).toMatch(/^[A-HJKMNP-Z2-9]{5}(-[A-HJKMNP-Z2-9]{5}){3}$/)
		}
	})

	it("doesn't repeat", () => {
		const keys = new Set(Array.from({ length: 500 }, generateKey))
		expect(keys.size).toBe(500)
	})
})

describe("normalizeKey / hashKey / keyMatches", () => {
	it("ignores case, spaces and dashes", () => {
		expect(normalizeKey("7k3qm-xw9pd 4hnte_b2ygc")).toBe("7K3QMXW9PD4HNTEB2YGC".toUpperCase())
		expect(hashKey("7k3qm xw9pd 4hnte b2ygc")).toBe(hashKey("7K3QM-XW9PD-4HNTE-B2YGC"))
	})

	it("hashes to 64 hex characters and never to the key itself", () => {
		const k = generateKey()
		expect(hashKey(k)).toMatch(/^[0-9a-f]{64}$/)
		expect(hashKey(k)).not.toContain(normalizeKey(k))
	})

	it("matches only the right key", () => {
		const k = generateKey()
		const stored = hashKey(k)
		expect(keyMatches(k, stored)).toBe(true)
		expect(keyMatches(k.toLowerCase(), stored)).toBe(true)
		expect(keyMatches(generateKey(), stored)).toBe(false)
	})

	it.each([undefined, null, 5, "", "short", "A".repeat(19), {}])("rejects the malformed key %j without throwing", (bad) => {
		expect(keyMatches(bad, hashKey(generateKey()))).toBe(false)
	})

	it("rejects a missing or malformed stored hash", () => {
		const k = generateKey()
		expect(keyMatches(k, undefined)).toBe(false)
		expect(keyMatches(k, "not-hex")).toBe(false)
		expect(keyMatches(k, "ab")).toBe(false)
	})
})

describe("authenticate", () => {
	beforeEach(() => getDocument.mockReset())

	const key = generateKey()
	const doc = { _id: "leaguePlayer.ann", handle: "Ann", handleLower: "ann", keyHash: hashKey(key) }

	it("looks up the player by their derived private id", async () => {
		getDocument.mockResolvedValueOnce(doc)
		await authenticate("ANN", key)
		expect(getDocument).toHaveBeenCalledWith("leaguePlayer.ann")
	})

	it("accepts the right handle and key and returns the display handle", async () => {
		getDocument.mockResolvedValueOnce(doc)
		expect(await authenticate("ann", key)).toEqual({ ok: true, handle: "Ann", lower: "ann" })
	})

	it("gives the same answer for an unknown handle and a wrong key", async () => {
		getDocument.mockResolvedValueOnce(null)
		const unknown = await authenticate("nobody", key)
		getDocument.mockResolvedValueOnce(doc)
		const wrong = await authenticate("ann", generateKey())
		expect(unknown).toEqual(wrong)
		expect(unknown).toMatchObject({ ok: false, status: 401 })
	})

	it("rejects a malformed handle without a lookup", async () => {
		const r = await authenticate("no way!", key)
		expect(r).toMatchObject({ ok: false, status: 400 })
		expect(getDocument).not.toHaveBeenCalled()
	})

	it("blocks banned players even with the right key", async () => {
		getDocument.mockResolvedValueOnce({ ...doc, banned: true })
		expect(await authenticate("ann", key)).toMatchObject({ ok: false, status: 403 })
	})
})
