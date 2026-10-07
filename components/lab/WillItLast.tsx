"use client"

import * as React from "react"
import { Check, Link2, Minus, Pause, Play, RotateCcw, TrendingDown, TrendingUp } from "lucide-react"

import CardFigure from "@/components/lab/CardFigure"
import { LAB } from "@/lib/lab/theme"
import {
	type Analysis,
	type CheckRow,
	DEFAULT_FILTER,
	type Filter,
	type Meta,
	type Table,
	abbrOf,
	analyze,
	fifthName,
	formatStat,
	ordinalOf,
	pctText,
	recordText,
	seasonGames,
	seasonOf,
	teamLabel,
	teamName,
} from "@/lib/lab/historyKit"

/** How long the dots take to travel from the first games to the rest of the season. */
const DURATION_MS = 4200
const SITE_URL = "https://www.raidersrundown.com"
const PAGE_PATH = "/lab/will-it-last"
/** The most teams listed in the table under the chart. */
const TABLE_LIMIT = 300
/** The checklist shows this many stats before "Show every stat". */
const CHECK_LIMIT = 8

function usePrefersReducedMotion() {
	const [reduced, setReduced] = React.useState(false)
	React.useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return
		const q = window.matchMedia("(prefers-reduced-motion: reduce)")
		setReduced(q.matches)
		const on = () => setReduced(q.matches)
		q.addEventListener?.("change", on)
		return () => q.removeEventListener?.("change", on)
	}, [])
	return reduced
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
/** Spread of an index over 0 to 1 that never repeats, so dots do not line up in stripes. */
const spread = (i: number, k: number) => (i * k) % 1
const GOLDEN = 0.6180339887
const SILVER = 0.7548776662

/** A circle as path text, so hundreds of them cost one element. */
const circle = (x: number, y: number, r: number) => `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`

function verdictColor(id: Analysis["verdict"]["id"]): string {
	if (id === "fade") return LAB.opp
	if (id === "improve") return LAB.scrimmage
	return LAB.inkSoft
}

function VerdictIcon({ id }: { id: Analysis["verdict"]["id"] }) {
	const cls = "h-4 w-4"
	if (id === "fade" || id === "linger") return <TrendingDown className={cls} aria-hidden />
	if (id === "improve" || id === "hold") return <TrendingUp className={cls} aria-hidden />
	return <Minus className={cls} aria-hidden />
}

/** The playoff marker used in the legend, the chips and the tooltip: filled for a playoff team, hollow for one that missed. */
function PlayoffMark({ made, size = 12 }: { made: boolean; size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className="shrink-0">
			{made ? <circle cx="6" cy="6" r="5" fill={LAB.scrimmage} /> : <circle cx="6" cy="6" r="4.4" fill={LAB.opp} fillOpacity={0.14} stroke={LAB.opp} strokeWidth="1.7" />}
		</svg>
	)
}

type Props = {
	meta: Meta
	tables: Table[]
	/** Keys of the Raiders' loudest numbers: the first tabs. */
	standouts: string[]
	checklist: CheckRow[]
	season: number
	/** Games played, which is where every team's season is cut in two. */
	n: number
	first: number
	last: number
	/** Changes when the data does, so share images are not served stale. */
	stamp: number
	/** The Raiders' record through `n` games, when none of them was a tie. */
	start: { wins: number; losses: number } | null
}

const FAMILIES: { id: Table["family"]; label: string }[] = [
	{ id: "net", label: "Overall" },
	{ id: "off", label: "Offense" },
	{ id: "def", label: "Defense" },
]

