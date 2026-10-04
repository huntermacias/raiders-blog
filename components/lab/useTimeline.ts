"use client"

import * as React from "react"

import { easeInOut, glideMs, SEGMENT_MS } from "@/lib/lab/timeline"

/**
 * The playhead for a drive: one number from 0 to `n` that playing, jumping and scrubbing all move.
 *
 *  - play: advances at a steady pace, one play per SEGMENT_MS at 1x
 *  - seek: glides to a play boundary with easing, passing through the plays in between
 *  - scrub: sets the position directly (dragging)
 *
 * With reduced motion there is no glide and no continuous movement: play steps one play at a time.
 */
export function useTimeline(n: number, reduced: boolean, speed: number) {
	const [pos, setPos] = React.useState(0)
	const [playing, setPlaying] = React.useState(false)
	const posRef = React.useRef(0)
	const nRef = React.useRef(n)
	const speedRef = React.useRef(speed)
	/** The play boundary a glide is heading to, so quick repeat clicks keep adding up. */
	const targetRef = React.useRef<number | null>(null)
	const stopper = React.useRef<(() => void) | null>(null)
	nRef.current = n
	speedRef.current = speed

	const set = React.useCallback((p: number) => {
		const v = Math.max(0, Math.min(nRef.current, p))
		posRef.current = v
		setPos(v)
	}, [])

	const stop = React.useCallback(() => {
		stopper.current?.()
		stopper.current = null
		targetRef.current = null
	}, [])

	React.useEffect(() => stop, [stop])

	/** Runs `step` every frame until it returns false. */
	const frames = React.useCallback((step: (dt: number, now: number) => boolean) => {
		let raf = 0
		let dead = false
		let last = performance.now()
		const tick = (now: number) => {
			if (dead) return
			const dt = Math.min(0.05, (now - last) / 1000)
			last = now
			if (step(dt, now)) raf = requestAnimationFrame(tick)
		}
		raf = requestAnimationFrame(tick)
		stopper.current = () => {
			dead = true
			cancelAnimationFrame(raf)
		}
	}, [])

	const pause = React.useCallback(() => {
		stop()
		setPlaying(false)
	}, [stop])

	const play = React.useCallback(() => {
		stop()
		if (posRef.current >= nRef.current) set(0)
		setPlaying(true)
		if (reduced) {
			const id = window.setInterval(() => {
				const next = Math.floor(posRef.current) + 1
				set(next)
				if (next >= nRef.current) {
					stop()
					setPlaying(false)
				}
			}, 1100 / speedRef.current)
			stopper.current = () => window.clearInterval(id)
			return
		}
		frames((dt) => {
			const next = posRef.current + (dt * speedRef.current * 1000) / SEGMENT_MS
			if (next >= nRef.current) {
				set(nRef.current)
				stopper.current = null
				setPlaying(false)
				return false
			}
			set(next)
			return true
		})
	}, [frames, reduced, set, stop])

	const seek = React.useCallback(
		(to: number) => {
			const from = posRef.current
			const target = Math.max(0, Math.min(nRef.current, to))
			stop()
			setPlaying(false)
			if (reduced || Math.abs(target - from) < 1e-6) {
				set(target)
				return
			}
			targetRef.current = target
			const dur = glideMs(target - from)
			const start = performance.now()
			frames((_, now) => {
				const t = Math.min(1, (now - start) / dur)
				set(from + (target - from) * easeInOut(t))
				if (t >= 1) {
					stopper.current = null
					targetRef.current = null
					return false
				}
				return true
			})
		},
		[frames, reduced, set, stop]
	)

	const scrub = React.useCallback(
		(p: number) => {
			stop()
			setPlaying(false)
			set(p)
		},
		[set, stop]
	)

	const reset = React.useCallback(() => {
		stop()
		setPlaying(false)
		set(0)
	}, [set, stop])

	return { pos, playing, play, pause, seek, scrub, reset, targetRef }
}
