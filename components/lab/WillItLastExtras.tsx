import { Minus, TrendingDown, TrendingUp } from "lucide-react"

import { LAB } from "@/lib/lab/theme"
import type { TrailView } from "@/lib/lab/history"
import { type Analysis, type Subject, formatStat, ordinalOf } from "@/lib/lab/historyKit"

// The parts of "Will it last?" that are plain pictures and words: what to expect over the rest of the season, and how the verdicts have
// moved week to week. No hooks here, so the page (a server component) can use WeekByWeek directly.

function verdictColor(id: string): string {
	if (id === "fade") return LAB.opp
	if (id === "improve") return LAB.scrimmage
	return LAB.inkSoft
}

function VerdictIcon({ id }: { id: string }) {
	const cls = "h-3.5 w-3.5 shrink-0"
	if (id === "fade" || id === "linger") return <TrendingDown className={cls} aria-hidden />
	if (id === "improve" || id === "hold") return <TrendingUp className={cls} aria-hidden />
	return <Minus className={cls} aria-hidden />
}

/**
 * Where the stat is now, where it usually ends up and the range 80% of similar teams finished in, on one line. Markers differ in shape
 * (circle, diamond, bar) and every one is named underneath, so nothing depends on color.
 */
export function ExpectBar({ story }: { story: Analysis }) {
	const [d0, d1] = story.domain
	const at = (v: number) => `${Math.min(100, Math.max(0, ((v - d0) / (d1 - d0)) * 100)).toFixed(1)}%`
	const lo = Math.min(story.forecast.lo, story.forecast.hi)
	const hi = Math.max(story.forecast.lo, story.forecast.hi)
	const fmt = (v: number) => formatForecast(story, v)
	const name = story.subject.name
	return (
		<section className="mt-5 rounded-xl border border-lab-line bg-lab-tint px-4 py-4 sm:px-5" aria-label="What to expect over the rest of the season">
			<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-muted">What to expect</p>
			<p className="m-0 mt-1 text-sm leading-snug text-lab-soft sm:text-base">
				Most teams like the {name} finished the year between <strong className="text-lab-ink">{fmt(lo)}</strong> and <strong className="text-lab-ink">{fmt(hi)}</strong> in {story.short}. The typical finish is{" "}
				<strong className="text-lab-ink">{story.typicalText}</strong>, from {story.valueText} now.
			</p>
			<div className="relative mt-4 h-10" role="img" aria-label={`${story.label}: ${name} at ${story.valueText} now, typical finish ${story.typicalText}, 80% of similar teams finished between ${fmt(lo)} and ${fmt(hi)}. Further ${story.higherIsBetter ? "right" : "left"} is better.`}>
				<div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2" style={{ background: LAB.axis }} />
				<div className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm" style={{ left: at(lo), width: `calc(${at(hi)} - ${at(lo)})`, background: LAB.grid, border: `1px solid ${LAB.axis}` }} title="Where 80% of similar teams finished" />
				<div className="absolute top-1 bottom-1 w-0 border-l border-dashed" style={{ left: at(story.base), borderColor: LAB.inkMuted }} title="League average" />
				<span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45" style={{ left: at(story.typical), background: LAB.ink }} title="Typical finish" />
				<span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ left: at(story.value), background: LAB.firstDown, borderColor: LAB.ink }} title="Now" />
			</div>
			<div className="mt-1 flex justify-between text-[11px] font-semibold text-lab-muted" aria-hidden>
				<span>{story.higherIsBetter ? "Worse" : "Better"}</span>
				<span>{story.higherIsBetter ? "Better" : "Worse"}</span>
			</div>
			<dl className="m-0 mt-3 grid grid-cols-3 gap-2 text-center text-xs sm:text-sm">
				<div className="rounded-lg border border-lab-line bg-lab-surface px-2 py-2">
					<dt className="font-semibold text-lab-muted">● Now</dt>
					<dd className="m-0 font-mono font-bold tabular-nums">{story.valueText}</dd>
				</div>
				<div className="rounded-lg border border-lab-line bg-lab-surface px-2 py-2">
					<dt className="font-semibold text-lab-muted">◆ Typical finish</dt>
					<dd className="m-0 font-mono font-bold tabular-nums">{story.typicalText}</dd>
				</div>
				<div className="rounded-lg border border-lab-line bg-lab-surface px-2 py-2">
					<dt className="font-semibold text-lab-muted">▬ Range (80%)</dt>
					<dd className="m-0 font-mono font-bold tabular-nums">
						{fmt(lo)} to {fmt(hi)}
					</dd>
				</div>
			</dl>
			{story.track ? (
				<details className="mt-3 text-sm">
					<summary className="min-h-[44px] cursor-pointer py-2 font-semibold text-lab-soft">Has this method been right before?</summary>
					<p className="m-0 pb-1 leading-relaxed text-lab-soft">
						{story.trackText} It is a pattern from past seasons, not a guarantee for one team: {story.forecast.teams} similar teams is a fair sample, but every season has its own luck.
					</p>
				</details>
			) : null}
		</section>
	)
}

