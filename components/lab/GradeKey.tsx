import { GROUPS, GROUP_ORDER, ordinal } from "@/lib/lab/unitsKit"

/** One real grade, worked through: the team, the group, its stats with their ranks, its score and where that puts it. */
export type GradeExample = { team: string; group: string; rank: number; score: number; stats: { label: string; rank: number }[] }

/**
 * Where a grade or rank on these pages comes from, so a reader who sets one beside a rating from another site
 * (a scouting grade, say) can see why they differ. Lists each position group's stats, pulled from the same
 * table the grades are made from.
 */
export default function GradeKey({ n, example, className = "" }: { n: number; example?: GradeExample; className?: string }) {
	return (
		<details className={`rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm text-lab-soft ${className}`}>
			<summary className="cursor-pointer text-sm font-semibold text-lab-ink">How these grades are calculated</summary>
			<ol className="mb-3 mt-3 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-lab-muted">
				<li>Each position group is judged on three to five plain stats, listed below. All of them are per play or per throw, never season totals.</li>
				<li>Every stat is ranked across all {n} teams, 1st to {n}th, the right way round (fewer drops is better, more pressure is better for a pass rush).</li>
				<li>A rank becomes a score from 0 to 100, with 1st at 100 and last at 0. The group&apos;s grade is the average of its stats&apos; scores.</li>
				<li>Teams are ranked by that grade, and that rank is the number on the cards.</li>
			</ol>
			{example ? (
				<p className="mb-3 mt-0 rounded-lg bg-lab-tint px-3 py-2 text-xs leading-relaxed text-lab-soft">
					<span className="font-semibold text-lab-ink">
						For example, the {example.team} {example.group.toLowerCase()} is {ordinal(example.rank)}.
					</span>{" "}
					Its stats rank {example.stats.map((x, i) => `${i > 0 && i === example.stats.length - 1 ? "and " : ""}${ordinal(x.rank)} (${x.label.toLowerCase()})`).join(", ")}. Averaged, that is a grade of {Math.round(example.score)} out of 100, which is {ordinal(example.rank)} among the {n} teams.
				</p>
			) : null}
			<p className="mb-3 mt-0 text-xs leading-relaxed text-lab-muted">
				This is why a grade can disagree with a total or with another site&apos;s rating. A team can rank high in rushing yards because it carries the ball a lot or trails late, and still rank low here because each run adds little. Film grades, like PFF&apos;s, come from watching every player on every snap, and these do not. Early in the season a few plays can move a rank a lot.
			</p>
			<dl className="m-0 grid gap-x-8 gap-y-2 text-xs sm:grid-cols-2">
				{GROUP_ORDER.map((g) => (
					<div key={g}>
						<dt className="font-semibold text-lab-ink">{GROUPS[g].label}</dt>
						<dd className="m-0 text-lab-muted">
							{Object.values(GROUPS[g].stats)
								.map((s) => s.label.toLowerCase())
								.join(", ")}
						</dd>
					</div>
				))}
			</dl>
		</details>
	)
}
