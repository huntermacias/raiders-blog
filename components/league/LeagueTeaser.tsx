import Link from "@/components/SiteLink"
import { ArrowRight, Trophy } from "lucide-react"

import { type StandingRow, type WeekSummary, signed } from "@/lib/league"

type Props = {
	players: number
	/** Season standings, best first. */
	top: StandingRow[]
	/** Latest graded week, if any. */
	lastWeek: WeekSummary | null
	/** Games currently open for picks. */
	open: number
}

/** The homepage hook: what the league is, how readers are doing, one tap in. */
export default function LeagueTeaser({ players, top, lastWeek, open }: Props) {
	const lead = top.slice(0, 3)

	return (
		<section aria-labelledby="league-teaser" className="container pt-14">
			<div className="relative overflow-hidden rounded-2xl border border-[#27272a] bg-[#09090b] text-zinc-50 shadow-xl">
				<div
					aria-hidden
					className="pointer-events-none absolute inset-0"
					style={{ background: "radial-gradient(55% 90% at 0% 0%, rgba(161,161,170,0.16) 0%, rgba(9,9,11,0) 65%)" }}
				/>
				<div className="relative grid gap-8 p-6 md:grid-cols-[1.2fr_1fr] md:p-10">
					<div>
						<p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
							<Trophy aria-hidden className="h-4 w-4" /> Free weekly league
						</p>
						<h2 id="league-teaser" className="mt-2 font-serif text-3xl font-bold leading-tight tracking-tight md:text-5xl">
							Beat the Blogger.
						</h2>
						<p className="mt-3 max-w-lg text-zinc-300">
							Pick the exact score before kickoff. You&rsquo;re graded with the same rules I am, and every week the board shows who beat me.
						</p>

						<dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
							<div>
								<dt className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Players</dt>
								<dd className="font-serif text-3xl font-bold tabular-nums">{players}</dd>
							</div>
							{lastWeek && lastWeek.entrants > 0 && (
								<div>
									<dt className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Beat me, Week {lastWeek.week}</dt>
									<dd className="font-serif text-3xl font-bold tabular-nums">
										{lastWeek.beat}
										<span className="text-lg text-zinc-500"> of {lastWeek.entrants}</span>
									</dd>
								</div>
							)}
						</dl>

						<div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
							<Link
								href="/league#play"
								className="inline-flex items-center gap-2 rounded-lg bg-zinc-50 px-5 py-2.5 text-sm font-bold text-[#09090b] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
							>
								{open > 0 ? "Make your pick" : "Join the league"} <ArrowRight aria-hidden className="h-4 w-4" />
							</Link>
							<Link href="/league" className="text-sm font-semibold text-zinc-300 underline-offset-4 hover:text-zinc-50 hover:underline">
								See the board
							</Link>
						</div>
					</div>

					<div>
						<p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Season leaders</p>
						{lead.length > 0 ? (
							<ol className="grid gap-2">
								{lead.map((r) => (
									<li key={r.lower}>
										<Link
											href={`/league/${r.handle}`}
											className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
										>
											<span className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-600 text-xs font-bold tabular-nums">{r.rank}</span>
											<span className="min-w-0 flex-1 truncate font-semibold">{r.handle}</span>
											<span className="font-serif text-lg font-bold tabular-nums">{r.points}</span>
											<span className="w-10 text-right text-xs font-bold tabular-nums text-zinc-400">{signed(r.delta)}</span>
										</Link>
									</li>
								))}
							</ol>
						) : (
							<p className="rounded-lg border border-dashed border-zinc-700 px-4 py-6 text-sm text-zinc-400">
								No one is on the board yet. The first graded game puts the first names here. Be one of them.
							</p>
						)}
					</div>
				</div>
			</div>
		</section>
	)
}
