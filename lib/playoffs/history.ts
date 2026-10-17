// Undo and redo for the reader's picks. Plain data in, plain data out.

import type { Predictions } from "./types"

export type History = { past: { picks: Predictions; label: string }[]; future: { picks: Predictions; label: string }[] }

export const EMPTY_HISTORY: History = { past: [], future: [] }
const LIMIT = 60

/** Records that `before` was the picks until `label` happened. Any redo is gone. */
export function record(h: History, before: Predictions, label: string): History {
	return { past: [...h.past, { picks: before, label }].slice(-LIMIT), future: [] }
}

export function undo(h: History, current: Predictions): { history: History; picks: Predictions; label: string } | null {
	const last = h.past[h.past.length - 1]
	if (!last) return null
	return { history: { past: h.past.slice(0, -1), future: [...h.future, { picks: current, label: last.label }] }, picks: last.picks, label: last.label }
}

export function redo(h: History, current: Predictions): { history: History; picks: Predictions; label: string } | null {
	const next = h.future[h.future.length - 1]
	if (!next) return null
	return { history: { past: [...h.past, { picks: current, label: next.label }], future: h.future.slice(0, -1) }, picks: next.picks, label: next.label }
}
