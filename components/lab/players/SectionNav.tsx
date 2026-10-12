"use client"

import * as React from "react"

export type NavItem = { id: string; label: string }

/**
 * The page's sections as a bar that stays under the site header, with the one being read marked. Plain links to anchors, so it works
 * without script; the marker follows the scroll when script is there.
 */
export default function SectionNav({ items }: { items: NavItem[] }) {
	const [active, setActive] = React.useState(items[0]?.id ?? "")
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
	if (items.length < 3) return null
	return (
		<nav aria-label="On this page" className="sticky top-16 z-30 border-b border-lab-line bg-lab-page/90 backdrop-blur sm:top-24" data-testid="section-nav">
			<ul className="container m-0 flex list-none gap-1 overflow-x-auto p-0 py-2">
				{items.map((i) => (
					<li key={i.id} className="shrink-0">
						<a
							href={`#${i.id}`}
							aria-current={active === i.id ? "true" : undefined}
							className={`inline-block whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${active === i.id ? "bg-lab-ink text-lab-page" : "text-lab-soft hover:bg-lab-hover hover:text-lab-ink"}`}
						>
							{i.label}
						</a>
					</li>
				))}
			</ul>
		</nav>
	)
}
