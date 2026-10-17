"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { trackPlayoff } from "@/lib/analytics"
import { crossedMilestone, newlyCompletedWeeks } from "@/lib/playoffs/events"
import { EMPTY_HISTORY, type History, record, redo as redoHistory, undo as undoHistory } from "@/lib/playoffs/history"
import { type Scope, clearPicks, pickHomeTeams, pickRandom, sanitizePicks, seededRandom, setPick } from "@/lib/playoffs/picks"
import { loadPrefs, loadScenario, savePrefs, saveScenario } from "@/lib/playoffs/persist"
import { DEFAULT_TEAM, SCENARIO_PARAM, TEAM_PARAM, decodeScenario, encodeScenario, readTeam } from "@/lib/playoffs/share"
import { NFL_LEAGUE } from "@/lib/playoffs/season"
import { simulateSeason } from "@/lib/playoffs/simulator"
import type { Game, Outcome, Predictions } from "@/lib/playoffs/types"

export type Notice = { kind: "shared"; picks: number; canRestore: boolean } | { kind: "stale-link" } | null

function storage(): Storage | null {
	try {
		return typeof window === "undefined" ? null : window.localStorage
	} catch {
		return null
	}
}

const count = (p: Predictions) => Object.keys(p).length
const TEAM_IDS: ReadonlySet<string> = new Set(NFL_LEAGUE.teams.map((t) => t.id))

/** Puts the scenario code and the followed team in the address bar, leaving the rest of the address alone. The Raiders are the default, so they are left out. */
function syncUrl(code: string, team: string) {
	try {
		const url = new URL(window.location.href)
		if (code) url.searchParams.set(SCENARIO_PARAM, code)
		else url.searchParams.delete(SCENARIO_PARAM)
		if (team && team !== DEFAULT_TEAM) url.searchParams.set(TEAM_PARAM, team)
		else url.searchParams.delete(TEAM_PARAM)
		window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
	} catch {
		// the address bar is a convenience
	}
}

/**
 * The reader's scenario: their picks, what they have saved, what a shared link says, and the bulk actions. The page
 * renders with no picks on the server and in the first paint, so the HTML is the same either way; the saved picks or
 * the link's picks are applied right after, in an effect.
 *
 * A shared link wins over saved picks when it is opened, but it does not overwrite them: the reader's own picks stay
 * in storage until they change something, and "Back to my picks" brings them back.
 */
