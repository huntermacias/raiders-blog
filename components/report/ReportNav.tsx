"use client"

import * as React from "react"

export type NavSection = { id: string; label: string }

/**
 * The bar that stays under the site header while a report is read: a chip for each part (the recap, the win probability, the numbers, the
 * drives, the players), the one on screen filled in, and a thin line along the bottom that fills as the recap is read. Plain anchors, so it
 * works without script; the script only lights up the current chip and draws the line.
 */
export default function ReportNav({ sections, progressFor, label = "Parts of this report", containerClass = "container max-w-6xl" }: { sections: NavSection[]; progressFor?: string; /** What the bar is for, read out to screen readers. */ label?: string; /** The width the chips line up with. */ containerClass?: string }) {
	const [active, setActive] = React.useState(sections[0]?.id ?? "")
	const [progress, setProgress] = React.useState(0)
	const bar = React.useRef<HTMLDivElement>(null)

	React.useEffect(() => {
		const els = sections.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e)
		if (!els.length || typeof IntersectionObserver === "undefined") return
		const visible = new Map<string, number>()
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top)
					else visible.delete(e.target.id)
				}
				// The section highest on the screen among those in the reading band.
				const top = Array.from(visible.entries()).sort((a, b) => a[1] - b[1])[0]
				if (top) setActive(top[0])
			},
			{ rootMargin: "-120px 0px -55% 0px", threshold: 0 },
		)
		els.forEach((el) => io.observe(el))
		return () => io.disconnect()
	}, [sections])

	React.useEffect(() => {
		const el = progressFor ? document.getElementById(progressFor) : null
		if (!el) return
		let frame = 0
		const update = () => {
			frame = 0
			const r = el.getBoundingClientRect()
			const total = r.height - window.innerHeight * 0.5
			setProgress(total <= 0 ? 0 : Math.min(1, Math.max(0, (-r.top + 120) / total)))
		}
		const onScroll = () => {
			if (!frame) frame = window.requestAnimationFrame(update)
		}
		update()
		window.addEventListener("scroll", onScroll, { passive: true })
		window.addEventListener("resize", onScroll)
		return () => {
			window.removeEventListener("scroll", onScroll)
			window.removeEventListener("resize", onScroll)
			if (frame) window.cancelAnimationFrame(frame)
		}
	}, [progressFor])

	// Keep the chip that is on screen visible inside the bar on a phone, without moving the page.
	React.useEffect(() => {
		const host = bar.current
		const chip = host?.querySelector<HTMLElement>(`[data-chip="${active}"]`)
		if (!host || !chip) return
		const left = chip.offsetLeft - host.clientWidth / 2 + chip.clientWidth / 2
		host.scrollTo?.({ left, behavior: "smooth" })
	}, [active])

	return (
		<div className="sticky top-16 z-30 border-b border-border/70 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75" data-testid="report-nav">
			<nav aria-label={label} className={containerClass}>
				<div ref={bar} className="-mx-1 flex gap-1 overflow-x-auto px-1 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					{sections.map((s) => (
						<a
							key={s.id}
							href={`#${s.id}`}
							data-chip={s.id}
							aria-current={active === s.id ? "true" : undefined}
							className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${active === s.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
						>
							{s.label}
						</a>
					))}
				</div>
			</nav>
			<div className="h-0.5 w-full bg-transparent" aria-hidden>
				{progressFor ? <div className="h-full origin-left bg-primary transition-transform duration-150" style={{ transform: `scaleX(${progress})` }} /> : null}
			</div>
		</div>
	)
}
