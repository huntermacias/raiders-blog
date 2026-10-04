// One continuous position through a drive, so playing, scrubbing and jumping all move the
// same way. `pos` runs from 0 to the number of plays: the whole part is the play, the
// fraction is where we are inside it.
//
// Inside each play: the ball is set at the line (0 to MOVE_FROM), moves along the play
// (MOVE_FROM to MOVE_TO), then the result holds on screen (MOVE_TO to the end of the play).
// Pure, so it can be tested.

export const MOVE_FROM = 0.2
export const MOVE_TO = 0.5
/** Time one play takes at 1x. */
export const SEGMENT_MS = 2400

export type TimelineState = {
	/** Plays finished. */
	done: number
	/** Index of the play the ball is traveling on right now, or null. */
	moving: number | null
	/** How far along the moving play the ball is, 0 to 1. 1 when no play is moving. */
	progress: number
	/** 0 to 1 while the ball is being spotted for the next snap; 0 otherwise. */
	settle: number
}

const smooth = (t: number) => t * t * (3 - 2 * t)

export function stateAt(pos: number, n: number): TimelineState {
	if (n <= 0) return { done: 0, moving: null, progress: 1, settle: 0 }
	const p = Math.min(n, Math.max(0, pos))
	if (p >= n) return { done: n, moving: null, progress: 1, settle: 0 }
	const k = Math.floor(p)
	const f = p - k
	if (f < MOVE_FROM) return { done: k, moving: null, progress: 1, settle: smooth(f / MOVE_FROM) }
	if (f < MOVE_TO) return { done: k, moving: k, progress: (f - MOVE_FROM) / (MOVE_TO - MOVE_FROM), settle: 1 }
	return { done: k + 1, moving: null, progress: 1, settle: 0 }
}

/** Ease in and out, for glides between positions. */
export function easeInOut(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** How long a glide over `distance` plays should take, in ms. */
export function glideMs(distance: number): number {
	return Math.min(1100, 380 + Math.abs(distance) * 160)
}

/** Position for a point `v` (0 to n) along the scrubber: play k, and how far through it. Dragging
 *  moves the ball along the play under the pointer. */
export function posAtScrub(v: number, n: number): number {
	if (n <= 0) return 0
	const c = Math.min(n, Math.max(0, v))
	if (c >= n) return n
	const k = Math.floor(c)
	return k + MOVE_FROM + (c - k) * (MOVE_TO - MOVE_FROM)
}

/** Where on the scrubber (0 to n) a state sits. The inverse of posAtScrub for moving states. */
export function scrubValue(s: TimelineState): number {
	return s.done + (s.moving != null ? s.progress : 0)
}
