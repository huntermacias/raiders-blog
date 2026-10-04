import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { SEASON } from "../../../../lib/predictions"
import { teamInfo } from "../../../../lib/nfl"
import { loadLeague } from "../../../../lib/league.data"
import { HANDLE_RE, buildProfile, oneDecimal, recordText, signed } from "../../../../lib/league"
import { cn } from "../../../../lib/utils"

export const dynamic = "force-dynamic"

const SITE_URL = "https://www.raidersrundown.com"

export async function generateMetadata({ params }: { params: { handle: string } }): Promise<Metadata> {
	const handle = HANDLE_RE.test(params.handle) ? params.handle : null
	if (!handle) return { title: "Beat the Blogger | Raiders Rundown" }
	const hour = Math.floor(Date.now() / 3_600_000)
	const image = `${SITE_URL}/api/og?type=league&handle=${encodeURIComponent(handle)}&v=${hour}`
	const title = `${handle} in Beat the Blogger | Raiders Rundown`
	const description = `${handle}'s season in the Raiders Rundown score-pick league: points, picks, and record against the blogger.`
	return {
		title,
		description,
		alternates: { canonical: `${SITE_URL}/league/${handle}` },
		openGraph: { type: "profile", title, description, url: `${SITE_URL}/league/${handle}`, siteName: "Raiders Rundown", images: [image, { url: image, width: 1200, height: 630, alt: `${handle} in Beat the Blogger` }] },
		twitter: { card: "summary_large_image", title, description, images: [image] },
	}
}

function Tile({ label, value, foot }: { label: string; value: string; foot?: string }) {
	return (
		<div className="rounded-xl border border-border bg-card p-4 shadow-sm">
			<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
			<p className="mt-2 font-serif text-3xl font-bold leading-none tabular-nums md:text-4xl">{value}</p>
			{foot && <p className="mt-2 text-xs text-muted-foreground">{foot}</p>}
		</div>
	)
}

export default async function LeagueProfile({ params }: { params: { handle: string } }) {
	if (!HANDLE_RE.test(params.handle)) notFound()

	const { data, ok } = await loadLeague()
	const profile = buildProfile(data.games, data.players, data.picks, params.handle)
	if (!profile) {
		// A failed load shouldn't masquerade as "no such player".
		if (!ok) {
			return (
				<div className="container py-12">
					<p role="status" className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
						The league is having trouble loading right now. Refresh in a minute.
					</p>
				</div>
			)
		}
		notFound()
	}

	const { player, row, ranked, history, pending } = profile
	const shareText = row
		? `I'm #${row.rank} in Beat the Blogger at Raiders Rundown with ${row.points} points. Think you can beat the blogger?`
		: `I'm playing Beat the Blogger at Raiders Rundown. Think you can beat the blogger?`
	const shareHref = `https://twitter.com/intent/tweet?${new URLSearchParams({ text: shareText, url: `${SITE_URL}/league/${player.handle}` }).toString()}`

	return (
		<div className="container py-12">
			<Link href="/league" className="text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
				&larr; Beat the Blogger
			</Link>

			<div className="mt-4 mb-8">
				<p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{SEASON} season</p>
				<h1 className="mt-1 font-serif text-4xl font-bold tracking-tight md:text-5xl">{player.handle}</h1>
				{row ? (
					<p className="mt-3 text-lg text-muted-foreground">
						Ranked <span className="font-semibold text-foreground">#{row.rank}</span> of {ranked}.
					</p>
				) : (
					<p className="mt-3 text-lg text-muted-foreground">
						In the league and waiting on a first graded game{pending > 0 ? `. ${pending} pick${pending === 1 ? " is" : "s are"} in.` : "."}
					</p>
				)}
				<a href={shareHref} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline">
					Share this profile<span className="sr-only"> (opens in a new tab)</span>
				</a>
			</div>

			{row && (
				<section aria-label="Season stats" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<Tile label="Points" value={String(row.points)} foot={`${row.games} game${row.games === 1 ? "" : "s"} graded`} />
					<Tile label="Winners right" value={`${row.correct}/${row.games}`} foot={row.exact > 0 ? `${row.exact} exact score${row.exact === 1 ? "" : "s"}` : "No exact scores yet"} />
					<Tile label="Average miss" value={oneDecimal(row.avgMarginError)} foot="points off the margin" />
					<Tile label="Against me" value={recordText(row.vsBlogger)} foot={row.delta === 0 ? "Level with me" : `${signed(row.delta)} points on the same games`} />
				</section>
			)}

			<section className="mt-12" aria-labelledby="picks-heading">
				<h2 id="picks-heading" className="font-serif text-3xl font-bold tracking-tight">
					Graded picks
				</h2>
				{pending > 0 && <p className="mt-1 text-sm text-muted-foreground">{pending} more {pending === 1 ? "pick stays" : "picks stay"} private until kickoff and the final.</p>}

				{history.length === 0 ? (
					<p className="mt-6 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No graded picks yet.</p>
				) : (
					<div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
						<div className="relative overflow-x-auto">
							<table className="w-full min-w-[34rem] text-left text-sm">
								<thead className="border-b border-border bg-muted/50 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
									<tr>
										<th scope="col" className="px-3 py-3">Wk</th>
										<th scope="col" className="px-3 py-3">Game</th>
										<th scope="col" className="px-3 py-3 text-right">Pick</th>
										<th scope="col" className="px-3 py-3 text-right">Final</th>
										<th scope="col" className="px-3 py-3 text-right">Pts</th>
										<th scope="col" className="px-3 py-3 text-right">Me</th>
										<th scope="col" className="px-3 py-3 text-right">Result</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border">
									{history.map((h) => {
										const away = teamInfo(h.game.awayTeam)
										const home = teamInfo(h.game.homeTeam)
										return (
											<tr key={h.game._id}>
												<td className="px-3 py-3 font-semibold tabular-nums">{h.game.week}</td>
												<td className="px-3 py-3">{away.abbr} at {home.abbr}</td>
												<td className="px-3 py-3 text-right tabular-nums">{h.pick.awayScore}–{h.pick.homeScore}</td>
												<td className="px-3 py-3 text-right tabular-nums">{h.game.actualAwayScore}–{h.game.actualHomeScore}</td>
												<td className="px-3 py-3 text-right font-serif text-base font-bold tabular-nums">{h.score.points}</td>
												<td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{h.blogger.points}</td>
												<td className="px-3 py-3 text-right">
													<span
														className={cn(
															"inline-flex min-w-[3.25rem] justify-center rounded-full border px-2 py-0.5 text-xs font-bold",
															h.vs === "W" && "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-400",
															h.vs === "L" && "border-rose-600/30 bg-rose-500/10 text-rose-700 dark:border-rose-400/30 dark:text-rose-400",
															h.vs === "T" && "border-border bg-muted text-muted-foreground"
														)}
													>
														<span className="sr-only">{h.vs === "W" ? "Beat me" : h.vs === "L" ? "Lost to me" : "Tied me"}</span>
														<span aria-hidden>{h.vs === "W" ? "Beat" : h.vs === "L" ? "Lost" : "Tied"}</span>
													</span>
												</td>
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>
					</div>
				)}
			</section>
		</div>
	)
}
