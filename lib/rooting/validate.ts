// A check that a rooting.json is the shape the page expects, so a damaged or out-of-date file shows the "numbers are not available"
// state instead of crashing a page or printing nonsense. Pure.

import { MODEL_VERSION } from "./engine"
import { GOALS, type RootingData } from "./types"

export function isRootingData(value: unknown): value is RootingData {
	const d = value as Partial<RootingData> | null
	if (!d || typeof d !== "object") return false
	if (d.version !== MODEL_VERSION || typeof d.season !== "number" || typeof d.resultsKey !== "string") return false
	if (!Array.isArray(d.teams) || d.teams.length < 2) return false
	const size = d.teams.length * GOALS.length
	if (!Array.isArray(d.baseline) || d.baseline.length !== size) return false
	if (!Array.isArray(d.games) || !Array.isArray(d.completed) || !Array.isArray(d.history) || typeof d.ties !== "object" || d.ties === null) return false
	for (const g of d.games) {
		if (!g || typeof g.id !== "string" || !Array.isArray(g.H) || !Array.isArray(g.A) || g.H.length !== size || g.A.length !== size) return false
	}
	for (const t of Object.values(d.ties)) if (!Array.isArray(t) || t.length !== size) return false
	return true
}