export function usePlayoffScenario(games: readonly Game[], season: number) {
	const [picks, setPicks] = useState<Predictions>({})
	// The team being followed (the Raiders unless the reader picks another) and whether it is highlighted everywhere.
	const [team, setTeamState] = useState(DEFAULT_TEAM)
	const [focus, setFocusState] = useState(true)
	const teamRef = useRef(DEFAULT_TEAM)
	const [ready, setReady] = useState(false)
	const [notice, setNotice] = useState<Notice>(null)
	const [history, setHistory] = useState<History>(EMPTY_HISTORY)
	// The picks as they were before the latest change, so every mode can say what that change did.
	const [lastChange, setLastChange] = useState<{ before: Predictions; label: string } | null>(null)
	const mine = useRef<Predictions | null>(null)
	const reportedWeeks = useRef(new Set<number>())
	const opened = useRef(false)

	// First load: a shared link beats saved picks.
	useEffect(() => {
		const store = storage()
		const prefs = loadPrefs(store)
		let followed = DEFAULT_TEAM
		if (prefs) {
			setFocusState(prefs.raiders)
			followed = readTeam(prefs.team, TEAM_IDS)
		}

		const saved = loadScenario(store, season, games)
		let start: Predictions = saved ?? {}
		let shared = false
		try {
			const params = new URLSearchParams(window.location.search)
			// A link that names a team is about that team, whatever this browser last followed.
			if (params.has(TEAM_PARAM)) followed = readTeam(params.get(TEAM_PARAM), TEAM_IDS)
			const code = params.get(SCENARIO_PARAM)
			if (code) {
				const result = decodeScenario(games, code)
				if (result.ok) {
					start = result.predictions
					shared = true
					mine.current = saved
					setNotice({ kind: "shared", picks: count(result.predictions), canRestore: Boolean(saved) })
				} else {
					setNotice({ kind: "stale-link" })
				}
			}
		} catch {
			// no URL to read
		}
		setPicks(start)
		teamRef.current = followed
		setTeamState(followed)
		setReady(true)
		if (!opened.current) {
			opened.current = true
			trackPlayoff("playoff_machine_open", { picks: count(start), shared })
		}
	}, [games, season])

	// Every change the reader makes is saved, and the address bar follows it so the URL is always the current scenario.
	const commit = useCallback(
		(next: Predictions, before: Predictions) => {
			const clean = sanitizePicks(games, next)
			setPicks(clean)
			saveScenario(storage(), season, clean)
			syncUrl(encodeScenario(games, clean), teamRef.current)
			setNotice((n) => (n?.kind === "shared" ? null : n))

			const milestone = crossedMilestone(count(before), count(clean))
			if (milestone) trackPlayoff("playoff_prediction_selected", { picks: milestone })
			for (const w of newlyCompletedWeeks(games, before, clean)) {
				if (reportedWeeks.current.has(w)) continue
				reportedWeeks.current.add(w)
				trackPlayoff("playoff_week_completed", { week: w })
			}
		},
		[games, season],
	)

	/** Replaces the picks with `next`, remembering how to get back. Nothing happens when nothing changes. */
	const setAll = useCallback(
		(label: string, next: Predictions) => {
			const clean = sanitizePicks(games, next)
			if (JSON.stringify(clean) === JSON.stringify(picks)) return
			setHistory((h) => record(h, picks, label))
			setLastChange({ before: picks, label })
			commit(clean, picks)
		},
		[commit, games, picks],
	)

	const pick = useCallback((gameId: string, outcome: Outcome) => setAll("pick", setPick(games, picks, gameId, outcome)), [setAll, games, picks])

	const bulk = useCallback((label: string, make: (p: Predictions) => Predictions) => setAll(label, make(picks)), [setAll, picks])

	const fillHome = useCallback((scope: Scope) => bulk("home teams", (p) => pickHomeTeams(games, p, scope)), [bulk, games])
	const fillRandom = useCallback(
		(scope: Scope) => {
			const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0
			bulk("random picks", (p) => pickRandom(games, p, seededRandom(seed), scope))
		},
		[bulk, games],
	)
	const reset = useCallback(() => {
		if (count(picks) === 0) return
		trackPlayoff("playoff_reset", { picks: count(picks) })
		bulk("reset", () => clearPicks(games, picks))
	}, [bulk, games, picks])

	const undoLast = useCallback(() => {
		const step = undoHistory(history, picks)
		if (!step) return
		setHistory(step.history)
		setLastChange(null)
		commit(step.picks, picks)
	}, [commit, history, picks])

	const redoLast = useCallback(() => {
		const step = redoHistory(history, picks)
		if (!step) return
		setHistory(step.history)
		setLastChange(null)
		commit(step.picks, picks)
	}, [commit, history, picks])

	const restoreMine = useCallback(() => {
		setAll("back to my picks", mine.current ?? {})
		mine.current = null
	}, [setAll])

	const setFocus = useCallback((on: boolean) => {
		setFocusState(on)
		savePrefs(storage(), { raiders: on, team: teamRef.current })
		if (on && teamRef.current === DEFAULT_TEAM) trackPlayoff("raiders_mode_enabled")
	}, [])

	const setTeam = useCallback(
		(id: string) => {
			const next = readTeam(id, TEAM_IDS)
			if (next === teamRef.current) return
			teamRef.current = next
			setTeamState(next)
			savePrefs(storage(), { raiders: focus, team: next })
			syncUrl(encodeScenario(games, picks), next)
			trackPlayoff("playoff_team_followed", { team: next })
		},
		[focus, games, picks],
	)

	const dismissNotice = useCallback(() => setNotice(null), [])
	const sim = useMemo(() => simulateSeason({ games, predictions: picks }), [games, picks])
	const code = useMemo(() => encodeScenario(games, picks), [games, picks])

	const undo = history.past.length ? { label: history.past[history.past.length - 1].label } : null
	const redo = history.future.length ? { label: history.future[history.future.length - 1].label } : null

	return { picks, sim, code, ready, notice, undo, redo, lastChange, pick, setAll, bulk, fillHome, fillRandom, reset, undoLast, redoLast, restoreMine, dismissNotice, team, setTeam, focus, setFocus }
}
