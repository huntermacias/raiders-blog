// A sentence or two about how a game went, written from the numbers so every recap gets one
// without anyone typing it. Pure, so it can be tested.

import type { LabGame } from "./types"
import { clockAt, formatSwing, gameStory, kindLabel, pct, swingPoints } from "./wp"

export type LabStory = {
	/** The one-line headline. */
	headline: string
	/** Supporting line about the play that decided it, or empty. */
	detail: string
}

export function labStory(g: LabGame): LabStory {
	const s = gameStory(g.wp, g.keyPlays, g.scores)
	const low = clockAt(s.low.el)
	const high = clockAt(s.high.el)
	const swing = s.swing
	const swingPts = swing ? swingPoints(swing) : null
	const swingClock = swing ? clockAt(swing.el) : null

	let headline: string
	if (g.result === "W") {
		if (s.maxDeficit >= 7 && s.low.p < 0.25) headline = `Down to ${pct(s.low.p)} in ${low.q}, then the Raiders took it back.`
		else if (s.maxDeficit >= 7) headline = `Trailed by as many as ${s.maxDeficit}, and still found a way.`
		else if (s.maxDeficit === 0) headline = s.maxLead >= 14 ? "Never trailed, and never really let it get close." : "The Raiders never trailed."
		else if (s.leadChanges >= 3) headline = `A back-and-forth win with ${s.leadChanges} lead changes.`
		else headline = `A win that was closer than the final, at ${pct(s.low.p)} at its lowest.`
	} else if (g.result === "L") {
		if (s.high.p >= 0.75) headline = `A ${pct(s.high.p)} chance to win in ${high.q}, and it slipped away.`
		else if (s.maxLead >= 7) headline = `Led by as many as ${s.maxLead}, but the lead didn't hold.`
		else if (s.maxLead <= 0) headline = "The Raiders never led."
		else headline = `A loss that swung ${s.leadChanges} time${s.leadChanges === 1 ? "" : "s"}.`
	} else {
		headline = "Neither side could separate."
	}

	let detail = ""
	if (swing && swingClock && swingPts != null) {
		detail = `The play that moved it most: ${kindLabel(swing.kind).toLowerCase()} in ${swingClock.q} at ${swing.clock}, ${formatSwing(swingPts)} of win probability.`
	}
	return { headline, detail }
}
