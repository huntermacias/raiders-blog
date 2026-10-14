import Link from "@/components/SiteLink"
import { GROUP_META, type PlayerGroup, ordinal } from "@/lib/lab/playersKit"
import {
	CONTRIBUTION,
	CONTRIBUTION_ONE_LINE,
	PROJECTION,
	PROJECTION_LIMITS,
	PROJECTION_ONE_LINE,
	THIS_SEASON,
	THIS_SEASON_ONE_LINE,
	componentsOf,
	contributionOf,
	lowerLabel,
	observedOf,
	projectionOf,
	rbOverlapNote,
	sharePct,
	whyDiffer,
} from "@/lib/lab/v2/kit"
import type { V2Data, V2Row } from "@/lib/lab/v2/types"

const signed = (v: number, d = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`

const OF: Record<string, string> = { dropbacks: "dropbacks", carries: "carries", targets: "targets", "designed runs": "designed runs", kickoffs: "kickoffs", punts: "punts", returns: "returns" }

/** What each job's contribution is measured over, in a few words. */
function contributionUnit(row: V2Row): string {
	return row.contrib?.parts.map((p) => OF[p.of] ?? p.of).join(" and ") ?? ""
}

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
	return (
		<>
			<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-lab-muted">{children}</p>
			{hint ? <p className="m-0 mt-0.5 text-xs leading-snug text-lab-muted">{hint}</p> : null}
		</>
	)
}

/**
 * The three answers about one player, side by side and never merged: how he has played THIS SEASON (the lead), what he has CONTRIBUTED
 * so far, and where the PROJECTION puts him once earlier seasons count. When they disagree, one sentence says why.
 */
export default function V2Summary({ data, player }: { data: V2Data; player: V2Row }) {
	const meta = GROUP_META[player.group as PlayerGroup]
	const obs = observedOf(data, player)
	const contrib = contributionOf(data, player)
	const proj = projectionOf(data, player)
	const comps = componentsOf(data, player)
	const why = whyDiffer(data, player)
	const policy = data.method.policy[player.group]
	const tracked = player.tracked

	return (
		<div className="grid gap-3" data-testid="v2-summary">
			<section className="overflow-hidden rounded-2xl border border-lab-line-strong bg-lab-surface/95 backdrop-blur" aria-labelledby="v2-season-h" data-testid="v2-season">
				<div className="p-5">
					<h2 id="v2-season-h" className="m-0">
						<Label hint={THIS_SEASON_ONE_LINE}>{THIS_SEASON}</Label>
					</h2>
					{obs ? (
						<div className="mt-3 flex items-end justify-between gap-4">
							<div className="min-w-0">
								<p className="m-0 font-mono text-4xl font-bold leading-none tabular-nums" data-testid="v2-season-value">
									{obs.formatted}
								</p>
								<p className="m-0 mt-1 text-sm text-lab-soft">{obs.label}</p>
							</div>
							{obs.rank !== null && obs.of !== null ? (
								<p className="m-0 shrink-0 text-right text-sm leading-snug text-lab-soft" data-testid="v2-season-rank">
									<span className="block font-serif text-3xl font-bold leading-none text-lab-ink">{ordinal(obs.rank)}</span>{" "}
									of {obs.of} {meta.peers}
								</p>
							) : null}
						</div>
					) : (
						<p className="m-0 mt-3 text-sm text-lab-soft">Not enough plays to rank yet.</p>
					)}
					{obs ? (
						<p className="m-0 mt-2 text-xs text-lab-muted">
							{Math.round(obs.n)} {obs.per} over {obs.games} {obs.games === 1 ? "game" : "games"}. This season&apos;s plays only.
						</p>
					) : null}
				</div>
				{comps.length ? (
					<ul className="m-0 grid list-none gap-0 border-t border-lab-line p-0" data-testid="v2-components">
						{comps.map((c) => (
							<li key={c.key} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-lab-line px-5 py-2 text-sm last:border-b-0">
								<span className="text-lab-soft">{c.label}</span>
								<span className="font-mono font-semibold tabular-nums text-lab-ink">
									{c.formatted}
									{c.rank !== null && c.of !== null ? <span className="ml-2 font-sans text-xs font-normal text-lab-muted">{ordinal(c.rank)} of {c.of}</span> : null}
								</span>
								{c.covered ? (
									<span className="basis-full text-xs text-lab-muted" data-testid="v2-covered">
										Tracking data covers {c.covered.n} of his {c.covered.of} carries ({c.covered.pct}%). Observed, not graded.
									</span>
								) : null}
							</li>
						))}
					</ul>
				) : null}
				{!comps.length && tracked && tracked.games < tracked.of && tracked.of > 0 ? (
					<p className="m-0 border-t border-lab-line bg-lab-tint px-5 py-2 text-xs text-lab-muted">Tracking numbers cover {tracked.games} of his {tracked.of} games.</p>
				) : null}
			</section>

			<section className="overflow-hidden rounded-2xl border border-lab-line bg-lab-surface/90" aria-labelledby="v2-contrib-h" data-testid="v2-contribution">
				<div className="p-5">
					<h2 id="v2-contrib-h" className="m-0">
						<Label hint={CONTRIBUTION_ONE_LINE}>{CONTRIBUTION}</Label>
					</h2>
					{contrib ? (
						<div className="mt-3 flex items-end justify-between gap-4">
							<div className="min-w-0">
								<p className="m-0 font-mono text-3xl font-bold leading-none tabular-nums" data-testid="v2-contrib-total">
									{signed(contrib.over)} EPA
								</p>
								<p className="m-0 mt-1 text-sm text-lab-soft">
									{signed(contrib.perGame)} per game, over his {contributionUnit(player)}
								</p>
							</div>
							<p className="m-0 shrink-0 text-right text-sm leading-snug text-lab-soft">
								<span className="block font-serif text-2xl font-bold leading-none text-lab-ink">{ordinal(contrib.rank)}</span>{" "}
								of {contrib.of} at the job
							</p>
						</div>
					) : (
						<p className="m-0 mt-3 text-sm text-lab-soft">Points added are not measured for this job: the public data does not say who did what on a play for it.</p>
					)}
				</div>
			</section>

			<section className="overflow-hidden rounded-2xl border border-dashed border-lab-line-strong bg-lab-tint/70" aria-labelledby="v2-proj-h" data-testid="v2-projection">
				<div className="p-5">
					<h2 id="v2-proj-h" className="m-0">
						<Label hint={PROJECTION_ONE_LINE}>{PROJECTION}</Label>
					</h2>
					{proj ? (
						<>
							<div className="mt-3 flex items-end justify-between gap-4">
								<div className="min-w-0">
									<p className="m-0 font-mono text-3xl font-bold leading-none tabular-nums" data-testid="v2-proj-grade">
										{Math.round(proj.grade)}
										<span className="ml-2 font-sans text-sm font-normal text-lab-muted" data-testid="v2-proj-range">
											likely {Math.round(proj.lo)} to {Math.round(proj.hi)}
										</span>
									</p>
									<p className="m-0 mt-1 text-sm text-lab-soft">Projected {lowerLabel(proj.statLabel)} (50 is an average {meta.single.toLowerCase()})</p>
								</div>
								<p className="m-0 shrink-0 text-right text-sm leading-snug text-lab-soft">
									<span className="block font-serif text-2xl font-bold leading-none text-lab-ink">{ordinal(proj.rank)}</span>{" "}
									of {proj.of} projected
								</p>
							</div>
							<div className="mt-3" data-testid="v2-share">
								<div className="flex h-2.5 overflow-hidden rounded-full bg-lab-line" role="img" aria-label={`${sharePct(proj.thisSeasonShare)} of this projection is this season's plays`}>
									<span style={{ width: `${Math.max(2, proj.thisSeasonShare * 100)}%`, background: "var(--pc-accent)" }} />
								</div>
								<p className="m-0 mt-1 text-xs leading-snug text-lab-muted">
									{sharePct(proj.thisSeasonShare)} of this projection is this season&apos;s plays; the rest is the league average and his earlier seasons.
									{proj.seasonOnly !== null ? ` From this season alone it would be ${Math.round(proj.seasonOnly)}.` : ""}
								</p>
							</div>
							<p className="m-0 mt-3 text-xs leading-snug text-lab-soft">{proj.target}</p>
							{proj.env.kind === "new-team" || proj.env.kind === "new-coach" ? (
								<p className="m-0 mt-3 rounded-lg border border-lab-line-strong bg-lab-surface px-3 py-2 text-xs leading-snug text-lab-ink" data-testid="v2-env">
									<span className="font-semibold">Heads up. </span>
									{proj.env.text}
								</p>
							) : null}
						</>
					) : comps.some((c) => c.grade) ? (
						<ul className="m-0 mt-3 grid list-none gap-2 p-0" data-testid="v2-component-grades">
							{comps
								.filter((c) => c.grade)
								.map((c) => (
									<li key={c.key} className="flex items-baseline justify-between gap-3 text-sm">
										<span className="text-lab-soft">{c.label}</span>
										<span className="font-mono font-semibold tabular-nums">
											{Math.round(c.grade!.g)}
											<span className="ml-2 font-sans text-xs font-normal text-lab-muted">
												likely {Math.round(c.grade!.lo)} to {Math.round(c.grade!.hi)} &middot; {sharePct(c.grade!.share)} this season
											</span>
										</span>
									</li>
								))}
							<li className="text-xs leading-snug text-lab-muted">{rbOverlapNote()} There is no single grade for a running back: rushing results barely repeat from one season to the next.</li>
						</ul>
					) : (
						<p className="m-0 mt-3 text-sm leading-snug text-lab-soft" data-testid="v2-no-projection">
							{policy?.mode === "none" ? `No projection for ${meta.peers}. The numbers that describe this job either describe his role or do not repeat from season to season, so a projection would be a guess.` : `No projection is published for this job.`}
						</p>
					)}
					<p className="m-0 mt-3 text-[11px] leading-snug text-lab-muted">{PROJECTION_LIMITS}</p>
				</div>
			</section>

			{why ? (
				<p className="m-0 rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm leading-relaxed text-lab-soft" data-testid="v2-why">
					<span className="font-semibold text-lab-ink">Why these differ. </span>
					{why}
				</p>
			) : null}
			<p className="m-0 text-xs text-lab-muted">
				Three questions, three numbers, never added together. <Link href="/lab/players#how-it-works" className="underline">How they work</Link>.
			</p>
		</div>
	)
}
