"use client"

import { useRouter } from "next/navigation"

import Link from "@/components/SiteLink"
import TeamPicker from "@/components/playoffs/TeamPicker"
import { trackRooting } from "@/lib/analytics"
import type { GoalSummary } from "@/lib/rooting/view"
import { guidePath, type Scope } from "@/lib/rooting/share"
import type { Goal } from "@/lib/rooting/types"

type Props = {
	team: string
	goal: Goal
	scope: Scope
	week: number | null
	goals: GoalSummary[]
	/** How many games matter this week and how many in all, for the scope toggle's labels. */
	counts: { week: number; all: number }
	color: string
}

const tile = "relative flex min-h-[76px] flex-1 flex-col justify-center rounded-xl border px-3.5 py-2.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lab-ink"

/** The team picker, the three goals (each with the team's chance) and the week / all-games switch. Every choice is a link to a URL, so it can be shared. */
export default function RootingControls({ team, goal, scope, week, goals, counts, color }: Props) {
	const router = useRouter()
	const href = (over: Partial<{ team: string; goal: Goal; scope: Scope }>) => guidePath({ team: over.team ?? team, goal: over.goal ?? goal, week, scope: over.scope ?? scope })

	return (
		<div className="grid gap-4">
			<div className="flex flex-wrap items-center gap-3">
				<TeamPicker
					value={team}
					onChange={(next) => {
						trackRooting("rooting_team_selected", { team: next })
						router.push(href({ team: next }), { scroll: false })
					}}
				/>
				<p className="m-0 text-xs text-lab-muted">Pick any of the 32 teams. The link updates, so you can share it.</p>
			</div>

			<div role="group" aria-label="What you are rooting for" className="grid gap-2 sm:grid-cols-3">
				{goals.map((g) => {
					const on = g.goal === goal
					return (
						<Link
							key={g.goal}
							href={href({ goal: g.goal })}
							scroll={false}
							aria-current={on ? "true" : undefined}
							onClick={() => {
								if (!on) trackRooting("rooting_goal_changed", { goal: g.goal })
							}}
							className={`${tile} ${on ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line bg-lab-surface text-lab-ink hover:border-lab-line-strong hover:bg-lab-tint"}`}
							style={on ? { boxShadow: `inset 4px 0 0 ${color}` } : undefined}
						>
							<span className={`text-[11px] font-bold uppercase tracking-[0.14em] ${on ? "opacity-80" : "text-lab-muted"}`}>{g.label}</span>
							<span className="mt-1 font-serif text-3xl font-bold leading-none tabular-nums">{g.text}</span>
						</Link>
					)
				})}
			</div>

			<div role="group" aria-label="Which games" className="inline-flex w-full max-w-md overflow-hidden rounded-lg border border-lab-line-strong text-sm font-semibold sm:w-auto">
				{(
					[
						{ id: "week" as const, label: week ? `Week ${week}` : "This week", n: counts.week },
						{ id: "all" as const, label: "All remaining games", n: counts.all },
					] as const
				).map((s) => (
					<Link
						key={s.id}
						href={href({ scope: s.id })}
						scroll={false}
						aria-current={scope === s.id ? "true" : undefined}
						onClick={() => {
							if (scope !== s.id) trackRooting("rooting_scope_changed", { scope: s.id })
						}}
						className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 px-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-lab-ink ${scope === s.id ? "bg-lab-ink text-lab-page" : "bg-lab-surface text-lab-ink hover:bg-lab-tint"}`}
					>
						{s.label}
						<span className={`rounded-full px-1.5 py-0.5 font-mono text-[11px] ${scope === s.id ? "bg-lab-page/20" : "bg-lab-tint text-lab-soft"}`}>{s.n}</span>
					</Link>
				))}
			</div>
		</div>
	)
}
