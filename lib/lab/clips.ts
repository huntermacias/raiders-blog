// The clips the weekly job has drawn for each game (data/lab/clips.json, written by scripts/clips/render.tsx).
// A page shows a clip only when the manifest lists it, so a game without one simply has no clip panel.

import clipsJson from "@/data/lab/clips.json"

export type ClipKind = "landscape" | "vertical" | "square"
export type ClipFiles = Record<ClipKind | "gif" | "poster", string>

export type GameClip = {
	week: number
	hash: string
	seconds: number
	files: ClipFiles
	bytes: Record<ClipKind | "gif" | "poster", number>
}

type Manifest = { version: number; generatedAt: string; games: Record<string, GameClip> }

const manifest = clipsJson as unknown as Manifest

export function clipFor(week: number): GameClip | null {
	const c = manifest.games[String(week)]
	return c && c.files && c.files.landscape ? c : null
}

/** "1.2 MB" / "240 KB". */
export function sizeText(bytes: number): string {
	if (!bytes) return ""
	return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`
}

export const CLIP_LABELS: Record<ClipKind | "gif", { name: string; ratio: string; use: string }> = {
	landscape: { name: "Landscape", ratio: "16:9", use: "X, YouTube, link posts" },
	vertical: { name: "Vertical", ratio: "9:16", use: "Reels, TikTok, Shorts, Stories" },
	square: { name: "Square", ratio: "1:1", use: "Instagram and Facebook feeds" },
	gif: { name: "GIF", ratio: "16:9", use: "Quick share, small file" },
}
