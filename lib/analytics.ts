import { track } from "@vercel/analytics"

import type { Utm } from "./utm"

export type ConversionEvent = "newsletter_signup" | "league_join"

/**
 * Records a sign-up as a Vercel Web Analytics custom event, tagged with the
 * campaign that brought the visitor ("direct" / "none" when there wasn't one).
 * Only two properties are sent because that's what every plan accepts.
 * Analytics must never break a sign-up, so every failure is swallowed.
 */
export function trackConversion(name: ConversionEvent, utm: Utm | null): void {
	try {
		track(name, { source: utm?.source ?? "direct", campaign: utm?.campaign ?? "none" })
	} catch {
		// ignore
	}
}
