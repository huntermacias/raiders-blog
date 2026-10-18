import { TAG_INFO, TAG_ORDER, TURNOVER_COST } from "@/lib/lab/flagsKit"

/** How the numbers are made, and what they cannot say. On every Flags page, closed by default. */
export default function FlagsMethod({ per = TURNOVER_COST }: { per?: number }) {
	return (
		<details className="mt-8 max-w-3xl rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm text-lab-soft">
			<summary className="cursor-pointer text-sm font-semibold text-lab-ink">How we count flags, and what they cannot tell you</summary>
			<div className="mb-2 mt-3 space-y-3 text-xs leading-relaxed text-lab-muted">
				<p className="m-0">
					<span className="font-semibold text-lab-soft">What is counted. </span>
					Every penalty the officials accepted in a regular-season game, from the league&apos;s play-by-play. A flag that was declined, or offset by another, is not a play in that data and is not here.
				</p>
				<p className="m-0">
					<span className="font-semibold text-lab-soft">What a flag costs. </span>
					Expected points: how much better or worse the committing team&apos;s situation was before the snap than after the flag was enforced, counting the yards, the replayed down and any free first down. A cost of 2.0 means the flag took about two points off the team&apos;s expected score on the drive. An average interception or lost fumble costs {per.toFixed(1)}, which is the yardstick for &ldquo;turnovers&rdquo; on this page.
				</p>
				<div>
					<p className="m-0">
						<span className="font-semibold text-lab-soft">Counts like a turnover. </span>A flag gets one of these marks when it does what a giveaway does, even though the box score has no turnover:
					</p>
					<ul className="mb-0 mt-1.5 list-disc space-y-1 pl-5">
						{TAG_ORDER.map((t) => (
							<li key={t}>
								<span className="font-semibold text-lab-soft">{TAG_INFO[t].label}.</span> {TAG_INFO[t].what}
							</li>
						))}
					</ul>
				</div>
				<p className="m-0">
					<span className="font-semibold text-lab-soft">Who gets the flag. </span>
					The player the penalty names. A delay of game before a snap belongs to the quarterback, who runs the clock, so it goes to the team&apos;s quarterback on the nearest pass play of that game. Too many men on the field, illegal substitution and a defensive delay of game belong to the team and its coaches, and so does any flag that names no one, and none of them is charged to a player.
				</p>
				<p className="m-0">
					<span className="font-semibold text-lab-soft">Be careful with. </span>
					Small samples: a handful of flags is a few bad plays, not a habit. A flag on the offense can be the second-best thing that happened on a play, and the cost is measured against the play before it, not against a play that never happened. Where a delay of game is charged to a quarterback is our best guess from the game&apos;s other plays; the league does not record it.
				</p>
			</div>
		</details>
	)
}
