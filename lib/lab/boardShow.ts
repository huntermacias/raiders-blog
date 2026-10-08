// The groups of teams the league board can be filtered to, and so the values a shared board link may carry: a
// conference or a division. Kept apart from matchupShare.ts so that file stays free of data.

import { TEAMS } from "../nfl"

export const BOARD_SHOWS: ReadonlySet<string> = new Set(["AFC", "NFC", ...TEAMS.map((t) => t.division)])
