import playerHistoryJson from "@/data/lab/player-history.json"

import type { PlayerHistory } from "./seasonKit"

// The earlier seasons are their own file: it is read only by the pages that look back (a profile's Career section, the comparison and
// its cards), and it does not change during a season.
const history = playerHistoryJson as unknown as PlayerHistory

export function getPlayerHistory(): PlayerHistory {
	return history
}
