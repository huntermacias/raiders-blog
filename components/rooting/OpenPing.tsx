"use client"

import { useEffect } from "react"

import { trackRooting } from "@/lib/analytics"

/** Reports one "guide opened" event per page view, with the team and goal. Draws nothing. */
export default function OpenPing({ team, goal }: { team: string; goal: string }) {
	useEffect(() => {
		trackRooting("rooting_open", { team, goal })
		// Once per view of the guide, not each time the team or goal changes: those have their own events.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])
	return null
}
