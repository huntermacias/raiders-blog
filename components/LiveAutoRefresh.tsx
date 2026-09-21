"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Polls the server component's data by re-running the route while a live
// thread is marked "live" -- router.refresh() re-fetches this force-dynamic
// page's Sanity query without a full page reload or losing scroll position.
// Stops entirely once the event is no longer live (the parent just doesn't
// render this component at all in that case).
function LiveAutoRefresh({ intervalMs = 25000 }: { intervalMs?: number }) {
	const router = useRouter()

	useEffect(() => {
		const id = setInterval(() => router.refresh(), intervalMs)
		return () => clearInterval(id)
	}, [router, intervalMs])

	return null
}

export default LiveAutoRefresh
