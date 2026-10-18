"use client"

import Link from "@/components/SiteLink"
import FlagShare from "@/components/lab/flags/FlagShare"
import { TeamLogo } from "@/components/lab/players/Media"
import { cardStyle, teamNick } from "@/lib/lab/playerView"
import { type Flag, type FlagPlayer, TAG_INFO, TAG_ORDER, clockText, costText, culpritText, downText, marginText, playerFlagsHref, resultLine, teamFlagsHref, turnoversText, versus } from "@/lib/lab/flagsKit"

const BAD = "text-rose-700 dark:text-rose-400"

/** The reasons a flag counts like a turnover, each a word as well as a color. */
export function TagChips({ tags, className = "" }: { tags: Flag["tg"]; className?: string }) {
	const shown = TAG_ORDER.filter((t) => tags.includes(t))
	if (!shown.length) return null
	return (
		<ul className={`m-0 flex list-none flex-wrap gap-1.5 p-0 ${className}`} aria-label="Why it counts like a turnover">
			{shown.map((t) => (
				<li key={t} title={TAG_INFO[t].what} className={`inline-flex items-center gap-1 rounded-full border border-rose-700/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] dark:border-rose-400/40 ${BAD}`}>
					<span aria-hidden="true">&#9873;</span>
					{TAG_INFO[t].short}
				</li>
			))}
		</ul>
	)
}

/** One flag as a card: when and against whom, who got it, the down and distance, what it did and what it cost. */
export default function FlagCard({
	f,
	players,
	showTeam = false,
	showWho = true,
	per,
	share,
}: {
	f: Flag
	players: Record<string, FlagPlayer>
	/** Show the team that committed it (a league-wide list); a team's own page leaves it out. */
	showTeam?: boolean
	/** Show who got the flag; a player's own page leaves it out. */
	showWho?: boolean
	per?: number
	/** Adds a Share button: the card for this one flag. The season it is from and the data's stamp, so a new card is fetched when the data changes. */
	share?: { season: number; stamp: number }
}) {
	const p = f.pid ? players[f.pid] : undefined
	const who = culpritText(f)
	const costly = f.tg.length > 0
	return (
		<li className="rounded-xl border border-lab-line bg-lab-surface p-3.5 sm:p-4" style={showTeam ? { ...cardStyle(f.t) } : undefined} data-testid="flag-card">
			<div className="flex items-start justify-between gap-3">
				<p className="m-0 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
					{showTeam ? (
						<Link href={teamFlagsHref(f.t)} className="inline-flex items-center gap-1.5 text-lab-ink hover:underline">
							<TeamLogo team={f.t} size={24} />
							{f.t}
						</Link>
					) : null}
					<span>
						Week {f.w} {versus(f)}
					</span>
					<span>{clockText(f)}</span>
				</p>
				<p className={`m-0 shrink-0 text-right font-mono text-base font-bold tabular-nums ${f.c >= 0.5 ? BAD : "text-lab-soft"}`}>
					{costText(f.c)}
					<span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-lab-muted">{f.c >= 0.5 ? turnoversText(f.c, per) : "from before the snap"}</span>
				</p>
			</div>
			<h3 className="m-0 mt-2 font-serif text-lg font-bold leading-snug">
				{f.ty}
				{f.yds ? <span className="font-sans text-sm font-semibold text-lab-muted">, {f.yds} yards</span> : null}
			</h3>
			{showWho ? (
				<p className="m-0 mt-0.5 text-sm text-lab-soft">
					{f.ck !== "team" && p ? (
						<Link href={playerFlagsHref(p.s)} className="font-semibold text-lab-ink underline-offset-4 hover:underline">
							{who}
						</Link>
					) : (
						<span className="font-semibold text-lab-ink">{who}</span>
					)}
					{p?.p && f.ck !== "team" ? <span className="text-lab-muted">, {p.p}</span> : null}
					{f.ck === "qb" ? <span className="text-lab-muted"> · delay of game goes to the quarterback</span> : null}
					{f.ck === "team" ? <span className="text-lab-muted"> · a team penalty, not one player&apos;s</span> : null}
				</p>
			) : null}
			<p className="m-0 mt-2 text-sm leading-snug text-lab-soft">
				<span className="font-semibold text-lab-ink">{downText(f.dn, f.yd)}</span>
				{f.fp ? <> at {f.fp}</> : null}, {marginText(f.mg)}
				{f.pl !== "snap" && f.pl !== "pass" && f.pl !== "run" ? <>, on a {f.pl === "fg" ? "field goal" : f.pl === "xp" ? "extra point" : f.pl}</> : null}
				{f.pl === "pass" || f.pl === "run" ? <>, on a {f.pl} play</> : null}
				{f.pl === "snap" ? <>, before the snap</> : null}
			</p>
			<p className={`m-0 mt-1.5 text-sm font-semibold ${costly ? BAD : "text-lab-ink"}`}>{resultLine(f)}</p>
			{costly ? <TagChips tags={f.tg} className="mt-2" /> : null}
			<details className="mt-2 text-xs text-lab-muted">
				<summary className="cursor-pointer font-semibold text-lab-soft">
					Play text{f.wp != null ? `, win probability ${f.wp > 0 ? "+" : f.wp < 0 ? "−" : ""}${Math.abs(f.wp).toFixed(1)} points` : ""}
				</summary>
				<p className="m-0 mt-1.5 leading-relaxed">{f.ds}</p>
			</details>
			{share ? (
				<div className="mt-2.5 flex justify-end">
					<FlagShare
						view={{ kind: "flag", id: f.id, season: share.season }}
						name="This flag"
						file={`flag-${f.t.toLowerCase()}-week-${f.w}`}
						stamp={share.stamp}
						text={`${teamNick(f.t)} ${f.ty}, week ${f.w} ${versus(f)}: ${downText(f.dn, f.yd)}, ${costText(f.c)}.`}
						alt={`${teamNick(f.t)} ${f.ty} in week ${f.w}, ${costText(f.c)}`}
					/>
				</div>
			) : null}
			{showTeam ? <span className="sr-only">Committed by the {teamNick(f.t)}</span> : null}
		</li>
	)
}
