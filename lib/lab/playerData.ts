import playerLogsJson from "@/data/lab/player-logs.json"

import type { PlayerLogs } from "./playersKit"

// The game-by-game trail is its own file because only the player pages need it, and it is the larger half of the data.
const logs = playerLogsJson as unknown as PlayerLogs

export function getPlayerLogs(): PlayerLogs {
	return logs
}
