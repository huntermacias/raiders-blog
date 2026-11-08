import Link from "@/components/SiteLink"

import { cn } from "@/lib/utils"
import { teamByAbbr } from "@/lib/nfl"
import type { TeamGame } from "@/lib/rankingsLive"

const TONE: Record<NonNullable<TeamGame["outcome"]>, string> = {
	winning: "text-emerald-600 dark:text-emerald-400",
	losing: "text-rose-600 dark:text-rose-400",
	tied: "text-muted-foreground",
	won: "text-emerald-600 dark:text-emerald-400",
	lost: "text-rose-600 dark:text-rose-400",
	tie: "text-muted-foreground",
}

const DARK_TONE: Record<NonNullable<TeamGame["outcome"]>, string> = {
	winning: "text-emerald-400",
	losing: "text-rose-400",
	tied: "text-zinc-400",
	won: "text-emerald-400",
	lost: "text-rose-400",
	tie: "text-zinc-400",
}

const WORDS: Record<NonNullable<TeamGame["outcome"]>, string> = { winning: "Leading", losing: "Trailing", tied: "Tied", won: "Won", lost: "Lost", tie: "Tied" }

/** The pulsing red dot that means a game is on. Decorative; the word LIVE beside it carries the meaning. */
export function LiveDot({ className }: { className?: string }) {
	return (
		<span className={cn("relative flex h-2 w-2", className)} aria-hidden>
			<span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60 motion-safe:animate-ping" />
			<span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
		</span>
	)
}

/** A one-line sentence for screen readers: "Live, Q3 4:12: Bills 21, Chiefs 17." */
export function gameSentence(g: TeamGame): string {
	const me = teamByAbbr(g.me.abbr).nick
	const opp = teamByAbbr(g.opp.abbr).nick
	if (g.state === "pre") return `${g.status}: ${g.atHome ? "home against" : "at"} the ${opp}.`
	const lead = g.state === "in" ? `Live, ${g.status}` : g.status
	return `${lead}: ${me} ${g.me.score}, ${opp} ${g.opp.score}.`
}

/**
 * What a team's row says about its game this week: a red LIVE pill with the quarter and clock and the score while it is on, the result once it
 * is over, the kickoff before. A link to the Live page for that game. Never colour alone: the words Leading, Trailing, Won and Lost are there.
 */
export default function GameChip({ game, tone = "light", className }: { game: TeamGame; tone?: "light" | "dark"; className?: string }) {
	const opp = teamByAbbr(game.opp.abbr)
	const live = game.state === "in"
	const dark = tone === "dark"
	const soft = dark ? "text-zinc-400" : "text-muted-foreground"
	const outcomeTone = (o: NonNullable<TeamGame["outcome"]>) => (dark ? DARK_TONE[o] : TONE[o])
	return (
		<Link
			href={game.href}
			aria-label={gameSentence(game)}
			className={cn(
				"group flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2",
				dark ? "text-white hover:bg-white/10 focus-visible:ring-white/60" : "hover:bg-muted/70 focus-visible:ring-ring",
				live ? "border-red-500/40 bg-red-500/[0.08]" : dark ? "border-white/15 bg-white/[0.04]" : "border-border bg-background/60",
				className
			)}
		>
			<span className="min-w-0 flex-1">
				<span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em]">
					{live ? (
						<>
							<LiveDot />
							<span className={dark ? "text-red-400" : "text-red-600 dark:text-red-400"}>Live</span>
							<span className={cn("truncate", soft)}>{game.status}</span>
						</>
					) : game.state === "post" ? (
						<span className={soft}>{game.status}</span>
					) : (
						<span className={cn("truncate", soft)}>{game.status}</span>
					)}
				</span>
				<span className={cn("mt-0.5 block truncate text-xs", soft)}>
					{game.atHome ? "vs" : "at"} {opp.nick}
				</span>
			</span>
			{game.state !== "pre" ? (
				<span className="flex shrink-0 flex-col items-end leading-none">
					<span key={`${game.me.score}-${game.opp.score}`} className="lab-score font-mono text-lg font-bold tabular-nums">
						{game.me.score}
						<span className={cn("px-0.5", soft)}>&ndash;</span>
						{game.opp.score}
					</span>
					{game.outcome && <span className={cn("mt-1 text-[10px] font-bold uppercase tracking-wide", outcomeTone(game.outcome))}>{WORDS[game.outcome]}</span>}
				</span>
			) : null}
		</Link>
	)
}
