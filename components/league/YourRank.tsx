"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { signed } from "@/lib/league"
import { loadCreds } from "@/lib/league.client"

export type RankLite = { lower: string; handle: string; rank: number; points: number; delta: number }

/**
 * "Where am I?" for returning players. The server hands over the season
 * standings; this finds the signed-in handle in them. Renders nothing for
 * visitors who haven't joined.
 */
export default function YourRank({ rows, total }: { rows: RankLite[]; total: number }) {
	const [handle, setHandle] = useState<string | null>(null)

	useEffect(() => {
		setHandle(loadCreds()?.handle ?? null)
	}, [])

	if (!handle) return null
	const me = rows.find((r) => r.lower === handle.toLowerCase())

	return (
		<div className="rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
			{me ? (
				<p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
					<span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">You</span>
					<Link href={`/league/${me.handle}`} className="font-serif text-xl font-bold underline-offset-4 hover:underline">
						{me.handle}
					</Link>
					<span className="font-semibold tabular-nums">
						#{me.rank} of {total}
					</span>
					<span className="tabular-nums text-muted-foreground">{me.points} pts</span>
					<span className="text-sm font-bold tabular-nums">{me.delta > 0 ? `${signed(me.delta)} on me` : me.delta < 0 ? `${signed(me.delta)} behind me` : "level with me"}</span>
				</p>
			) : (
				<p className="text-sm text-muted-foreground">
					<span className="font-semibold text-foreground">{handle}</span>, you&rsquo;re in. You&rsquo;ll appear here after your first graded game.
				</p>
			)}
		</div>
	)
}
