import Link from "@/components/SiteLink"
import { ArrowRight, Minus, TrendingDown, TrendingUp } from "lucide-react"

import { TeamBadge } from "@/components/rooting/parts"
import type { LabCopy, RootingSnapshot } from "@/lib/homeLab"
import type { LabTool } from "@/lib/lab/tools"
import { cn } from "@/lib/utils"

export type BandTool = { tool: LabTool; badges: string[] }

/**
 * The homepage's window into the Lab. The left panel is the one number that changes every week (the Raiders' playoff odds) and the
 * game elsewhere that moves it most, straight from the Rooting Guide; the right column is the tools that fit where the week is.
 * Server component, no state: the page works out the phase and hands everything in.
 */

function Change({ change }: { change: NonNullable<RootingSnapshot["change"]> }) {
	const Icon = change.dir === "up" ? TrendingUp : change.dir === "down" ? TrendingDown : Minus
	return (
		<span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
			<span
				className={cn(
					"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold tabular-nums",
					change.dir === "up" && "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
					change.dir === "down" && "border-rose-400/40 bg-rose-400/10 text-rose-300",
					change.dir === "flat" && "border-zinc-700 text-zinc-300"
				)}
			>
				<Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
				{change.text}
			</span>
			{change.since}
		</span>
	)
}

function Meter({ value }: { value: number }) {
	const pct = Math.max(0, Math.min(1, value)) * 100
	return (
		<div role="img" aria-label={`${Math.round(pct)} percent`} className="relative mt-4 h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
			<div className="h-full rounded-full bg-zinc-50" style={{ width: `${Math.max(pct, 1.5)}%` }} />
			{[25, 50, 75].map((t) => (
				<span key={t} aria-hidden className="absolute top-0 h-full w-px bg-[#09090b]/70" style={{ left: `${t}%` }} />
			))}
		</div>
	)
}

function OddsPanel({ s }: { s: RootingSnapshot }) {
	const settled = s.status !== "live"
	return (
		<div className="relative flex flex-col overflow-hidden rounded-2xl border border-[#27272a] bg-[#09090b] p-5 text-zinc-50 shadow-xl md:p-7">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0"
				style={{ background: "radial-gradient(60% 80% at 100% 0%, rgba(161,161,170,0.14) 0%, rgba(9,9,11,0) 60%)" }}
			/>
			<div className="relative flex-1">
				<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
					{s.nick} · chance to {s.goalPhrase}
				</p>
				<div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
					<p className="font-serif text-6xl font-bold leading-none tabular-nums md:text-7xl">{s.pct}</p>
					{s.change && <Change change={s.change} />}
				</div>
				{settled ? <p className="mt-3 max-w-md text-sm text-zinc-300">{s.headline}</p> : <Meter value={s.baseline} />}
				<p className="mt-2 text-xs text-zinc-500">
					A model estimate from the standings and the schedule left.{s.updating ? " A final score is still being worked in." : ""}
				</p>

				<div className="mt-6 border-t border-zinc-800 pt-5">
					<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Best game to root for{s.week ? ` · Week ${s.week}` : ""}</p>
					{s.best ? (
						<div className="mt-3 flex items-center gap-3">
							<TeamBadge abbr={s.best.rootFor} size={44} />
							<div className="min-w-0 flex-1">
								<p className="font-serif text-xl font-bold leading-tight">Root for the {s.best.forNick}</p>
								<p className="truncate text-sm text-zinc-400">{s.best.matchup}</p>
							</div>
							<span className="shrink-0 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-sm font-bold tabular-nums text-emerald-300">
								{s.best.gain}
								<span className="sr-only"> to the {s.nick}&rsquo; odds</span>
							</span>
						</div>
					) : s.own ? (
						<p className="mt-3 text-sm leading-relaxed text-zinc-300">
							No other game moves it much. The one that does is the {s.nick}&rsquo; own: a win is worth <span className="font-bold text-emerald-300">{s.own.win}</span>, a loss{" "}
							<span className="font-bold text-rose-300">{s.own.loss}</span>.
						</p>
					) : (
						<p className="mt-3 text-sm text-zinc-300">{settled ? "Nothing left on the schedule changes this." : "No game this week moves the odds by a point or more."}</p>
					)}
					{s.best?.small && <p className="mt-3 text-xs text-zinc-400">Not much moves the odds this week; this is the best of a small field.</p>}
					{s.best && s.own && (
						<p className="mt-3 text-xs text-zinc-400">
							A {s.nick} win over the {s.own.opp} is worth {s.own.win}; a loss, {s.own.loss}.
						</p>
					)}
				</div>
			</div>

			<Link
				href={s.href}
				className="relative mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-50 px-5 py-2.5 text-sm font-bold text-[#09090b] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] sm:w-auto sm:self-start"
			>
				{s.matters > 1 ? `See all ${s.matters} games that matter` : "Open the Rooting Guide"} <ArrowRight aria-hidden className="h-4 w-4" />
			</Link>
		</div>
	)
}

function ToolTile({ tool, badges }: BandTool) {
	return (
		<Link
			href={tool.href}
			className="group flex flex-1 flex-col justify-center rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<div className="flex items-start justify-between gap-3">
				<h3 className="font-serif text-lg font-bold leading-tight">{tool.title}</h3>
				<ArrowRight aria-hidden className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
			</div>
			<p className="mt-1 text-sm text-muted-foreground">{tool.short}</p>
			{badges.length > 0 && (
				<p className="mt-2 flex flex-wrap gap-1.5">
					{badges.map((b) => (
						<span
							key={b}
							className={cn(
								"rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]",
								b === "New" ? "bg-foreground text-background" : "border border-border text-muted-foreground"
							)}
						>
							{b}
						</span>
					))}
				</p>
			)}
		</Link>
	)
}

export default function LabBand({ copy, snapshot, tools }: { copy: LabCopy; snapshot: RootingSnapshot | null; tools: BandTool[] }) {
	if (!snapshot && tools.length === 0) return null
	return (
		<section aria-labelledby="home-lab" className="container pt-14">
			<div className="mb-6 flex items-end justify-between gap-4">
				<div className="min-w-0">
					<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">The Lab</p>
					<h2 id="home-lab" className="mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
						{copy.title}
					</h2>
					<p className="mt-1 max-w-xl text-sm text-muted-foreground">{copy.blurb}</p>
				</div>
				<Link href="/lab" className="shrink-0 text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
					All tools
				</Link>
			</div>

			<div className={cn("grid gap-4", snapshot && "lg:grid-cols-[1.15fr_1fr]")}>
				{snapshot && <OddsPanel s={snapshot} />}
				<div className={cn("flex flex-col gap-3", !snapshot && "sm:grid sm:grid-cols-3")}>
					{tools.map((t) => (
						<ToolTile key={t.tool.id} {...t} />
					))}
				</div>
			</div>
		</section>
	)
}
