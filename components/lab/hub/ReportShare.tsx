"use client"

import ShareCard from "@/components/lab/ShareCard"
import { trackPlayers } from "@/lib/lab/track"

/** The whole week on one picture: the card at /api/og?type=hub, linked to /lab itself. */
export default function ReportShare({ stamp, week, text }: { stamp: number; week: number | null; text: string }) {
	return (
		<ShareCard
			target={{ type: "hub", query: "", linkQuery: "", sharePath: "/lab", name: "The Lab Report", file: `raiders-rundown-lab-report${week ? `-week-${week}` : ""}`, campaign: "lab_report" }}
			sizes={["wide"]}
			stamp={stamp}
			text={text}
			alt="The Lab Report: this week's findings on one card"
			label="Share the report"
			footnote="The link opens the Lab, with the same findings."
			onOpen={() => trackPlayers("lab_hub_share_opened", { drop: "report" })}
			onAction={(method) => trackPlayers("lab_hub_share_action", { drop: "report", method })}
		/>
	)
}
