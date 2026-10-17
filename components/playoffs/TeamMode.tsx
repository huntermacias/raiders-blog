"use client"

import { useMemo } from "react"

import { teamByAbbr } from "@/lib/nfl"
import { cannotTakeTopSeed, cannotWinDivision } from "@/lib/playoffs/clinching"
import { oddsText } from "@/lib/playoffs/format"
import { MIN_BUCKET } from "@/lib/playoffs/odds"
import { NFL_LEAGUE, buildSeason } from "@/lib/playoffs/season"
import type { SimulationResult } from "@/lib/playoffs/simulator"
import { describeTie } from "@/lib/playoffs/summary"
import { buildTimeline, raceSummary, seasonEvents } from "@/lib/playoffs/timeline"
import type { Game, Outcome, Predictions } from "@/lib/playoffs/types"
import NeedsPanel from "./NeedsPanel"
import TeamOutlook from "./TeamOutlook"
import TeamSchedule from "./TeamSchedule"
import TeamTag from "./TeamTag"
import { btnSm } from "./ui"
import type { TeamOdds } from "./useOdds"

type Props = {
	games: readonly Game[]
	picks: Predictions
	simulated: ReadonlySet<string>
	sim: SimulationResult
	team: string
	odds: TeamOdds | null
	working: boolean
	chances: Record<string, number>
	onPick: (id: string, outcome: Outcome) => void
	onGoToGame: (game: Game) => void
	/** Sets every game the team has left to a win, or to a loss, in one step. */
	onResult: (team: string, result: "W" | "L") => void
}

function Badge({ kind }: { kind: "verified" | "model" | "scenario" }) {
	const text = kind === "verified" ? "Verified by the standings" : kind === "model" ? "Model estimate" : "This scenario only"
	return <span className="rounded border border-lab-line-strong px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-lab-soft">{text}</span>
}

function Card({ title, badge, children }: { title: string; badge: "verified" | "model" | "scenario"; children: React.ReactNode }) {
	return (
		<section className="rounded-xl border border-lab-line bg-lab-surface p-4">
			<div className="flex items-start justify-between gap-2">
				<h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-lab-muted">{title}</h3>
				<Badge kind={badge} />
			</div>
			<div className="mt-2 text-sm leading-relaxed text-lab-soft">{children}</div>
		</section>
	)
}

