// The numbers behind the broadcast-style overlay on the field: the score and the Raiders' win chance
// before and after a play. Pure, so it can be tested.

import type { Frame } from "./drive"

/** [Raiders, opponent] */
export type Score = [number, number]

/** The score in force at `el` seconds. `after` counts a score that happened on the play at `el`; otherwise it does not. */
export function scoreAt(scores: [number, number, number][] | undefined, el: number, after: boolean): Score {
	let out: Score = [0, 0]
	for (const [t, a, b] of scores ?? []) {
		if (after ? t <= el : t < el) out = [a, b]
		else break
	}
	return out
}

/** The Raiders' win probability before and after a play (0 to 1), or null when the log has no number for it. */
export function wpAround(f: Frame, offenseIsTeam: boolean): { before: number; after: number } | null {
	if (f.w0 == null) return null
	const before = f.w0
	if (f.wpa == null) return { before, after: before }
	const after = Math.min(1, Math.max(0, before + (offenseIsTeam ? f.wpa : -f.wpa)))
	return { before, after }
}

/** "Q2 8:41", or "OT 4:12". */
export function clockText(f: Pick<Frame, "q" | "clk">): string {
	if (f.q == null || !f.clk) return ""
	return `${f.q >= 5 ? "OT" : `Q${f.q}`} ${f.clk}`
}
