"use client"

import ShareCard from "@/components/lab/ShareCard"
import type { Drop } from "@/lib/lab/hubKit"
import { trackPlayers } from "@/lib/lab/track"

/** The cards that also come in a tall size for posting as a picture. */
const TALL = new Set(["rooting", "twins", "board"])

/** The Share button on a finding: the same card the tool itself would share (the player's card, the rooting guide, the biggest play), with a link that opens it. */
export default function DropShare({ drop, stamp }: { drop: Drop; stamp: number }) {
	const s = drop.share
	return (
		<ShareCard
			target={{ type: s.type, query: s.query, linkQuery: s.linkQuery, sharePath: s.sharePath, name: s.name, file: s.file, campaign: s.campaign ?? "lab_hub" }}
			sizes={TALL.has(s.type) ? ["wide", "tall"] : ["wide"]}
			footnote="The link opens the page this finding comes from."
			stamp={stamp}
			text={s.text}
			alt={s.alt}
			onOpen={() => trackPlayers("lab_hub_share_opened", { drop: drop.id })}
			onAction={(method) => trackPlayers("lab_hub_share_action", { drop: drop.id, method })}
		/>
	)
}
