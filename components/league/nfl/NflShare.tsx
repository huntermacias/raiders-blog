"use client"

import * as React from "react"

import ShareCard from "@/components/lab/ShareCard"
import { MODE_NAME, type NflMode } from "@/lib/league2/competitions"
import { hourStamp } from "@/lib/shareStamp"

export const SHARE_PATH = "/league/nfl/share"

/**
 * The share buttons under a format's picks: a player's own week, the week's standings and, for upsets, the upset of the
 * week. Each opens the share window with its own card. The link opens the format on the same week, so whoever follows it
 * lands where the card came from.
 */
export default function NflShare({ mode, week, handle, headline, hasResults, hasBoard, hasUpset = false }: { mode: NflMode; week: number; handle: string | null; headline: string | null; hasResults: boolean; hasBoard: boolean; hasUpset?: boolean }) {
	const [stamp, setStamp] = React.useState(0)
	React.useEffect(() => setStamp(hourStamp()), [])
	if (stamp === 0 || (!(handle && hasResults) && !hasBoard && !hasUpset)) return null
	const name = MODE_NAME[mode]
	const base = `mode=${mode}&week=${week}`
	const file = `raiders-rundown-${mode}-week-${week}`
	const target = (view: string, extra = "") => ({ type: "nflleague", query: `${base}&view=${view}${extra}`, linkQuery: `${base}&view=${view}${extra}`, sharePath: SHARE_PATH, name, file: `${file}-${view}`, campaign: `league_${mode}` })

	return (
		<section aria-labelledby="share-h" className="mt-10">
			<h2 id="share-h" className="mb-3 font-serif text-2xl font-bold tracking-tight md:text-3xl">
				Share
			</h2>
			<div className="flex flex-wrap gap-3">
				{handle && hasResults && (
					<ShareCard
						target={target("me", `&handle=${encodeURIComponent(handle)}`)}
						stamp={stamp}
						text={headline ? `${headline} in week ${week} of the Raiders Rundown ${name}.` : `My week ${week} picks in the Raiders Rundown ${name}.`}
						alt={`${handle}'s week ${week} in the ${name}`}
						label="Share my week"
						footnote="Only games that have started are on the card. The link opens this week in the league."
					/>
				)}
				{hasBoard && (
					<ShareCard
						target={target("board")}
						stamp={stamp}
						text={`Week ${week} standings in the Raiders Rundown ${name}.`}
						alt={`Week ${week} standings in the ${name}`}
						label="Share the standings"
						footnote="The link opens this week in the league."
					/>
				)}
				{hasUpset && (
					<ShareCard
						target={target("alert")}
						stamp={stamp}
						text={`The upset of week ${week} in the Raiders Rundown Upset Challenge. Did you call it?`}
						alt={`The upset of week ${week}`}
						label="Share the upset of the week"
						footnote="The link opens this week in the league."
					/>
				)}
			</div>
		</section>
	)
}
