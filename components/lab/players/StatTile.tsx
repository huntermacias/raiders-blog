import { ConfidenceChip, Delta, EarlyChip, TierChip } from "@/components/lab/players/Bits"
import Yardstick from "@/components/lab/players/Yardstick"
import { cardStyle } from "@/lib/lab/playerView"
import {
	GROUP_META,
	type PlayerRow,
	type PlayerStat,
	type PlayersData,
	SURE_WORD,
	confidenceOf,
	contextOf,
	formNameFor,
	formatStat,
	rankPhrase,
	styleLine,
	topPhrase,
} from "@/lib/lab/playersKit"

/** Last stretch against the games before it, in the stat's own units, and how sure the change is. */
export function TrendLine({ data, player, stat }: { data: PlayersData; player: PlayerRow; stat: PlayerStat }) {
	if (!stat.form || !stat.earlier) return null
	const f = formatStat(player.group, stat.k, stat.form.v)
	const e = formatStat(player.group, stat.k, stat.earlier.v)
	const conf = confidenceOf(stat.z)
	// Two numbers that print the same are not a change, whatever the grade points say.
	const same = f === e || (stat.delta !== undefined && Math.abs(stat.delta) < 1)
	return (
		<p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-snug text-lab-soft">
			<span>
				{formNameFor(data, player)}: <span className="font-mono font-semibold text-lab-ink">{f}</span> <span className="text-lab-muted">({Math.round(stat.form.n)})</span> vs <span className="font-mono">{e}</span> before.
			</span>
			{same ? (
				<span className="text-lab-muted">No change worth reading.</span>
			) : (
				<>
					{stat.delta !== undefined ? <Delta v={stat.delta} /> : null}{" "}
					{stat.delta !== undefined ? <ConfidenceChip conf={conf} /> : null}
				</>
			)}
		</p>
	)
}

/**
 * One stat as a card: the number, where it ranks, the league's yardstick with a whisker for how sure the number is, what it means in
 * plain English, and what the box score shows instead.
 */
export default function StatTile({ data, player, stat, showBox = false, showTrend = true, win = null, className = "" }: { data: PlayersData; player: PlayerRow; stat: PlayerStat; showBox?: boolean; showTrend?: boolean; win?: string | null; className?: string }) {
	const ctx = contextOf(data, player, stat)
	if (!ctx) return null
	const { info } = ctx
	const peers = GROUP_META[player.group].peers
	const style = info.higher === null
	// A unit's number (a line's run success) is not his: it is shown against the league, with no place and no tier for him.
	const shared = Boolean(info.unit)
	const luck = !style && !shared && ctx.signal === "luck"
	return (
		<article className={`lab-opp flex h-full flex-col rounded-2xl border border-lab-line bg-lab-surface p-4 ${className}`} style={cardStyle(player.team)} data-testid="stat-tile">
			<header className="flex items-start justify-between gap-3">
				<h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-lab-muted">{info.label}</h3>
				{shared ? <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-lab-muted">His line</span> : ctx.tier ? <TierChip tier={ctx.tier} /> : luck ? <EarlyChip /> : <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-lab-muted">Style</span>}
			</header>
			<p className="m-0 mt-2 flex items-baseline gap-2">
				<span className="font-mono text-3xl font-bold tabular-nums leading-none text-lab-ink">{formatStat(player.group, stat.k, ctx.value)}</span>
				{ctx.info.higher === false ? <span className="text-[11px] text-lab-muted">lower is better</span> : null}
			</p>
			<p className="m-0 mt-1 text-sm text-lab-soft">
				{shared ? (
					<>
						<span className="font-semibold text-lab-ink">Not ranked.</span> Every lineman who starts beside him has this same number.
					</>
				) : luck ? (
					<>
						<span className="font-semibold text-lab-ink">Too early to rank.</span> On {Math.round(ctx.n)} {info.per}, luck still decides who is on top of {peers}.
					</>
				) : ctx.rank !== null && ctx.of !== null ? (
					<>
						<span className="font-semibold text-lab-ink">{rankPhrase(ctx.rank, ctx.of)}</span> {peers} <span className="text-lab-muted">&middot; {topPhrase(ctx.rank, ctx.of).toLowerCase()}</span>
					</>
				) : (
					<span className="text-lab-soft">{styleLine(data, player, stat)}</span>
				)}
			</p>
			{ctx.yard ? (
				<div className="mt-3">
					<Yardstick marks={[{ v: ctx.value, se: stat.season.se, name: player.name }]} yard={ctx.yard} higher={info.higher} fmt={(v) => formatStat(player.group, stat.k, v)} peers={peers} />
				</div>
			) : null}
			{info.unit ? <p className="m-0 mt-2 rounded-lg border border-lab-line-strong bg-lab-tint px-2.5 py-1.5 text-xs leading-snug text-lab-soft">It says how his unit is doing more than how he is.</p> : null}
			<p className="m-0 mt-3 text-[13px] leading-relaxed text-lab-soft">{info.what}</p>
			{showBox ? (
				<p className="m-0 mt-2 border-l-2 border-lab-line-strong pl-3 text-xs leading-relaxed text-lab-muted">
					<span className="font-semibold text-lab-soft">The box score: </span>
					{info.box}
				</p>
			) : null}
			{win ? (
				<p className="m-0 mt-2 border-l-2 border-lab-line-strong pl-3 text-xs leading-relaxed text-lab-muted" data-testid="win-line">
					<span className="font-semibold text-lab-soft">Does it show up in winning? </span>
					{win}
				</p>
			) : null}
			<footer className="mt-auto grid gap-1.5 pt-3">
				{showTrend && !style ? <TrendLine data={data} player={player} stat={stat} /> : null}
				<p className="m-0 text-[11px] text-lab-muted">
					{SURE_WORD[ctx.sure]} &middot; {Math.round(ctx.n)} {info.per}
					{ctx.range && !style && !luck ? (
						<>
							{" "}
							&middot; true level likely {formatStat(player.group, stat.k, Math.min(...ctx.range))} to {formatStat(player.group, stat.k, Math.max(...ctx.range))}
						</>
					) : null}
				</p>
			</footer>
		</article>
	)
}
