"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, RotateCcw, Shuffle, Undo2 } from "lucide-react"

import { trackPlayoff } from "@/lib/analytics"
import { teamByAbbr } from "@/lib/nfl"
import { rivalsOf } from "@/lib/playoffs/format"
import { firstOpenWeek, weekProgress } from "@/lib/playoffs/picks"
import { PLAYOFFS_SHARE_PATH, scenarioQuery } from "@/lib/playoffs/share"
import ShareCard from "@/components/lab/ShareCard"
import type { Conference, Game } from "@/lib/playoffs/types"
import BracketView from "./BracketView"
import GameCard from "./GameCard"
import NeedsPanel from "./NeedsPanel"
import StandingsTable from "./StandingsTable"
import TeamOutlook from "./TeamOutlook"
import TeamPicker from "./TeamPicker"
import { useOdds } from "./useOdds"
import { usePlayoffScenario } from "./usePlayoffScenario"

type Tab = "games" | "standings" | "bracket" | "needs"
type Fill = "week" | "all"


const btn =
	"inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-lab-line bg-lab-surface px-4 text-sm font-semibold text-lab-ink transition hover:border-lab-line-strong hover:bg-lab-tint disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lab-ink"

export default function PlayoffMachine({ games, season, throughWeek, stamp }: { games: Game[]; season: number; throughWeek: number; stamp: number }) {
	const s = usePlayoffScenario(games, season)
	const { sim, picks } = s
	const [tab, setTab] = useState<Tab>("games")
	const [week, setWeek] = useState(() => firstOpenWeek(games))
	const [conference, setConference] = useState<Conference>("AFC")
	const [fill, setFill] = useState<Fill>("all")
	const [keep, setKeep] = useState(true)
	const chips = useRef<HTMLDivElement>(null)

	const progress = useMemo(() => weekProgress(games, picks), [games, picks])
	const weeks = progress.map((w) => w.week)
	const current = progress.find((w) => w.week === week)
	const pickedCount = Object.keys(picks).length
	const team = s.team
	const info = teamByAbbr(team)
	const focusTeam = s.focus ? team : null
	const rivals = useMemo(() => rivalsOf(sim, team), [sim, team])
	const myDivision = sim.teams[team]?.division ?? ""
	const divisionMates = useMemo(() => new Set(Object.values(sim.teams).filter((t) => t.division === myDivision && t.team !== team).map((t) => t.team)), [sim, myDivision, team])
	const { odds, working } = useOdds(games, picks, team, s.ready)
	const mine = (g: Game) => g.homeTeam === team || g.awayTeam === team

	const weekGames = useMemo(() => {
		const list = games.filter((g) => g.week === week)
		const rank = (g: Game) => (s.focus && mine(g) ? 0 : s.focus && (rivals.has(g.homeTeam) || rivals.has(g.awayTeam)) && g.status !== "final" ? 1 : 2)
		return [...list].sort((a, b) => rank(a) - rank(b) || `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`) || a.id.localeCompare(b.id))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [games, week, s.focus, rivals, team])

	// Keep the chosen week's chip in view on a narrow screen.
	useEffect(() => {
		const el = chips.current?.querySelector<HTMLElement>('[aria-current="true"]')
		el?.scrollIntoView({ block: "nearest", inline: "center" })
	}, [week, tab])

	const scope = fill === "week" ? { weeks: [week], keepPicks: keep } : { keepPicks: keep }
	const shareQuery = scenarioQuery(s.code, team)
	const shareText = pickedCount
		? `My ${season} NFL playoff scenario: the ${info.nick}' road to the playoffs, ${pickedCount} ${pickedCount === 1 ? "pick" : "picks"} in. Build yours:`
		: `The ${season} NFL playoff race and what the ${info.nick} need. Build your own scenario:`

	const tabs: { id: Tab; label: string }[] = [
		{ id: "games", label: "Games" },
		{ id: "standings", label: "Standings" },
		{ id: "bracket", label: "Bracket" },
		...(s.focus ? [{ id: "needs" as const, label: "Odds" }] : []),
	]
	const activeTab: Tab = tab === "needs" && !s.focus ? "games" : tab

	const confSwitch = (
		<div role="group" aria-label="Conference" className="inline-flex rounded-lg border border-lab-line bg-lab-surface p-0.5">
			{(["AFC", "NFC"] as const).map((c) => (
				<button
					key={c}
					type="button"
					aria-pressed={conference === c}
					onClick={() => setConference(c)}
					className={`min-h-[40px] min-w-[64px] rounded-md px-4 text-sm font-bold transition ${conference === c ? "bg-lab-ink text-lab-page" : "text-lab-soft hover:text-lab-ink"}`}
				>
					{c}
				</button>
			))}
		</div>
	)

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center gap-2">
				<TeamPicker value={team} onChange={s.setTeam} />
				<button type="button" role="switch" aria-checked={s.focus} onClick={() => s.setFocus(!s.focus)} className={`${btn} pr-3`}>
					<span>{info.nick} mode</span>
					<span aria-hidden="true" className={`relative block h-5 w-9 rounded-full transition ${s.focus ? "bg-lab-ink" : "bg-lab-line-strong"}`}>
						<span className={`absolute top-0.5 block h-4 w-4 rounded-full bg-lab-page transition-all ${s.focus ? "left-[18px]" : "left-0.5"}`} />
					</span>
				</button>
				<ShareCard
					target={{ type: "playoffs", query: shareQuery, sharePath: PLAYOFFS_SHARE_PATH, name: "Playoff scenario", file: `${team.toLowerCase()}-playoff-scenario` }}
					stamp={stamp}
					text={shareText}
					alt={`${info.nick} playoff scenario: seeds, bracket and playoff odds`}
					className="!min-h-[44px] !rounded-lg !border-lab-line !text-sm !font-semibold !normal-case !tracking-normal"
					onAction={(method) => trackPlayoff("playoff_scenario_shared", { picks: pickedCount, method })}
				/>
				<button type="button" onClick={s.reset} disabled={pickedCount === 0} className={btn}>
					<RotateCcw className="h-4 w-4" aria-hidden="true" />
					Reset
				</button>
				{s.undo ? (
					<button type="button" onClick={s.undoLast} className={btn}>
						<Undo2 className="h-4 w-4" aria-hidden="true" />
						Undo {s.undo.label}
					</button>
				) : null}
			</div>

			<details className="rounded-xl border border-lab-line bg-lab-surface">
				<summary className="flex min-h-[44px] cursor-pointer items-center gap-2 px-4 text-sm font-semibold">
					<Shuffle className="h-4 w-4" aria-hidden="true" />
					Quick fill
					<span className="ml-auto text-xs font-normal text-lab-muted">{pickedCount} of {sim.openGames + sim.pickedGames} picked</span>
				</summary>
				<div className="space-y-3 border-t border-lab-line p-4">
					<div className="flex flex-wrap items-center gap-3">
						<div role="group" aria-label="Which games" className="inline-flex rounded-lg border border-lab-line p-0.5">
							{([["all", "All remaining weeks"], ["week", `Week ${week} only`]] as const).map(([id, label]) => (
								<button key={id} type="button" aria-pressed={fill === id} onClick={() => setFill(id)} className={`min-h-[40px] rounded-md px-3 text-sm font-semibold ${fill === id ? "bg-lab-ink text-lab-page" : "text-lab-soft hover:text-lab-ink"}`}>
									{label}
								</button>
							))}
						</div>
						<label className="inline-flex min-h-[40px] items-center gap-2 text-sm text-lab-soft">
							<input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="h-4 w-4" />
							Keep the picks I made
						</label>
					</div>
					<div className="flex flex-wrap gap-2">
						<button type="button" className={btn} onClick={() => s.fillHome(scope)}>
							Pick home teams
						</button>
						<button type="button" className={btn} onClick={() => s.fillRandom(scope)}>
							<Shuffle className="h-4 w-4" aria-hidden="true" />
							Randomize
						</button>
					</div>
					<p className="m-0 text-xs text-lab-muted">Fills in games nobody has played. Undo is one tap away. Each pick updates the standings at once.</p>
				</div>
			</details>

			{s.notice?.kind === "shared" ? (
				<div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-lab-line-strong bg-lab-tint px-4 py-3 text-sm">
					<span>You&rsquo;re viewing a shared scenario with {s.notice.picks} {s.notice.picks === 1 ? "pick" : "picks"}. Change anything and it becomes yours.</span>
					{s.notice.canRestore ? (
						<button type="button" onClick={s.restoreMine} className="font-semibold underline underline-offset-4">
							Back to my picks
						</button>
					) : null}
				</div>
			) : null}
			{s.notice?.kind === "stale-link" ? (
				<div role="status" className="rounded-xl border border-lab-line-strong bg-lab-tint px-4 py-3 text-sm">
					That scenario link was made for a different version of the schedule, so it can&rsquo;t be opened. Showing your own picks instead.
				</div>
			) : null}

			{s.focus ? <TeamOutlook sim={sim} team={team} picked={pickedCount} odds={odds} working={working} /> : null}

			<div role="tablist" aria-label="Playoff machine sections" className="grid gap-1 rounded-xl border border-lab-line bg-lab-surface p-1 lg:hidden" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
				{tabs.map((t) => (
					<button
						key={t.id}
						type="button"
						role="tab"
						id={`tab-${t.id}`}
						aria-selected={activeTab === t.id}
						aria-controls={`panel-${t.id}`}
						onClick={() => setTab(t.id)}
						className={`min-h-[44px] rounded-lg text-sm font-bold transition ${activeTab === t.id ? "bg-lab-ink text-lab-page" : "text-lab-soft hover:text-lab-ink"}`}
					>
						{t.label}
					</button>
				))}
			</div>

			{s.focus ? (
				<div id="panel-needs" role="tabpanel" aria-labelledby="tab-needs" className={`${activeTab === "needs" ? "block" : "hidden"} lg:block`}>
					<NeedsPanel team={team} odds={odds} working={working} picked={pickedCount} />
				</div>
			) : null}

			<div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-8">
				<section id="panel-games" role="tabpanel" aria-labelledby="tab-games" className={`${activeTab === "games" ? "block" : "hidden"} lg:col-span-5 lg:block`}>
					<h2 className="sr-only">Games</h2>
					<div ref={chips} role="group" aria-label="Week" className="-mx-4 flex snap-x gap-1.5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
						{weeks.map((w) => {
							const p = progress.find((x) => x.week === w)!
							const done = p.open === 0
							return (
								<button
									key={w}
									type="button"
									aria-current={w === week ? "true" : undefined}
									aria-label={`Week ${w}${p.played === p.total ? ", played" : done ? ", all picked" : `, ${p.open} left to pick`}`}
									onClick={() => setWeek(w)}
									className={`relative min-h-[44px] min-w-[52px] shrink-0 snap-center rounded-lg border px-2.5 text-sm font-bold tabular-nums transition ${
										w === week ? "border-lab-ink bg-lab-ink text-lab-page" : p.played === p.total ? "border-lab-line text-lab-muted hover:text-lab-ink" : "border-lab-line bg-lab-surface text-lab-ink hover:border-lab-line-strong"
									}`}
								>
									<span className="block text-[9px] font-semibold uppercase leading-none tracking-[0.12em] opacity-70">Wk</span>
									{w}
									{p.played < p.total && done ? <Check className="absolute right-1 top-1 h-3 w-3" aria-hidden="true" /> : null}
								</button>
							)
						})}
					</div>

					<div className="mt-3 flex items-center justify-between gap-3">
						<h3 className="m-0 font-serif text-xl font-bold">Week {week}</h3>
						<p className="m-0 text-xs text-lab-muted">
							{current ? (current.played === current.total ? "All played" : `${current.played} played · ${current.picked} picked · ${current.open} open`) : ""}
						</p>
					</div>
					{week <= throughWeek && current && current.played > 0 ? <p className="m-0 mt-1 text-xs text-lab-muted">Games that have been played are locked to their real result.</p> : null}

					<ul className="m-0 mt-3 list-none space-y-3 p-0">
						{weekGames.map((g) => (
							<li key={g.id}>
								<GameCard game={g} pick={picks[g.id]} sim={sim} onPick={s.pick} divisionMates={s.focus ? divisionMates : undefined} divisionLabel={myDivision} focusLabel={`${info.nick} game`} focus={s.focus ? (mine(g) ? "mine" : rivals.has(g.homeTeam) || rivals.has(g.awayTeam) ? "rival" : null) : null} />
							</li>
						))}
					</ul>
				</section>

				<div className="lg:col-span-7">
					<div className="hidden items-center justify-between gap-3 lg:flex">{confSwitch}</div>

					<section id="panel-standings" role="tabpanel" aria-labelledby="tab-standings" className={`${activeTab === "standings" ? "block" : "hidden"} lg:mt-4 lg:block`}>
						<div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
							<h2 className="m-0 font-serif text-xl font-bold">Standings</h2>
							{confSwitch}
						</div>
						<h2 className="sr-only lg:not-sr-only lg:mb-3 lg:font-serif lg:text-xl lg:font-bold">{conference} standings</h2>
						<StandingsTable sim={sim} conference={conference} team={focusTeam} rivals={rivals} odds={odds?.base.teams ?? null} oddsWorking={working} oddsExact={odds?.base.exact} />
					</section>

					<section id="panel-bracket" role="tabpanel" aria-labelledby="tab-bracket" className={`${activeTab === "bracket" ? "block" : "hidden"} mt-0 lg:mt-8 lg:block`}>
						<div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
							<h2 className="m-0 font-serif text-xl font-bold">Bracket</h2>
							{confSwitch}
						</div>
						<h2 className="sr-only lg:not-sr-only lg:mb-3 lg:font-serif lg:text-xl lg:font-bold">{conference} playoff bracket</h2>
						<BracketView sim={sim} conference={conference} team={focusTeam} />
					</section>
				</div>
			</div>
		</div>
	)
}
