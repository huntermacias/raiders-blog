"use client"

import { useMemo } from "react"

import { NFL_LEAGUE } from "@/lib/playoffs/season"
import { teamByAbbr } from "@/lib/nfl"

const ORDER = ["AFC East", "AFC North", "AFC South", "AFC West", "NFC East", "NFC North", "NFC South", "NFC West"]

/** A plain select of the 32 teams, grouped by division, for choosing the team the page follows. */
export default function TeamPicker({ value, onChange, className = "" }: { value: string; onChange: (team: string) => void; className?: string }) {
	const groups = useMemo(() => {
		const by = new Map<string, { id: string; name: string }[]>()
		for (const t of NFL_LEAGUE.teams) {
			const list = by.get(t.division) ?? []
			list.push({ id: t.id, name: teamByAbbr(t.id).nick })
			by.set(t.division, list)
		}
		return ORDER.filter((d) => by.has(d)).map((d) => ({ division: d, teams: (by.get(d) ?? []).sort((a, b) => a.name.localeCompare(b.name)) }))
	}, [])
	return (
		<label className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-lab-line bg-lab-surface pl-3 pr-2 sm:pl-4 text-sm font-semibold text-lab-ink transition hover:border-lab-line-strong ${className}`}>
			<span className="hidden text-lab-muted sm:inline">Following</span>
			<select aria-label="Team to follow" value={value} onChange={(e) => onChange(e.target.value)} className="min-h-[40px] max-w-[11rem] cursor-pointer rounded-md border-0 bg-transparent py-0 pl-1 pr-7 text-sm font-bold text-lab-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lab-ink">
				{groups.map((g) => (
					<optgroup key={g.division} label={g.division}>
						{g.teams.map((t) => (
							<option key={t.id} value={t.id}>
								{t.name}
							</option>
						))}
					</optgroup>
				))}
			</select>
		</label>
	)
}
