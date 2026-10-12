import PlayerCard from "@/components/lab/players/PlayerCard"
import { getPlayers } from "@/lib/lab/data"
import { getPlayerLogs } from "@/lib/lab/playerData"
import { profileHref } from "@/lib/lab/playerView"
import { rowsFor } from "@/lib/lab/playersKit"

/**
 * A player's card inside a post, live from the Lab: when the numbers refresh, every post that shows him shows the new ones. The link
 * carries ?ref=post so the visits that come from posts can be told apart in analytics. A player who is not in the data renders nothing,
 * so a stale slug in an old post never breaks it.
 */
export default function PlayerEmbed({ slug, note }: { slug?: string; note?: string }) {
	if (!slug) return null
	const data = getPlayers()
	const rows = rowsFor(data, slug)
	if (!rows.length) return null
	const row = rows[0]
	const log = getPlayerLogs().logs[slug]?.[row.group]
	return (
		<div className="lab not-prose my-8 max-w-md" data-testid="player-embed">
			<PlayerCard data={data} player={row} log={log} note={note?.trim() || undefined} href={`${profileHref(slug)}?ref=post`} />
		</div>
	)
}
