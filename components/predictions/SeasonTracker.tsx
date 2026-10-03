"use client"

import { useMemo, useState } from "react"

import { cn } from "@/lib/utils"
import { DIVISIONS, RAIDERS, teamInfo } from "@/lib/nfl"
import { SEASON_GAMES, type SeasonStatus, type SeasonTeamRow, seasonStanding } from "@/lib/predictions"
import { TeamChip } from "./TeamChip"
import { SeasonPill } from "./StatusPill"

type Props = { rows: SeasonTeamRow[]; isFinal: boolean }

const FILTERS = ["All", "AFC", "NFC", ...DIVISIONS] as const
type Filter = (typeof FILTERS)[number]

const SORTS = [
	{ id: "pick", label: "My predicted wins" },
	{ id: "now", label: "Current wins" },
	{ id: "az", label: "A to Z" },
] as const
type SortId = (typeof SORTS)[number]["id"]

function rec(w: number, l: number, t = 0) {
	return `${w}–${l}${t ? `–${t}` : ""}`
}

/**
 * 17 cells = 17 games. Wins fill from the LEFT, losses (and ties) from the
 * RIGHT, open games sit in the middle. The vertical tick is the pick: it sits
 * after `predictedWins` cells. A prediction is alive while the wins haven't
 * crossed the tick and the losses haven't crossed it from the other side; a
 * perfect call ends with the two bars meeting exactly at the tick.
 */
