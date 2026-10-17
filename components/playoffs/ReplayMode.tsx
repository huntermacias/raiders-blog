"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, ChevronsRight, Dices, Pause, Play, SkipBack } from "lucide-react"

import { teamByAbbr } from "@/lib/nfl"
import { NFL_LEAGUE, actualOutcome } from "@/lib/playoffs/season"
import { type ChartMetric, METRICS, buildTimeline, seasonEvents } from "@/lib/playoffs/timeline"
import type { Conference, Game, Predictions } from "@/lib/playoffs/types"
import ReplayStandings from "./ReplayStandings"
import SeasonStory from "./SeasonStory"
import TrajectoryChart from "./TrajectoryChart"
import { btn, btnSm, focusRing } from "./ui"
import { SPEEDS, useReplay } from "./useReplay"

type Props = {
	games: readonly Game[]
	picks: Predictions
	team: string
	openGames: number
	onSimulate: () => void
	onTeamMode: (team: string) => void
}

type Panel = "chart" | "standings" | "events" | "story"

const DIVISIONS = ["East", "North", "South", "West"] as const

export default function ReplayMode({ games, picks, team, openGames, onSimulate, onTeamMode }: Props) {
	const timeline = useMemo(() => buildTimeline(games, picks), [games, picks])
	const events = useMemo(() => seasonEvents(timeline), [timeline])
	// "Today" is the last week whose every game has been played. Weeks after it (and the week in progress) mix real and hypothetical games.
	const { nowIndex, hypotheticalWeeks } = useMemo(() => {
		let through = 0
		for (const w of timeline.weeks) {
			if (games.filter((g) => g.week === w).every((g) => actualOutcome(g) !== null)) through = w
			else break
		}
		const hyp = new Set<number>()
		for (const f of timeline.frames) if (f.decided > games.filter((g) => g.week <= f.week && actualOutcome(g) !== null).length) hyp.add(f.week)
		return { nowIndex: Math.max(0, timeline.weeks.indexOf(through)), hypotheticalWeeks: hyp }
	}, [games, timeline])
	const lastIndex = timeline.frames.length - 1
	const r = useReplay(timeline.frames.length, nowIndex)

	const [conference, setConference] = useState<Conference>(() => NFL_LEAGUE.teams.find((t) => t.id === team)?.conference ?? "AFC")
	const [metric, setMetric] = useState<ChartMetric>("rank")
	const [spotlight, setSpotlight] = useState<ReadonlySet<string>>(() => new Set([team]))
	const [hovered, setHovered] = useState<string | null>(null)
	const [division, setDivision] = useState<string | null>(null)
	const [panel, setPanel] = useState<Panel>("chart")
	const [allEvents, setAllEvents] = useState(false)
	const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 640)
	useEffect(() => {
		const on = () => setNarrow(window.innerWidth < 640)
		window.addEventListener("resize", on)
		return () => window.removeEventListener("resize", on)
	}, [])

	// Following a different team spotlights it, in its own conference.
	useEffect(() => {
		setSpotlight(new Set([team]))
		const c = NFL_LEAGUE.teams.find((t) => t.id === team)?.conference
		if (c) setConference(c)
	}, [team])

	const frame = timeline.frames[Math.min(r.index, lastIndex)]
	const previous = r.index > 0 ? timeline.frames[r.index - 1] : null
	const divisions = useMemo(() => (division ? new Set(NFL_LEAGUE.teams.filter((t) => t.conference === conference && t.division.endsWith(division)).map((t) => t.division)) : null), [division, conference])
	const confTeams = useMemo(() => NFL_LEAGUE.teams.filter((t) => t.conference === conference).map((t) => t.id).sort(), [conference])
	const toggle = (id: string) =>
		setSpotlight((s) => {
			const next = new Set(s)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})

	const shown = events.filter((e) => allEvents || e.week <= frame.week)
	const weekEvents = events.filter((e) => e.week === frame.week)
	const hypothetical = hypotheticalWeeks.has(frame.week)
	const hoverTeam = hovered ?? (spotlight.size === 1 ? Array.from(spotlight)[0] : null)

	const body = {
		chart: (
			<div>
				<div className="mb-3 flex flex-wrap items-center gap-2">
					<div role="group" aria-label="Chart measure" className="inline-flex rounded-lg border border-lab-line bg-lab-surface p-0.5">
						{METRICS.map((m) => (
							<button key={m.id} type="button" aria-pressed={metric === m.id} onClick={() => setMetric(m.id)} className={`min-h-[36px] rounded-md px-3 text-xs font-bold ${focusRing} ${metric === m.id ? "bg-lab-ink text-lab-page" : "text-lab-soft hover:text-lab-ink"}`}>
								{m.label}
							</button>
						))}
					</div>
					<div role="group" aria-label="Division filter" className="inline-flex rounded-lg border border-lab-line bg-lab-surface p-0.5">
						{[null, ...DIVISIONS].map((d) => (
							<button key={d ?? "all"} type="button" aria-pressed={division === d} onClick={() => setDivision(d)} className={`min-h-[36px] rounded-md px-2.5 text-xs font-bold ${focusRing} ${division === d ? "bg-lab-ink text-lab-page" : "text-lab-soft hover:text-lab-ink"}`}>
								{d ?? "All"}
							</button>
						))}
					</div>
				</div>
				<TrajectoryChart compact={narrow} frames={timeline.frames} conference={conference} metric={metric} index={r.index} pos={r.pos} nowIndex={nowIndex} spotlight={spotlight} hovered={hovered} divisions={divisions} onHover={setHovered} onToggle={toggle} reduced={r.reduced} />
				{hoverTeam ? (
					<p role="status" className="m-0 mt-2 rounded-lg border border-lab-line bg-lab-tint px-3 py-2 text-sm">
						{(() => {
							const t = frame.teams[hoverTeam]
							return (
								<>
									<span className="font-bold">{teamByAbbr(hoverTeam).name}</span> after Week {frame.week}: {t.record.w}-{t.record.l}
									{t.record.t ? `-${t.record.t}` : ""}, {t.seed ? `the ${t.seed} seed` : `${t.rank}${["st", "nd", "rd"][t.rank - 1] ?? "th"} in the ${t.conference}, outside the field`}
									{t.eliminated ? ", eliminated" : t.clinchedTopSeed ? ", clinched the No. 1 seed" : t.clinchedDivision ? ", clinched the division" : t.clinchedPlayoff ? ", clinched a berth" : ""}.
									{hypothetical ? " (hypothetical)" : ""}{" "}
									<button type="button" className="font-semibold underline underline-offset-4" onClick={() => onTeamMode(hoverTeam)}>
										Open {teamByAbbr(hoverTeam).nick} explorer
									</button>
								</>
							)
						})()}
					</p>
				) : null}
				<div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Teams to spotlight">
					{confTeams.map((id) => (
						<button key={id} type="button" aria-pressed={spotlight.has(id)} onClick={() => toggle(id)} className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-2.5 text-xs font-bold ${focusRing} ${spotlight.has(id) ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line bg-lab-surface text-lab-soft hover:border-lab-line-strong hover:text-lab-ink"}`}>
							<span className="block h-2 w-2 rounded-full" style={{ background: teamByAbbr(id).color }} aria-hidden="true" />
							{id}
						</button>
					))}
					<button type="button" className="min-h-[32px] px-2 text-xs font-semibold text-lab-soft underline underline-offset-4" onClick={() => setSpotlight(new Set())}>
						Clear
					</button>
				</div>
				<details className="mt-3 rounded-xl border border-lab-line bg-lab-surface">
					<summary className="flex min-h-[40px] cursor-pointer items-center px-3 text-sm font-semibold">View the chart as a table</summary>
					<div className="overflow-x-auto p-2">
						<table className="w-max min-w-full border-collapse text-xs">
							<caption className="sr-only">
								{METRICS.find((m) => m.id === metric)?.label} for each {conference} team after each week
							</caption>
							<thead>
								<tr>
									<th scope="col" className="p-1 text-left">Team</th>
									{timeline.frames.map((f) => (
										<th key={f.week} scope="col" className="p-1 text-center font-mono">{f.week}</th>
									))}
								</tr>
							</thead>
							<tbody>
								{confTeams.map((id) => (
									<tr key={id} className="border-t border-lab-line">
										<th scope="row" className="p-1 text-left">{id}</th>
										{timeline.frames.map((f) => {
											const t = f.teams[id]
											const v = metric === "rank" ? t.rank : metric === "behind" ? t.behind : Math.round(t.pct * 1000) / 1000
											return <td key={f.week} className={`p-1 text-center font-mono ${t.seed ? "font-bold" : "text-lab-muted"}`}>{metric === "pct" ? v.toFixed(3).replace(/^0/, "") : v}</td>
										})}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</details>
			</div>
		),
		standings: (
			<div>
				<h3 className="m-0 mb-2 font-serif text-lg font-bold">
					{conference} after Week {frame.week}
					<span className={`ml-2 rounded-full px-2 py-0.5 align-middle font-sans text-[10px] font-bold uppercase tracking-[0.12em] ${hypothetical ? "bg-lab-ink text-lab-page" : "border border-lab-line-strong text-lab-soft"}`}>{hypothetical ? "Hypothetical" : "Played"}</span>
				</h3>
				<ReplayStandings frame={frame} previous={previous} conference={conference} spotlight={spotlight} hovered={hovered} onToggle={toggle} onHover={setHovered} reduced={r.reduced} divisions={divisions} />
			</div>
		),
		events: (
			<div>
				<div className="mb-2 flex items-center justify-between gap-2">
					<h3 className="m-0 font-serif text-lg font-bold">Season events</h3>
					<label className="inline-flex min-h-[32px] items-center gap-2 text-xs text-lab-soft">
						<input type="checkbox" checked={allEvents} onChange={(e) => setAllEvents(e.target.checked)} className="h-4 w-4" />
						Show the whole season
					</label>
				</div>
				{shown.length === 0 ? (
					<p className="m-0 text-sm text-lab-muted">Nothing has changed hands yet. Play the replay forward.</p>
				) : (
					<ol className="m-0 max-h-[360px] list-none divide-y divide-lab-line overflow-y-auto rounded-xl border border-lab-line p-0">
						{[...shown].sort((a, b) => b.week - a.week).map((e, i) => {
							const idx = timeline.weeks.indexOf(e.week)
							return (
								<li key={`${e.week}-${e.team}-${e.kind}-${i}`}>
									<button
										type="button"
										onClick={() => {
											r.pause()
											r.setIndex(idx)
											setSpotlight(new Set([e.team]))
										}}
										className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm hover:bg-lab-tint ${focusRing} ${e.week === frame.week ? "bg-lab-tint" : ""}`}
									>
										<span className="w-10 shrink-0 font-mono text-xs font-semibold text-lab-muted">Wk {e.week}</span>
										<span>{e.text}</span>
										{hypotheticalWeeks.has(e.week) ? <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wider text-lab-muted">hypothetical</span> : null}
									</button>
								</li>
							)
						})}
					</ol>
				)}
				<p className="m-0 mt-2 text-[11px] leading-relaxed text-lab-muted">
					Clinched and eliminated are called only when the games left can&rsquo;t change the answer, so they are facts about this scenario. They say nothing about other ways the season could go.
				</p>
			</div>
		),
		story: (
			<div>
				<h3 className="m-0 mb-2 font-serif text-lg font-bold">How this season ends</h3>
				<SeasonStory timeline={timeline} events={events} nowIndex={nowIndex} onTeam={onTeamMode} />
			</div>
		),
	} as const

	const panels: { id: Panel; label: string }[] = [
		{ id: "chart", label: "Chart" },
		{ id: "standings", label: "Standings" },
		{ id: "events", label: "Events" },
		{ id: "story", label: "Story" },
	]

	return (
		<div className="space-y-4">
			{openGames > 0 ? (
				<div className="flex flex-wrap items-center gap-3 rounded-xl border border-lab-line-strong bg-lab-tint px-4 py-3 text-sm">
					<span className="min-w-0 flex-1">
						{openGames} {openGames === 1 ? "game is" : "games are"} still undecided, so the weeks after them repeat the table until you pick or simulate them. Fill in the season to see the whole race.
					</span>
					<button type="button" className={`${btn} !bg-lab-ink !text-lab-page hover:!bg-lab-ink`} onClick={onSimulate}>
						<Dices className="h-4 w-4" aria-hidden="true" />
						Simulate the rest
					</button>
				</div>
			) : null}

			<div className="rounded-xl border border-lab-line bg-lab-surface p-3">
				<div className="flex flex-wrap items-center gap-2">
					<button type="button" className={`${btn} !min-w-[44px] !px-3`} onClick={r.toggle} aria-label={r.playing ? "Pause" : "Play"}>
						{r.playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
						<span className="hidden sm:inline">{r.playing ? "Pause" : r.index >= lastIndex ? "Replay" : "Play"}</span>
					</button>
					<button type="button" className={`${btn} !px-3`} onClick={() => { r.pause(); r.setIndex(r.index - 1) }} disabled={r.index <= 0} aria-label="Previous week">
						<ChevronLeft className="h-4 w-4" aria-hidden="true" />
					</button>
					<button type="button" className={`${btn} !px-3`} onClick={() => { r.pause(); r.setIndex(r.index + 1) }} disabled={r.index >= lastIndex} aria-label="Next week">
						<ChevronRight className="h-4 w-4" aria-hidden="true" />
					</button>
					<div className="flex min-w-[160px] flex-1 items-center gap-3">
						<input
							type="range"
							min={0}
							max={lastIndex}
							step={1}
							value={r.index}
							onChange={(e) => {
								r.pause()
								r.setIndex(Number(e.target.value))
							}}
							aria-label="Week"
							aria-valuetext={`Week ${frame.week}`}
							className="h-2 min-w-0 flex-1 cursor-pointer accent-[var(--lab-ink,#111)]"
						/>
						<span className="w-16 shrink-0 text-right font-mono text-sm font-bold tabular-nums">Wk {frame.week}</span>
					</div>
					<div role="group" aria-label="Speed" className="inline-flex rounded-lg border border-lab-line p-0.5">
						{SPEEDS.map((s) => (
							<button key={s} type="button" aria-pressed={r.speed === s} onClick={() => r.setSpeed(s)} className={`min-h-[36px] min-w-[40px] rounded-md px-2 text-xs font-bold ${focusRing} ${r.speed === s ? "bg-lab-ink text-lab-page" : "text-lab-soft hover:text-lab-ink"}`}>
								{s}×
							</button>
						))}
					</div>
					<button type="button" className={btnSm} onClick={() => { r.pause(); r.setIndex(nowIndex) }}>
						<SkipBack className="h-3.5 w-3.5" aria-hidden="true" />
						Today
					</button>
					<button type="button" className={btnSm} onClick={() => { r.pause(); r.setIndex(lastIndex) }}>
						Week {timeline.weeks[lastIndex]}
						<ChevronsRight className="h-3.5 w-3.5" aria-hidden="true" />
					</button>
					<div role="group" aria-label="Conference" className="inline-flex rounded-lg border border-lab-line p-0.5">
						{(["AFC", "NFC"] as const).map((c) => (
							<button key={c} type="button" aria-pressed={conference === c} onClick={() => setConference(c)} className={`min-h-[36px] min-w-[48px] rounded-md px-2 text-xs font-bold ${focusRing} ${conference === c ? "bg-lab-ink text-lab-page" : "text-lab-soft hover:text-lab-ink"}`}>
								{c}
							</button>
						))}
					</div>
				</div>
				<p role="status" aria-live="polite" className="m-0 mt-2 min-h-[1.25rem] text-sm text-lab-soft">
					{weekEvents.length ? <span className="font-semibold text-lab-ink">Week {frame.week}: </span> : null}
					{weekEvents.slice(0, 2).map((e) => e.text).join(" · ")}
				</p>
			</div>

			<div role="tablist" aria-label="Replay sections" className="grid grid-cols-4 gap-1 rounded-xl border border-lab-line bg-lab-surface p-1 lg:hidden">
				{panels.map((p) => (
					<button key={p.id} type="button" role="tab" aria-selected={panel === p.id} onClick={() => setPanel(p.id)} className={`min-h-[40px] rounded-lg text-sm font-bold ${focusRing} ${panel === p.id ? "bg-lab-ink text-lab-page" : "text-lab-soft hover:text-lab-ink"}`}>
						{p.label}
					</button>
				))}
			</div>

			<div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-8">
				<div className="space-y-6 lg:col-span-7">
					<div className={`${panel === "chart" ? "block" : "hidden"} lg:block`}>{body.chart}</div>
					<div className={`${panel === "events" ? "block" : "hidden"} lg:block`}>{body.events}</div>
				</div>
				<div className="space-y-6 lg:col-span-5">
					<div className={`${panel === "standings" ? "block" : "hidden"} lg:block`}>{body.standings}</div>
				</div>
			</div>
			<div className={`${panel === "story" ? "block" : "hidden"} lg:block`}>{body.story}</div>
		</div>
	)
}
