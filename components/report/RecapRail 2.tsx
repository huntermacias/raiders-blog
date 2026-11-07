"use client"

import * as React from "react"

import type { Heading } from "@/lib/report/story"

/**
 * "In this recap": the headings of the writer's piece, the one being read marked. Under a phone-width screen it is a collapsed list above the
 * text; from large screens it sits beside the text and stays in view.
 */
export default function RecapRail({ headings, minutes }: { headings: Heading[]; minutes: number | null }) {
	const [active, setActive] = React.useState(headings[0]?.id ?? "")
	React.useEffect(() => {
		const els = headings.map((h) => document.getElementById(h.id)).filter((e): e is HTMLElement => !!e)
		if (!els.length || typeof IntersectionObserver === "undefined") return
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
			},
			{ rootMargin: "-140px 0px -70% 0px", threshold: 0 },
		)
		els.forEach((el) => io.observe(el))
		return () => io.disconnect()
	}, [headings])

	if (headings.length < 3) return null
	const list = (
		<ol className="space-y-0.5 text-sm">
			{headings.map((h) => (
				<li key={h.id} className={h.level === 3 ? "pl-4" : ""}>
					<a
						href={`#${h.id}`}
						aria-current={active === h.id ? "true" : undefined}
						className={`block rounded-md border-l-2 py-1.5 pl-3 pr-2 leading-snug transition-colors ${active === h.id ? "border-primary bg-muted/60 font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"} ${h.level === 3 ? "text-[13px]" : ""}`}
					>
						{h.text}
					</a>
				</li>
			))}
		</ol>
	)
	return (
		<>
			<details className="mb-8 rounded-2xl border border-border/70 bg-card p-4 lg:hidden">
				<summary className="cursor-pointer select-none text-sm font-semibold">
					In this recap <span className="font-normal text-muted-foreground">({headings.filter((h) => h.level === 2).length} sections{minutes ? `, ${minutes} min` : ""})</span>
				</summary>
				<div className="mt-3">{list}</div>
			</details>
			<aside aria-label="In this recap" className="sticky top-36 hidden max-h-[calc(100vh-10rem)] overflow-y-auto pr-2 lg:block">
				<p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">In this recap{minutes ? ` · ${minutes} min` : ""}</p>
				{list}
			</aside>
		</>
	)
}
