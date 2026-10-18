// The public NFL competitions. All three run on the same NFL games; each is its own competition with its own picks,
// grades and boards. Plain constants, safe to import anywhere.

export const NFL_COMPETITION = (season: number) => `nfl-winners-${season}`
export const CONFIDENCE_COMPETITION = (season: number) => `nfl-confidence-${season}`
export const UPSET_COMPETITION = (season: number) => `nfl-upset-${season}`

export type NflMode = "winners" | "confidence" | "upset"
export const NFL_MODES: readonly NflMode[] = ["winners", "confidence", "upset"]

export const competitionForMode = (mode: NflMode, season: number): string => (mode === "confidence" ? CONFIDENCE_COMPETITION(season) : mode === "upset" ? UPSET_COMPETITION(season) : NFL_COMPETITION(season))

export const isNflMode = (v: unknown): v is NflMode => v === "winners" || v === "confidence" || v === "upset"

/** Where each format lives on the site. */
export const MODE_PATH: Record<NflMode, string> = { winners: "/league/nfl", confidence: "/league/nfl/confidence", upset: "/league/nfl/upsets" }
export const MODE_NAME: Record<NflMode, string> = { winners: "NFL Weekly Winners", confidence: "NFL Confidence Picks", upset: "NFL Upset Challenge" }
