"use client"

import ShareCard from "@/components/lab/ShareCard"
import { trackRooting } from "@/lib/analytics"
import { ROOTING_CAMPAIGN, ROOTING_PATH, guideQuery, type Scope } from "@/lib/rooting/share"
import type { Goal } from "@/lib/rooting/types"

type Props = {
	team: string
	nick: string
	goal: Goal
	goalLabel: string
	week: number | null
	scope: Scope
	stamp: number
	text: string
}

/** The Share button: opens the card for this team, goal and week, with Share on X, Copy link, Copy image and the rest. */
export default function RootingShare({ team, nick, goal, goalLabel, week, scope, stamp, text }: Props) {
	// The card is of the team, goal and week; the link also keeps the scope so it opens on the same list.
	const cardQuery = guideQuery({ team, goal, week })
	return (
		<ShareCard
			target={{ type: "rooting", query: cardQuery, sharePath: ROOTING_PATH, name: `${nick} rooting guide`, file: `raiders-rundown-rooting-${team.toLowerCase()}-${goal}`, campaign: ROOTING_CAMPAIGN }}
			stamp={stamp}
			text={text}
			alt={`${nick} Sunday Rooting Guide for ${week ? `Week ${week}` : "the rest of the season"}: ${goalLabel.toLowerCase()}, and the games to root in`}
			label="Share guide"
			onOpen={() => trackRooting("rooting_share_opened", { team, goal })}
			onAction={(method) => {
				if (method === "copy_link") trackRooting("rooting_link_copied", { team, goal })
				else trackRooting("rooting_share_action", { method, goal })
			}}
		/>
	)
}
