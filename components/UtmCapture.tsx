"use client"

import { useEffect } from "react"

import { HUMAN_COOKIE, HUMAN_COOKIE_DAYS, humanCookieValue } from "@/lib/og/guard"
import { captureUtm } from "@/lib/utm"

/**
 * Mounted once in the root layout. On a visitor's landing it remembers the UTM
 * tags in the URL (first touch, 30 days) so a later newsletter or league
 * sign-up can say which campaign brought them. It also leaves a week-long cookie that says "this client runs JavaScript", which is what lets a reader's
 * click on a player comparison go straight to the page (see lib/og/guard.ts). Renders nothing.
 */
export default function UtmCapture() {
	useEffect(() => {
		captureUtm(window.location.search)
		try {
			document.cookie = `${HUMAN_COOKIE}=${humanCookieValue()};path=/;max-age=${HUMAN_COOKIE_DAYS * 86400};samesite=lax${window.location.protocol === "https:" ? ";secure" : ""}`
		} catch {
			// cookies off: the comparison page asks again, and says so if it still cannot
		}
	}, [])
	return null
}
