import Link from "@/components/SiteLink"
import { type TopPlay, helped, playWord, swingText, whenText } from "@/lib/lab/topPlays"
import CardFigure from "./CardFigure"

const pct = (n: number) => `${Math.round(n * 100)}%`

/** A bar from 0 to 100% win chance, filled to where the play left it, with a tick where it started. */
function SwingBar({ play }: { play: TopPlay }) {
	if (play.before === null || play.after === null) return null
	const raiders = play.swing >= 0
	return (
		<div className="mt-3" role="img" aria-label={`The Raiders' chance to win went from ${pct(play.before)} to ${pct(play.after)}.`}>
			<div className="relative h-2 rounded-full bg-lab-tint ring-1 ring-inset ring-lab-line">
				<div className={`absolute inset-y-0 left-0 rounded-full ${raiders ? "bg-lab-team" : "bg-lab-opp"}`} style={{ width: `${Math.round(play.after * 100)}%` }} />
				<div className="absolute -top-1 h-4 w-0.5 bg-lab-ink" style={{ left: `${Math.round(play.before * 100)}%` }} />
			</div>
			<div className="mt-1 flex justify-between font-mono text-[11px] tabular-nums text-lab-muted">
				<span>Before {pct(play.before)}</span>
				<span>After {pct(play.after)}</span>
			</div>
		</div>
	)
}

type Props = {
	plays: TopPlay[]
	/** Slug of the game these come from ("week-4"), or "season". */
	scope: string
	/** Version stamp for card URLs, so a refreshed data file gives a fresh image. */
	stamp: number
	/** Show a link to the game on every row (the season page). */
	linkGames?: boolean
	/** Show a card for the first play. */
	card?: boolean
}

export default function TopPlays({ plays, scope, stamp, linkGames = false, card = true }: Props) {
	if (!plays.length) return null
	const first = plays[0]
	const cardSrc = (rank: number) => `/api/og?type=lab&slug=${scope}&view=play&rank=${rank}&v=${stamp}`
	return (
		<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
			<ol className="m-0 list-none divide-y divide-lab-line rounded-xl border border-lab-line p-0">
				{plays.map((p) => (
					<li key={`${p.slug}-${p.drive}-${p.playN}`} className="p-4 sm:p-5">
						<div className="flex items-start gap-4">
							<span className="mt-0.5 w-6 shrink-0 font-mono text-sm font-bold tabular-nums text-lab-muted">{p.rank}</span>
							<div className="min-w-0 flex-1">
								<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
									<h3 className="font-serif text-lg font-bold leading-snug">
										{playWord(p)}
										{linkGames ? (
											<>
												{" "}
												<span className="text-sm font-normal text-lab-muted">
													&middot;{" "}
													<Link href={`/lab/${p.slug}`} className="underline-offset-4 hover:text-lab-ink hover:underline">
														Week {p.week} vs {p.oppName}
													</Link>
												</span>
											</>
										) : null}
									</h3>
									<p className="m-0 font-mono text-sm font-bold tabular-nums">
										{swingText(p)} <span className="font-sans text-xs font-normal text-lab-muted">for the {helped(p)}</span>
									</p>
								</div>
								<p className="m-0 mt-1 text-xs text-lab-muted">{whenText(p) || `Week ${p.week}`}</p>
								<p className="m-0 mt-2 text-sm leading-relaxed text-lab-soft">{p.text}</p>
								<SwingBar play={p} />
								<p className="m-0 mt-2 text-xs">
									<a href={cardSrc(p.rank)} target="_blank" rel="noopener noreferrer" className="font-semibold text-lab-soft underline-offset-4 hover:text-lab-ink hover:underline">
										Share card for this play
									</a>
								</p>
							</div>
						</div>
					</li>
				))}
			</ol>
			{card ? (
				<CardFigure
					src={cardSrc(first.rank)}
					alt={`${playWord(first)}, ${whenText(first)}: ${swingText(first)} of win probability for the ${helped(first)}.`}
					filename={`raiders-play-${scope}-${first.rank}.png`}
					caption={scope === "season" ? "Play of the season" : "Play of the game"}
				/>
			) : null}
		</div>
	)
}
