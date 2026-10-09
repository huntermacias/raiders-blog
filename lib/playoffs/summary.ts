// A short, plain description of a scenario for one team: what a share card or a headline would say. No images,
// no formatting; the page shows it today and a social card can draw it later.

import { recordText } from "./season"
import type { Berth, SimulationResult } from "./simulator"
import { type StepId, type TieDecision, supportedSteps } from "./tiebreakers"

export type ScenarioSummary = {
	team: string
	record: string
	/** The conference seed, or null when the team is not in. */
	seed: number | null
	conference: "AFC" | "NFC"
	berth: Berth
	/** e.g. "Wild card", "Division leader", "In the hunt", "Eliminated". */
	status: string
	/** The first-round games for the team's conference, in "#7 PIT @ #2 BUF" form. */
	wildCardRound: string[]
	/** What the reader has not picked yet. */
	openGames: number
}

export function statusLabel(berth: Berth, seed: number | null): string {
	if (berth === "division") return seed === 1 ? "Division leader, top seed" : "Division leader"
	if (berth === "wildcard") return "Wild card"
	if (berth === "hunt") return "In the hunt"
	return "Eliminated"
}

export function scenarioSummary(result: SimulationResult, team: string): ScenarioSummary | null {
	const t = result.teams[team]
	if (!t) return null
	const b = result.bracket[t.conference]
	return {
		team,
		record: recordText(t.overall),
		seed: t.seed,
		conference: t.conference,
		berth: t.berth,
		status: statusLabel(t.berth, t.seed),
		wildCardRound: b.wildCard.map((g) => `#${g.awaySeed} ${g.away} @ #${g.homeSeed} ${g.home}`),
		openGames: t.openGames,
	}
}

/** One line for a team's place in the table, saying the strongest true thing: clinched, or eliminated, or where it sits. */
export function standingLabel(t: { berth: Berth; eliminated: boolean; clinchedPlayoff: boolean; clinchedDivision: boolean; clinchedTopSeed: boolean }): string {
	if (t.eliminated) return "Eliminated"
	if (t.clinchedTopSeed) return "Clinched No. 1 seed"
	if (t.clinchedDivision) return "Clinched division"
	if (t.clinchedPlayoff) return "Clinched playoff berth"
	if (t.berth === "division") return "Division leader"
	if (t.berth === "wildcard") return "Wild card"
	return "In the hunt"
}

const STEP_NAMES: Record<StepId, string> = Object.fromEntries(supportedSteps().map((s) => [s.id, s.label.charAt(0).toLowerCase() + s.label.slice(1)])) as Record<StepId, string>

/** A tie, in words, for the "how ties were settled" list. Unresolved ties say so instead of naming a step that did not decide them. */
export function describeTie(d: TieDecision): string {
	const kind = d.kind === "division" ? "division tie" : "wild-card tie"
	if (d.step === "unresolved") {
		const tied = (d.stillTied ?? [d.placed, ...d.over]).join(", ")
		const why = d.blockedBy && d.blockedBy !== "net-touchdowns" ? "the next tiebreakers use points, which a projected game does not have" : "the last tiebreakers need touchdown counts or a coin toss"
		return `${tied} are still level (${kind}). ${d.placed} is listed first by name only, because ${why}.`
	}
	return `${d.placed} over ${d.over.join(", ")} (${kind}): ${STEP_NAMES[d.step]}.`
}
