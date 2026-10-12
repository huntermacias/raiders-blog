"use client"

import * as React from "react"
import SectionIcon, { keyOf } from "@/components/lab/players/SectionIcon"

export type NavItem = { id: string; label: string }

/**
 * The page's sections as a bar that stays under the site header. The section being read is filled in the team's color, a thin line
 * under the bar fills as the page is read, and a counter says where you are. Plain links to anchors, so it works without script; the
 * marker, the line and the sideways scroll that keeps the current chip in view all follow the page when script is there.
 */
export default function SectionNav({ items }: { items: NavItem[] }) {
	const [active, setActive] = React.useState(items[0]?.id ?? "")
	const listRef = React.useRef<HTMLUListElement>(null)
	const lineRef = React.useRef<HTMLSpanElement>(null)
	const [edges, setEdges] = React.useState({ left: false, right: false })

	React.useEffect(() => {
		if (typeof IntersectionObserver === "undefined") return
		const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e)
		if (!els.length) return
		const seen = new Map<string, number>()
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting) seen.set(e.target.id, e.boundingClientRect.top)
					else seen.delete(e.target.id)
				}
				if (!seen.size) return
				const top = Array.from(seen.entries()).sort((a, b) => a[1] - b[1])[0][0]
				setActive(top)
			},
			{ rootMargin: "-140px 0px -60% 0px", threshold: 0 },
		)
		els.forEach((e) => io.observe(e))
		return () => io.disconnect()
	}, [items])

	// How far down the sections the reader is, from the top of the first to the bottom of the last.
	React.useEffect(() => {
		const first = document.getElementById(items[0]?.id ?? "")
		const last = document.getElementById(items[items.length - 1]?.id ?? "")
		if (!first || !last) return
		let raf = 0
		const draw = () => {
			raf = 0
			const top = first.getBoundingClientRect().top + window.scrollY
			const end = last.getBoundingClientRect().bottom + window.scrollY - window.innerHeight
			const span = Math.max(1, end - top)
			const v = Math.min(1, Math.max(0, (window.scrollY - top + 160) / span))
			if (lineRef.current) lineRef.current.style.transform = `scaleX(${v})`
		}
		const on = () => {
			if (!raf) raf = requestAnimationFrame(draw)
		}
		draw()
		window.addEventListener("scroll", on, { passive: true })
		window.addEventListener("resize", on)
		return () => {
			window.removeEventListener("scroll", on)
			window.removeEventListener("resize", on)
			if (raf) cancelAnimationFrame(raf)
		}
	}, [items])

	// Keep the current chip in view inside the bar (never scrolls the page itself).
	React.useEffect(() => {
		const list = listRef.current
		if (!list) return
		const chip = list.querySelector<HTMLElement>('[aria-current="true"]')
		if (!chip) return
		const left = chip.offsetLeft - list.clientWidth / 2 + chip.clientWidth / 2
		const to = Math.max(0, left)
		if (typeof list.scrollTo === "function") list.scrollTo({ left: to, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
		else list.scrollLeft = to
	}, [active])

	// Fades on the sides only where more chips are hidden.
	React.useEffect(() => {
		const list = listRef.current
		if (!list) return
		const read = () => setEdges({ left: list.scrollLeft > 4, right: list.scrollLeft + list.clientWidth < list.scrollWidth - 4 })
		read()
		list.addEventListener("scroll", read, { passive: true })
		window.addEventListener("resize", read)
		return () => {
			list.removeEventListener("scroll", read)
			window.removeEventListener("resize", read)
		}
	}, [items])

	if (items.length < 3) return null
	const at = Math.max(0, items.findIndex((i) => i.id === active))
	return (
		<nav aria-label="On this page" className="sticky top-16 z-30 border-b border-lab-line bg-lab-page/90 backdrop-blur sm:top-24" data-testid="section-nav">
			<div className="container relative flex items-center gap-3">
				<div className="relative min-w-0 flex-1">
					<ul ref={listRef} className="m-0 flex list-none gap-1.5 overflow-x-auto p-0 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						{items.map((i) => {
							const on = active === i.id
							return (
								<li key={i.id} className="shrink-0">
									<a
										href={`#${i.id}`}
										aria-current={on ? "true" : undefined}
										className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${on ? "shadow-sm" : "text-lab-soft hover:bg-lab-hover hover:text-lab-ink"}`}
										style={on ? { background: "var(--pc-accent)", color: "var(--pc-on)" } : undefined}
									>
										<SectionIcon name={keyOf(i.id)} className="h-3.5 w-3.5" />
										{i.label}
									</a>
								</li>
							)
						})}
					</ul>
					{edges.left ? <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-lab-page to-transparent" /> : null}
					{edges.right ? <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-lab-page to-transparent" /> : null}
				</div>
				<p className="m-0 hidden shrink-0 font-mono text-[11px] font-semibold tabular-nums text-lab-muted lg:block" aria-hidden="true">
					<span className="text-lab-ink">{String(at + 1).padStart(2, "0")}</span> / {String(items.length).padStart(2, "0")}
				</p>
			</div>
			<span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-transparent">
				<span ref={lineRef} className="block h-full origin-left" style={{ background: "var(--pc-accent)", transform: "scaleX(0)" }} />
			</span>
		</nav>
	)
}
