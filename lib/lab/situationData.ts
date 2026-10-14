import type { SitData } from "./situationsKit"

// Down-and-distance splits and every game's plays. Its own file because only the player pages need it, and only the server reads it:
// a page hands the client the one player's slice. The method switch (labMethod.ts) picks the file at build time.
/* eslint-disable @typescript-eslint/no-require-imports */
const sit = (process.env.NEXT_PUBLIC_LAB_METHOD === "v2" ? require("../../data/lab/v2/player-situations.json") : require("../../data/lab/player-situations.json")) as SitData

export function getSituations(): SitData {
	return sit
}
