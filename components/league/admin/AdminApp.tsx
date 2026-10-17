"use client"

import * as React from "react"

import { AuditPanel } from "./AuditPanel"
import { GamesPanel } from "./GamesPanel"
import { MembersPanel } from "./MembersPanel"
import { OverviewPanel } from "./OverviewPanel"
import { RulesPanel } from "./RulesPanel"

const TABS = [
	{ id: "overview", label: "Overview", Panel: OverviewPanel },
	{ id: "games", label: "Games", Panel: GamesPanel },
	{ id: "members", label: "Members", Panel: MembersPanel },
	{ id: "rules", label: "Rules", Panel: RulesPanel },
	{ id: "audit", label: "Audit log", Panel: AuditPanel },
] as const

export function AdminApp() {
	const [tab, setTab] = React.useState<(typeof TABS)[number]["id"]>("overview")
	const refs = React.useRef<Record<string, HTMLButtonElement | null>>({})
	const move = (dir: 1 | -1) => {
		const i = TABS.findIndex((t) => t.id === tab)
		const next = TABS[(i + dir + TABS.length) % TABS.length]
		setTab(next.id)
		refs.current[next.id]?.focus()
	}
	return (
		<div>
			<div role="tablist" aria-label="Admin sections" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" onKeyDown={(e) => (e.key === "ArrowRight" ? (e.preventDefault(), move(1)) : e.key === "ArrowLeft" ? (e.preventDefault(), move(-1)) : null)}>
				{TABS.map((t) => (
					<button key={t.id} ref={(el) => void (refs.current[t.id] = el)} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"}`}>
						{t.label}
					</button>
				))}
			</div>
			{TABS.map((t) => (
				<div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} tabIndex={0} hidden={tab !== t.id} className="mt-4 focus:outline-none">
					{tab === t.id && <t.Panel />}
				</div>
			))}
		</div>
	)
}
