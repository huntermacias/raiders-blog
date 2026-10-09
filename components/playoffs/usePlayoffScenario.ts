"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { trackPlayoff } from "@/lib/analytics"
import { crossedMilestone, newlyCompletedWeeks } from "@/lib/playoffs/events"
import { type Scope, clearPicks, pickHomeTeams, pickRandom, sanitizePicks, seededRandom, setPick } from "@/lib/playoffs/picks"
import { loadPrefs, loadScenario, savePrefs, saveScenario } from "@/lib/playoffs/persist"
import { SCENARIO_PARAM, decodeScenario, encodeScenario } from "@/lib/playoffs/share"
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
	const [raiders, setRaidersState] = useState(true)
	const [ready, setReady] = useState(false)
	const [notice, setNotice] = useState<Notice>(null)
	const [undo, setUndo] = useState<{ picks: Predictions; label: string } | null>(null)
	const mine = useRef<Predictions | null>(null)
	const reportedWeeks = useRef(new Set<number>())
	const opened = useRef(false)

	// First load: a shared link beats saved picks.
	useEffect(() => {
		const store = storage()
		const prefs = loadPrefs(store)
		if (prefs) setRaidersState(prefs.raiders)

		const saved = loadScenario(store, season, games)
		let start: Predictions = saved ?? {}
		let shared = false
		try {
			const code = new URLSearchParams(window.location.search).get(SCENARIO_PARAM)
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
			try {
				const code = encodeScenario(games, clean)
				const url = new URL(window.location.href)
				if (code) url.searchParams.set(SCENARIO_PARAM, code)
				else url.searchParams.delete(SCENARIO_PARAM)
				window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
			} catch {
				// the address bar is a convenience
			}
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

	const pick = useCallback((gameId: string, outcome: Outcome) => commit(setPick(games, picks, gameId, outcome), picks), [commit, games, picks])

	const bulk = useCallback(
		(label: string, make: (p: Predictions) => Predictions) => {
			setUndo({ picks, label })
			commit(make(picks), picks)
		},
		[commit, picks],
	)

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
		if (!undo) return
		const target = undo.picks
		setUndo(null)
		commit(target, picks)
	}, [commit, picks, undo])

	const restoreMine = useCallback(() => {
		commit(mine.current ?? {}, picks)
		mine.current = null
	}, [commit, picks])

	const setRaiders = useCallback((on: boolean) => {
		setRaidersState(on)
		savePrefs(storage(), { raiders: on })
		if (on) trackPlayoff("raiders_mode_enabled")
	}, [])

	const dismissNotice = useCallback(() => setNotice(null), [])
	const sim = useMemo(() => simulateSeason({ games, predictions: picks }), [games, picks])
	const code = useMemo(() => encodeScenario(games, picks), [games, picks])

	return { picks, sim, code, ready, notice, undo, pick, fillHome, fillRandom, reset, undoLast, restoreMine, dismissNotice, raiders, setRaiders }
}
