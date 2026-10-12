import WeekBars from "@/components/lab/WeekBars"
import {
	GROUP_LABEL,
	type PlayerRow,
	type PlayersData,
	type Standout,
	describeMove,
	formName,
	formWeeks,
	gradeWord,
	isMixed,
	level,
	moveText,
	roleMove,
	snapText,
	standoutLine,
	statInfo,
	HEADLINE,
} from "@/lib/lab/playersKit"

const UP = "text-emerald-700 dark:text-emerald-400"
const DOWN = "text-rose-700 dark:text-rose-400"

/** A direction that does not depend on color: an arrow and a word. */
export function Move({ score, className = "" }: { score: number; className?: string }) {
	const up = score > 0
	return (
		<span className={`inline-flex items-center gap-1 font-mono text-sm font-bold tabular-nums ${up ? UP : DOWN} ${className}`}>
			<span aria-hidden="true">{up ? "▲" : "▼"}</span>
			<span>{moveText(score)}</span>
			<span className="sr-only">{up ? "grade points up" : "grade points down"}</span>
		</span>
	)
}

function Grade({ label, g }: { label: string; g: number | null }) {
	return (
		<div className="min-w-0">
			<dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">{label}</dt>
			<dd className="m-0 mt-0.5 text-sm text-lab-ink">
				<span className="font-mono text-base font-bold tabular-nums">{g === null ? "–" : Math.round(g)}</span>{" "}
				<span className="text-xs text-lab-muted">{gradeWord(g)}</span>
			</dd>
		</div>
	)
}

/** One player who is moving: why in a sentence, the game-by-game bars, and where he sits now against before. */
export function MoverCard({ data, player, dir }: { data: PlayersData; player: PlayerRow; dir: "up" | "down" }) {
	const mover = player.mover
	if (!mover) return null
	const key = HEADLINE[player.group]
	const info = statInfo(player.group, key)
	const role = roleMove(player)
	const mixed = isMixed(player)
	return (
		<article className="flex h-full flex-col rounded-2xl border border-lab-line bg-lab-surface p-5" data-testid="mover-card" data-dir={dir}>
			<header className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<h3 className="m-0 font-serif text-xl font-bold leading-tight">{player.name}</h3>
					<p className="m-0 mt-0.5 text-xs text-lab-muted">
						{player.pos} &middot; {GROUP_LABEL[player.group].title}
					</p>
				</div>
				<Move score={mover.score} className="shrink-0" />
			</header>
			<p className="m-0 mt-3 text-sm leading-relaxed text-lab-soft">{describeMove(data, player)}</p>
			{mixed ? (
				<p className="m-0 mt-2 text-xs leading-relaxed text-lab-muted">Mixed picture: {mover.agree} of {mover.stats} stats moved the same way.</p>
			) : null}
			{role ? (
				<p className="m-0 mt-2 text-xs leading-relaxed text-lab-muted">
					Playing time is {role === "up" ? "up" : "down"}: {snapText(player.snaps.earlier)} of snaps before, {snapText(player.snaps.form)} lately.
				</p>
			) : null}
			<div className="mt-4">
				<WeekBars data={data} player={player} />
				<p className="m-0 mt-1 text-[11px] leading-snug text-lab-muted">
					{info?.label}{info?.higher === false ? ", lower is better" : ""}. Dark bars are {formName(data, player.group).toLowerCase()} ({formWeeks(data, player.group)}).
				</p>
			</div>
			<dl className="m-0 mt-4 grid grid-cols-2 gap-3 border-t border-lab-line pt-3">
				<Grade label="Before" g={level(player, "earlier")} />
				<Grade label={formName(data, player.group)} g={level(player, "form")} />
			</dl>
		</article>
	)
}

export function MoverColumn({ data, title, blurb, players, dir }: { data: PlayersData; title: string; blurb: string; players: PlayerRow[]; dir: "up" | "down" }) {
	return (
		<section aria-labelledby={`movers-${dir}`}>
			<h2 id={`movers-${dir}`} className={`m-0 font-serif text-2xl font-bold tracking-tight ${dir === "up" ? UP : DOWN}`}>
				<span aria-hidden="true">{dir === "up" ? "▲ " : "▼ "}</span>
				{title}
			</h2>
			<p className="m-0 mt-1 text-sm text-lab-soft">{blurb}</p>
			{players.length ? (
				<div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
					{players.map((p) => (
						<MoverCard key={p.id} data={data} player={p} dir={dir} />
					))}
				</div>
			) : (
				<p className="m-0 mt-4 rounded-2xl border border-dashed border-lab-line-strong p-5 text-sm leading-relaxed text-lab-soft">
					Nobody has moved by a full grade point or more with enough plays behind it. That is normal after a steady week.
				</p>
			)}
		</section>
	)
}

/** The Raiders' best and worst advanced numbers over the whole season, each with where it ranks among that position in the league. */
export function StandoutList({ data, items, tone }: { data: PlayersData; items: Standout[]; tone: "good" | "bad" }) {
	if (!items.length) {
		return <p className="m-0 text-sm text-lab-soft">{tone === "good" ? "No stat is in the top 15% of the league at its position yet." : "No stat is in the bottom 15% of the league at its position yet."}</p>
	}
	return (
		<ul className="m-0 grid list-none gap-2 p-0" data-testid={`standouts-${tone}`}>
			{items.map((x) => (
				<li key={`${x.player.id}-${x.stat.k}`} className="rounded-xl border border-lab-line bg-lab-surface px-4 py-3">
					<p className="m-0 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
						<span className="font-serif text-base font-bold">{x.player.name}</span>
						<span className={`font-mono text-xs font-bold tabular-nums ${tone === "good" ? UP : DOWN}`}>
							{tone === "good" ? "Top " : "Bottom "}
							{Math.max(1, Math.round(tone === "good" ? 100 - x.pct : x.pct))}%
						</span>
					</p>
					<p className="m-0 mt-1 text-sm leading-snug text-lab-soft">{standoutLine(data, x)}</p>
					<p className="m-0 mt-1 text-xs leading-relaxed text-lab-muted">{x.info.what}</p>
				</li>
			))}
		</ul>
	)
}
