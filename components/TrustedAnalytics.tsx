"use client"

import { useEffect, useState } from "react"
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/next"
import GoogleAnalytics from "@bradgarropy/next-google-analytics"

import { isLikelyHuman } from "@/lib/likelyHuman"

/**
 * Web Analytics, Speed Insights and Google Analytics, switched off for browsers that announce they are automated, so the visitor numbers
 * are readers. Renders nothing until the check has run in the browser (the first paint never waits on it).
 */
export default function TrustedAnalytics({ measurementId }: { measurementId: string }) {
	const [human, setHuman] = useState(false)
	useEffect(() => setHuman(isLikelyHuman()), [])
	if (!human) return null
	return (
		<>
			<Analytics beforeSend={(event) => (isLikelyHuman() ? event : null)} />
			<SpeedInsights beforeSend={(event) => (isLikelyHuman() ? event : null)} />
			<GoogleAnalytics measurementId={measurementId} />
		</>
	)
}
