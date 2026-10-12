"use client"

import ShareCard from "@/components/lab/ShareCard"
import { trackPlayers } from "@/lib/lab/track"

/** The profile's Share button: the picture is the player card, the link is the profile itself. Counts shares by how, never by who. */
export default function ProfileShare({ slug, name, group, stamp, text }: { slug: string; name: string; group: string; stamp: number; text: string }) {
	return (
		<ShareCard
			sizes={["wide"]}
			stamp={stamp}
			text={text}
			alt={`${name}'s Player Lab card: overall grade, where he leads the league and his strongest numbers`}
			label="Share this profile"
			className="min-h-[44px] rounded-lg border border-lab-line-strong px-3.5 py-2 font-semibold text-lab-soft hover:border-lab-ink hover:text-lab-ink"
			target={{ type: "player", query: `slug=${slug}`, linkQuery: "", sharePath: `/lab/players/${slug}`, name, file: `raiders-rundown-${slug}`, campaign: "player_share" }}
			onOpen={() => trackPlayers("lab_player_share_open", { player: slug, group })}
			onAction={(method) => trackPlayers("lab_player_share", { player: slug, group, method })}
		/>
	)
}