function formatForecast(story: Analysis, v: number): string {
	return formatStat(story, story.fmt === "pct" || story.fmt === "pct1" ? Math.min(1, Math.max(0, v)) : v)
}

const short = (id: string) => (id === "fade" ? "fade" : id === "improve" ? "improve" : id === "hold" ? "hold" : id === "linger" ? "linger" : "mixed")

/** The verdicts after each game count on file, and what moved since the week before. The reason to come back after the next game. */
export function WeekByWeek({ trail, subject, n }: { trail: TrailView; subject: Subject; n: number }) {
	const name = subject.name
	const weeks = Array.from(new Set(trail.stats.flatMap((s) => s.weeks.map((w) => w.n)))).sort((a, b) => a - b)
	const verdictChanges = trail.changes.filter((c) => c.verdictChanged)
	return (
		<section className="container pb-10 sm:pb-14" aria-labelledby="trail-heading">
			<div className="rounded-2xl border border-lab-line bg-lab-surface p-5 sm:p-8">
				<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-lab-muted">Week by week</p>
				<h2 id="trail-heading" className="m-0 mt-2 scroll-mt-6 font-serif text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
					{trail.since === null ? `Tracking the ${name} from here` : `What changed for the ${name} since game ${trail.since}`}
				</h2>
				{trail.since === null ? (
					<p className="m-0 mt-3 max-w-3xl text-base leading-relaxed text-lab-soft">
						This page now keeps each week&rsquo;s numbers. Come back after the {name}&rsquo; next game and it will show which of these verdicts held and which moved.
					</p>
				) : (
					<ul className="m-0 mt-4 grid list-none gap-2 p-0 text-sm leading-snug text-lab-soft sm:text-base">
						{verdictChanges.length === 0 ? <li className="rounded-lg border border-lab-line bg-lab-tint px-4 py-3">None of the {trail.stats.length} verdicts above changed after game {n}.</li> : null}
						{verdictChanges.map((c) => (
							<li key={c.key} className="rounded-lg border border-lab-line bg-lab-tint px-4 py-3">
								<strong className="text-lab-ink">{c.label}</strong> went from &ldquo;{c.verdictFrom.toLowerCase()}&rdquo; to &ldquo;{c.verdictTo.toLowerCase()}&rdquo; ({ordinalOf(c.from)} to {ordinalOf(c.to)} in the league).
							</li>
						))}
						{trail.movers.map((m) => (
							<li key={m.key} className="rounded-lg border border-lab-line bg-lab-tint px-4 py-3">
								<strong className="text-lab-ink">{m.label}</strong> {m.to < m.from ? "climbed" : "dropped"} from {ordinalOf(m.from)} to {ordinalOf(m.to)} of 32.
							</li>
						))}
					</ul>
				)}
				{trail.stats.length > 0 && weeks.length > 1 ? (
					<>
						<p className="m-0 mt-5 text-xs font-semibold text-lab-muted">League rank (1 is best) and the verdict after each game count. Swipe the table sideways for more weeks.</p>
						<div className="relative mt-2 overflow-x-auto [contain:paint]" role="region" aria-label="Week-by-week ranks" tabIndex={0}>
							<table className="w-full min-w-[17rem] border-collapse text-sm">
								<caption className="sr-only">League rank (1 is best) and the verdict after each game count</caption>
								<thead>
									<tr className="border-b border-lab-line text-left text-xs text-lab-muted">
										<th scope="col" className="sticky left-0 bg-lab-surface py-2 pr-2 font-semibold">
											Stat
										</th>
										{weeks.map((w) => (
											<th key={w} scope="col" className="px-2 py-2 text-center font-semibold">
												After {w}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{trail.stats.map((s) => (
										<tr key={s.key} className="border-b border-lab-line last:border-0">
											<th scope="row" className="sticky left-0 bg-lab-surface py-2 pr-2 text-left font-semibold text-lab-ink">
												{s.label}
											</th>
											{weeks.map((w) => {
												const c = s.weeks.find((x) => x.n === w)
												return (
													<td key={w} className="px-2 py-2 text-center align-top">
														{c ? (
															<span className="inline-flex flex-col items-center gap-0.5">
																<span className="font-mono font-bold tabular-nums">{ordinalOf(c.rank)}</span>
																<span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: verdictColor(c.verdict.id) }}>
																	<VerdictIcon id={c.verdict.id} />
																	{short(c.verdict.id)}
																</span>
															</span>
														) : (
															<span className="text-lab-muted" aria-label="not recorded">
																&ndash;
															</span>
														)}
													</td>
												)
											})}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</>
				) : null}
			</div>
		</section>
	)
}
