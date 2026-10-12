"use client"

import * as React from "react"

import { trackPlayers } from "@/lib/lab/track"

export type GroupTab = { id: string; label: string; count: number; panel: React.ReactNode }

/**
 * Tabs for a list that comes in one piece per position ("Everyone", then each position that has something to show). Every panel is
 * rendered on the server so the content is on the page, and only the chosen one is visible.
 */
export default function GroupTabs({ tabs, label, event }: { tabs: GroupTab[]; label: string; event: string }) {
	const [id, setId] = React.useState(tabs[0]?.id ?? "")
	const base = React.useId()
	if (!tabs.length) return null
	const cur = tabs.find((t) => t.id === id) ?? tabs[0]
	const move = (e: React.KeyboardEvent, i: number) => {
		const to = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1
		if (to < 0) return
		e.preventDefault()
		setId(tabs[to].id)
		document.getElementById(`${base}-tab-${tabs[to].id}`)?.focus()
	}
	return (
		<div>
			<div role="tablist" aria-label={label} className="flex flex-wrap gap-1.5">
				{tabs.map((t, i) => (
					<button
						key={t.id}
						id={`${base}-tab-${t.id}`}
						type="button"
						role="tab"
						aria-selected={t.id === cur.id}
						aria-controls={`${base}-panel-${t.id}`}
						tabIndex={t.id === cur.id ? 0 : -1}
						onKeyDown={(e) => move(e, i)}
						onClick={() => {
							setId(t.id)
							trackPlayers(event, { group: t.id })
						}}
						className={`min-h-[36px] rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${t.id === cur.id ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong text-lab-soft hover:border-lab-ink hover:text-lab-ink"}`}
					>
						{t.label} <span className="font-mono opacity-70">{t.count}</span>
					</button>
				))}
			</div>
			{tabs.map((t) => (
				<div key={t.id} id={`${base}-panel-${t.id}`} role="tabpanel" aria-labelledby={`${base}-tab-${t.id}`} hidden={t.id !== cur.id} className="mt-4">
					{t.panel}
				</div>
			))}
		</div>
	)
}