export default function TeamMode({ games, picks, simulated, sim, team, odds, working, chances, onPick, onGoToGame, onResult }: Props) {
	const info = teamByAbbr(team)
	const t = sim.teams[team]
	const season = useMemo(() => buildSeason(NFL_LEAGUE, games, picks), [games, picks])
	const timeline = useMemo(() => buildTimeline(games, picks), [games, picks])
	const race = useMemo(() => raceSummary(timeline).teams[team], [timeline, team])
	const myEvents = useMemo(() => seasonEvents(timeline).filter((e) => e.team === team || e.other === team), [timeline, team])
	const exact = Boolean(odds?.base.exact)

	const rooting = useMemo(() => (odds?.base.rooting ?? []).filter((r) => r.swing !== null && r.swing >= 0.02).slice(0, 8), [odds])
	const important = useMemo(() => new Map((odds?.base.rooting ?? []).filter((r) => r.swing !== null).map((r) => [r.gameId, r.swing as number])), [odds])
	const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games])

	const wins = (odds?.base.winsTable ?? []).filter((w) => w.seasons >= Math.max(20, MIN_BUCKET / 6))
	const fewest = wins.find((w) => w.made > 0)
	const ties = sim.ties.filter((d) => d.placed === team || d.over.includes(team) || (d.stillTied ?? []).includes(team))

	const divisionOut = !t?.clinchedDivision && cannotWinDivision(season, team)
	const topOut = !t?.clinchedTopSeed && cannotTakeTopSeed(season, team)

	return (
		<div className="space-y-5">
			<p className="m-0 text-sm text-lab-muted">Change any game below and the whole league updates. Nothing here needs you to start over.</p>

			<TeamOutlook sim={sim} team={team} picked={Object.keys(picks).length} odds={odds} working={working} />

			<div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-8">
				<section className="lg:col-span-6" aria-labelledby="team-schedule">
					<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
						<h2 id="team-schedule" className="m-0 font-serif text-xl font-bold">
							{info.nick} schedule
						</h2>
						<span className="flex gap-1.5">
							<button type="button" className={btnSm} onClick={() => onResult(team, "W")}>
								Win out
							</button>
							<button type="button" className={btnSm} onClick={() => onResult(team, "L")}>
								Lose out
							</button>
						</span>
					</div>
					<TeamSchedule games={games} team={team} picks={picks} simulated={simulated} sim={sim} chances={chances} onPick={onPick} important={important} />
					<p className="m-0 mt-2 text-[11px] leading-relaxed text-lab-muted">The percent is the model&rsquo;s chance the {info.nick} win. Tap W or L to set the game; tap it again to take it back. The running record counts only games with a result.</p>
				</section>

				<div className="mt-6 space-y-3 lg:col-span-6 lg:mt-0">
					<h2 className="m-0 font-serif text-xl font-bold">Path to the playoffs</h2>
					<Card title="Can they still win the division?" badge="verified">
						{t?.clinchedDivision ? (
							<p className="m-0">Already clinched the {t.division} in this scenario.</p>
						) : divisionOut ? (
							<p className="m-0">No. A division rival already has more wins than the {info.nick} can reach, so the division is out of reach.</p>
						) : (
							<p className="m-0">Yes, it is still possible on wins alone. That says nothing about how likely it is.</p>
						)}
					</Card>
					<Card title="Can they get the No. 1 seed?" badge="verified">
						{t?.clinchedTopSeed ? <p className="m-0">Clinched the No. 1 seed in this scenario.</p> : topOut ? <p className="m-0">No. Another team in the {t?.conference} already has more wins than they can reach.</p> : <p className="m-0">Yes, still possible on wins alone.</p>}
					</Card>
					<Card title="How many wins do they need?" badge="model">
						{wins.length ? (
							<>
								<p className="m-0">
									{fewest ? (
										<>
											The fewest wins that still got in, in the simulated seasons: <span className="font-bold text-lab-ink">{fewest.wins}</span>, which made it {oddsText(fewest.made / fewest.seasons)} of the time.
										</>
									) : (
										<>No simulated season with a normal win total got them in.</>
									)}
								</p>
								<table className="mt-2 w-full border-collapse text-xs">
									<caption className="sr-only">Chance of making the playoffs by final win total, across the simulated seasons</caption>
									<thead>
										<tr className="text-left text-[10px] uppercase tracking-wider text-lab-muted">
											<th scope="col" className="py-1 font-semibold">Final wins</th>
											<th scope="col" className="py-1 text-right font-semibold">Seasons</th>
											<th scope="col" className="py-1 pl-3 font-semibold">Made the playoffs</th>
										</tr>
									</thead>
									<tbody>
										{wins.map((w) => (
											<tr key={w.wins} className="border-t border-lab-line">
												<th scope="row" className="py-1 text-left font-mono">{w.wins}</th>
												<td className="py-1 text-right font-mono text-lab-muted">{w.seasons}</td>
												<td className="py-1 pl-3">
													<span className="flex items-center gap-2">
														<span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-lab-line" aria-hidden="true">
															<span className="block h-full rounded-full bg-lab-ink" style={{ width: `${Math.round((w.made / w.seasons) * 100)}%` }} />
														</span>
														<span className="w-10 text-right font-mono">{oddsText(w.made / w.seasons)}</span>
													</span>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</>
						) : (
							<p className="m-0">{exact ? "The season is decided in this scenario." : "Working it out…"}</p>
						)}
					</Card>
					<Card title="Games that matter most" badge="model">
						{rooting.length ? (
							<ul className="m-0 list-none space-y-2 p-0">
								{rooting.map((r) => {
									const g = gameById.get(r.gameId)
									if (!g) return null
									const rootFor = r.rootFor
									const own = g.homeTeam === team || g.awayTeam === team
									return (
										<li key={r.gameId} className="flex items-center gap-2 text-sm">
											<span className="w-10 shrink-0 font-mono text-xs font-semibold text-lab-muted">Wk {r.week}</span>
											<span className="min-w-0 flex-1">
												<button type="button" className="text-left underline-offset-4 hover:underline" onClick={() => onGoToGame(g)}>
													<TeamTag id={g.awayTeam} /> at <TeamTag id={g.homeTeam} />
												</button>
												<span className="block text-[11px] text-lab-muted">
													{own ? "Your own game. " : ""}
													{rootFor ? <>Better for them if <span className="font-semibold text-lab-ink">{rootFor}</span> win: about {Math.round((r.swing as number) * 100)} points of playoff odds.</> : "No clear difference."}
												</span>
											</span>
											{rootFor ? (
												<button type="button" className={btnSm} onClick={() => onPick(g.id, rootFor === g.homeTeam ? "H" : "A")}>
													{rootFor} win
												</button>
											) : null}
										</li>
									)
								})}
							</ul>
						) : (
							<p className="m-0">{exact ? "No games are left to play." : odds ? "No single game moves their odds by more than a couple of points yet." : "Working it out…"}</p>
						)}
					</Card>
					<Card title="Tiebreakers in this scenario" badge="scenario">
						{ties.length ? (
							<ul className="m-0 list-none space-y-1 p-0">
								{ties.map((d, i) => (
									<li key={i}>{describeTie(d)}</li>
								))}
							</ul>
						) : (
							<p className="m-0">No tiebreaker involves the {info.nick} in this scenario.</p>
						)}
					</Card>
					{race ? (
						<Card title="Their season, week by week" badge="scenario">
							<p className="m-0">
								Best spot: {race.bestRank}
								{["st", "nd", "rd"][race.bestRank - 1] ?? "th"} in the {t?.conference}. Worst: {race.worstRank}
								{["st", "nd", "rd"][race.worstRank - 1] ?? "th"}. {race.weeksIn} of {race.weeksIn + race.weeksOut} weeks inside the playoff field.{Object.keys(picks).length === 0 && sim.openGames > 0 ? " Weeks nobody has decided yet are left out." : ""}
							</p>
							{myEvents.length ? (
								<ul className="m-0 mt-2 list-none space-y-1 p-0">
									{myEvents.slice(0, 6).map((e, i) => (
										<li key={i}>
											<span className="mr-2 font-mono text-xs text-lab-muted">Wk {e.week}</span>
											{e.text}
										</li>
									))}
								</ul>
							) : null}
						</Card>
					) : null}
				</div>
			</div>

			<NeedsPanel team={team} odds={odds} working={working} picked={Object.keys(picks).length} />
		</div>
	)
}
