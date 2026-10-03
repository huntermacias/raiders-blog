"use client"

import { useMemo, useState } from "react"

import { cn } from "@/lib/utils"
import { type GamePrediction, involvesRaiders, isFinal } from "@/lib/predictions"
import GamePickCard from "./GamePickCard"

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				"rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				active ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground"
			)}
		>
			{children}
		</button>
	)
}

export default function PicksFeed({ picks }: { picks: GamePrediction[] }) {
	const [raidersOnly, setRaidersOnly] = useState(false)

	const raidersCount = useMemo(() => picks.filter(involvesRaiders).length, [picks])
	const visible = raidersOnly ? picks.filter(involvesRaiders) : picks

	const upcoming = visible
		.filter((p) => !isFinal(p))
		.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
	const graded = visible
		.filter(isFinal)
		.sort((a, b) => new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime())

	return (
		<div>
			<div className="mb-6 flex flex-wrap items-center gap-2" role="group" aria-label="Filter picks">
				<Chip active={!raidersOnly} onClick={() => setRaidersOnly(false)}>
					All games ({picks.length})
				</Chip>
				<Chip active={raidersOnly} onClick={() => setRaidersOnly(true)}>
					Raiders games ({raidersCount})
				</Chip>
			</div>

			{visible.length === 0 && (
				<div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
					No picks yet. They show up here as soon as they&rsquo;re published.
				</div>
			)}

			{upcoming.length > 0 && (
				<div className="mb-10">
					<h3 className="mb-4 font-serif text-xl font-bold tracking-tight">Up next</h3>
					<div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
						{upcoming.map((p) => (
							<GamePickCard key={p._id} pick={p} />
						))}
					</div>
				</div>
			)}

			{graded.length > 0 && (
				<div>
					<h3 className="mb-4 font-serif text-xl font-bold tracking-tight">Graded picks</h3>
					<div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
						{graded.map((p) => (
							<GamePickCard key={p._id} pick={p} />
						))}
					</div>
				</div>
			)}
		</div>
	)
}
