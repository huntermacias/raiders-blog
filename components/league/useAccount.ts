"use client"

import * as React from "react"

import { post } from "@/lib/league2/client"
import { type StripState, TEAM_EVENT, chooseTeam, forgetStrip, loadStrip, readCachedStrip, readLocalTeam, writeLocalTeam } from "@/lib/league2/myTeam"

/** Who is looking: "loading" until the browser has asked, then off / visitor / player. The server render is always "loading", so pages stay static. */
export function useAccountState(): StripState {
	const [state, setState] = React.useState<StripState>({ status: "loading" })
	React.useEffect(() => {
		let live = true
		const cached = readCachedStrip()
		if (cached) setState(cached)
		loadStrip().then((s) => live && setState(s))
		return () => {
			live = false
		}
	}, [])
	return state
}

/**
 * The reader's team. Works signed out (kept in this browser). Signed in, it comes from the account, and a team chosen before signing in is
 * saved to the account once, without overwriting a team the account already has.
 */
export function useMyTeam(): { team: string | null; ready: boolean; account: StripState; setTeam: (abbr: string | null) => Promise<void> } {
	const account = useAccountState()
	const [local, setLocal] = React.useState<string | null>(null)
	const [ready, setReady] = React.useState(false)
	const synced = React.useRef(false)
	// What this tab just saved to the account, so a change shows at once instead of waiting for the next fetch.
	const [saved, setSaved] = React.useState<string | null | undefined>(undefined)

	React.useEffect(() => {
		setLocal(readLocalTeam())
		setReady(true)
		const onChange = () => setLocal(readLocalTeam())
		window.addEventListener(TEAM_EVENT, onChange)
		window.addEventListener("storage", onChange)
		return () => {
			window.removeEventListener(TEAM_EVENT, onChange)
			window.removeEventListener("storage", onChange)
		}
	}, [])

	const accountTeam = saved !== undefined ? saved : account.status === "player" ? account.strip.favoriteTeam : null
	const team = chooseTeam(local, accountTeam)

	React.useEffect(() => {
		if (account.status !== "player" || synced.current || !ready) return
		synced.current = true
		if (accountTeam) {
			if (accountTeam !== local) {
				writeLocalTeam(accountTeam)
				setLocal(accountTeam)
			}
		} else if (local) {
			void post("/api/league/account/team", { favoriteTeam: local }).then((r) => {
				if (r.ok) {
					setSaved(local)
					forgetStrip()
				}
			})
		}
	}, [account, accountTeam, local, ready])

	const setTeam = React.useCallback(
		async (abbr: string | null) => {
			writeLocalTeam(abbr)
			setLocal(abbr)
			window.dispatchEvent(new Event(TEAM_EVENT))
			if (account.status === "player") {
				const r = await post("/api/league/account/team", { favoriteTeam: abbr })
				if (r.ok) {
					setSaved(abbr)
					forgetStrip()
				}
			}
		},
		[account.status]
	)

	return { team, ready, account, setTeam }
}
