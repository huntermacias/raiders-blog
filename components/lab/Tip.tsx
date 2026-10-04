"use client"

import * as React from "react"

type Props = {
	/** The explanation shown on hover and keyboard focus. */
	text: React.ReactNode
	children: React.ReactNode
	align?: "start" | "center" | "end"
	/** Where the bubble opens. */
	side?: "top" | "bottom"
	/**
	 * Make the trigger reachable with the keyboard. Leave it off when the trigger already sits
	 * inside a button or link, which would otherwise read the tooltip as part of its name.
	 */
	focusable?: boolean
	className?: string
}

/**
 * A small CSS-only tooltip. Opens on hover and on keyboard focus, never covers its own trigger,
 * and is hidden from screen readers when the trigger is not focusable (the visible text and
 * labels around it already say the same thing).
 */
export default function Tip({ text, children, align = "center", side = "top", focusable = true, className = "" }: Props) {
	const id = React.useId()
	const root = React.useRef<HTMLSpanElement>(null)
	// Open toward the side that has room, whatever the caller asked for, so the bubble
	// is never cut off at the edge of a phone screen.
	const [fit, setFit] = React.useState<"start" | "center" | "end" | null>(null)
	const place = () => {
		const el = root.current
		if (!el || typeof window === "undefined") return
		const r = el.getBoundingClientRect()
		const room = 256 + 12
		const right = window.innerWidth - r.left
		const left = r.right
		const mid = (window.innerWidth - r.left - r.width / 2) > room / 2 && r.left + r.width / 2 > room / 2
		if (align === "end" && left >= room) return setFit("end")
		if (align === "start" && right >= room) return setFit("start")
		if (align === "center" && mid) return setFit("center")
		if (right >= room) return setFit("start")
		if (left >= room) return setFit("end")
		setFit("center")
	}
	const where = fit ?? align
	const position = where === "start" ? "left-0" : where === "end" ? "right-0" : "left-1/2 -translate-x-1/2"
	const edge = side === "top" ? "bottom-full mb-2" : "top-full mt-2"
	return (
		<span ref={root} onMouseEnter={place} onFocus={place} className={`group/tip relative inline-flex ${className}`}>
			<span
				tabIndex={focusable ? 0 : undefined}
				aria-describedby={focusable ? id : undefined}
				className="inline-flex cursor-help rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lab-ink"
			>
				{children}
			</span>
			<span
				id={id}
				role={focusable ? "tooltip" : undefined}
				aria-hidden={focusable ? undefined : true}
				className={`pointer-events-none absolute ${edge} ${position} z-30 hidden w-max max-w-[min(16rem,calc(100vw-1.5rem))] rounded-lg border border-lab-line-strong bg-lab-surface px-3 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-lab-ink shadow-[var(--lab-shadow)] group-focus-within/tip:block group-hover/tip:block`}
			>
				{text}
			</span>
		</span>
	)
}
