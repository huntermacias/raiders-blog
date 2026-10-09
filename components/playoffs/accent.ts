import type { CSSProperties } from "react"

import { labColorVars } from "@/lib/lab/colors"

/**
 * The accent color for a team's panels: the Raiders use the page's own team color (silver on dark, near-black on light),
 * every other team its own color adjusted for contrast in the current theme. Used as `bg-[var(--pm-accent)]`.
 * Put the result on an element that also has the `lab-opp` class.
 */
export function accentStyle(team: string): CSSProperties {
	const raiders = team === "LV"
	return { ...(raiders ? {} : labColorVars(team)), ["--pm-accent" as string]: raiders ? "var(--lab-team)" : "var(--lab-opp)" }
}
