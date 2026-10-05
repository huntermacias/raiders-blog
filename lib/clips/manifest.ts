// The record of which clips exist, kept in data/lab/clips.json so pages can show a clip only when its file is
// really there and the weekly job can skip games whose clip is already current.

import { createHash } from "node:crypto"

import type { LabGame } from "../lab/types"
import { CLIP_SIZES, type ClipKind } from "./story"

/** Bump when the look of the clips changes, so every clip is drawn again. */
export const CLIP_VERSION = 1

export type ClipEntry = {
	week: number
	/** Fingerprint of what the clip was drawn from; a different one means redraw. */
	hash: string
	seconds: number
	/** Public paths, e.g. "/lab/clips/week-4-landscape.mp4". */
	files: Record<ClipKind | "gif" | "poster", string>
	bytes: Record<ClipKind | "gif" | "poster", number>
}

export type ClipManifest = { version: number; generatedAt: string; games: Record<string, ClipEntry> }

export const KINDS = Object.keys(CLIP_SIZES) as ClipKind[]

/** What a clip is drawn from: the curve, the running score, the final and the opponent. */
export function clipHash(game: LabGame): string {
	const h = createHash("sha256")
	h.update(JSON.stringify({ v: CLIP_VERSION, w: game.week, o: game.opp, n: game.oppName, h: game.home, r: game.result, s: game.score, wp: game.wp, sc: game.scores, k: game.keyPlays.map((k) => [k.el, k.kind]) }))
	return h.digest("hex").slice(0, 16)
}

/** The public path of one of a game's files. */
export function clipPath(week: number, what: ClipKind | "gif" | "poster"): string {
	if (what === "gif") return `/lab/clips/week-${week}.gif`
	if (what === "poster") return `/lab/clips/week-${week}-poster.jpg`
	return `/lab/clips/week-${week}-${what}.mp4`
}

/** Games whose clip is missing or out of date. */
export function staleGames(games: LabGame[], manifest: ClipManifest | null): LabGame[] {
	return games.filter((g) => manifest?.version !== CLIP_VERSION || manifest.games[String(g.week)]?.hash !== clipHash(g))
}
