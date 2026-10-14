import type { PlayerLogs } from "./playersKit"

// The game-by-game trail is its own file because only the player pages need it, and it is the larger half of the data.
// The method switch (labMethod.ts) picks the file at build time; the unused one is never bundled.
/* eslint-disable @typescript-eslint/no-require-imports */
const logs = (process.env.NEXT_PUBLIC_LAB_METHOD === "v2" ? require("../../data/lab/v2/player-logs.json") : require("../../data/lab/player-logs.json")) as PlayerLogs

export function getPlayerLogs(): PlayerLogs {
	return logs
}
