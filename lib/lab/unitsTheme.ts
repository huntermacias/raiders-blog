// Colors for a page with two teams on it. The Raiders are always the Lab's team color (silver on dark, black on
// light). Everyone else wears their own team color, and when neither team is the Raiders the second one uses the
// Lab's second opponent color. Both teams are always named in text too, so color is never the only cue.

import type { CSSProperties } from "react"
import { labColorVars, labColorVarsB } from "./colors"
import { LAB } from "./theme"

export type PairTheme = {
	/** Class names for the page wrapper. */
	className: string
	style: CSSProperties
	/** A CSS color (a variable reference) per team. */
	color: Record<string, string>
	/** The ink to use on top of that color. */
	on: Record<string, string>
}

export function pairTheme(a: string, b: string): PairTheme {
	if (a === "LV" || b === "LV") {
		const other = a === "LV" ? b : a
		return {
			className: "lab lab-opp",
			style: labColorVars(other) as CSSProperties,
			color: { LV: LAB.team, [other]: LAB.opp },
			on: { LV: LAB.onTeam, [other]: LAB.onOpp },
		}
	}
	return {
		className: "lab lab-opp lab-opp2",
		style: { ...labColorVars(a), ...labColorVarsB(b) } as CSSProperties,
		color: { [a]: LAB.opp, [b]: LAB.opp2 },
		on: { [a]: LAB.onOpp, [b]: LAB.onOpp2 },
	}
}
