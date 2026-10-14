// Which grading method the Player Lab pages read. Production stays on v1 until the whole Lab passes its checks on v2.
//
// One switch, read at build time: NEXT_PUBLIC_LAB_METHOD=v2 makes the data loaders read data/lab/v2/* and the player pages draw the
// v2 views (this season first, contribution and projection kept apart). Unset, nothing about the site changes: the same files, the same
// pages, the same URLs. The v2 builders are NOT part of the scheduled data pipeline; the files in data/lab/v2 are built by hand.
export type LabMethod = "v1" | "v2"

export function labMethod(): LabMethod {
	return process.env.NEXT_PUBLIC_LAB_METHOD === "v2" ? "v2" : "v1"
}

export const isV2Site = () => labMethod() === "v2"
