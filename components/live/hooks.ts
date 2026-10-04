"use client"

import * as React from "react"

/** True when the visitor asked their system for less motion. */
export function useReducedMotion(): boolean {
	const [reduced, setReduced] = React.useState(false)
	React.useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return
		const q = window.matchMedia("(prefers-reduced-motion: reduce)")
		setReduced(q.matches)
		const on = () => setReduced(q.matches)
		q.addEventListener?.("change", on)
		return () => q.removeEventListener?.("change", on)
	}, [])
	return reduced
}

/** True below the sm breakpoint, where the field is drawn narrower and taller. */
export function useCompact(): boolean {
	const [compact, setCompact] = React.useState(false)
	React.useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return
		const q = window.matchMedia("(max-width: 639px)")
		setCompact(q.matches)
		const on = () => setCompact(q.matches)
		q.addEventListener?.("change", on)
		return () => q.removeEventListener?.("change", on)
	}, [])
	return compact
}

/** The current time in ms, refreshed every `ms`. Null until mounted, so server and browser agree. */
export function useNow(ms = 1000): number | null {
	const [now, setNow] = React.useState<number | null>(null)
	React.useEffect(() => {
		setNow(Date.now())
		const id = window.setInterval(() => setNow(Date.now()), ms)
		return () => window.clearInterval(id)
	}, [ms])
	return now
}

/** Eases a number toward its target, so the camera glides instead of jumping. */
export function useSmooth(target: number, reduced: boolean, rate = 4, eps = 0.02): number {
	const [value, setValue] = React.useState(target)
	const current = React.useRef(target)
	React.useEffect(() => {
		if (reduced || typeof requestAnimationFrame === "undefined") {
			current.current = target
			setValue(target)
			return
		}
		let raf = 0
		let last = performance.now()
		const tick = (now: number) => {
			const dt = Math.min(0.05, (now - last) / 1000)
			last = now
			current.current += (target - current.current) * (1 - Math.exp(-dt * rate))
			if (Math.abs(target - current.current) < eps) {
				current.current = target
				setValue(target)
				return
			}
			setValue(current.current)
			raf = requestAnimationFrame(tick)
		}
		raf = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(raf)
	}, [target, reduced, rate, eps])
	return value
}

export type Polled<T> = {
	data: T | null
	/** The last request failed. Data from an earlier one, if any, is still in `data`. */
	error: boolean
	/** When the data last arrived (ms since the epoch). */
	updatedAt: number | null
	refresh: () => void
}

/**
 * Fetches `url` and keeps fetching it. `nextDelay` says how long to wait after each answer (null
 * stops). It pauses while the tab is hidden and fetches again the moment the tab is visible. With
 * `initial` given, the first fetch waits one delay instead of repeating what the server just sent.
 */
export function usePolled<T>(url: string | null, nextDelay: (data: T | null) => number | null, initial: T | null = null): Polled<T> {
	const [data, setData] = React.useState<T | null>(initial)
	const [error, setError] = React.useState(false)
	const [updatedAt, setUpdatedAt] = React.useState<number | null>(null)
	const delay = React.useRef(nextDelay)
	delay.current = nextDelay
	const latest = React.useRef<T | null>(initial)
	const run = React.useRef<() => void>(() => {})

	React.useEffect(() => {
		if (!url) return
		let dead = false
		let timer: number | undefined
		let ctl: AbortController | undefined

		const schedule = () => {
			if (dead) return
			const ms = delay.current(latest.current)
			if (ms != null) timer = window.setTimeout(go, ms)
		}
		const go = async () => {
			window.clearTimeout(timer)
			if (document.hidden) return
			ctl?.abort()
			ctl = new AbortController()
			try {
				const res = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } })
				if (!res.ok) throw new Error(String(res.status))
				const json = (await res.json()) as T
				if (dead) return
				latest.current = json
				setData(json)
				setError(false)
				setUpdatedAt(Date.now())
			} catch (e) {
				if (dead || (e as Error).name === "AbortError") return
				setError(true)
			}
			schedule()
		}
		run.current = go
		const onVisible = () => {
			if (!document.hidden) go()
		}
		document.addEventListener("visibilitychange", onVisible)
		if (initial) schedule()
		else go()
		return () => {
			dead = true
			window.clearTimeout(timer)
			ctl?.abort()
			document.removeEventListener("visibilitychange", onVisible)
		}
		// `initial` only matters for the first fetch.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [url])

	return { data, error, updatedAt, refresh: () => run.current() }
}
