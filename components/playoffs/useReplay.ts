"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export const SPEEDS = [0.5, 1, 2, 4] as const

/** True when the reader asks their system for less motion. Read after the first paint so the server and browser agree. */
export function useReducedMotion(): boolean {
	const [reduced, setReduced] = useState(false)
	useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return
		const q = window.matchMedia("(prefers-reduced-motion: reduce)")
		setReduced(q.matches)
		const on = () => setReduced(q.matches)
		q.addEventListener?.("change", on)
		return () => q.removeEventListener?.("change", on)
	}, [])
	return reduced
}

/**
 * Playback over a fixed number of frames. `index` is the frame on screen and everything that needs exact numbers (the
 * standings, the events) reads it. `pos` is a smoothed copy for the chart's moving head: it glides to `index` and
 * never decides what the standings say, so scrubbing back and forth always lands on the same frames.
 */
export function useReplay(count: number, start: number) {
	const reduced = useReducedMotion()
	const last = Math.max(0, count - 1)
	const [index, setIndexRaw] = useState(() => Math.min(Math.max(0, start), last))
	const [playing, setPlaying] = useState(false)
	const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1)
	const [pos, setPos] = useState(index)
	const posRef = useRef(index)
	const frame = useRef(0)

	const setIndex = useCallback((i: number) => setIndexRaw(Math.min(Math.max(0, Math.round(i)), last)), [last])

	// Keep the index inside the frames when the scenario (and so the frame count) changes.
	useEffect(() => {
		setIndexRaw((i) => Math.min(i, last))
	}, [last])

	useEffect(() => {
		if (!playing) return
		if (index >= last) {
			setPlaying(false)
			return
		}
		const id = setTimeout(() => setIndexRaw((i) => Math.min(i + 1, last)), 1400 / speed)
		return () => clearTimeout(id)
	}, [playing, index, last, speed])

	useEffect(() => {
		cancelAnimationFrame(frame.current)
		if (reduced || typeof requestAnimationFrame === "undefined") {
			posRef.current = index
			setPos(index)
			return
		}
		const from = posRef.current
		const to = index
		if (from === to) return
		const ms = Math.min(520, 1100 / speed)
		const t0 = performance.now()
		const tick = (now: number) => {
			const t = Math.min(1, (now - t0) / ms)
			const eased = 1 - Math.pow(1 - t, 3)
			posRef.current = from + (to - from) * eased
			setPos(posRef.current)
			if (t < 1) frame.current = requestAnimationFrame(tick)
		}
		frame.current = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(frame.current)
	}, [index, reduced, speed])

	const toggle = useCallback(() => {
		setPlaying((p) => {
			if (!p && index >= last) setIndexRaw(0)
			return !p
		})
	}, [index, last])

	return { index, pos, playing, speed, reduced, setIndex, setSpeed, toggle, pause: () => setPlaying(false), last }
}
