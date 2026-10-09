"use client"

import { useEffect, useMemo, useState } from "react"

import { type OddsResult, PAGE_SIMS, gamesLeft, oddsRun, ratingsFor } from "@/lib/playoffs/odds"
import { pickTeamGames } from "@/lib/playoffs/picks"
import type { Game, Predictions } from "@/lib/playoffs/types"

/** Simulated seasons for the odds on the page, and for each of the two "if they win out / lose out" checks. */
const SIMS = PAGE_SIMS
const SIMS_EXTRA = 900
/** Seasons played before the browser gets a turn (about 50 ms). */
const CHUNK = 90
/** How long to wait after the last pick before starting, so tapping through games does not start a run for each one. */
const SETTLE_MS = 220

export type TeamOdds = {
	/** The odds for every team, given the picks. */
	base: OddsResult
	/** The followed team's playoff odds if it wins / loses every game it has left. Null when it has none left. */
	winOut: number | null
	loseOut: number | null
}

export type OddsState = {
	/** The latest finished odds, even while a newer run is working. Null until the first run finishes. */
	odds: TeamOdds | null
	/** True while a run for the current picks is still working, so the numbers on screen may be a pick behind. */
	working: boolean
	sims: number
}

/**
 * Plays the rest of the season for the reader's picks, a few simulations at a time so the page stays responsive, and
 * returns the odds when each run finishes. A pick starts a new run (after a short wait); the numbers from the last
 * finished run stay on screen, marked as updating, until the new ones are ready. Nothing is sent anywhere.
 */
export function useOdds(games: readonly Game[], picks: Predictions, team: string, enabled: boolean): OddsState {
	const ratings = useMemo(() => ratingsFor(games), [games])
	const [odds, setOdds] = useState<TeamOdds | null>(null)
	const [working, setWorking] = useState(false)

	useEffect(() => {
		if (!enabled) return
		let cancelled = false
		let timer: ReturnType<typeof setTimeout> | undefined
		setWorking(true)

		const play = (input: Parameters<typeof oddsRun>[0], done: (r: OddsResult) => void) => {
			const run = oddsRun(input)
			const tick = () => {
				if (cancelled) return
				run.step(CHUNK)
				if (run.done) done(run.result())
				else timer = setTimeout(tick, 0)
			}
			tick()
		}

		const start = () => {
			play({ games, predictions: picks, ratings, sims: SIMS, track: team, trackGames: 3 }, (base) => {
				if (cancelled) return
				// Publish the main odds at once; the two what-ifs follow a moment later.
				setOdds({ base, winOut: null, loseOut: null })
				if (base.exact || gamesLeft(games, picks, team) === 0) {
					setWorking(false)
					return
				}
				play({ games, predictions: pickTeamGames(games, picks, team, "W"), ratings, sims: SIMS_EXTRA }, (w) => {
					if (cancelled) return
					play({ games, predictions: pickTeamGames(games, picks, team, "L"), ratings, sims: SIMS_EXTRA }, (l) => {
						if (cancelled) return
						setOdds({ base, winOut: w.teams[team].playoffs, loseOut: l.teams[team].playoffs })
						setWorking(false)
					})
				})
			})
		}

		timer = setTimeout(start, SETTLE_MS)
		return () => {
			cancelled = true
			if (timer) clearTimeout(timer)
		}
	}, [games, picks, team, ratings, enabled])

	return { odds, working, sims: SIMS }
}
