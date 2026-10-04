"use client"

import { useEffect } from "react"

import { captureUtm } from "@/lib/utm"

/**
 * Mounted once in the root layout. On a visitor's landing it remembers the UTM
 * tags in the URL (first touch, 30 days) so a later newsletter or league
 * sign-up can say which campaign brought them. Renders nothing.
 */
export default function UtmCapture() {
	useEffect(() => {
		captureUtm(window.location.search)
	}, [])
	return null
}