function PaceBar({ wins, losses, ties, predictedWins }: { wins: number; losses: number; ties: number; predictedWins: number | null }) {
	const cells = Array.from({ length: SEASON_GAMES }, (_, i) => {
		if (i < wins) return "win" as const
		if (i >= SEASON_GAMES - losses) return "loss" as const
		if (i >= SEASON_GAMES - losses - ties) return "tie" as const
		return "open" as const
	})
	const remaining = Math.max(0, SEASON_GAMES - wins - losses - ties)
	const label = `${wins} win${wins === 1 ? "" : "s"}, ${losses} loss${losses === 1 ? "" : "es"}${ties ? `, ${ties} tie${ties === 1 ? "" : "s"}` : ""}, ${remaining} to play${
		predictedWins === null ? "" : `. Pick: ${predictedWins} wins`
	}`

	return (
		<div role="img" aria-label={label} className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${SEASON_GAMES}, minmax(0, 1fr))` }}>
			{cells.map((kind, i) => (
				<span
					key={i}
					className={cn(
						"relative h-3 rounded-[3px]",
						kind === "win" && "bg-foreground",
						kind === "loss" &&
							"border border-muted-foreground/50 bg-[repeating-linear-gradient(135deg,hsl(var(--muted-foreground)/0.55)_0_2px,transparent_2px_5px)]",
						kind === "tie" && "bg-muted-foreground/60",
						kind === "open" && "bg-secondary"
					)}
				>
					{predictedWins !== null && i === predictedWins && (
						<span aria-hidden className="absolute -bottom-1.5 -left-[2px] -top-1.5 z-10 w-0.5 rounded-full bg-foreground ring-1 ring-background" />
					)}
					{predictedWins === SEASON_GAMES && i === SEASON_GAMES - 1 && (
						<span aria-hidden className="absolute -bottom-1.5 -right-[2px] -top-1.5 z-10 w-0.5 rounded-full bg-foreground ring-1 ring-background" />
					)}
				</span>
			))}
		</div>
	)
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				"shrink-0 rounded-full border px-3 py-1 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				active ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground"
			)}
		>
			{children}
		</button>
	)
}

const SUMMARY_ORDER: { status: SeasonStatus; label: string }[] = [
	{ status: "hit", label: "Nailed it" },
	{ status: "close", label: "Off by one" },
	{ status: "alive", label: "Still alive" },
	{ status: "over", label: "Too many wins" },
	{ status: "under", label: "Too many losses" },
	{ status: "miss", label: "Missed" },
	{ status: "none", label: "No pick" },
]

export default function SeasonTracker({ rows, isFinal }: Props) {
	const [filter, setFilter] = useState<Filter>("All")
	const [sort, setSort] = useState<SortId>("pick")

	const enriched = useMemo(
		() =>
			rows.map((r) => ({
				row: r,
				info: teamInfo(r.team),
				standing: seasonStanding(r, isFinal),
			})),
		[rows, isFinal]
	)

	const counts = useMemo(() => {
		const c: Record<SeasonStatus, number> = { none: 0, alive: 0, over: 0, under: 0, hit: 0, close: 0, miss: 0 }
		for (const e of enriched) c[e.standing.status]++
		return c
	}, [enriched])

	const visible = enriched
		.filter((e) => filter === "All" || e.info.conference === filter || e.info.division === filter)
		.sort((a, b) => {
			if (sort === "az") return a.info.nick.localeCompare(b.info.nick)
			if (sort === "now") {
				return b.standing.wins - a.standing.wins || a.standing.losses - b.standing.losses || a.info.nick.localeCompare(b.info.nick)
			}
			// "pick": most predicted wins first, teams without a pick last
			const pa = a.standing.predictedWins ?? -1
			const pb = b.standing.predictedWins ?? -1
			return pb - pa || a.info.nick.localeCompare(b.info.nick)
		})

	return (
		<div>
			{/* Status tally */}
			<ul className="mb-5 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
				{SUMMARY_ORDER.filter((s) => counts[s.status] > 0).map((s) => (
					<li key={s.status} className="inline-flex items-center gap-1.5">
						<strong className="font-serif text-lg font-bold tabular-nums">{counts[s.status]}</strong>
						<span className="text-muted-foreground">{s.label}</span>
					</li>
				))}
			</ul>

			{/* Controls */}
			<div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-1 md:flex-wrap md:overflow-visible md:px-0" role="group" aria-label="Filter teams">
					{FILTERS.map((f) => (
						<Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
							{f}
						</Chip>
					))}
				</div>
				<label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
					<span className="shrink-0">Sort by</span>
					<select
						value={sort}
						onChange={(e) => setSort(e.target.value as SortId)}
						className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{SORTS.map((s) => (
							<option key={s.id} value={s.id}>
								{s.label}
							</option>
						))}
					</select>
				</label>
			</div>

			{/* Legend for the pace bar */}
			<div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
				<span className="inline-flex items-center gap-1.5">
					<span aria-hidden className="h-3 w-3 rounded-[3px] bg-foreground" /> Win
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span aria-hidden className="h-3 w-3 rounded-[3px] border border-muted-foreground/50 bg-[repeating-linear-gradient(135deg,hsl(var(--muted-foreground)/0.55)_0_2px,transparent_2px_5px)]" /> Loss
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span aria-hidden className="h-3 w-3 rounded-[3px] bg-secondary" /> Still to play
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span aria-hidden className="h-4 w-0.5 rounded-full bg-foreground" /> My pick (wins must end here)
				</span>
			</div>

			<ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
				{visible.map(({ row, info, standing }) => {
					const isRaiders = info.name === RAIDERS
					return (
						<li key={row._key ?? row.team} className={cn("rounded-lg border bg-card p-4", isRaiders ? "border-foreground/50 ring-1 ring-foreground/15" : "border-border/70")}>
							<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
								<TeamChip team={info.name} />
								<div className="min-w-0 flex-1">
									<p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold leading-tight">
										{info.nick}
										{row.divisionWinner && (
											<span className="rounded border border-border px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Div. winner</span>
										)}
										{row.playoffs && (
											<span className="rounded border border-border px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Playoffs</span>
										)}
									</p>
									<p className="text-xs text-muted-foreground">{info.division}</p>
								</div>
								<div className="flex items-center gap-4 text-right">
									<div>
										<p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">My pick</p>
										<p className="font-serif text-lg font-bold tabular-nums">
											{standing.predictedWins === null ? "—" : rec(standing.predictedWins, standing.predictedLosses as number)}
										</p>
									</div>
									<div>
										<p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Now</p>
										<p className="font-serif text-lg font-bold tabular-nums">{rec(standing.wins, standing.losses, standing.ties)}</p>
									</div>
								</div>
							</div>

							<div className="mt-4">
								<PaceBar wins={standing.wins} losses={standing.losses} ties={standing.ties} predictedWins={standing.predictedWins} />
							</div>

							<div className="mt-3 flex flex-wrap items-center justify-between gap-2">
								<p className="text-xs text-muted-foreground">{standing.detail}</p>
								<SeasonPill status={standing.status} label={standing.label} />
							</div>

							{row.note && <p className="mt-2 text-xs italic text-muted-foreground">&ldquo;{row.note}&rdquo;</p>}
						</li>
					)
				})}
			</ul>

			{visible.length === 0 && <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">No teams match that filter.</div>}
		</div>
	)
}
