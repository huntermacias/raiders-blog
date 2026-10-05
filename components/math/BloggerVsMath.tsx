import { teamInfo } from "@/lib/nfl"
import { cn } from "@/lib/utils"
import type { GradedGame, MathRow, Scorecard } from "@/lib/math/compare"
import { TeamChip } from "@/components/predictions/TeamChip"

function pct(right: number, games: number) {
	return games === 0 ? "n/a" : `${Math.round((right / games) * 100)}%`
}

function Tile({ label, value, foot, lead }: { label: string; value: string; foot: string; lead?: boolean }) {
	return (
		<div className={cn("rounded-xl border border-border bg-card p-4 shadow-sm", lead && "ring-2 ring-foreground/80")}>
			<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
			<p className="mt-2 font-serif text-4xl font-bold leading-none tabular-nums">{value}</p>
			<p className="mt-2 text-xs text-muted-foreground">{foot}</p>
		</div>
	)
}

const record = (right: number, games: number) => `${right}–${games - right}`

/** Who is ahead, said in words so the tile's emphasis is never the only signal. */
function leaderWords(card: Scorecard) {
	const d = card.blogger.right - card.math.right
	if (card.blogger.games === 0) return null
	if (d === 0) return "Dead even so far."
	return d > 0 ? `I'm ahead by ${d} game${d === 1 ? "" : "s"}.` : `The math is ahead by ${-d} game${d === -1 ? "" : "s"}.`
}

export function Scoreboard({ card }: { card: Scorecard }) {
	const { blogger, math, split } = card
	if (blogger.games === 0) {
		return (
			<p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
				No games to grade yet. Once there are rankings for a week and results for the week after, the scoreboard fills in on its own.
			</p>
		)
	}
	const lead = blogger.right === math.right ? undefined : blogger.right > math.right ? "me" : "math"
	return (
		<div>
			<div className="grid gap-3 sm:grid-cols-3">
				<Tile label="Me" value={record(blogger.right, blogger.games)} foot={`${pct(blogger.right, blogger.games)} of winners picked`} lead={lead === "me"} />
				<Tile label="The math" value={record(math.right, math.games)} foot={`${pct(math.right, math.games)} of winners picked`} lead={lead === "math"} />
				<Tile
					label="When we disagree"
					value={split.games === 0 ? "n/a" : `${split.blogger}–${split.math}`}
					foot={split.games === 0 ? "We have picked the same team every time" : `${split.games} game${split.games === 1 ? "" : "s"}, my pick first`}
				/>
			</div>
			<p className="mt-3 text-sm text-muted-foreground">
				{leaderWords(card)} Each week&rsquo;s rankings are graded on the next week&rsquo;s games, {blogger.games} so far. A pick is simply the higher-ranked team: no home field, no point spread, ties skipped.
			</p>
			{split.games > 0 && (
				<details className="mt-4 rounded-xl border border-border bg-card shadow-sm">
					<summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">The {split.games} game{split.games === 1 ? "" : "s"} we disagreed on</summary>
					<ul className="divide-y divide-border border-t border-border text-sm">
						{card.games
							.filter((g) => g.bloggerPick !== g.mathPick)
							.map((g) => (
								<Disagreement key={`${g.week}-${g.away}-${g.home}`} g={g} />
							))}
					</ul>
				</details>
			)}
		</div>
	)
}

function Disagreement({ g }: { g: GradedGame }) {
	const meRight = g.bloggerPick === g.winner
	return (
		<li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
			<span className="w-10 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Wk {g.week}</span>
			<span className="font-semibold tabular-nums">
				{g.away} {g.awayScore}, {g.home} {g.homeScore}
			</span>
			<span className="text-muted-foreground">
				I picked <strong className="text-foreground">{g.bloggerPick}</strong>, the math picked <strong className="text-foreground">{g.mathPick}</strong>.
			</span>
			<span className={cn("ml-auto rounded-full border px-2 py-0.5 text-xs font-bold", meRight ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-400" : "border-rose-600/30 bg-rose-500/10 text-rose-700 dark:border-rose-400/30 dark:text-rose-400")}>
				{meRight ? "I was right" : "The math was right"}
			</span>
		</li>
	)
}

export function HotTakes({ takes }: { takes: MathRow[] }) {
	if (takes.length === 0) {
		return <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No big disagreements this week. The math and I are within a few spots on every team.</p>
	}
	return (
		<ul className="grid gap-3 sm:grid-cols-2">
			{takes.map((r) => {
				const nick = teamInfo(r.team).nick
				const higher = r.gap > 0
				return (
					<li key={r.team} className="rounded-xl border border-border bg-card p-4 shadow-sm">
						<div className="flex items-center gap-2">
							<TeamChip team={r.team} />
							<span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{higher ? "I'm higher" : "I'm lower"}</span>
						</div>
						<p className="mt-2 font-serif text-xl font-bold leading-snug">
							{higher ? `The math doesn't believe in the ${nick}.` : `The math loves the ${nick} more than I do.`}
						</p>
						<p className="mt-1 text-sm text-muted-foreground tabular-nums">
							I have them No. {r.blogger}. The math has them No. {r.math}, {Math.abs(r.gap)} spots {higher ? "lower" : "higher"}.
						</p>
					</li>
				)
			})}
		</ul>
	)
}