export default function WillItLast({ meta, tables, standouts, checklist, season, n, first, last, stamp, start }: Props) {
	const [statKey, setStatKey] = React.useState(standouts[0] ?? tables[0]?.key ?? "")
	const [filter, setFilter] = React.useState<Filter>(DEFAULT_FILTER)
	const [spot, setSpot] = React.useState<number | null>(null)
	const [p, setP] = React.useState(0)
	const [playing, setPlaying] = React.useState(false)
	const [hover, setHover] = React.useState<number | null>(null)
	const [copied, setCopied] = React.useState(false)
	const [showAllChecks, setShowAllChecks] = React.useState(false)
	const [width, setWidth] = React.useState(960)
	const reduced = usePrefersReducedMotion()
	const reducedRef = React.useRef(reduced)
	reducedRef.current = reduced
	const rootRef = React.useRef<HTMLDivElement>(null)
	const stripRef = React.useRef<HTMLDivElement>(null)
	const svgRef = React.useRef<SVGSVGElement>(null)
	const pRef = React.useRef(0)
	const raf = React.useRef(0)
	const started = React.useRef(false)

	const table = tables.find((t) => t.key === statKey) ?? tables[0]
	const story = React.useMemo(() => (table ? analyze(meta, table, season, filter) : null), [meta, table, season, filter])
	const raidersRows = React.useMemo(() => (story ? story.rows.filter((r) => r.raiders).sort((a, b) => seasonOf(meta.teams[a.i]) - seasonOf(meta.teams[b.i])) : []), [story, meta])

	React.useEffect(() => {
		const el = stripRef.current
		if (!el) return
		const measure = () => setWidth(Math.max(280, el.clientWidth || 960))
		measure()
		if (typeof ResizeObserver === "undefined") return
		const ro = new ResizeObserver(measure)
		ro.observe(el)
		return () => ro.disconnect()
	}, [])

	const stop = React.useCallback(() => {
		cancelAnimationFrame(raf.current)
		setPlaying(false)
	}, [])

	const set = React.useCallback((v: number) => {
		pRef.current = v
		setP(v)
	}, [])

	const play = React.useCallback(
		(fromStart = false) => {
			cancelAnimationFrame(raf.current)
			if (reducedRef.current) {
				set(1)
				setPlaying(false)
				return
			}
			if (fromStart || pRef.current >= 1) set(0)
			setPlaying(true)
			let prev = performance.now()
			const tick = (now: number) => {
				const dt = Math.min(50, now - prev)
				prev = now
				const next = Math.min(1, pRef.current + dt / DURATION_MS)
				set(next)
				if (next >= 1) {
					setPlaying(false)
					return
				}
				raf.current = requestAnimationFrame(tick)
			}
			raf.current = requestAnimationFrame(tick)
		},
		[set],
	)

	React.useEffect(() => () => cancelAnimationFrame(raf.current), [])

	// Start the first time the chart is on screen, so the movement is the first thing a reader sees.
	React.useEffect(() => {
		const el = rootRef.current
		if (!el || typeof IntersectionObserver === "undefined") return
		const io = new IntersectionObserver(
			(entries) => {
				if (started.current || !entries.some((e) => e.isIntersecting)) return
				started.current = true
				io.disconnect()
				if (reducedRef.current) set(1)
				else play(true)
			},
			{ threshold: 0.45 },
		)
		io.observe(el)
		return () => io.disconnect()
	}, [play, set])

	const pick = (key: string, scroll = false) => {
		stop()
		setStatKey(key)
		setHover(null)
		started.current = true
		if (reducedRef.current) set(1)
		else {
			set(0)
			play(true)
		}
		if (scroll) stripRef.current?.scrollIntoView?.({ block: "center", behavior: reducedRef.current ? "auto" : "smooth" })
	}

	const update = (next: Partial<Filter>) => {
		setHover(null)
		setFilter((f) => ({ ...f, ...next }))
		started.current = true
	}

	if (!story || !table) return null

	const narrow = width < 560
	const H = narrow ? 290 : 340
	const M = { left: 18, right: 18, top: 44, bottom: 34 }
	const plotW = width - M.left - M.right
	const [d0, d1] = story.domain
	const X = (v: number) => M.left + ((v - d0) / (d1 - d0)) * plotW
	const R = narrow ? 3.4 : 4.2
	const lane = H - M.top - M.bottom - 14
	const yOf = (i: number) => M.top + 7 + spread(i + 1, GOLDEN) * lane
	const delayOf = (i: number) => spread(i + 1, SILVER) * 0.22
	const xAt = (r: { i: number; start: number; rest: number }) => {
		const local = ease(clamp01((p - delayOf(r.i)) / (1 - delayOf(r.i))))
		return X(r.start + (r.rest - r.start) * local)
	}

	const ticks = [0, 1, 2, 3, 4].map((k) => {
		const v = d0 + ((d1 - d0) * k) / 4
		const shown = story.fmt === "pct" || story.fmt === "pct1" ? Math.min(1, Math.max(0, v)) : v
		return { x: X(v), label: formatStat(story, shown) }
	})
	const rvX = X(story.value)
	const flip = rvX > width * 0.66
	const chip = `${season} Raiders ${story.valueText}`
	const chipW = chip.length * 8.4 + 24
	const vColor = verdictColor(story.verdict.id)
	const empty = story.groupSize === 0
	const games = seasonGames(season)
	const remaining = games - n

	// Dots: everyone not in the group faint behind, the group as playoff (filled) and missed (hollow), Raiders on top.
	let bgPath = ""
	let madePath = ""
	let missedPath = ""
	for (const r of story.rows) {
		if (r.raiders) continue
		const x = xAt(r)
		const y = yOf(r.i)
		if (!r.inGroup) bgPath += circle(x, y, R * 0.75)
		else if (r.po) madePath += circle(x, y, R)
		else missedPath += circle(x, y, R - 0.6)
	}
	const rowOf = (i: number | null) => (i === null ? null : (story.rows.find((r) => r.i === i) ?? null))
	const hv = rowOf(hover)
	const spotRow = raidersRows.find((r) => seasonOf(meta.teams[r.i]) === spot) ?? null

	const nearest = (clientX: number, clientY: number): number | null => {
		const rect = svgRef.current?.getBoundingClientRect()
		if (!rect) return null
		const px = clientX - rect.left
		const py = clientY - rect.top
		let best: number | null = null
		let bestD = 15 * 15
		for (const r of story.rows) {
			const dx = xAt(r) - px
			const dy = yOf(r.i) - py
			const dist = dx * dx + dy * dy - (r.raiders ? 40 : r.inGroup ? 12 : 0)
			if (dist < bestD) {
				bestD = dist
				best = r.i
			}
		}
		return best
	}

	const keptPct = Math.round(story.kept * 100)
	const towardPct = Number.isFinite(story.toward) ? Math.round(story.toward * 100) : 0
	const src = `/api/og?type=last&stat=${encodeURIComponent(story.key)}&n=${n}&v=${stamp}`
	const shareText = `${story.headline} ${story.verdict.text}.`
	const copyLink = async () => {
		const url = `${window.location.origin}${PAGE_PATH}`
		try {
			await navigator.clipboard.writeText(url)
			setCopied(true)
			window.setTimeout(() => setCopied(false), 1800)
		} catch {
			window.prompt("Copy this link", url)
		}
	}
	const postOnX = () => {
		const url = `${SITE_URL}${PAGE_PATH}?utm_source=x&utm_medium=social&utm_campaign=lab_share`
		window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer")
	}

	const o = story.outcomes
	const phase = p < 0.03 ? 0 : p > 0.97 ? 2 : 1
	const hasBackground = story.rows.length > story.groupSize
	const caption = [
		empty ? "Nothing to show with these filters. Widen them to see teams." : `Where the ${story.groupSize} highlighted teams stood after their first ${n} games${hasBackground ? ", with every other team faint behind them" : ""}.`,
		"Now the rest of their seasons play out. Watch where the dots head.",
		empty ? "" : `Where they finished. ${towardPct}% of the highlighted teams slid back toward the dashed line, the league average.`,
	][phase]
	const raidersWin = start ? start.wins / n : null
	const progressText = p <= 0 ? `First ${n} games` : p >= 1 ? "Rest of the season" : `${Math.round(p * 100)}% of the way`
	const filtered = filter.scope !== DEFAULT_FILTER.scope || !!filter.team || filter.playoffs !== "any"

	const teamOptions = Array.from(new Set(meta.teams.map(abbrOf))).sort((a, b) => (a === "LV" ? -1 : b === "LV" ? 1 : teamName(a).localeCompare(teamName(b))))
	const statList = [...standouts, ...(standouts.includes(statKey) ? [] : [statKey])].flatMap((k) => {
		const t = tables.find((x) => x.key === k)
		return t ? [t] : []
	})
	const lineFor = (i: number): string => {
		const g = seasonGames(seasonOf(meta.teams[i]))
		const s = table.start[i]
		const r = table.rest[i]
		return `${teamLabel(meta.teams[i])}: ${s === null ? "n/a" : formatStat(table, s)} through ${n} games (${recordText(meta.startWins[i], meta.startLosses[i], n)}), ${r === null ? "n/a" : formatStat(table, r)} after. Finished ${recordText(meta.wins[i], meta.losses[i], g)}${meta.po[i] ? ", made the playoffs" : ", missed the playoffs"}.`
	}

	const tableRows = story.rows
		.filter((r) => r.inGroup)
		.sort((a, b) => Math.abs(a.start - story.value) - Math.abs(b.start - story.value))
		.slice(0, TABLE_LIMIT)
	const checks = showAllChecks ? checklist : checklist.slice(0, CHECK_LIMIT)

	return (
		<div ref={rootRef}>
			<div className="flex flex-wrap gap-2" role="group" aria-label="Choose a stat">
				{statList.map((t) => {
					const on = t.key === statKey
					return (
						<button
							key={t.key}
							type="button"
							aria-pressed={on}
							onClick={() => pick(t.key)}
							className={`min-h-[44px] rounded-full border px-4 py-2 text-sm font-semibold transition ${on ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong bg-lab-surface text-lab-ink hover:bg-lab-hover"}`}
						>
							{t.label} <span className={on ? "opacity-80" : "text-lab-muted"}>&middot; {ordinalOf(t.rank)}</span>
						</button>
					)
				})}
			</div>
			<details className="mt-3 rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm">
				<summary className="cursor-pointer font-semibold text-lab-soft">More stats ({tables.length - standouts.length})</summary>
				<div className="mt-3 grid gap-4 md:grid-cols-3">
					{FAMILIES.map((f) => (
						<div key={f.id}>
							<p className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-lab-muted">{f.label}</p>
							<div className="flex flex-wrap gap-2">
								{tables
									.filter((t) => t.family === f.id)
									.map((t) => {
										const on = t.key === statKey
										return (
											<button
												key={t.key}
												type="button"
												aria-pressed={on}
												onClick={() => pick(t.key, true)}
												className={`min-h-[40px] rounded-full border px-3 py-1.5 text-xs font-semibold transition ${on ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong bg-lab-page text-lab-ink hover:bg-lab-hover"}`}
											>
												{t.label} <span className={on ? "opacity-80" : "text-lab-muted"}>&middot; {ordinalOf(t.rank)}</span>
											</button>
										)
									})}
							</div>
						</div>
					))}
				</div>
			</details>

			<div className="mt-5 overflow-hidden rounded-2xl border border-lab-line bg-lab-surface shadow-[var(--lab-shadow)]">
				<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-lab-line bg-lab-tint px-4 py-3 sm:px-7">
					<div className="flex items-center gap-3">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src="/logo-rr.png" alt="" width={36} height={36} className="h-9 w-9 rounded-full ring-1 ring-lab-line-strong" />
						<div className="leading-tight">
							<p className="m-0 font-serif text-base font-bold">Raiders Rundown</p>
							<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-muted">The Lab &middot; Will it last?</p>
						</div>
					</div>
					<p className="m-0 font-mono text-sm tabular-nums text-lab-soft">
						{season} Raiders &middot; {start ? `${start.wins}-${start.losses} after ${n} games` : `${n} games played`}
					</p>
				</div>
				<div className="p-4 sm:p-7">
					<div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
						<div className="min-w-0 flex-1 basis-[28rem]">
							<h2 className="m-0 font-serif text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{story.headline}</h2>
							<p className="m-0 mt-3 text-sm leading-relaxed text-lab-soft sm:text-base">{story.sub}</p>
						</div>
						<p className="m-0 inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.12em]" style={{ borderColor: vColor, color: vColor }}>
							<VerdictIcon id={story.verdict.id} />
							{story.verdict.text}
						</p>
					</div>

					<ol className="m-0 mt-5 grid list-none gap-3 p-0 text-sm leading-snug text-lab-soft sm:grid-cols-3" aria-label="How to read this chart">
						{[
							{ t: "One dot is one team", d: `Each dot is one team in one season since ${first}. Filled blue dots made the playoffs, hollow orange rings did not, and gold rings are earlier Raiders teams.` },
							{ t: story.higherIsBetter ? "Further right is better" : "Further left is better", d: `Left to right is ${story.unit}. ${story.higherIsBetter ? "More is better" : "Less is better"} for a team, so ${story.higherIsBetter ? "the right" : "the left"} side is where you want to be.` },
							{ t: "Press play to see the next games", d: `Each dot slides from where its team stood after ${n} games to where it stood over the rest of its season. The Raiders have ${remaining} games left.` },
						].map((c, i) => (
							<li key={c.t} className="flex items-center gap-3 rounded-xl border border-lab-line bg-lab-tint px-4 py-2.5 sm:items-start sm:py-3">
								<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lab-ink text-xs font-bold text-lab-page" aria-hidden>
									{i + 1}
								</span>
								<span>
									<span className="block font-semibold text-lab-ink">{c.t}</span>
									<span className="hidden sm:inline">{c.d}</span>
								</span>
							</li>
						))}
					</ol>

					<fieldset className="m-0 mt-5 min-w-0 rounded-xl border border-lab-line bg-lab-tint px-4 py-3">
						<legend className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-lab-muted">Filter the teams</legend>
						<div className="flex flex-wrap items-end gap-x-6 gap-y-3">
							<div role="group" aria-label="Which teams" className="flex flex-col gap-1">
								<span className="text-xs font-semibold text-lab-muted">Which teams</span>
								<div className="flex overflow-hidden rounded-lg border border-lab-line-strong">
									{(
										[
											["like", "Started like the Raiders"],
											["all", `Every team since ${first}`],
										] as const
									).map(([v, label]) => (
										<button
											key={v}
											type="button"
											aria-pressed={filter.scope === v}
											onClick={() => update({ scope: v })}
											className={`min-h-[40px] px-3 py-2 text-xs font-semibold transition sm:text-sm ${filter.scope === v ? "bg-lab-ink text-lab-page" : "bg-lab-surface text-lab-ink hover:bg-lab-hover"}`}
										>
											{label}
										</button>
									))}
								</div>
							</div>
							<label className="flex flex-col gap-1">
								<span className="text-xs font-semibold text-lab-muted">Team</span>
								<select
									value={filter.team ?? ""}
									onChange={(e) => update({ team: e.target.value || null })}
									className="min-h-[40px] rounded-lg border border-lab-line-strong bg-lab-surface px-3 py-2 text-sm font-semibold text-lab-ink"
								>
									<option value="">Every team</option>
									{teamOptions.map((a) => (
										<option key={a} value={a}>
											{teamName(a)}
										</option>
									))}
								</select>
							</label>
							<div role="group" aria-label="Playoff result" className="flex flex-col gap-1">
								<span className="text-xs font-semibold text-lab-muted">Season result</span>
								<div className="flex overflow-hidden rounded-lg border border-lab-line-strong">
									{(
										[
											["any", "Any"],
											["made", "Made playoffs"],
											["missed", "Missed playoffs"],
										] as const
									).map(([v, label]) => (
										<button
											key={v}
											type="button"
											aria-pressed={filter.playoffs === v}
											onClick={() => update({ playoffs: v })}
											className={`min-h-[40px] px-3 py-2 text-xs font-semibold transition sm:text-sm ${filter.playoffs === v ? "bg-lab-ink text-lab-page" : "bg-lab-surface text-lab-ink hover:bg-lab-hover"}`}
										>
											{label}
										</button>
									))}
								</div>
							</div>
							{filtered ? (
								<button
									type="button"
									onClick={() => update(DEFAULT_FILTER)}
									className="min-h-[40px] rounded-lg px-3 py-2 text-sm font-semibold text-lab-soft underline underline-offset-4 hover:text-lab-ink"
								>
									Reset filters
								</button>
							) : null}
						</div>
					</fieldset>

					<div className="mt-4">
						<p className="m-0 mb-2 text-xs font-semibold text-lab-muted">
							Compare with a Raiders season ({first} to {last}). Pick one to see its start and how it ended.
						</p>
						<div className="flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Raiders seasons">
							{raidersRows.map((r) => {
								const yr = seasonOf(meta.teams[r.i])
								const on = spot === yr
								const rec = recordText(meta.startWins[r.i], meta.startLosses[r.i], n)
								const fin = recordText(meta.wins[r.i], meta.losses[r.i], seasonGames(yr))
								return (
									<button
										key={r.i}
										type="button"
										aria-pressed={on}
										aria-label={`${yr} Raiders: started ${rec}, finished ${fin}, ${r.po ? "made" : "missed"} the playoffs`}
										onClick={() => setSpot(on ? null : yr)}
										className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${on ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong bg-lab-page text-lab-ink hover:bg-lab-hover"}`}
									>
										<PlayoffMark made={r.po} />
										{yr} <span className={`font-mono text-xs ${on ? "opacity-80" : "text-lab-muted"}`}>{rec}</span>
									</button>
								)
							})}
						</div>
						{spotRow ? (
							<p className="m-0 mt-2 rounded-lg border px-3 py-2 text-sm leading-snug text-lab-soft" style={{ borderColor: LAB.firstDown }}>
								{lineFor(spotRow.i)} The {season} Raiders are at {story.valueText}.
							</p>
						) : null}
					</div>

					<div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2" aria-hidden>
						{[`First ${n} games`, "Rest of the season"].map((label, i) => {
							const on = i === 0 ? phase === 0 : phase > 0
							return (
								<span key={label} className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: on ? LAB.ink : LAB.inkMuted }}>
									<span className="flex h-5 w-5 items-center justify-center rounded-full border text-[11px]" style={{ borderColor: on ? LAB.ink : LAB.line, background: on ? LAB.ink : "transparent", color: on ? LAB.page : LAB.inkMuted }}>
										{i + 1}
									</span>
									{label}
									{i === 0 ? <span className="px-1 text-lab-muted">&rarr;</span> : null}
								</span>
							)
						})}
					</div>
					<p className="m-0 mt-1 min-h-[2.5rem] text-sm leading-snug text-lab-soft">{caption}</p>

					<div ref={stripRef} className="relative mt-2 w-full">
						<svg
							ref={svgRef}
							width={width}
							height={H}
							role="img"
							aria-label={`${story.headline} ${story.verdict.text}. The table below the chart lists every team.`}
							className="block max-w-full select-none overflow-visible"
							style={{ touchAction: "pan-y" }}
							onPointerMove={(e) => setHover(nearest(e.clientX, e.clientY))}
							onPointerDown={(e) => setHover(nearest(e.clientX, e.clientY))}
							onPointerLeave={() => setHover(null)}
						>
							<rect x={0} y={0} width={width} height={H - M.bottom + 12} rx={12} fill={LAB.page} stroke={LAB.line} />
							{!empty ? <rect x={X(story.band[0])} y={M.top - 8} width={Math.max(2, X(story.band[1]) - X(story.band[0]))} height={H - M.top - M.bottom + 16} fill={LAB.firstDown} fillOpacity={0.14 * ease(p)} stroke={LAB.firstDown} strokeOpacity={0.7 * ease(p)} strokeDasharray="4 4" /> : null}
							<line x1={X(story.base)} x2={X(story.base)} y1={M.top - 8} y2={H - M.bottom + 8} stroke={LAB.axis} strokeDasharray="2 5" />
							<line x1={rvX} x2={rvX} y1={M.top - 14} y2={H - M.bottom + 8} stroke={LAB.firstDown} strokeWidth={2.5} />
							<path d={bgPath} fill={LAB.inkMuted} fillOpacity={0.2} pointerEvents="none" />
							<path d={missedPath} fill={LAB.opp} fillOpacity={0.14} stroke={LAB.opp} strokeWidth={1.6} pointerEvents="none" />
							<path d={madePath} fill={LAB.scrimmage} fillOpacity={0.8} pointerEvents="none" />
							{raidersRows.map((r) => {
								const on = hover === r.i || spotRow?.i === r.i
								const cx = xAt(r)
								const cy = yOf(r.i)
								return (
									<g key={r.i} pointerEvents="none">
										{r.po ? (
											<circle cx={cx} cy={cy} r={on ? R + 4 : R + 2.4} fill={LAB.scrimmage} stroke={LAB.firstDown} strokeWidth={2.6} />
										) : (
											<circle cx={cx} cy={cy} r={on ? R + 4 : R + 2.4} fill={LAB.surface} stroke={LAB.firstDown} strokeWidth={2.6} strokeDasharray="3 2" />
										)}
										{spotRow?.i === r.i ? (
											<text x={cx} y={cy - R - 8} fontSize={12} fontWeight={700} textAnchor="middle" fill={LAB.ink} stroke={LAB.page} strokeWidth={4} paintOrder="stroke">
												{seasonOf(meta.teams[r.i])}
											</text>
										) : null}
									</g>
								)
							})}
							{hv && !hv.raiders ? <circle cx={xAt(hv)} cy={yOf(hv.i)} r={R + 3} fill="none" stroke={LAB.ink} strokeWidth={2} pointerEvents="none" /> : null}
							<g transform={`translate(${flip ? rvX - chipW - 6 : rvX + 6}, 8)`} pointerEvents="none">
								<rect width={chipW} height={26} rx={7} fill={LAB.firstDown} />
								<text x={11} y={17.5} fontSize={13} fontWeight={700} fill={LAB.onFirstDown}>
									{chip}
								</text>
							</g>
							<text x={X(story.base)} y={H - M.bottom - 2} fontSize={12} textAnchor="middle" fill={LAB.inkMuted} pointerEvents="none" stroke={LAB.page} strokeWidth={5} paintOrder="stroke">
								league average
							</text>
							{ticks.map((t, k) => (
								<text key={k} x={Math.min(width - 14, Math.max(14, t.x))} y={H - 10} fontSize={12} textAnchor="middle" fill={LAB.inkMuted} pointerEvents="none">
									{t.label}
								</text>
							))}
						</svg>
						{hv ? (
							<div
								role="presentation"
								className="pointer-events-none absolute z-10 w-60 rounded-lg border border-lab-line-strong bg-lab-surface px-3 py-2 text-xs leading-snug shadow-[var(--lab-shadow)]"
								style={{ left: Math.max(0, Math.min(width - 240, xAt(hv) > width * 0.55 ? xAt(hv) - 252 : xAt(hv) + 14)), top: Math.max(0, Math.min(H - 150, yOf(hv.i) > H * 0.5 ? yOf(hv.i) - 120 : yOf(hv.i) + 16)) }}
							>
								<p className="m-0 flex items-center gap-2 text-sm font-bold text-lab-ink">
									<PlayoffMark made={hv.po} />
									{teamLabel(meta.teams[hv.i])}
								</p>
								<p className="m-0 mt-1 text-lab-soft">
									Started {recordText(meta.startWins[hv.i], meta.startLosses[hv.i], n)}: <span className="font-mono font-semibold text-lab-ink">{formatStat(table, hv.start)}</span>
								</p>
								<p className="m-0 text-lab-soft">
									Rest of the way: <span className="font-mono font-semibold text-lab-ink">{formatStat(table, hv.rest)}</span> ({hv.toward ? "closer to" : "further from"} average)
								</p>
								<p className="m-0 mt-1 font-semibold text-lab-ink">
									Finished {recordText(meta.wins[hv.i], meta.losses[hv.i], seasonGames(seasonOf(meta.teams[hv.i])))}, {hv.po ? "made the playoffs" : "missed the playoffs"}
								</p>
							</div>
						) : null}
						<div className="mt-1 flex justify-between text-xs font-semibold text-lab-muted" aria-hidden>
							<span>&larr; {story.higherIsBetter ? "Worse" : "Better"}</span>
							<span>{story.higherIsBetter ? "Better" : "Worse"} &rarr;</span>
						</div>
					</div>

					<div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
						<button
							type="button"
							onClick={() => (playing ? stop() : play())}
							className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-lab-ink px-5 py-2 text-sm font-bold text-lab-page transition hover:opacity-90"
						>
							{playing ? <Pause className="h-4 w-4" aria-hidden /> : p >= 1 ? <RotateCcw className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
							{playing ? "Pause" : p >= 1 ? "Replay" : "Play"}
						</button>
						<div className="flex min-w-[220px] flex-1 flex-col gap-1">
							<input
								type="range"
								min={0}
								max={100}
								step={1}
								value={Math.round(p * 100)}
								onChange={(e) => {
									stop()
									started.current = true
									set(Number(e.target.value) / 100)
								}}
								aria-label="Move every team from its first games to the rest of its season"
								aria-valuetext={progressText}
								className="w-full"
								style={{ accentColor: LAB.firstDown }}
							/>
							<div className="flex justify-between text-xs text-lab-muted">
								<span>First {n} games</span>
								<span>Rest of the season</span>
							</div>
						</div>
						<p className="m-0 min-h-[44px] min-w-[220px] flex-1 basis-[240px] self-center text-sm leading-snug text-lab-soft" aria-live="polite">
							{hv ? lineFor(hv.i) : "Hover or tap a dot to see which team it is, its record and whether it made the playoffs."}
						</p>
					</div>

					<ul className="m-0 mt-4 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-xs text-lab-soft" aria-label="Legend">
						<li className="flex items-center gap-2">
							<PlayoffMark made />
							Made the playoffs
						</li>
						<li className="flex items-center gap-2">
							<PlayoffMark made={false} />
							Missed the playoffs
						</li>
						<li className="flex items-center gap-2">
							<svg width="14" height="14" aria-hidden>
								<circle cx="7" cy="7" r="5" fill={LAB.scrimmage} stroke={LAB.firstDown} strokeWidth="2.5" />
							</svg>
							An earlier Raiders team (dashed ring if they missed)
						</li>
						{hasBackground ? (
							<li className="flex items-center gap-2">
								<svg width="12" height="12" aria-hidden>
									<circle cx="6" cy="6" r="3.5" fill={LAB.inkMuted} fillOpacity={0.35} />
								</svg>
								Not in the group you picked
							</li>
						) : null}
						<li className="flex items-center gap-2">
							<svg width="18" height="12" aria-hidden>
								<rect x="0.5" y="0.5" width="17" height="11" fill={LAB.firstDown} fillOpacity={0.14} stroke={LAB.firstDown} strokeOpacity={0.7} strokeDasharray="3 3" />
							</svg>
							Where the middle half finished
						</li>
						<li className="flex items-center gap-2">
							<svg width="14" height="12" aria-hidden>
								<line x1="7" x2="7" y1="0" y2="12" stroke={LAB.firstDown} strokeWidth="2.5" />
							</svg>
							The {season} Raiders now
						</li>
					</ul>

					{!empty ? (
						<>
							<dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
								{[
									{ k: "Their average start", v: story.startText, note: `through ${n} games` },
									{ k: "Their average finish", v: story.restText, note: "rest of the season" },
									{ k: "Moved toward average", v: `${towardPct}%`, note: `of ${story.groupSize} teams`, hot: true },
									{ k: "Typical finish for a team like this", v: story.typicalText, note: `league average is ${story.baseText}` },
									{ k: "Raiders seasons in this group", v: story.earlier.count ? `${story.earlier.toward} of ${story.earlier.count}` : "None", note: story.earlier.count ? "moved toward average" : "match these filters" },
								].map((c) => (
									<div key={c.k} className="rounded-xl border border-lab-line bg-lab-tint px-4 py-3">
										<dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">{c.k}</dt>
										<dd className="m-0 mt-1 font-mono text-2xl font-bold tabular-nums" style={c.hot ? { color: vColor } : undefined}>
											{c.v}
										</dd>
										<dd className="m-0 text-xs text-lab-muted">{c.note}</dd>
									</div>
								))}
							</dl>
							<p className="m-0 mt-3 text-xs leading-relaxed text-lab-muted">
								Across every team since {first}, about {keptPct}% of a team&rsquo;s distance from average over its first {n} games was still there over the rest of its season.
								{story.groupSize < 10 ? ` Only ${story.groupSize} team${story.groupSize === 1 ? "" : "s"} match these filters, so treat the numbers above as a few examples, not a pattern.` : ""}
							</p>

							<section className="mt-7 rounded-xl border border-lab-line bg-lab-tint p-4 sm:p-5" aria-labelledby="wins-heading">
								<h3 id="wins-heading" className="m-0 font-serif text-lg font-bold">
									What that meant in wins and playoffs
								</h3>
								<p className="m-0 mt-1 text-sm leading-relaxed text-lab-soft">{story.winsLine}</p>
								<ul className="m-0 mt-4 grid list-none gap-4 p-0 md:grid-cols-3">
									{[
										{ label: `Won in their first ${n} games`, v: o.startWin, all: raidersWin, text: pctText(o.startWin), note: raidersWin !== null && start ? `Yellow tick, the Raiders now: ${start.wins}-${start.losses}, ${pctText(raidersWin)}.` : "" },
										{ label: "Won over the rest of the season", v: o.restWin, all: o.allRestWin, text: pctText(o.restWin), note: `About ${o.restWins.toFixed(1)} wins in ${Math.round(o.restGames)} games. Every team: ${pctText(o.allRestWin)}.` },
										{ label: "Made the playoffs", v: o.playoffs, all: o.allPlayoffs, text: pctText(o.playoffs), note: `Every team: ${pctText(o.allPlayoffs)}.` },
									].map((r) => (
										<li key={r.label}>
											<div className="flex items-baseline justify-between gap-3 text-sm">
												<span className="font-semibold">{r.label}</span>
												<span className="font-mono text-lg font-bold tabular-nums">{r.text}</span>
											</div>
											<div className="relative mt-2 h-3 rounded-full bg-lab-hover" aria-hidden>
												<div className="h-3 rounded-full" style={{ width: `${Math.round(r.v * 100)}%`, background: LAB.team }} />
												{r.all !== null ? <div className="absolute -top-1 h-5 w-0.5" style={{ left: `${Math.round(r.all * 100)}%`, background: LAB.firstDown }} /> : null}
											</div>
											<p className="m-0 mt-1.5 text-xs leading-snug text-lab-muted">{r.note}</p>
										</li>
									))}
								</ul>
								<p className="m-0 mt-4 text-xs leading-relaxed text-lab-muted">
									For scale: at {pctText(o.restWin)}, a team wins about {(remaining * o.restWin).toFixed(1)} of {remaining} games, and at {pctText(o.allRestWin)} about {(remaining * o.allRestWin).toFixed(1)}. In the second and third bars the yellow tick marks the average team. These are
									results, not a forecast: one stat does not decide a season, and these teams differed in other ways too.
								</p>
							</section>
						</>
					) : (
						<p className="m-0 mt-6 rounded-xl border border-lab-line bg-lab-tint px-4 py-3 text-sm text-lab-soft">No team-seasons match these filters. Try a different team, or choose &ldquo;Any&rdquo; for the season result.</p>
					)}

					<section className="mt-5 rounded-xl border border-lab-line bg-lab-tint p-4 sm:p-5" aria-labelledby="fifths-heading">
						<h3 id="fifths-heading" className="m-0 font-serif text-lg font-bold">
							How often teams made the playoffs, by {story.short}
						</h3>
						<p className="m-0 mt-1 text-sm leading-relaxed text-lab-soft">
							Every team since {first}, split into five equal groups by their {story.short} through {n} games. The Raiders ({story.valueText}, {ordinalOf(story.rank)} of 32 now) are in the {fifthName(story.raidersFifth)}, where {pctText(story.fifths[story.raidersFifth].rate)} of teams made the playoffs.
						</p>
						<ul className="m-0 mt-4 grid list-none gap-3 p-0 sm:grid-cols-5">
							{story.fifths.map((f, k) => {
								const mine = k === story.raidersFifth
								return (
									<li key={k} className="rounded-lg border px-3 py-2" style={{ borderColor: mine ? LAB.firstDown : LAB.line, borderWidth: mine ? 2 : 1 }}>
										<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-lab-muted">{fifthName(k)}</p>
										<p className="m-0 mt-1 font-mono text-xl font-bold tabular-nums">{pctText(f.rate)}</p>
										<div className="mt-1 h-2 rounded-full bg-lab-hover" aria-hidden>
											<div className="h-2 rounded-full" style={{ width: `${Math.round(f.rate * 100)}%`, background: LAB.scrimmage }} />
										</div>
										<p className="m-0 mt-1 text-[11px] leading-snug text-lab-muted">
											{formatStat(table, f.lo)} to {formatStat(table, f.hi)}
											{mine ? <span className="block font-bold text-lab-ink">The Raiders are here</span> : null}
										</p>
									</li>
								)
							})}
						</ul>
						<p className="m-0 mt-3 text-xs leading-relaxed text-lab-muted">Made the playoffs, as a share of teams in each group. A stat that lines up with winning will show a steep drop from left to right, but teams differ in many other ways, so this is a pattern, not a cause.</p>
					</section>

					<section className="mt-5" aria-labelledby="check-heading">
						<h3 id="check-heading" className="m-0 font-serif text-lg font-bold">
							The Raiders&rsquo; playoff checklist
						</h3>
						<p className="m-0 mt-1 max-w-3xl text-sm leading-relaxed text-lab-soft">
							Every stat, ranked by how much it has separated playoff teams from the rest after {n} games (best fifth of teams against worst fifth). The big number and bar are how often teams that stood where the {season} Raiders stand made the playoffs. Select one to see it in the chart.
						</p>
						<ul className="m-0 mt-3 grid list-none gap-2 p-0 md:grid-cols-2">
							{checks.map((c) => {
								const on = c.key === statKey
								return (
									<li key={c.key}>
										<button
											type="button"
											aria-pressed={on}
											onClick={() => pick(c.key, true)}
											className={`w-full rounded-xl border px-4 py-3 text-left transition hover:bg-lab-hover ${on ? "border-lab-ink bg-lab-hover" : "border-lab-line bg-lab-surface"}`}
										>
											<span className="flex items-baseline justify-between gap-3">
												<span className="text-sm font-semibold text-lab-ink">{c.label}</span>
												<span className="font-mono text-lg font-bold tabular-nums">{pctText(c.rate)}</span>
											</span>
											<span className="mt-1 block h-2 rounded-full bg-lab-hover" aria-hidden>
												<span className="block h-2 rounded-full" style={{ width: `${Math.round(c.rate * 100)}%`, background: LAB.scrimmage }} />
											</span>
											<span className="mt-1 block text-xs leading-snug text-lab-muted">
												Raiders {c.valueText}, {ordinalOf(c.rank)} of 32, in the {fifthName(c.fifth)}. Made the playoffs: {pctText(c.best)} of the best fifth of teams, {pctText(c.worst)} of the worst.
											</span>
										</button>
									</li>
								)
							})}
						</ul>
						{checklist.length > CHECK_LIMIT ? (
							<button type="button" onClick={() => setShowAllChecks((v) => !v)} className="mt-3 min-h-[40px] rounded-lg border border-lab-line-strong px-4 py-2 text-sm font-semibold text-lab-soft transition hover:bg-lab-hover hover:text-lab-ink">
								{showAllChecks ? "Show fewer stats" : `Show every stat (${checklist.length})`}
							</button>
						) : null}
					</section>

					<details className="mt-5 rounded-xl border border-lab-line bg-lab-tint px-4 py-3 text-sm">
						<summary className="cursor-pointer font-semibold text-lab-soft">See every team in this chart ({Math.min(story.groupSize, TABLE_LIMIT)})</summary>
						<div className="mt-3 max-h-80 overflow-auto">
							<table className="w-full border-collapse text-left text-xs tabular-nums">
								<caption className="sr-only">
									Highlighted teams, closest to the {season} Raiders first, with their {story.unit} through {n} games and over the rest of the season, their records and whether they made the playoffs.
								</caption>
								<thead>
									<tr className="text-lab-muted">
										<th scope="col" className="sticky top-0 bg-lab-page py-1.5 pr-3 font-semibold">
											Team
										</th>
										<th scope="col" className="sticky top-0 bg-lab-page py-1.5 pr-3 text-right font-semibold">
											First {n} games
										</th>
										<th scope="col" className="sticky top-0 bg-lab-page py-1.5 pr-3 text-right font-semibold">
											Rest of season
										</th>
										<th scope="col" className="sticky top-0 bg-lab-page py-1.5 pr-3 font-semibold">
											Started
										</th>
										<th scope="col" className="sticky top-0 bg-lab-page py-1.5 pr-3 font-semibold">
											Finished
										</th>
										<th scope="col" className="sticky top-0 bg-lab-page py-1.5 font-semibold">
											Playoffs
										</th>
									</tr>
								</thead>
								<tbody>
									{tableRows.map((r) => (
										<tr key={r.i} className="border-t border-lab-line">
											<th scope="row" className="py-1.5 pr-3 font-semibold">
												{teamLabel(meta.teams[r.i])}
											</th>
											<td className="py-1.5 pr-3 text-right font-mono">{formatStat(table, r.start)}</td>
											<td className="py-1.5 pr-3 text-right font-mono">{formatStat(table, r.rest)}</td>
											<td className="py-1.5 pr-3 font-mono">{recordText(meta.startWins[r.i], meta.startLosses[r.i], n)}</td>
											<td className="py-1.5 pr-3 font-mono">{recordText(meta.wins[r.i], meta.losses[r.i], seasonGames(seasonOf(meta.teams[r.i])))}</td>
											<td className="py-1.5">{r.po ? "Made it" : "Missed"}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</details>

					<div className="mt-5 flex flex-wrap items-center gap-3">
						<button type="button" onClick={copyLink} className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-lab-line-strong px-4 py-2 text-sm font-semibold text-lab-soft transition hover:bg-lab-hover hover:text-lab-ink">
							{copied ? <Check className="h-4 w-4" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
							{copied ? "Link copied" : "Copy link"}
						</button>
						<button type="button" onClick={postOnX} className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-lab-line-strong px-4 py-2 text-sm font-semibold text-lab-soft transition hover:bg-lab-hover hover:text-lab-ink">
							Post on X
						</button>
					</div>
				</div>
			</div>

			<div className="mt-6 max-w-xl">
				<CardFigure src={src} alt={`${story.label}: ${story.headline} ${story.verdict.text}.`} filename={`raiders-will-it-last-${story.key.replace(".", "-")}.png`} caption={`Share card, ${first} to ${last} history`} />
			</div>
		</div>
	)
}
