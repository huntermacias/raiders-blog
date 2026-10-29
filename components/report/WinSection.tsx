import Link from "@/components/SiteLink"
import Tip from "@/components/lab/Tip"
import WinProbabilityReplay from "@/components/lab/WinProbabilityReplay"
import { TeamLogo } from "@/components/lab/players/Media"
import { SWING_HELP, WP_HELP } from "@/lib/lab/glossary"
import { gameSlug } from "@/lib/lab/data"
import { labStory } from "@/lib/lab/story"
import { clockAt, formatSwing, gameStory, kindLabel, pct, swingPoints } from "@/lib/lab/wp"
import type { ReportView } from "@/lib/report/build"
import Panel from "./Panel"
import ReportShare from "./ReportShare"

/**
 * The win probability: the Lab's chart with its replay, the four numbers that sum the game up, and the plays that moved it most, each
 * with how far it moved the Raiders' chances. The headline is worked out from the numbers, so every report has one.
 */
export default function WinSection({ view, stamp }: { view: ReportView; stamp: number }) {
	const lab = view.lab
	if (!lab) return null
	const s = gameStory(lab.wp, lab.keyPlays, lab.scores)
	const story = labStory(lab)
	const low = clockAt(s.low.el)
	const swing = s.swing
	const swingClock = swing ? clockAt(swing.el) : null
	const swingPts = swing ? swingPoints(swing) : null
	const slug = gameSlug(lab)
	const tiles = [
		{ label: "Lowest point", help: WP_HELP, value: pct(s.low.p), note: `${low.q} ${low.clock}` },
		{ label: "Biggest swing", help: SWING_HELP, value: formatSwing(swingPts) || "—", note: swing && swingClock ? `${kindLabel(swing.kind)}, ${swingClock.q} ${swing.clock}` : "" },
		{ label: "Lead changes", value: String(s.leadChanges), note: "on scoring plays" },
		{ label: s.maxDeficit > 0 ? "Biggest deficit" : "Biggest lead", value: `${s.maxDeficit > 0 ? s.maxDeficit : s.maxLead} pts`, note: s.maxDeficit > 0 ? "the Raiders faced" : "the Raiders held" },
	]
	const worst = Math.max(1, ...view.turning.map((t) => Math.abs(t.swing ?? 0)))

	return (
		<Panel
			id="win-probability"
			eyebrow={`Win probability · Week ${lab.week}`}
			title={story.headline}
			intro={story.detail || undefined}
			opp={lab.opp}
			actions={
				<ReportShare slug={view.slug} kind="wp" week={lab.week} stamp={stamp} text={`Win probability, play by play: ${view.title}`} alt={`Week ${lab.week} win probability card`} label="Share this chart" />
			}
			footer={
				<div className="flex flex-wrap items-center justify-between gap-3">
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
			}
		>
			<dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
						<dd className="mt-1 font-sans text-xl font-bold tabular-nums sm:text-3xl">{t.value}</dd>
						<dd className="mt-0.5 text-xs text-lab-muted">{t.note}</dd>
					</div>
				))}
			</dl>

			<div className="-mx-2 mt-5 sm:mx-0">
				<p className="mb-3 px-2 text-xs leading-relaxed text-lab-muted sm:px-0">Press play, or drag across the chart. Click any marker to jump to that play.</p>
				<WinProbabilityReplay
					series={lab.wp}
					keyPlays={lab.keyPlays}
					scores={lab.scores}
					teamName="Raiders"
					oppName={lab.oppName}
					finalScore={lab.score}
					sharePath={`/lab/${slug}`}
					collapsePlays
					shareText={`Week ${lab.week}: ${view.title}. Scrub through the win probability, play by play.`}
				/>
			</div>

			{view.turning.length > 0 && (
				<div className="mt-8">
					<h3 className="font-serif text-xl font-bold sm:text-2xl">The plays that moved it</h3>
					<p className="mt-1 text-sm text-lab-soft">The {view.turning.length} biggest changes in the Raiders&apos; chance of winning, in the order they happened.</p>
					<ol className="mt-4 divide-y divide-lab-line rounded-2xl border border-lab-line bg-lab-tint">
						{view.turning.map((t) => {
							const pts = t.swing ?? 0
							const good = pts >= 0
							const raidersBall = t.team === "LV"
							return (
								<li key={`${t.el}-${t.text.slice(0, 12)}`} className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 p-3.5 sm:grid-cols-[72px_1fr_210px] sm:items-center sm:gap-x-5 sm:p-4">
									<div className="font-mono text-xs font-semibold tabular-nums text-lab-muted">
										<p className="text-sm text-lab-ink">{t.q}</p>
										<p>{t.clock}</p>
									</div>
									<div className="min-w-0">
										<p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-lab-muted">
											{t.team && <TeamLogo team={raidersBall ? "LV" : view.opp.abbr ?? t.team} size={18} />}
											{kindLabel(t.kind)}
											<span className="font-mono normal-case tracking-normal tabular-nums">· {t.score[0]}–{t.score[1]}</span>
										</p>
										<p className="mt-0.5 text-sm leading-snug">{t.text}</p>
									</div>
									<div className="col-span-2 sm:col-span-1">
										<div className="flex items-baseline justify-between gap-3">
											<span className={`whitespace-nowrap font-sans text-lg font-bold tabular-nums ${good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{formatSwing(pts)}</span>
											{t.wpAfter != null && <span className="whitespace-nowrap text-xs text-lab-muted">win chance now {pct(t.wpAfter)}</span>}
										</div>
										<div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-lab-line" aria-hidden>
											<div className={`h-full rounded-full ${good ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${Math.max(6, (Math.abs(pts) / worst) * 100)}%` }} />
										</div>
									</div>
								</li>
							)
						})}
					</ol>
				</div>
			)}
		</Panel>
	)
}
