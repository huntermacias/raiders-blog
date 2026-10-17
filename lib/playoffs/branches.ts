// Saved scenarios ("snapshots") for comparing: a name and a set of picks, kept in this browser. They are checked against
// the schedule on the way in, so a snapshot from an older schedule loses the picks that no longer apply instead of
// breaking the page. Nothing here is sent anywhere.

import { sanitizePicks } from "./picks"
import type { Game, Predictions } from "./types"

export const BRANCHES_KEY = "rr.playoff-machine.snapshots"
export const BRANCHES_VERSION = 1
export const MAX_BRANCHES = 12
export const MAX_NAME = 40

export type Branch = { id: string; name: string; picks: Predictions; savedAt: number }

type ReadStore = Pick<Storage, "getItem">
type WriteStore = Pick<Storage, "setItem">

/** A name a reader typed, made safe to show: no control characters, one line, a sensible length. */
export function cleanName(name: string): string {
	return name.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NAME)
}

export function loadBranches(store: ReadStore | null, season: number, games: readonly Game[]): Branch[] {
	try {
		if (!store) return []
		const raw = store.getItem(BRANCHES_KEY)
		if (!raw) return []
		const data = JSON.parse(raw) as { v?: number; season?: number; branches?: unknown }
		if (!data || data.v !== BRANCHES_VERSION || data.season !== season || !Array.isArray(data.branches)) return []
		const out: Branch[] = []
		for (const b of data.branches as Partial<Branch>[]) {
			if (!b || typeof b.id !== "string" || typeof b.name !== "string" || typeof b.picks !== "object" || b.picks === null) continue
			out.push({ id: b.id.slice(0, 24), name: cleanName(b.name) || "Scenario", picks: sanitizePicks(games, b.picks as Predictions), savedAt: typeof b.savedAt === "number" ? b.savedAt : 0 })
			if (out.length >= MAX_BRANCHES) break
		}
		return out
	} catch {
		return []
	}
}

export function saveBranches(store: WriteStore | null, season: number, branches: readonly Branch[]): void {
	try {
		if (!store) return
		store.setItem(BRANCHES_KEY, JSON.stringify({ v: BRANCHES_VERSION, season, branches: branches.slice(0, MAX_BRANCHES) }))
	} catch {
		// Storage can be full or blocked. Snapshots then last until the page is closed.
	}
}

/** Adds a snapshot, newest first. When the list is full the oldest goes. Ids are derived from the time and the count so tests can fix `now`. */
export function addBranch(branches: readonly Branch[], name: string, picks: Predictions, now = Date.now()): Branch[] {
	const clean = cleanName(name) || `Scenario ${branches.length + 1}`
	const id = `${now.toString(36)}${branches.length.toString(36)}`
	return [{ id, name: clean, picks: { ...picks }, savedAt: now }, ...branches].slice(0, MAX_BRANCHES)
}

export function removeBranch(branches: readonly Branch[], id: string): Branch[] {
	return branches.filter((b) => b.id !== id)
}
