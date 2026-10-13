import type { CSSProperties } from "react"

import { TEAMS } from "@/lib/nfl"

import { labColorVars } from "./colors"
import type { PlayerGroup } from "./playersKit"

// View helpers for the player pages: team accents and links. Kept out of playersKit.ts so that file stays free of site data.

const NICK = new Map(TEAMS.map((t) => [t.abbr, t.nick]))
const NAME = new Map(TEAMS.map((t) => [t.abbr, t.name]))

export const teamNick = (abbr: string) => NICK.get(abbr) ?? abbr
export const teamName = (abbr: string) => NAME.get(abbr) ?? abbr

/**
 * Inline custom properties for a card: the card's accent is its team's color, adjusted for contrast in the current theme, and the
 * Raiders wear the page's own team color. Put the result on an element that also has the `lab-opp` class.
 */
export function cardStyle(team: string): CSSProperties {
	const raiders = team === "LV"
	return {
		...(raiders ? {} : labColorVars(team)),
		["--pc-accent" as string]: raiders ? "var(--lab-team)" : "var(--lab-opp)",
		["--pc-on" as string]: raiders ? "var(--lab-on-team)" : "var(--lab-on-opp)",
	}
}

export const profileHref = (slug: string) => `/lab/players/${slug}`
export const boardHref = (group: PlayerGroup, path: string) => `/lab/players/leaders/${group}/${path}`
export const compareHref = (a: string, b?: string) => `/lab/players/compare?a=${encodeURIComponent(a)}${b ? `&b=${encodeURIComponent(b)}` : ""}`

/**
 * The two sides' colors as CSS values. The first is the page's accent for his team (set by cardStyle); the second is the opponent's second
 * color, the Raiders' own, or a fixed blue when both play for the same team so the two are never the same color.
 */
export function sideColors(aTeam: string, bTeam: string): { a: string; b: string; onB: string } {
	if (aTeam === bTeam) return { a: "var(--pc-accent)", b: "var(--lab-scrimmage)", onB: "#ffffff" }
	if (bTeam === "LV") return { a: "var(--pc-accent)", b: "var(--lab-team)", onB: "var(--lab-on-team)" }
	return { a: "var(--pc-accent)", b: "var(--lab-opp2)", onB: "var(--lab-on-opp2)" }
}
