"use client"

import { useId, useState } from "react"
import { ChevronDown } from "lucide-react"

import { trackRooting } from "@/lib/analytics"
import { teamByAbbr } from "@/lib/nfl"
import { IMPACT_LABEL, type Recommendation, pctText, pointsText } from "@/lib/rooting/guide"
import type { GameFacts } from "@/lib/rooting/facts"
import { OddsRange, TeamBadge } from "./parts"


type Props = {
	rec: Recommendation
	rank: number
	team: string
	color: string
	facts: GameFacts
}

const tone: Record<string, string> = { major: "bg-lab-ink text-lab-page", notable: "bg-lab-tint text-lab-ink ring-1 ring-lab-line-strong", minor: "bg-lab-tint text-lab-soft" }

function Outcome({ label, p, base, dim, strong }: { label: string; p: number | null; base: number; dim?: boolean; strong?: boolean }) {
	return (
		<div className={`flex items-baseline justify-between gap-3 py-2 ${dim ? "text-lab-soft" : ""}`}>
			<span className={`text-sm ${strong ? "font-bold text-lab-ink" : ""}`}>{label}</span>
			<span className="text-right font-mono text-sm tabular-nums">
				{p === null ? (
					<span className="text-lab-muted">not worked out</span>
				) : (
					<>
						<span className={strong ? "font-bold text-lab-ink" : ""}>{pctText(p)}</span>
						<span className="ml-2 text-xs text-lab-muted">{pointsText(p - base)}</span>
					</>
				)}
			</span>
		</div>
	)
}

/** One game on the list: who to root for and what it is worth, opening to the numbers for every ending and why it helps. */
export default function RootingGame({ rec, rank, team, color, facts }: Props) {
	const [open, setOpen] = useState(false)
	const panel = useId()
	const away = teamByAbbr(rec.away)
	const home = teamByAbbr(rec.home)
	const rootFor = rec.rootFor as string
	const forInfo = teamByAbbr(rootFor)
	const against = rec.rootAgainst as string
	const best = rec.bestP as number
	const worst = rec.worstP as number
	const gain = rec.gain as number
	const range = `${pctText(worst)} to ${pctText(best)}, from ${pctText(rec.baseline)} now`
	const homeNick = home.nick
	const awayNick = away.nick

	return (
		<li className="rounded-2xl border border-lab-line bg-lab-surface">
			<button
				type="button"
				aria-expanded={open}
				aria-controls={panel}
				onClick={() => {
					setOpen(!open)
					if (!open) trackRooting("rooting_game_expanded", { week: rec.week, rank })
				}}
				className="flex w-full items-start gap-3 rounded-2xl p-3.5 text-left transition hover:bg-lab-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lab-ink sm:gap-4 sm:p-4"
			>
				<span className="mt-1 w-6 shrink-0 text-center font-mono text-sm font-bold text-lab-muted tabular-nums">{rank}</span>
				<span className="min-w-0 flex-1">
					<span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
						<span>
							Week {rec.week}
							{facts.when ? ` \u00b7 ${facts.when}` : ""}
						</span>
						{rec.yours ? <span className="rounded-sm border border-current px-1 text-[9px] font-bold tracking-[0.1em]">{teamByAbbr(team).nick} game</span> : null}
					</span>
					<span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
						<span className="inline-flex items-center gap-2" aria-label={`Root for the ${forInfo.nick}`}>
							<TeamBadge abbr={rootFor} size={40} />
							<span className="flex flex-col">
								<span className="text-[10px] font-bold uppercase tracking-[0.14em] text-lab-muted">Root for</span>
								<span className="font-serif text-xl font-bold leading-tight">{forInfo.nick}</span>
							</span>
						</span>
						<span className="text-sm text-lab-soft">
							{awayNick} at {homeNick}
						</span>
					</span>
					<span className="mt-3 flex flex-wrap items-center gap-2">
						<span className="font-serif text-2xl font-bold leading-none tabular-nums">{pointsText(gain)}</span>
						<span className="text-xs text-lab-muted">to your odds, against {pointsText(rec.loss as number)} if it goes the other way</span>
						<span className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${tone[rec.impact]}`}>
							{IMPACT_LABEL[rec.impact]} &middot; {Math.round(rec.spread * 100)}-pt swing
						</span>
					</span>
					<span className="mt-2 block">
						<OddsRange worst={worst} best={best} baseline={rec.baseline} color={color} label={`Chance to ${facts.goalPhrase}: ${range}`} />
					</span>
				</span>
				<ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-lab-muted transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
			</button>

			<div id={panel} hidden={!open} className="border-t border-lab-line px-4 pb-4 pt-3 sm:px-5">
				<p className="m-0 text-sm leading-relaxed text-lab-soft">{facts.why}</p>
				<div className="mt-3 divide-y divide-lab-line rounded-xl border border-lab-line px-3.5">
					<Outcome label={`If the ${forInfo.nick} win (your best case)`} p={best} base={rec.baseline} strong />
					<Outcome label={`If the ${teamByAbbr(against).nick} win`} p={worst} base={rec.baseline} />
					<Outcome label="If it ends in a tie" p={rec.pTie} base={rec.baseline} dim />
					<Outcome label="Where you stand now" p={rec.baseline} base={rec.baseline} dim />
				</div>
				<dl className="m-0 mt-3 grid gap-x-6 gap-y-1 text-xs text-lab-muted sm:grid-cols-2">
					<div className="flex justify-between gap-2">
						<dt>{away.nick} (away)</dt>
						<dd className="m-0 font-mono">{facts.awayRecord}</dd>
					</div>
					<div className="flex justify-between gap-2">
						<dt>{home.nick} (home)</dt>
						<dd className="m-0 font-mono">{facts.homeRecord}</dd>
					</div>
					<div className="flex justify-between gap-2 sm:col-span-2">
						<dt>The model gives the {home.nick} a</dt>
						<dd className="m-0 font-mono">{pctText(rec.modelHome)} chance to win</dd>
					</div>
				</dl>
				{facts.context.length ? (
					<ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
						{facts.context.map((c) => (
							<li key={c} className="rounded-full border border-lab-line px-2.5 py-1 text-[11px] font-semibold text-lab-soft">
								{c}
							</li>
						))}
					</ul>
				) : null}
				<p className="m-0 mt-3 text-[11px] leading-relaxed text-lab-muted">
					{rec.se > 0 ? `The swing is measured to within about ${Math.max(1, Math.round(rec.se * 196))} ${Math.max(1, Math.round(rec.se * 196)) === 1 ? "point" : "points"} either way (95% range). ` : "Every ending was counted, so these chances carry no sampling error. "}
					Points are percentage points of the team&rsquo;s chance, not percent growth.
				</p>
			</div>
		</li>
	)
}
