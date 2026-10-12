import situationsJson from "@/data/lab/player-situations.json"

import type { SitData } from "./situationsKit"

// Down-and-distance splits and every game's plays. Its own file because only the player pages need it, and only the server reads it:
// a page hands the client the one player's slice.
const sit = situationsJson as unknown as SitData

export function getSituations(): SitData {
	return sit
}
