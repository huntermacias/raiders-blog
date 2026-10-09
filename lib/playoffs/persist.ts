// Keeping a visitor's picks between visits, in the browser's own storage.
//
// The saved object carries a version and the season. If either does not match what the page expects, or the schedule no
// longer has a game, the saved picks are dropped for those games and nothing else is touched. Reading never throws: a
// private window, blocked storage or a corrupt value just means "no saved picks".

import { sanitizePicks } from "./picks"
import type { Game, Outcome, Predictions } from "./types"

export const STORAGE_VERSION = 1
export const SCENARIO_KEY = "rr.playoff-machine.scenario"
export const PREFS_KEY = "rr.playoff-machine.prefs"

export type SavedScenario = { v: number; season: number; picks: Record<string, Outcome>; savedAt: number }
/** `raiders` is the old name of "highlight my team"; it is kept so saved settings still read. `team` is the team being followed. */
export type Prefs = { v: number; raiders: boolean; team?: string }

type ReadStore = Pick<Storage, "getItem">
type WriteStore = Pick<Storage, "setItem" | "removeItem">

function parse(raw: string | null): unknown {
	if (!raw) return null
	try {
		return JSON.parse(raw)
	} catch {
		return null
	}
}

export function loadScenario(store: ReadStore | null, season: number, games: readonly Game[]): Predictions | null {
	try {
		if (!store) return null
		const data = parse(store.getItem(SCENARIO_KEY)) as Partial<SavedScenario> | null
		if (!data || data.v !== STORAGE_VERSION || data.season !== season || typeof data.picks !== "object" || data.picks === null) return null
		const picks = sanitizePicks(games, data.picks as Predictions)
		return Object.keys(picks).length ? picks : null
	} catch {
		return null
	}
}

export function saveScenario(store: WriteStore | null, season: number, picks: Predictions, now = Date.now()): void {
	try {
		if (!store) return
		if (Object.keys(picks).length === 0) {
			store.removeItem(SCENARIO_KEY)
			return
		}
		const data: SavedScenario = { v: STORAGE_VERSION, season, picks: { ...picks }, savedAt: now }
		store.setItem(SCENARIO_KEY, JSON.stringify(data))
	} catch {
		// Storage can be full or blocked. The page still works without it.
	}
}

export function loadPrefs(store: ReadStore | null): Prefs | null {
	try {
		if (!store) return null
		const data = parse(store.getItem(PREFS_KEY)) as Partial<Prefs> | null
		if (!data || data.v !== STORAGE_VERSION || typeof data.raiders !== "boolean") return null
		return { v: STORAGE_VERSION, raiders: data.raiders, ...(typeof data.team === "string" && /^[A-Z]{2,3}$/.test(data.team) ? { team: data.team } : {}) }
	} catch {
		return null
	}
}

export function savePrefs(store: WriteStore | null, prefs: { raiders: boolean; team?: string }): void {
	try {
		store?.setItem(PREFS_KEY, JSON.stringify({ v: STORAGE_VERSION, raiders: prefs.raiders, ...(prefs.team ? { team: prefs.team } : {}) }))
	} catch {
		// ignore
	}
}
