import type { PlayerHistory } from "./seasonKit"

// The earlier seasons are their own file: it is read only by the pages that look back (a profile's Career section, the comparison and
// its cards), and it does not change during a season. The method switch (labMethod.ts) picks the file at build time.
/* eslint-disable @typescript-eslint/no-require-imports */
const history = (process.env.NEXT_PUBLIC_LAB_METHOD === "v2" ? require("../../data/lab/v2/player-history.json") : require("../../data/lab/player-history.json")) as PlayerHistory

export function getPlayerHistory(): PlayerHistory {
	return history
}
