import type { KeyKind } from "./types"

// Plain-English meanings for the little symbols on the charts. Shown as hover and focus
// tooltips on the markers, in the legend, and in the key-plays list.

export type Symbol = {
	tag: string
	title: string
	body: string
	shape: "circle" | "diamond" | "ring"
}

export const SYMBOLS: Record<KeyKind, Symbol> = {
	TD: { tag: "TD", title: "Touchdown", body: "Six points. The extra point or two-point try that follows is counted on its own.", shape: "circle" },
	FG: { tag: "FG", title: "Field goal", body: "A kick through the uprights, worth three points.", shape: "circle" },
	SAF: { tag: "S", title: "Safety", body: "Two points and the ball, scored when the offense is tackled in its own end zone.", shape: "circle" },
	"2PT": { tag: "2", title: "Two-point conversion", body: "A successful try from the 2-yard line after a touchdown, worth two points.", shape: "circle" },
	INT: { tag: "TO", title: "Turnover", body: "The offense lost the ball: an interception, or a fumble the other team recovered.", shape: "diamond" },
	FUM: { tag: "TO", title: "Turnover", body: "The offense lost the ball: an interception, or a fumble the other team recovered.", shape: "diamond" },
	BIG: {
		tag: "!",
		title: "Big swing",
		body: "Not a score or a turnover, but a play that moved win probability a lot, like a long gain, a fourth-down stop or a key penalty.",
		shape: "ring",
	},
}

/** The entries to show in a legend, one per tag. */
export const LEGEND: KeyKind[] = ["TD", "FG", "SAF", "2PT", "INT", "BIG"]

export const SWING_HELP =
	"How many percentage points this play added to the Raiders' chance to win, or took away. +20 means it moved from 40% to 60%."

export const WP_HELP =
	"The model's estimate of how often a team wins from this exact spot: score, time left, down, distance and field position. It is not a prediction, it is how surprised to be."
