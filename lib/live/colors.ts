// Which color each side wears on the live page. The Raiders keep their own (silver on dark, black
// on light) and the other team wears its color; in a game with neither, the away team uses the
// first opponent color and the home team the second. The CSS variables are set on the page wrapper.

import { labColorVars, labColorVarsB } from "@/lib/lab/colors"
import { LAB } from "@/lib/lab/theme"

import type { LiveGameInfo } from "./types"

export type Side = { abbr: string; fill: string; on: string }

export const RAIDERS_ABBR = "LV"

export function sideColors(info: LiveGameInfo): { away: Side; home: Side; vars: Record<string, string> } {
	const a = info.away.abbr
	const h = info.home.abbr
	if (a === RAIDERS_ABBR || h === RAIDERS_ABBR) {
		const other = a === RAIDERS_ABBR ? h : a
		const mine: Omit<Side, "abbr"> = { fill: LAB.team, on: LAB.onTeam }
		const theirs: Omit<Side, "abbr"> = { fill: LAB.opp, on: LAB.onOpp }
		return {
			away: { abbr: a, ...(a === RAIDERS_ABBR ? mine : theirs) },
			home: { abbr: h, ...(h === RAIDERS_ABBR ? mine : theirs) },
			vars: labColorVars(other),
		}
	}
	return {
		away: { abbr: a, fill: LAB.opp, on: LAB.onOpp },
		home: { abbr: h, fill: LAB.opp2, on: LAB.onOpp2 },
		vars: { ...labColorVars(a), ...labColorVarsB(h) },
	}
}
