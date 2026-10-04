import Link from "@/components/SiteLink"
import Tip from "@/components/lab/Tip"
import WinProbabilityReplay from "@/components/lab/WinProbabilityReplay"
import { labColorVars } from "@/lib/lab/colors"
import { gameSlug } from "@/lib/lab/data"
import { SWING_HELP, WP_HELP } from "@/lib/lab/glossary"
import { labStory } from "@/lib/lab/story"
import type { LabGame } from "@/lib/lab/types"
import { clockAt, formatSwing, gameStory, kindLabel, pct, swingPoints } from "@/lib/lab/wp"

/**
 * "From the Lab": the game's win probability, how it was won, and a way into the full replay, built
 * from the same data as /lab so a recap gets it with nothing typed in. Sits in the recap in its own
 * dark panel so the chart keeps the colors it was designed for in either site theme.
 */
export default function LabTake({ game }: { game: LabGame }) {
	const slug = gameSlug(game)
	const s = gameStory(game.wp, game.keyPlays)
	const low = clockAt(s.low.el)
	const swing = s.swing
	const swingPts = swing ? swingPoints(swing) : null
	const swingClock = swing ? clockAt(swing.el) : null
	const story = labStory(game)
	const title = `Week ${game.week}: Raiders ${game.score[0]}, ${game.oppName} ${game.score[1]}`

	const tiles: { label: string; help?: string; value: string; note: string }[] = [
		{ label: "Lowest point", help: WP_HELP, value: pct(s.low.p), note: `${low.q} ${low.clock}` },
		{ label: "Biggest swing", help: SWING_HELP, value: formatSwing(swingPts) || "—", note: swing && swingClock ? `${kindLabel(swing.kind)}, ${swingClock.q} ${swing.clock}` : "" },
		{ label: "Lead changes", value: String(s.leadChanges), note: "on scoring plays" },
		{
			label: s.maxDeficit > 0 ? "Biggest deficit" : "Biggest lead",
			value: `${s.maxDeficit > 0 ? s.maxDeficit : s.maxLead} pts`,
			note: s.maxDeficit > 0 ? "the Raiders faced" : "the Raiders held",
		},
	]

	return (
		<section
			className="lab lab-opp overflow-hidden rounded-3xl border border-lab-line bg-lab-page text-lab-ink shadow-[var(--lab-shadow)]"
			style={labColorVars(game.opp)}
			aria-labelledby={`lab-take-${slug}`}
		>
			<div className="p-5 sm:p-8">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-lab-muted">From The Lab &middot; Week {game.week}</p>
					<Link href={`/lab/${slug}`} className="text-sm font-semibold text-lab-soft underline-offset-4 hover:text-lab-ink hover:underline">
						Open the full replay &rarr;
					</Link>
				</div>
				<h2 id={`lab-take-${slug}`} className="mt-3 max-w-3xl font-serif text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
					{story.headline}
				</h2>
				{story.detail && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-lab-soft sm:text-base">{story.detail}</p>}

				<dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
					{tiles.map((t) => (
						<div key={t.label} className="rounded-xl border border-lab-line bg-lab-tint p-3.5 sm:p-4">
							<dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-lab-muted">
								{t.help ? (
									<Tip text={t.help} align="start" side="bottom">
										<span className="border-b border-dotted border-lab-line-strong">{t.label}</span>
									</Tip>
								) : (
									t.label
								)}
							</dt>
							<dd className="mt-1 font-mono text-xl font-bold tabular-nums sm:text-3xl">{t.value}</dd>
							<dd className="mt-0.5 text-xs text-lab-muted">{t.note}</dd>
						</div>
					))}
				</dl>
			</div>

			<div className="border-t border-lab-line p-3 sm:p-6">
				<p className="mb-3 px-2 text-xs leading-relaxed text-lab-muted sm:px-0">Press play, or drag across the chart. Click any marker to jump to that play.</p>
				<WinProbabilityReplay
					series={game.wp}
					keyPlays={game.keyPlays}
					scores={game.scores}
					teamName="Raiders"
					oppName={game.oppName}
					finalScore={game.score}
					sharePath={`/lab/${slug}`}
					collapsePlays
					shareText={`${title}: scrub through the win probability, play by play.`}
				/>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-3 border-t border-lab-line px-5 py-4 text-xs text-lab-muted sm:px-8">
				<Link href={`/lab/${slug}#drive-heading`} className="font-semibold text-lab-soft underline-offset-4 hover:text-lab-ink hover:underline">
					Watch every drive, one snap at a time &rarr;
				</Link>
				<span>
					Win probability from{" "}
					<a className="underline underline-offset-4 hover:text-lab-ink" href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noopener noreferrer">
						nflverse
					</a>
					.
				</span>
			</div>
		</section>
	)
}
