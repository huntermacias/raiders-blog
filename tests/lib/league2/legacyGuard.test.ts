import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ enabled: false, pool: null as null | { query: (t: string, p?: unknown[]) => Promise<{ rows: { state: string }[]; rowCount: number }> } }))
vi.mock("../../../lib/league2/auth/server", () => ({ accountsEnabled: () => state.enabled }))
vi.mock("../../../lib/league2/db", () => ({ sharedPool: () => state.pool }))

import { KEYS_CLOSED_MESSAGE, UPGRADED_MESSAGE, guardLegacyJoin, guardLegacyKey, legacyKeyState } from "../../../lib/league2/legacyGuard"

const withState = (s: string | undefined) => ({ query: async () => ({ rows: s ? [{ state: s }] : [], rowCount: s ? 1 : 0 }) }) as never

describe("legacy key guard", () => {
	beforeEach(() => {
		state.enabled = false
		state.pool = null
	})

	it("lets unclaimed and mid-claim keys keep working, and blocks claimed and retired ones", async () => {
		expect(await legacyKeyState(withState("unclaimed"), "ann")).toEqual({ blocked: false })
		expect(await legacyKeyState(withState("claiming"), "ann")).toEqual({ blocked: false })
		expect(await legacyKeyState(withState(undefined), "ann")).toEqual({ blocked: false })
		expect(await legacyKeyState(withState("claimed"), "ann")).toEqual({ blocked: true, status: 403, message: UPGRADED_MESSAGE })
		expect(await legacyKeyState(withState("retired"), "ann")).toEqual({ blocked: true, status: 403, message: UPGRADED_MESSAGE })
	})

	it("does nothing while accounts are off, without touching the database", async () => {
		const query = vi.fn()
		state.pool = { query } as never
		expect(await guardLegacyKey("ann", "down")).toEqual({ blocked: false })
		expect(guardLegacyJoin()).toEqual({ blocked: false })
		expect(query).not.toHaveBeenCalled()
	})

	it("refuses an upgraded key once accounts are on", async () => {
		state.enabled = true
		state.pool = withState("claimed") as never
		expect(await guardLegacyKey("ann", "down")).toMatchObject({ blocked: true, status: 403 })
	})

	it("fails closed when the database cannot answer", async () => {
		state.enabled = true
		state.pool = null
		expect(await guardLegacyKey("ann", "down")).toEqual({ blocked: true, status: 503, message: "down" })
		state.pool = { query: async () => Promise.reject(new Error("boom")) } as never
		expect(await guardLegacyKey("ann", "down")).toEqual({ blocked: true, status: 503, message: "down" })
	})

	it("closes new key sign-ups when accounts are on", () => {
		state.enabled = true
		expect(guardLegacyJoin()).toEqual({ blocked: true, status: 403, message: KEYS_CLOSED_MESSAGE })
	})
})
