"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowRight, ArrowUp, Minus, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import { DIVISIONS, RAIDERS, teamInfo } from "@/lib/nfl"
import { type RankRow, type RankingsWeek, biggestMovers, movementWords, raidersRow } from "@/lib/rankings"
import { TeamChip } from "@/components/predictions/TeamChip"

export type Records = Record<string, { w: number; l: number; t: number }>

type Props = {
	/** Oldest to newest. */
	boards: RankingsWeek[]
	records?: Records
	season: number
}

const FILTERS = ["All", "AFC", "NFC", ...DIVISIONS] as const
type Filter = (typeof FILTERS)[number]

function recText(r?: { w: number; l: number; t: number }) {
	if (!r) return null
	return `${r.w}–${r.l}${r.t ? `–${r.t}` : ""}`
}

/**
 * Movement is never colour alone: an arrow icon AND the number of spots, or
 * a plain dash / "New" word when there is nothing to compare to.
 */
function Move({ row, hasPrev, dark = false }: { row: RankRow; hasPrev: boolean; dark?: boolean }) {
	if (!hasPrev) return <span className="sr-only">First week of rankings</span>

	if (row.change === null) {
		return (
			<span
				className={cn(
					"inline-flex items-center gap-1 text-xs font-semibold",
					dark ? "text-zinc-400" : "text-muted-foreground"
				)}
			>
				<Sparkles aria-hidden className="h-3.5 w-3.5" /> New
			</span>
		)
	}

	const up = row.change > 0
	const flat = row.change === 0
	const Icon = flat ? Minus : up ? ArrowUp : ArrowDown
	const tone = flat
		? dark
			? "text-zinc-400"
			: "text-muted-foreground"
		: up
			? dark
				? "text-emerald-400"
				: "text-emerald-700 dark:text-emerald-400"
			: dark
				? "text-rose-400"
				: "text-rose-700 dark:text-rose-400"

	return (
		<span className={cn("inline-flex items-center gap-0.5 text-sm font-bold tabular-nums", tone)}>
			<Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
			{flat ? <span className="sr-only">No change</span> : Math.abs(row.change)}
			{!flat && <span className="sr-only">{up ? " spots up" : " spots down"}</span>}
		</span>
	)
}

