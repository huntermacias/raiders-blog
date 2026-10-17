"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { trackPlayoff } from "@/lib/analytics"
import { teamByAbbr } from "@/lib/nfl"
import { type Branch, addBranch, loadBranches, removeBranch, saveBranches } from "@/lib/playoffs/branches"
import { gameChances, simulateRemaining } from "@/lib/playoffs/autosim"
import { rivalsOf } from "@/lib/playoffs/format"
import { ratingsFor } from "@/lib/playoffs/odds"
import { clearPicks, firstOpenWeek, pickHomeTeams, pickTeamGames, weekProgress } from "@/lib/playoffs/picks"
import { PLAYOFFS_SHARE_PATH, scenarioQuery } from "@/lib/playoffs/share"
import type { Conference, Game, Outcome, Predictions } from "@/lib/playoffs/types"
import AutoSim from "./AutoSim"
import BracketView from "./BracketView"
import CompareMode from "./CompareMode"
import ReplayMode from "./ReplayMode"
import ScenarioBar from "./ScenarioBar"
import SeasonGrid from "./SeasonGrid"
import StandingsTable from "./StandingsTable"
import TeamMode from "./TeamMode"
import TeamPicker from "./TeamPicker"
import TeamSchedule from "./TeamSchedule"
import WeekView from "./WeekView"
import { useOdds } from "./useOdds"
import { usePlayoffScenario } from "./usePlayoffScenario"
import { focusRing } from "./ui"

type Mode = "pick" | "replay" | "team" | "compare"
type View = "week" | "grid" | "team"

const MODES: { id: Mode; label: string; short: string }[] = [
	{ id: "pick", label: "Pick games", short: "Pick" },
	{ id: "replay", label: "Season replay", short: "Replay" },
	{ id: "team", label: "Team explorer", short: "Team" },
	{ id: "compare", label: "Compare", short: "Compare" },
]
const MODE_PARAM = "m"

function storage(): Storage | null {
	try {
		return typeof window === "undefined" ? null : window.localStorage
	} catch {
		return null
	}
}

function writeMode(mode: Mode) {
	try {
		const url = new URL(window.location.href)
		if (mode === "pick") url.searchParams.delete(MODE_PARAM)
		else url.searchParams.set(MODE_PARAM, mode)
		window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
	} catch {
		// the address bar is a convenience
	}
}

