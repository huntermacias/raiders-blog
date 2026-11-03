import Link from "@/components/SiteLink"
import { ArrowRight } from "lucide-react"

import { TeamLogo } from "@/components/lab/players/Media"
import { kickoffLabel } from "@/lib/live/format"
import { teamInfo } from "@/lib/nfl"

export type GameLink = {
	week?: number | null
	awayTeam?: string | null
	homeTeam?: string | null
	kickoff?: string | null
	predictedAwayScore?: number | null
	predictedHomeScore?: number | null
	actualAwayScore?: number | null
	actualHomeScore?: number | null
	report?: { slug?: string | null; title?: string | null } | null
}

const num = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n)

/**
 * "The game" box on a preview (or the story about a week): who is playing, when or how it ended, the site's pick, and a link to the game
 * report once there is one. It reads the same Game Prediction document the Predictions page and the scoreboard use, so nothing is typed twice.
 */
export default function GameCard({ game }: { game: GameLink | null | undefined }) {
	if (!game?.awayTeam || !game?.homeTeam) return null
	const away = teamInfo(game.awayTeam)
	const home = teamInfo(game.homeTeam)
	const final = num(game.actualAwayScore) && num(game.actualHomeScore)
	const pick = num(game.predictedAwayScore) && num(game.predictedHomeScore)
	const reportHref = game.report?.slug ? `/games/${game.report.slug}` : null
	return (
		<section aria-label="The game" className="mb-10 overflow-hidden rounded-2xl border border-border/70 bg-card" data-testid="game-card">
			<h2 className="flex items-center justify-between border-b border-border/70 bg-muted/50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
				<span>The game{game.week ? ` · Week ${game.week}` : ""}</span>
				<span className="normal-case tracking-normal">{final ? "Final" : kickoffLabel(game.kickoff ?? null)}</span>
			</h2>
			<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-5 text-center">
				{[
					{ t: away, score: game.actualAwayScore, side: "away" },
					null,
					{ t: home, score: game.actualHomeScore, side: "home" },
				].map((s) =>
					s ? (
						<div key={s.side} className="flex min-w-0 flex-col items-center gap-1.5" style={{ "--pc-accent": s.t.color, "--pc-on": "#ffffff" } as React.CSSProperties}>
							<TeamLogo team={s.t.abbr} size={48} className="h-12 w-12" />
							<p className="truncate text-sm font-semibold">{s.t.nick}</p>
							{final && <p className="font-sans text-3xl font-extrabold tabular-nums">{s.score}</p>}
						</div>
					) : (
						<p key="at" className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">at</p>
					),
				)}
			</div>
			{(pick || reportHref) && (
				<div className="flex flex-col gap-2 border-t border-border/70 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
					{pick ? (
						<p>
							<span className="text-muted-foreground">Our pick: </span>
							<span className="font-semibold">
								{away.nick} {game.predictedAwayScore}, {home.nick} {game.predictedHomeScore}
							</span>
						</p>
					) : (
						<span />
					)}
					{reportHref && (
						<Link href={reportHref} className="inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline">
							{final ? "Read the game report" : "Game report"} <ArrowRight aria-hidden className="h-4 w-4" />
						</Link>
					)}
				</div>
			)}
		</section>
	)
}
