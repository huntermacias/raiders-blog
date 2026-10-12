"use client"

import { useCallback, useSyncExternalStore } from "react"

const KEY = "team"
const EVENT = "rr-team-filter"

/** The team in the address bar (?team=LV), or "" for everyone. Only a team code is ever accepted. */
function read(): string {
	if (typeof window === "undefined") return ""
	const t = new URLSearchParams(window.location.search).get(KEY) ?? ""
	return /^[A-Z]{2,3}$/.test(t) ? t : ""
}

function subscribe(cb: () => void) {
	window.addEventListener("popstate", cb)
	window.addEventListener(EVENT, cb)
	return () => {
		window.removeEventListener("popstate", cb)
		window.removeEventListener(EVENT, cb)
	}
}

/**
 * The team a leaderboard is filtered to. It lives in the address (?team=LV), so it survives switching to another stat or position
 * (every leaderboard link carries it, see TeamLink), a reload, and being shared. Setting it rewrites the address without navigating.
 */
export function useTeamFilter(): [string, (team: string) => void] {
	const team = useSyncExternalStore(subscribe, read, () => "")
	const set = useCallback((next: string) => {
		const url = new URL(window.location.href)
		if (next) url.searchParams.set(KEY, next)
		else url.searchParams.delete(KEY)
		window.history.replaceState(window.history.state, "", url)
		window.dispatchEvent(new Event(EVENT))
	}, [])
	return [team, set]
}

/** A link to a leaderboard with the current team filter carried along. */
export function withTeam(href: string, team: string): string {
	if (!team || !/^[A-Z]{2,3}$/.test(team)) return href
	return `${href}${href.includes("?") ? "&" : "?"}${KEY}=${team}`
}
