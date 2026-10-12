"use client"

import { useEffect } from "react"

import { trackPlayers } from "@/lib/lab/track"

/** Records one view of a player page, board or comparison, once per visit to that page. Renders nothing. */
export default function TrackView({ event, props }: { event: string; props: Record<string, string | number | boolean> }) {
	const key = JSON.stringify(props)
	useEffect(() => {
		trackPlayers(event, JSON.parse(key))
	}, [event, key])
	return null
}
