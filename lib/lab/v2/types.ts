// The shapes v2 adds to the Player Lab's data (data/lab/v2/players.json, scripts/lab/build_players.py). Everything v1 has is still there.
import type { PlayerGroup, PlayerRow, PlayersData } from "../playersKit"

/** The grade of the job's primary stat: an estimate on the fixed scale (50 = average at the job, 10 points = one SD of true talent). */
export type V2Grade = {
	k: string
	g: number
	lo: number
	hi: number
	/** Share of the league's spread in true level that this number pins down (0 to 1). */
	rl: number
	/** Plays behind this season's number. */
	n: number
	/** The share of the estimate that comes from this season's plays; the rest is the league and his earlier seasons. */
	cw: number | null
	/** What the grade would be from this season alone (pulled toward the league only). */
	g0: number | null
	rank: number
	of: number
}

export type V2ContribPart = { k: string; of: string; n: number; tot: number; over: number }
/** EPA above an average player at the job over the plays he had: in total, and per game. */
export type V2Contrib = { parts: V2ContribPart[]; over: number; perGame: number }
export type V2Tracked = { games: number; of: number; plays?: number; ofPlays?: number }
export type V2Env = { prevTeam?: string; prevSeason?: number; teamChanged?: boolean; coachChanged?: boolean }

export type V2Row = PlayerRow & V2Env & { grade?: V2Grade; contrib?: V2Contrib; tracked?: V2Tracked }

/** A player under the volume a card needs: no card, rank or grade, but every legitimate play still counts. `obs` is [value, plays]. */
export type V2Other = { id: string; name: string; team: string; pos: string; group: PlayerGroup; games: number; box: Record<string, number>; obs: Record<string, [number, number]>; contrib: V2Contrib | null }

export type V2Policy = { mode: "primary" | "components" | "none"; primary: string | null; grade: string[]; name: string; unit: string; why: string }
export type V2Bucket = { lo: number; claimed: number; realized: number; pairs: number; publish: boolean }
export type V2Pairwise = {
	target: string
	cutoffGames: number[]
	display: { step: number; floor: number; cap: number; rule: string }
	buckets: V2Bucket[]
	coverage: { within80: number; within95: number }
	players: number
	playerSeasonCutoffs: number
	pairs: number
}
export type V2Method = {
	version: 2
	name: string
	scale: { center: number; perSd: number; interval: number; z: number; calibration: number }
	policy: Partial<Record<PlayerGroup, V2Policy>>
	contribution: Record<string, { k: string; of: string }[]>
	pairwise: V2Pairwise | null
}

export type V2Data = Omit<PlayersData, "players"> & { players: V2Row[]; others: V2Other[]; method: V2Method; trackedWeek?: number }

export function isV2(data: PlayersData | V2Data): data is V2Data {
	return (data as V2Data).method?.version === 2
}