export default function PlayoffMachine({ games, season, throughWeek, stamp }: { games: Game[]; season: number; throughWeek: number; stamp: number }) {
	const s = usePlayoffScenario(games, season)
	const { sim, picks } = s
	const team = s.team
	const info = teamByAbbr(team)
	const [mode, setModeState] = useState<Mode>("pick")
	const [view, setView] = useState<View>("week")
	const [week, setWeek] = useState(() => firstOpenWeek(games))
	const [conference, setConference] = useState<Conference>("AFC")
	const [simNumber, setSimNumber] = useState(1)
	// Games a simulation filled in, and what it put there. A pick changed by the reader, or by undo, stops being "simulated".
	const [simmed, setSimmed] = useState<ReadonlyMap<string, Outcome>>(new Map())
	const [branches, setBranches] = useState<Branch[]>([])

	useEffect(() => {
		setBranches(loadBranches(storage(), season, games))
		try {
			const m = new URLSearchParams(window.location.search).get(MODE_PARAM)
			if (m === "replay" || m === "team" || m === "compare") setModeState(m)
		} catch {
			// no URL to read
		}
	}, [season, games])

	const setMode = useCallback((m: Mode) => {
		setModeState(m)
		writeMode(m)
		trackPlayoff("playoff_mode_opened", { mode: m })
	}, [])

	const simulated = useMemo(() => new Set(Array.from(simmed).filter(([id, o]) => picks[id] === o).map(([id]) => id)), [simmed, picks])
	const chances = useMemo(() => gameChances(games, ratingsFor(games)), [games])
	const progress = useMemo(() => weekProgress(games, picks), [games, picks])
	const { odds, working } = useOdds(games, picks, team, s.ready)
	const rivals = useMemo(() => rivalsOf(sim, team), [sim, team])
	const openGames = sim.openGames

	const onPick = useCallback(
		(id: string, outcome: Outcome) => {
			setSimmed((m) => {
				if (!m.has(id)) return m
				const next = new Map(m)
				next.delete(id)
				return next
			})
			s.pick(id, outcome)
		},
		[s],
	)

	const runSim = useCallback(
		(scope: "week" | "rest", rule: "model" | "favorites") => {
			const weeks = scope === "week" ? [week] : undefined
			const inScope = (id: string) => !weeks || weeks.includes(games.find((g) => g.id === id)?.week ?? -1)
			// Re-rolling replaces earlier simulated games in scope, never a game the reader picked.
			const base: Record<string, Outcome> = { ...picks }
			const kept = new Map<string, Outcome>()
			for (const [id, o] of Array.from(simmed)) {
				if (picks[id] !== o) continue
				if (inScope(id)) delete base[id]
				else kept.set(id, o)
			}
			const next = simulateRemaining(games, base, { rule, seed: simNumber, weeks, keepPicks: true })
			const fresh = new Map(kept)
			for (const id of Object.keys(next)) if (!Object.prototype.hasOwnProperty.call(base, id)) fresh.set(id, next[id])
			s.setAll(scope === "week" ? `simulate week ${week}` : rule === "favorites" ? "favorites win" : "simulate season", next)
			setSimmed(fresh)
			setSimNumber((n) => n + 1)
			trackPlayoff("playoff_simulated", { scope, rule })
		},
		[games, picks, simmed, simNumber, week, s],
	)

	const onResult = useCallback((id: string, result: "W" | "L") => s.bulk(`${id} ${result === "W" ? "win out" : "lose out"}`, (p) => pickTeamGames(games, p, id, result)), [s, games])
	const clearWeek = useCallback(() => s.bulk(`clear week ${week}`, (p) => clearPicks(games, p, { weeks: [week] })), [s, games, week])
	const homeTeams = useCallback(() => s.bulk("home teams", (p) => pickHomeTeams(games, p, { keepPicks: true })), [s, games])
	const reset = useCallback(() => {
		setSimmed(new Map())
		s.reset()
	}, [s])
	const clearOne = useCallback((id: string, outcome: Outcome | null) => {
		if (outcome === null && picks[id]) onPick(id, picks[id])
	}, [onPick, picks])

	const goToGame = useCallback(
		(g: Game) => {
			setWeek(g.week)
			setView("week")
			setMode("pick")
			if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
		},
		[setMode],
	)

	const saveBranch = useCallback(
		(name: string) => {
			const next = addBranch(branches, name, picks)
			setBranches(next)
			saveBranches(storage(), season, next)
		},
		[branches, picks, season],
	)
	const deleteBranch = useCallback(
		(id: string) => {
			const next = removeBranch(branches, id)
			setBranches(next)
			saveBranches(storage(), season, next)
		},
		[branches, season],
	)
	const useScenario = useCallback((next: Predictions, label: string) => s.setAll(label, next), [s])

	const pickedCount = Object.keys(picks).length
	const shareText = pickedCount
		? `My ${season} NFL playoff scenario: the ${info.nick}' road to the playoffs, ${pickedCount} ${pickedCount === 1 ? "pick" : "picks"} in. Build yours:`
		: `The ${season} NFL playoff race and what the ${info.nick} need. Build your own scenario:`

	const confSwitch = (
		<div role="group" aria-label="Conference" className="inline-flex rounded-lg border border-lab-line bg-lab-surface p-0.5">
			{(["AFC", "NFC"] as const).map((c) => (
				<button key={c} type="button" aria-pressed={conference === c} onClick={() => setConference(c)} className={`min-h-[36px] min-w-[56px] rounded-md px-3 text-sm font-bold transition ${focusRing} ${conference === c ? "bg-lab-ink text-lab-page" : "text-lab-soft hover:text-lab-ink"}`}>
					{c}
				</button>
			))}
		</div>
	)

	return (
		<div className="space-y-4">
			<ScenarioBar
				games={games}
				throughWeek={throughWeek}
				picked={pickedCount}
				simulated={simulated.size}
				undo={s.undo}
				redo={s.redo}
				lastChange={s.lastChange}
				picks={picks}
				onUndo={s.undoLast}
				onRedo={s.redoLast}
				onReset={reset}
				share={{ query: scenarioQuery(s.code, team), stamp, text: shareText, alt: `${info.nick} playoff scenario: seeds, bracket and playoff odds`, file: `${team.toLowerCase()}-playoff-scenario`, onAction: (method) => trackPlayoff("playoff_scenario_shared", { picks: pickedCount, method }), sharePath: PLAYOFFS_SHARE_PATH }}
			/>

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

			<div className="flex flex-wrap items-center gap-2">
				<div role="tablist" aria-label="Playoff machine modes" className="grid min-w-0 basis-full grid-cols-4 sm:flex-1 sm:basis-auto gap-1 rounded-xl border border-lab-line bg-lab-surface p-1 sm:max-w-xl">
					{MODES.map((m) => (
						<button key={m.id} type="button" role="tab" id={`mode-${m.id}`} aria-selected={mode === m.id} aria-controls="mode-panel" onClick={() => setMode(m.id)} className={`min-h-[44px] rounded-lg text-sm font-bold transition ${focusRing} ${mode === m.id ? "bg-lab-ink text-lab-page" : "text-lab-soft hover:text-lab-ink"}`}>
							<span className="sm:hidden">{m.short}</span>
							<span className="hidden sm:inline">{m.label}</span>
						</button>
					))}
				</div>
				<TeamPicker value={team} onChange={s.setTeam} />
			</div>

			<div id="mode-panel" role="tabpanel" aria-labelledby={`mode-${mode}`}>
				{mode === "pick" ? (
					<div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-8">
						<div className="space-y-4 lg:col-span-7">
							<AutoSim week={week} team={team} openLeft={openGames} simNumber={simNumber} onSimulate={runSim} onHome={homeTeams} onTeam={(r) => onResult(team, r)} onClearWeek={clearWeek} />
							<div role="group" aria-label="How to see the schedule" className="inline-flex rounded-lg border border-lab-line bg-lab-surface p-0.5">
								{([["week", "By week"], ["grid", "Season grid"], ["team", `${info.nick} schedule`]] as const).map(([id, label]) => (
									<button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={`min-h-[36px] rounded-md px-3 text-sm font-bold ${focusRing} ${view === id ? "bg-lab-ink text-lab-page" : "text-lab-soft hover:text-lab-ink"}`}>
										{label}
									</button>
								))}
							</div>
							{view === "week" ? (
								<WeekView games={games} week={week} setWeek={setWeek} progress={progress} picks={picks} simulated={simulated} sim={sim} chances={chances} onPick={onPick} team={s.focus ? team : null} throughWeek={throughWeek} />
							) : view === "grid" ? (
								<SeasonGrid games={games} picks={picks} simulated={simulated} sim={sim} onPick={onPick} onSet={clearOne} team={s.focus ? team : null} />
							) : (
								<TeamSchedule games={games} team={team} picks={picks} simulated={simulated} sim={sim} chances={chances} onPick={onPick} important={new Map((odds?.base.rooting ?? []).filter((r) => r.swing !== null).map((r) => [r.gameId, r.swing as number]))} />
							)}
						</div>
						<div className="mt-6 space-y-6 lg:sticky lg:top-16 lg:col-span-5 lg:mt-0">
							<section aria-labelledby="pm-standings">
								<div className="mb-2 flex items-center justify-between gap-3">
									<h2 id="pm-standings" className="m-0 font-serif text-xl font-bold">
										{conference} standings
									</h2>
									{confSwitch}
								</div>
								<StandingsTable sim={sim} conference={conference} team={s.focus ? team : null} rivals={rivals} odds={odds?.base.teams ?? null} oddsWorking={working} oddsExact={odds?.base.exact} />
							</section>
							<section aria-labelledby="pm-bracket">
								<h2 id="pm-bracket" className="mb-2 mt-0 font-serif text-xl font-bold">
									{conference} bracket
								</h2>
								<BracketView sim={sim} conference={conference} team={s.focus ? team : null} />
							</section>
						</div>
					</div>
				) : mode === "replay" ? (
					<ReplayMode games={games} picks={picks} team={team} openGames={openGames} onSimulate={() => runSim("rest", "model")} onTeamMode={(id) => { s.setTeam(id); setMode("team") }} />
				) : mode === "team" ? (
					<TeamMode games={games} picks={picks} simulated={simulated} sim={sim} team={team} odds={odds} working={working} chances={chances} onPick={onPick} onGoToGame={goToGame} onResult={onResult} />
				) : (
					<CompareMode games={games} picks={picks} team={team} branches={branches} onSave={saveBranch} onDelete={deleteBranch} onUse={useScenario} />
				)}
			</div>
		</div>
	)
}
