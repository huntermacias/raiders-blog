// Shared class names and small helpers for the Playoff Machine's modes.

import type { Game, Outcome } from "@/lib/playoffs/types"

export const btn =
	"inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-lab-line bg-lab-surface px-4 text-sm font-semibold text-lab-ink transition hover:border-lab-line-strong hover:bg-lab-tint disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lab-ink"

export const btnSm =
	"inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-md border border-lab-line bg-lab-surface px-3 text-xs font-semibold text-lab-ink transition hover:border-lab-line-strong hover:bg-lab-tint disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lab-ink"

export const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lab-ink"

/** The outcome that makes `team` win (or lose) `game`. */
export function outcomeFor(game: Pick<Game, "homeTeam">, team: string, result: "W" | "L"): Outcome {
	return (result === "W") === (game.homeTeam === team) ? "H" : "A"
}

/** How a game went for one team: W, L or T, or null while it is open. */
export function resultFor(game: Pick<Game, "homeTeam">, team: string, outcome: Outcome | undefined | null): "W" | "L" | "T" | null {
	if (!outcome) return null
	if (outcome === "T") return "T"
	return (outcome === "H") === (game.homeTeam === team) ? "W" : "L"
}

export const WEEK_LABELS = (n: number) => (n === 18 ? "Wk 18" : `Wk ${n}`)