/** Rank history. No. 1 is at the top, so a line going up means a team rising. */
function Sparkline({ history, width = 72, height = 24, className }: { history: (number | null)[]; width?: number; height?: number; className?: string }) {
	const pts = history.map((r, i) => (r === null ? null : { i, r }))
	const real = pts.filter((p): p is { i: number; r: number } => p !== null)
	if (real.length < 2) return null

	const pad = 3
	const x = (i: number) => pad + (i / Math.max(1, history.length - 1)) * (width - pad * 2)
	const y = (r: number) => pad + ((r - 1) / 31) * (height - pad * 2)

	const d = real.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)} ${y(p.r).toFixed(1)}`).join(" ")
	const last = real[real.length - 1]
	const label = `Rank by week: ${history.map((r) => (r === null ? "unranked" : r)).join(", ")}`

	return (
		<svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={cn("overflow-visible", className)}>
			<path d={d} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
			<circle cx={x(last.i)} cy={y(last.r)} r={2.75} fill="currentColor" />
		</svg>
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

function MoverList({ title, items, kind }: { title: string; items: { team: string; rank: number; change: number }[]; kind: "up" | "down" }) {
	if (items.length === 0) return null
	return (
		<div className="rounded-xl border border-border bg-card p-4 shadow-sm">
			<p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
				{kind === "up" ? <ArrowUp aria-hidden className="h-3.5 w-3.5" strokeWidth={3} /> : <ArrowDown aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />}
				{title}
			</p>
			<ul className="space-y-1.5">
				{items.map((m) => (
					<li key={m.team} className="flex items-center justify-between gap-3 text-sm">
						<span className="flex min-w-0 items-center gap-2">
							<TeamChip team={m.team} />
							<span className={cn("truncate", m.team === RAIDERS && "font-bold")}>{teamInfo(m.team).nick}</span>
						</span>
						<span className="shrink-0 tabular-nums text-muted-foreground">
							No. {m.rank} <span className="font-semibold text-foreground">({kind === "up" ? "+" : "-"}{Math.abs(m.change)})</span>
						</span>
					</li>
				))}
			</ul>
		</div>
	)
}

export default function RankingsBoard({ boards, records, season }: Props) {
	const latest = boards[boards.length - 1]
	const [week, setWeek] = useState<number>(latest?.week ?? 0)
	const [filter, setFilter] = useState<Filter>("All")

	const board = boards.find((b) => b.week === week) ?? latest
	const hasPrev = board ? board.rows.some((r) => r.history.length > 1) : false

	const rows = useMemo(() => {
		if (!board) return []
		return board.rows.filter((r) => {
			if (filter === "All") return true
			const t = teamInfo(r.team)
			return filter === t.conference || filter === t.division
		})
	}, [board, filter])

	const movers = useMemo(() => (board ? biggestMovers(board.rows) : { risers: [], fallers: [] }), [board])
	const lv = board ? raidersRow(board.rows) : null

	if (!board) return null

	const lvRanks = (lv?.history ?? []).filter((r): r is number => r !== null)
	const best = lvRanks.length ? Math.min(...lvRanks) : null
	const worst = lvRanks.length ? Math.max(...lvRanks) : null
	const weeksDesc = boards.slice().reverse()

	return (
		<div>
			{/* Raiders strip */}
			{lv && (
				<section aria-label="Raiders ranking" className="overflow-hidden rounded-2xl border border-[#27272a] bg-[#09090b] text-zinc-50 shadow-lg">
					<div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5 p-6 md:p-8">
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Las Vegas Raiders · Week {board.week}</p>
							<div className="mt-1 flex items-baseline gap-4">
								<p className="font-serif text-6xl font-bold leading-none tracking-tight md:text-7xl">No. {lv.rank}</p>
								<div className="flex flex-col gap-0.5">
									<Move row={lv} hasPrev={hasPrev} dark />
									{lv.change !== null && <span className="text-xs text-zinc-400">{movementWords(lv.change)} from last week</span>}
								</div>
							</div>
							{lv.note && <p className="mt-3 max-w-md text-sm text-zinc-300">{lv.note}</p>}
						</div>

						{lvRanks.length >= 2 && (
							<div className="min-w-[10rem] text-zinc-100">
								<p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Rank by week</p>
								<Sparkline history={lv.history} width={220} height={56} />
								<p className="mt-1 text-xs text-zinc-400">
									Best No. {best} · Low No. {worst}
								</p>
							</div>
						)}
					</div>
				</section>
			)}

			{/* Controls */}
			<div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-1 md:flex-wrap md:overflow-visible md:px-0 md:pb-0" role="group" aria-label="Filter teams">
					{FILTERS.map((f) => (
						<Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
							{f}
						</Chip>
					))}
				</div>
				{boards.length > 1 && (
					<label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
						<span className="font-semibold">Week</span>
						<select
							value={board.week}
							onChange={(e) => setWeek(Number(e.target.value))}
							className="rounded-md border border-border bg-background px-2 py-1.5 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{weeksDesc.map((b) => (
								<option key={b.week} value={b.week}>
									{b.week === latest.week ? `Week ${b.week} (latest)` : `Week ${b.week}`}
								</option>
							))}
						</select>
					</label>
				)}
			</div>

			{/* Movers */}
			{filter === "All" && (movers.risers.length > 0 || movers.fallers.length > 0) && (
				<div className="mt-6 grid gap-4 md:grid-cols-2">
					<MoverList title="Biggest risers" items={movers.risers} kind="up" />
					<MoverList title="Biggest fallers" items={movers.fallers} kind="down" />
				</div>
			)}

			{/* Full list */}
			<ol className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm" aria-label={`Week ${board.week} power rankings`}>
				{rows.map((r) => {
					const isLV = r.team === RAIDERS
					const t = teamInfo(r.team)
					const rec = recText(records?.[r.team])
					return (
						<li
							key={r.team}
							value={r.rank}
							className={cn("grid grid-cols-[2.5rem_1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 md:grid-cols-[3rem_4.5rem_minmax(0,1fr)_4rem_5.5rem] md:gap-x-4", isLV && "bg-muted/60")}
						>
							<span className="font-serif text-2xl font-bold tabular-nums leading-none md:text-3xl">{r.rank}</span>

							{/* Desktop: movement column */}
							<span className="hidden md:block">
								<Move row={r} hasPrev={hasPrev} />
							</span>

							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
									<TeamChip team={r.team} />
									<span className={cn("font-semibold", isLV && "font-extrabold")}>{t.name}</span>
									{isLV && <span className="rounded bg-foreground px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-background">Us</span>}
								</div>
								{r.note && <p className="mt-1 text-sm text-muted-foreground">{r.note}</p>}
								{/* Mobile: movement + record under the name */}
								<div className="mt-1 flex items-center gap-3 md:hidden">
									<Move row={r} hasPrev={hasPrev} />
									{rec && <span className="text-xs tabular-nums text-muted-foreground">{rec}</span>}
								</div>
							</div>

							<span className="hidden text-right text-sm tabular-nums text-muted-foreground md:block">{rec}</span>

							<span className="justify-self-end text-muted-foreground">
								<Sparkline history={r.history} />
							</span>
						</li>
					)
				})}
			</ol>

			{board.post && (
				<p className="mt-6">
					<Link href={`/post/${board.post.slug}`} className="inline-flex items-center gap-1.5 font-semibold underline-offset-4 hover:underline">
						Read the Week {board.week} rankings write-up <ArrowRight aria-hidden className="h-4 w-4" />
					</Link>
				</p>
			)}
			<p className="mt-4 text-xs text-muted-foreground">
				{season} season. Rankings are my own opinion, updated weekly; the little line shows each team's rank week by week with No. 1 at the top.
			</p>
		</div>
	)
}
