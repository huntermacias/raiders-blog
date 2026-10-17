"use client"

import * as React from "react"

import { duration } from "@/lib/league2/format"

/** "Locks in 2h 10m", ticking every 30 seconds. Display only: the server decides when a game is closed. */
export default function Countdown({ lockAt, className }: { lockAt: string; className?: string }) {
	const [left, setLeft] = React.useState<number | null>(null)
	React.useEffect(() => {
		const tick = () => setLeft(Date.parse(lockAt) - Date.now())
		tick()
		const t = setInterval(tick, 30_000)
		return () => clearInterval(t)
	}, [lockAt])
	if (left === null) return <span className={className}>&nbsp;</span>
	return <span className={className}>{left <= 0 ? "Picks are closed" : `Locks in ${duration(left)}`}</span>
}
