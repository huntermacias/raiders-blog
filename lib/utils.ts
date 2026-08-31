import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

const VOTE_STORAGE_PREFIX = "raiders-rundown:voted:"

/**
 * Lightweight per-browser "have they already voted on this" guard for the
 * fan-interactive features (reactions, polls, player-of-the-game). There's
 * no auth on this site, so this isn't fraud-proof - it just stops the
 * obvious case of a single click firing twice or a page refresh re-voting.
 */
export function hasVoted(key: string): boolean {
	if (typeof window === "undefined") return false
	try {
		return window.localStorage.getItem(VOTE_STORAGE_PREFIX + key) === "1"
	} catch {
		return false
	}
}

export function markVoted(key: string) {
	if (typeof window === "undefined") return
	try {
		window.localStorage.setItem(VOTE_STORAGE_PREFIX + key, "1")
	} catch {
		// ignore - storage may be unavailable (private mode, etc.)
	}
}
