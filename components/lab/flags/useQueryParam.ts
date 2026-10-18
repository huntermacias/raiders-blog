"use client"

import { useCallback, useSyncExternalStore } from "react"

const EVENT = "rr-flags-query"

function subscribe(cb: () => void) {
	window.addEventListener("popstate", cb)
	window.addEventListener(EVENT, cb)
	return () => {
		window.removeEventListener("popstate", cb)
		window.removeEventListener(EVENT, cb)
	}
}

/**
 * One query parameter of the address (?tab=teams), read in the browser and rewritten without navigating, so the page can stay a static page
 * and still open on the tab a shared link names. Only a value in `allowed` is ever returned; anything else reads as `fallback`.
 */
export function useQueryParam(key: string, allowed: readonly string[], fallback: string): [string, (next: string) => void] {
	const value = useSyncExternalStore(
		subscribe,
		() => {
			const v = new URLSearchParams(window.location.search).get(key) ?? ""
			return allowed.includes(v) ? v : fallback
		},
		() => fallback,
	)
	const set = useCallback(
		(next: string) => {
			const url = new URL(window.location.href)
			if (next && next !== fallback) url.searchParams.set(key, next)
			else url.searchParams.delete(key)
			window.history.replaceState(window.history.state, "", url)
			window.dispatchEvent(new Event(EVENT))
		},
		[key, fallback],
	)
	return [value, set]
}
