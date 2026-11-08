import { TeamLogo } from "@/components/lab/players/Media"
import { cn } from "@/lib/utils"
import { teamInfo } from "@/lib/nfl"
import type { RankRow } from "@/lib/rankings"
import { accentOnDark, withAlpha } from "@/lib/teamAccent"
import type { TeamGame } from "@/lib/rankingsLive"
import GameChip from "./GameChip"
import Move from "./Move"

/**
 * The top three as big cards, No. 1 raised in the middle on a wide screen and first on a phone. Each card is washed in its team's color
 * (lightened to read on black), with the rank numeral ghosted behind and the team's game chip underneath when it is playing.
 */
export default function Podium({
	rows,
	records,
	games,
	hasPrev,
}: {
	rows: RankRow[]
	records?: Record<string, { w: number; l: number; t: number }>
	games: Record<string, TeamGame>
	hasPrev: boolean
}) {
	const top = rows.slice(0, 3)
	if (top.length === 0) return null
	return (
		<ol className="grid items-stretch gap-3 md:grid-cols-3 md:items-end" aria-label="The top three">
			{top.map((r) => {
				const t = teamInfo(r.team)
				const accent = accentOnDark(t.color, t.abbr)
				const rec = records?.[r.team]
				const first = r.rank === 1
				const game = games[t.abbr]
				return (
					<li
						key={r.team}
						value={r.rank}
						className={cn(
							"relative isolate flex flex-col overflow-hidden rounded-2xl border p-5 transition-transform motion-safe:hover:-translate-y-0.5",
							first ? "md:order-2 md:min-h-[21rem] md:p-6" : r.rank === 2 ? "md:order-1 md:min-h-[18.5rem]" : "md:order-3 md:min-h-[17rem]"
						)}
						style={
							{
								borderColor: withAlpha(accent, first ? 0.55 : 0.32),
								background: `radial-gradient(120% 90% at 0% 0%, ${withAlpha(accent, first ? 0.3 : 0.18)} 0%, rgba(9,9,11,0) 60%), linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))`,
								"--pc-accent": accent,
								"--pc-on": "#09090b",
							} as React.CSSProperties
						}
					>
						<span aria-hidden className="pointer-events-none absolute -right-2 -top-6 -z-10 select-none font-serif text-[9rem] font-bold leading-none text-white/[0.06] md:text-[11rem]">
							{r.rank}
						</span>
						<div className="flex items-start justify-between gap-3">
							<span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ background: withAlpha(accent, 0.28), color: "#fafafa" }}>
								No. {r.rank}
							</span>
							<Move row={r} hasPrev={hasPrev} dark />
						</div>
						<div className="mt-4 flex items-center gap-4">
							<TeamLogo team={t.abbr} size={first ? 84 : 64} className={first ? "h-[84px] w-[84px] drop-shadow-[0_6px_18px_rgba(0,0,0,0.5)]" : "h-16 w-16 drop-shadow-[0_6px_18px_rgba(0,0,0,0.5)]"} />
							<div className="min-w-0">
								<h3 className={cn("font-serif font-bold leading-tight text-white", first ? "text-3xl" : "text-2xl")}>{t.nick}</h3>
								<p className="mt-0.5 text-xs text-zinc-400">
									{t.name.slice(0, Math.max(0, t.name.length - t.nick.length)).trim()}
									{rec ? <span className="tabular-nums"> · {rec.w}&ndash;{rec.l}{rec.t ? `–${rec.t}` : ""}</span> : null}
								</p>
							</div>
						</div>
						{r.note && <p className={cn("mt-4 text-sm leading-relaxed text-zinc-300", first ? "line-clamp-5" : "line-clamp-3")}>{r.note}</p>}
						{game && (
						<div className="mt-auto pt-4">
							<GameChip game={game} tone="dark" />
						</div>
					)}
					</li>
				)
			})}
		</ol>
	)
}
