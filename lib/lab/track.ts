import { track } from "@vercel/analytics"

type Props = Record<string, string | number | boolean>

declare global {
	interface Window {
		gtag?: (...args: unknown[]) => void
	}
}

/**
 * Says to Vercel Analytics and Google Analytics that something happened on a player page: which player was opened, which board, which
 * two were compared, which stat tab was tapped. Only names of players, stats and teams go out, nothing about the reader, so the site
 * can see who readers look into without learning anything about them. Safe to call anywhere on the client; it does nothing when
 * analytics is blocked or not loaded.
 */
export function trackPlayers(event: string, props: Props = {}): void {
	if (typeof window === "undefined") return
	try {
		track(event, props)
	} catch {
		// Analytics is an extra, never a reason for a page to break.
	}
	try {
		window.gtag?.("event", event, props)
	} catch {
		// Same.
	}
}
