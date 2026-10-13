import Link from "@/components/SiteLink"
import { ConfidenceChip, Delta, EarlyChip, TierChip } from "@/components/lab/players/Bits"
import { Headshot, TeamLogo } from "@/components/lab/players/Media"
import ProgressLine from "@/components/lab/players/ProgressLine"
import Yardstick from "@/components/lab/players/Yardstick"
import { cardStyle, profileHref, teamNick } from "@/lib/lab/playerView"
import {
	GROUP_META,
	type PlayerLog,
	type PlayerRow,
	type PlayersData,
	confidenceOf,
	contextOf,
	describeMove,
	formatStat,
	HEADLINE,
	isCore,
	isEarly,
	moveText,
	moverTier,
	leagueScore,
	overall,
	overallRank,
	rankPhrase,
	statInfo,
	statOf,
	tierOf,
	arcLine,
	arcOf,
} from "@/lib/lab/playersKit"

/** The stat besides the headline that says the most about him: the furthest from the middle among those whose sample is not thin. */
export function featuredStat(data: PlayersData, p: PlayerRow) {
	const head = statOf(p, HEADLINE[p.group])
	const rest = p.stats
		.filter((s) => s.k !== HEADLINE[p.group] && isCore(p.group, s.k))
		.map((s) => ({ s, c: contextOf(data, p, s) }))
		.filter((x) => x.c && x.c.pct !== null && x.c.sure !== "thin" && x.c.signal !== "luck")
		.sort((a, b) => Math.abs(b.c!.pct! - 50) - Math.abs(a.c!.pct! - 50))
	return [head, rest[0]?.s ?? null].filter((s): s is NonNullable<typeof s> => Boolean(s))
}

/**
 * A player as a card: who he is, how he grades against the players who do his job, his two defining numbers each set against the league,
 * and which way he is heading with how sure that is. The whole card is a link to his page.
 */
export default function PlayerCard({ data, player, log, note, href, className = "" }: { data: PlayersData; player: PlayerRow; log?: PlayerLog; note?: string; href?: string; className?: string }) {
	const o = overall(player)
	const score = leagueScore(data, player)
	const rank = overallRank(data, player)
	const meta = GROUP_META[player.group]
	const tier = rank ? tierOf(((rank.of - rank.rank) / Math.max(1, rank.of - 1)) * 100) : null
	const picks = featuredStat(data, player)
	const arc = arcOf(player, log)
	const points = arc.map((t) => ({ w: t.w, pct: t.pct as number | null }))
	const mover = player.mover
	const tierMove = moverTier(player)
	return (
		<article className={`lab-opp group relative flex h-full flex-col overflow-hidden rounded-2xl border border-lab-line bg-lab-surface ${className}`} style={cardStyle(player.team)} data-testid="player-card">
			<div className="h-1.5 w-full" style={{ background: "var(--pc-accent)" }} aria-hidden="true" />
			<div className="flex flex-1 flex-col p-4">
				<header className="flex items-start justify-between gap-3">
					<div className="flex min-w-0 items-center gap-3">
						<Headshot espn={player.espn} shot={player.shot} name={player.name} size={52} />
						<div className="min-w-0">
							<p className="m-0 flex items-center gap-1.5 text-xs text-lab-muted">
								<TeamLogo team={player.team} size={16} />
								<span className="truncate">
									{player.pos || meta.single} &middot; {meta.single}
								</span>
							</p>
							<h3 className="m-0 mt-0.5 font-serif text-xl font-bold leading-tight">
								<Link href={href ?? profileHref(player.slug)} className="after:absolute after:inset-0 after:content-[''] hover:underline">
									{player.name}
								</Link>
							</h3>
						</div>
					</div>
					<div className="shrink-0 text-right">
						<p className="m-0 font-mono text-3xl font-bold leading-none tabular-nums" title={o === null ? undefined : `Scouting grade ${Math.round(o)}; 50 is average`}>{score === null ? "–" : score}</p>
						<p className="m-0 mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-lab-muted">Overall</p>
					</div>
				</header>
				<p className="m-0 mt-1 text-xs text-lab-soft">
					{rank ? (
						<>
							<span className="font-semibold text-lab-ink">{rankPhrase(rank.rank, rank.of)}</span> {meta.peers}
						</>
					) : (
						"Not enough plays to rank yet"
					)}
					{isEarly(data, player) ? <span> &middot; <EarlyChip label="Early read" /></span> : tier ? <span> &middot; <TierChip tier={tier} /></span> : null}
				</p>
				{note ? <p className="m-0 mt-2 text-sm leading-snug text-lab-soft">{note}</p> : null}

				<div className="mt-3 grid gap-3">
					{picks.map((s) => {
						const c = contextOf(data, player, s)
						const info = statInfo(player.group, s.k)
						if (!c || !c.yard || !info) return null
						return (
							<div key={s.k}>
								<p className="m-0 flex items-baseline justify-between gap-2">
									<span className="text-xs text-lab-soft">{info.label}</span>
									<span className="font-mono text-sm font-bold tabular-nums">{formatStat(player.group, s.k, c.value)}</span>
								</p>
								<Yardstick compact marks={[{ v: c.value, se: s.season.se, name: info.label }]} yard={c.yard} higher={info.higher} fmt={(v) => formatStat(player.group, s.k, v)} peers={meta.peers} />
								<p className="m-0 text-[11px] text-lab-muted">
									{c.signal === "luck" ? "Too early to rank: mostly luck so far" : c.rank !== null && c.of !== null ? `${rankPhrase(c.rank, c.of)} among ${meta.peers}` : ""}
								</p>
							</div>
						)
					})}
				</div>

				<footer className="mt-auto pt-3">
					{points.filter((p) => p.pct !== null).length >= 2 ? (
						<div className="flex items-center gap-3 border-t border-lab-line pt-3">
							<div className="w-24 shrink-0">
								<ProgressLine compact weeks={data.weeks} points={points} formWeeks={data.formWeeks} label={`${player.name}, overall standing by week: ${arcLine(arc)}`} />
							</div>
							<p className="m-0 text-[11px] leading-snug text-lab-muted">{arcLine(arc)}</p>
						</div>
					) : null}
					{mover && tierMove !== "steady" ? (
						<div className="mt-2 flex flex-nowrap items-center gap-2 whitespace-nowrap">
							<Delta v={mover.score} />
							<ConfidenceChip conf={confidenceOf(mover.z)} />
						</div>
					) : null}
					{note === undefined && mover && tierMove !== "steady" ? <p className="m-0 mt-1 text-xs leading-snug text-lab-soft">{describeMove(data, player)}</p> : null}
				</footer>
			</div>
			<p className="sr-only">
				{player.name}, {teamNick(player.team)} {meta.single.toLowerCase()}, overall {score === null ? "not yet available" : `${score} out of 99 (scouting grade ${Math.round(o ?? 0)}), ${moveText(mover?.score ?? 0)} lately`}.
			</p>
		</article>
	)
}
