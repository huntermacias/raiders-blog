"use client"

import * as React from "react"
import { ArrowLeft, ArrowRight, Minus, Pause, Play, RotateCcw, TrendingDown, TrendingUp, X as CloseIcon } from "lucide-react"

import ShareCard from "@/components/lab/ShareCard"
import { GameRuler, Leaderboard, MoveLine, PlayoffMark, RaidersMark, YearPicker } from "@/components/lab/WillItLastParts"
import { SECTION_IDS, readView } from "@/lib/lab/lastShare"
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
/** The most teams listed in the table under the chart. */
const TABLE_LIMIT = 300
/** The checklist shows this many stats before "Show every stat". */
const CHECK_LIMIT = 8
const RIDGE_BINS = 44

/** `text` cut at a word boundary to at most `max` characters, for a post. */
function clipText(text: string, max: number): string {
	if (text.length <= max) return text
	const cut = text.slice(0, max - 1)
	return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : cut.length)}…`
}

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

/** How many teams fall in each slice of the axis, smoothed a little so it reads as a shape. */
function density(values: number[], d0: number, d1: number): number[] {
	const raw = new Array<number>(RIDGE_BINS).fill(0)
	for (const v of values) raw[Math.min(RIDGE_BINS - 1, Math.max(0, Math.floor(((v - d0) / (d1 - d0)) * RIDGE_BINS)))]++
	const w = [1, 2, 3, 2, 1]
	return raw.map((_, k) => w.reduce((a, wt, j) => (k + j - 2 >= 0 && k + j - 2 < RIDGE_BINS ? a + raw[k + j - 2] * wt : a), 0) / 9)
}

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
	/** Path of the Raiders shield in /public, when the site has the file. */
	raidersLogo?: string | null
}

const FAMILIES: { id: Table["family"]; label: string }[] = [
	{ id: "net", label: "Overall" },
	{ id: "off", label: "Offense" },
	{ id: "def", label: "Defense" },
]

export default function WillItLast({ meta, tables, standouts, checklist, season, n, first, last, stamp, start, raidersLogo = null }: Props) {
	const [statKey, setStatKey] = React.useState(standouts[0] ?? tables[0]?.key ?? "")
	const [filter, setFilter] = React.useState<Filter>(DEFAULT_FILTER)
	const [pin, setPin] = React.useState<number | null>(null)
	const [yMode, setYMode] = React.useState<"spread" | "wins">("spread")
	const [yBlend, setYBlend] = React.useState(0)
	const [p, setP] = React.useState(0)
	const [playing, setPlaying] = React.useState(false)
	const [hover, setHover] = React.useState<number | null>(null)
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
	const yRaf = React.useRef(0)
	const yRef = React.useRef(0)
	const started = React.useRef(false)

	const table = tables.find((t) => t.key === statKey) ?? tables[0]
	const story = React.useMemo(() => (table ? analyze(meta, table, season, filter) : null), [meta, table, season, filter])
	const raidersRows = React.useMemo(() => (story ? story.rows.filter((r) => r.raiders).sort((a, b) => seasonOf(meta.teams[a.i]) - seasonOf(meta.teams[b.i])) : []), [story, meta])
	const members = React.useMemo(() => (story ? story.rows.filter((r) => r.inGroup) : []), [story])
	const ordered = React.useMemo(() => (story ? members.slice().sort((a, b) => Math.abs(a.start - story.value) - Math.abs(b.start - story.value)) : []), [members, story])
	const dens = React.useMemo(() => {
		if (!story || !members.length) return null
		const [d0, d1] = story.domain
		const a = density(members.map((r) => r.start), d0, d1)
		const b = density(members.map((r) => r.rest), d0, d1)
		return { a, b, max: Math.max(1, ...a, ...b) }
	}, [story, members])

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

	// A shared link carries the stat, the filters and the pinned team: open on the same chart, and scroll to the part that was shared.
	React.useEffect(() => {
		const sp = new URLSearchParams(window.location.search)
		if (!sp.get("kind") && !sp.get("stat")) return
		const v = readView(Object.fromEntries(sp.entries()), { first, last, teams: new Set(meta.teams.map(abbrOf)), rows: new Set(meta.teams) })
		if (v.stat && tables.some((t) => t.key === v.stat)) setStatKey(v.stat)
		setFilter(v.filter)
		setYMode(v.y)
		if (v.pin) {
			const i = meta.teams.indexOf(v.pin)
			if (i >= 0) setPin(i)
		}
		if (sp.get("kind")) {
			const t = window.setTimeout(() => document.getElementById(SECTION_IDS[v.kind])?.scrollIntoView?.({ block: "start", behavior: reducedRef.current ? "auto" : "smooth" }), 400)
			return () => window.clearTimeout(t)
		}
	}, [meta, tables, first, last])

	// Slide the dots between "spread out" and "by final wins".
	React.useEffect(() => {
		const target = yMode === "wins" ? 1 : 0
		cancelAnimationFrame(yRaf.current)
		if (reducedRef.current) {
			yRef.current = target
			setYBlend(target)
			return
		}
		let prev = performance.now()
		const tick = (now: number) => {
			const dt = Math.min(50, now - prev)
			prev = now
			const cur = yRef.current
			const next = target > cur ? Math.min(target, cur + dt / 500) : Math.max(target, cur - dt / 500)
			yRef.current = next
			setYBlend(next)
			if (next !== target) yRaf.current = requestAnimationFrame(tick)
		}
		yRaf.current = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(yRaf.current)
	}, [yMode])

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

	React.useEffect(
		() => () => {
			cancelAnimationFrame(raf.current)
			cancelAnimationFrame(yRaf.current)
		},
		[],
	)

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

	const toChart = () => stripRef.current?.scrollIntoView?.({ block: "center", behavior: reducedRef.current ? "auto" : "smooth" })

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
		if (scroll) toChart()
	}

	const update = (next: Partial<Filter>) => {
		setHover(null)
		setFilter((f) => ({ ...f, ...next }))
		started.current = true
	}

	if (!story || !table) return null

	const narrow = width < 560
	const H = narrow ? 330 : 390
	const M = { left: 18, right: 18, top: 62, bottom: 34 }
	const plotW = width - M.left - M.right
	const [d0, d1] = story.domain
	const X = (v: number) => M.left + ((v - d0) / (d1 - d0)) * plotW
	const R = narrow ? 3.4 : 4.2
	const lane = H - M.top - M.bottom - 14
	const games = seasonGames(season)
	const mix = ease(p)
	const yJit = (i: number) => M.top + 7 + spread(i + 1, GOLDEN) * lane
	const yWin = (i: number) => M.top + 7 + (1 - clamp01(meta.wins[i] / games)) * lane + (spread(i + 1, SILVER) - 0.5) * 9
	const yAt = (i: number) => {
		const b = ease(yBlend)
		const a = yJit(i)
		return a + (yWin(i) - a) * b
	}
	const delayOf = (i: number) => spread(i + 1, SILVER) * 0.22
	const localAt = (i: number) => ease(clamp01((p - delayOf(i)) / (1 - delayOf(i))))
	const xAt = (r: { i: number; start: number; rest: number }) => X(r.start + (r.rest - r.start) * localAt(r.i))

	const ticks = [0, 1, 2, 3, 4].map((k) => {
		const v = d0 + ((d1 - d0) * k) / 4
		const shown = story.fmt === "pct" || story.fmt === "pct1" ? Math.min(1, Math.max(0, v)) : v
		return { x: X(v), label: formatStat(story, shown) }
	})
	const rvX = X(story.value)
	const chip = `${season} Raiders ${story.valueText}`
	const logoW = raidersLogo ? 26 : 0
	const chipW = chip.length * 8.4 + 24 + logoW
	const chipX = Math.max(4, Math.min(width - chipW - 4, rvX + 6 + chipW > width - 4 ? rvX - chipW - 6 : rvX + 6))
	const vColor = verdictColor(story.verdict.id)
	const empty = story.groupSize === 0
	const remaining = games - n
	const baseY = H - M.bottom + 6

	// Dots: everyone not in the group faint behind, the group as playoff (filled) and missed (hollow), Raiders on top.
	let bgPath = ""
	let madePath = ""
	let glowPath = ""
	let missedPath = ""
	let trailPath = ""
	let closer = 0
	for (const r of story.rows) {
		if (r.inGroup) {
			const cur = r.start + (r.rest - r.start) * localAt(r.i)
			if (Math.abs(cur - story.base) < Math.abs(r.start - story.base)) closer++
		}
		if (r.raiders) continue
		const x = xAt(r)
		const y = yAt(r.i)
		if (!r.inGroup) bgPath += circle(x, y, R * 0.75)
		else {
			if (p > 0.005) trailPath += `M${X(r.start).toFixed(1)} ${y.toFixed(1)}L${x.toFixed(1)} ${y.toFixed(1)}`
			if (r.po) {
				madePath += circle(x, y, R)
				glowPath += circle(x, y, R * 2.1)
			} else missedPath += circle(x, y, R - 0.6)
		}
	}
	const liveAvg = story.avgStart + (story.avgRest - story.avgStart) * mix
	const avgX = X(liveAvg)
	const closerPct = members.length ? Math.round((closer / members.length) * 100) : 0
	const rowOf = (i: number | null) => (i === null ? null : (story.rows.find((r) => r.i === i) ?? null))
	const hv = rowOf(hover)
	const pinned = rowOf(pin)

	const nearest = (clientX: number, clientY: number): number | null => {
		const rect = svgRef.current?.getBoundingClientRect()
		if (!rect) return null
		const px = clientX - rect.left
		const py = clientY - rect.top
		let best: number | null = null
		let bestD = 15 * 15
		for (const r of story.rows) {
			const dx = xAt(r) - px
			const dy = yAt(r.i) - py
			const dist = dx * dx + dy * dy - (r.raiders ? 40 : r.inGroup ? 12 : 0)
			if (dist < bestD) {
				bestD = dist
				best = r.i
			}
		}
		return best
	}

	const step = (dir: 1 | -1) => {
		if (!ordered.length) return
		const at = ordered.findIndex((r) => r.i === pin)
		const next = at < 0 ? (dir === 1 ? 0 : ordered.length - 1) : (at + dir + ordered.length) % ordered.length
		setPin(ordered[next].i)
	}

	const keptPct = Math.round(story.kept * 100)
	const towardPct = Number.isFinite(story.toward) ? Math.round(story.toward * 100) : 0
	const shareStat = story.key
	const pinRow = pinned ? meta.teams[pinned.i] : null
	const shareText = {
		chart: `${story.headline} ${story.verdict.text}.`,
		wins: clipText(story.winsLine, 200),
		fifths: `${story.label}: the Raiders are ${ordinalOf(story.rank)} of 32 (${story.valueText}), in the ${fifthName(story.raidersFifth)} of teams, where ${pctText(story.fifths[story.raidersFifth].rate)} made the playoffs.`,
		checklist: checklist[0] ? `The Raiders' playoff checklist after ${n} games. ${checklist[0].label} has separated playoff teams best: ${pctText(checklist[0].best)} of the best fifth made it, ${pctText(checklist[0].worst)} of the worst.` : "The Raiders' playoff checklist.",
		season: pinned ? `${teamLabel(meta.teams[pinned.i])} started ${recordText(meta.startWins[pinned.i], meta.startLosses[pinned.i], n)} and finished ${recordText(meta.wins[pinned.i], meta.losses[pinned.i], seasonGames(seasonOf(meta.teams[pinned.i])))}${pinned.po ? ", making the playoffs" : ", missing the playoffs"}.` : "",
	}

	const o = story.outcomes
	const phase = p < 0.03 ? 0 : p > 0.97 ? 2 : 1
	const hasBackground = story.rows.length > story.groupSize
	const gamesA = `Games 1–${n}`
	const gamesB = `Games ${n + 1}–${games}`
	const phaseLabel = phase === 0 ? gamesA : phase === 2 ? gamesB : `${gamesA} → ${gamesB}`
	const caption = [
		empty ? "Nothing to show with these filters. Widen them to see teams." : `Where the ${story.groupSize} highlighted teams stood after their first ${n} games${hasBackground ? ", with every other team faint behind them" : ""}.`,
		"Now the rest of their seasons play out. Watch where the dots head.",
		empty ? "" : `Where they finished. ${towardPct}% of the highlighted teams slid back toward the dashed line, the league average.`,
	][phase]
	const raidersWin = start ? start.wins / n : null
	const progressText = p <= 0 ? `${gamesA}, the first ${n} games` : p >= 1 ? `${gamesB}, the rest of the season` : `Moving from ${gamesA.toLowerCase()} to ${gamesB.toLowerCase()}, ${Math.round(p * 100)}% of the way`
	const filtered = filter.scope !== DEFAULT_FILTER.scope || !!filter.team || filter.playoffs !== "any" || filter.years.length > 0

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
	const checks = showAllChecks ? checklist : checklist.slice(0, CHECK_LIMIT)

	let ridge = ""
	if (dens && !empty) {
		const hmax = 54
		const pts = dens.a.map((a, k) => {
			const v = a + (dens.b[k] - a) * mix
			return `${(M.left + ((k + 0.5) / RIDGE_BINS) * plotW).toFixed(1)} ${(baseY - (v / dens.max) * hmax).toFixed(1)}`
		})
		ridge = `M${M.left} ${baseY}L${pts.join("L")}L${M.left + plotW} ${baseY}Z`
	}
	let ghost = ""
	if (dens && !empty) {
		const hmax = 54
		ghost = `M${dens.a.map((a, k) => `${(M.left + ((k + 0.5) / RIDGE_BINS) * plotW).toFixed(1)} ${(baseY - (a / dens.max) * hmax).toFixed(1)}`).join("L")}`
	}
	const winTicks = [4, 8, 12, 16].filter((w) => w < games)

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
					<p className="m-0 flex items-center gap-2.5 font-mono text-sm tabular-nums text-lab-soft">
						<RaidersMark src={raidersLogo} size={34} />
						<span>
							{season} Raiders &middot; {start ? `${start.wins}-${start.losses} after ${n} games` : `${n} games played`}
						</span>
					</p>
				</div>
				<div className="p-4 sm:p-7">
					<div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
						<div className="min-w-0 flex-1 basis-[28rem]">
							<h2 id="chart-heading" className="m-0 scroll-mt-6 font-serif text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
								{story.headline}
							</h2>
							<p className="m-0 mt-3 text-sm leading-relaxed text-lab-soft sm:text-base">{story.sub}</p>
						</div>
						<div className="flex shrink-0 flex-wrap items-center gap-2">
							<p className="m-0 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.12em]" style={{ borderColor: vColor, color: vColor }}>
								<VerdictIcon id={story.verdict.id} />
								{story.verdict.text}
							</p>
							<ShareCard kind="chart" view={{ stat: shareStat, filter, pin: pinRow, y: yMode }} stamp={stamp} text={shareText.chart} alt={`${story.label}: ${story.headline} ${story.verdict.text}.`} />
						</div>
					</div>

					<ol className="m-0 mt-5 grid list-none gap-3 p-0 text-sm leading-snug text-lab-soft sm:grid-cols-3" aria-label="How to read this chart">
						{[
							{ t: "One dot is one team", d: `Each dot is one team in one season since ${first}. Filled blue dots made the playoffs, hollow orange rings did not, and gold rings are earlier Raiders teams. Tap a dot to pin it.` },
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
						<div className="flex flex-wrap items-start gap-x-6 gap-y-4">
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
							<YearPicker first={first} last={last} years={filter.years} onChange={(years) => update({ years })} />
							{filtered ? (
								<button type="button" onClick={() => update(DEFAULT_FILTER)} className="min-h-[40px] self-end rounded-lg px-3 py-2 text-sm font-semibold text-lab-soft underline underline-offset-4 hover:text-lab-ink">
									Reset filters
								</button>
							) : null}
						</div>
					</fieldset>

					<div className="mt-4">
						<p className="m-0 mb-2 text-xs font-semibold text-lab-muted">
							Compare with a Raiders season ({first} to {last}). Pick one to pin it and see how it started and ended.
						</p>
						<div className="flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Raiders seasons">
							{raidersRows.map((r) => {
								const yr = seasonOf(meta.teams[r.i])
								const on = pin === r.i
								const rec = recordText(meta.startWins[r.i], meta.startLosses[r.i], n)
								const fin = recordText(meta.wins[r.i], meta.losses[r.i], seasonGames(yr))
								return (
									<button
										key={r.i}
										type="button"
										aria-pressed={on}
										aria-label={`${yr} Raiders: started ${rec}, finished ${fin}, ${r.po ? "made" : "missed"} the playoffs`}
										onClick={() => setPin(on ? null : r.i)}
										className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${on ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong bg-lab-page text-lab-ink hover:bg-lab-hover"}`}
									>
										<PlayoffMark made={r.po} />
										{yr} <span className={`font-mono text-xs ${on ? "opacity-80" : "text-lab-muted"}`}>{rec}</span>
									</button>
								)
							})}
						</div>
					</div>

					<div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border border-lab-line bg-lab-tint px-4 py-3">
						<div className="flex flex-wrap items-center gap-x-5 gap-y-2">
							<p className="m-0 inline-flex items-center gap-2 rounded-full bg-lab-ink px-4 py-1.5 font-mono text-sm font-bold tabular-nums text-lab-page" aria-live="off">
								<span className="inline-block h-2 w-2 rounded-full" style={{ background: playing ? LAB.firstDown : LAB.inkMuted }} aria-hidden />
								{phaseLabel}
							</p>
							{!empty ? (
								<>
									<p className="m-0 text-xs leading-tight text-lab-muted">
										<span className="block font-semibold uppercase tracking-[0.12em]">Group average</span>
										<span className="font-mono text-lg font-bold tabular-nums text-lab-ink">{formatStat(story, liveAvg)}</span>
										<span className="ml-1.5">league {story.baseText}</span>
									</p>
									<p className="m-0 text-xs leading-tight text-lab-muted">
										<span className="block font-semibold uppercase tracking-[0.12em]">Closer to average</span>
										<span className="font-mono text-lg font-bold tabular-nums text-lab-ink">{closerPct}%</span>
										<span className="ml-1.5">of {members.length}</span>
									</p>
								</>
							) : null}
						</div>
						<div role="group" aria-label="How the dots are spread" className="flex flex-col gap-1">
							<span className="text-xs font-semibold text-lab-muted">Dots go up with</span>
							<div className="flex overflow-hidden rounded-lg border border-lab-line-strong">
								{(
									[
										["spread", "Nothing (spread out)"],
										["wins", "Final wins"],
									] as const
								).map(([v, label]) => (
									<button
										key={v}
										type="button"
										aria-pressed={yMode === v}
										onClick={() => setYMode(v)}
										className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${yMode === v ? "bg-lab-ink text-lab-page" : "bg-lab-surface text-lab-ink hover:bg-lab-hover"}`}
									>
										{label}
									</button>
								))}
							</div>
						</div>
					</div>
					<p className="m-0 mt-2 min-h-[2.5rem] text-sm leading-snug text-lab-soft">{caption}</p>

					<div ref={stripRef} className="relative mt-1 w-full">
						<svg
							ref={svgRef}
							width={width}
							height={H}
							role="img"
							aria-label={`${story.headline} ${story.verdict.text}. The table below the chart lists every team.`}
							className="block max-w-full cursor-crosshair select-none overflow-visible"
							style={{ touchAction: "pan-y" }}
							onPointerMove={(e) => setHover(nearest(e.clientX, e.clientY))}
							onPointerDown={(e) => setHover(nearest(e.clientX, e.clientY))}
							onPointerLeave={() => setHover(null)}
							onClick={(e) => {
								const i = nearest(e.clientX, e.clientY)
								if (i !== null) setPin((cur) => (cur === i ? null : i))
							}}
						>
							<rect x={0} y={0} width={width} height={H - M.bottom + 12} rx={12} fill={LAB.page} stroke={LAB.line} />
							{ticks.map((t, k) => (
								<line key={`g${k}`} x1={t.x} x2={t.x} y1={M.top - 8} y2={H - M.bottom + 8} stroke={LAB.grid} strokeWidth={1} pointerEvents="none" />
							))}
							{yBlend > 0.02
								? winTicks.map((w) => {
										const y = M.top + 7 + (1 - w / games) * lane
										return (
											<g key={`w${w}`} pointerEvents="none" opacity={ease(yBlend)}>
												<line x1={M.left} x2={width - M.right} y1={y} y2={y} stroke={LAB.grid} strokeDasharray="1 4" />
												<text x={M.left + 4} y={y - 4} fontSize={11} fontWeight={600} fill={LAB.inkMuted} stroke={LAB.page} strokeWidth={4} paintOrder="stroke">
													{w} wins
												</text>
											</g>
										)
									})
								: null}
							{!empty ? <rect x={X(story.band[0])} y={M.top - 8} width={Math.max(2, X(story.band[1]) - X(story.band[0]))} height={H - M.top - M.bottom + 16} fill={LAB.firstDown} fillOpacity={0.12 * mix} stroke={LAB.firstDown} strokeOpacity={0.6 * mix} strokeDasharray="4 4" /> : null}
							{ridge ? <path d={ridge} fill={LAB.scrimmage} fillOpacity={0.16} stroke={LAB.scrimmage} strokeOpacity={0.7} strokeWidth={1.5} pointerEvents="none" /> : null}
							{ghost && mix > 0.02 ? <path d={ghost} fill="none" stroke={LAB.inkMuted} strokeWidth={1.5} strokeDasharray="3 4" pointerEvents="none" /> : null}
							<line x1={X(story.base)} x2={X(story.base)} y1={M.top - 8} y2={H - M.bottom + 8} stroke={LAB.axis} strokeDasharray="2 5" />
							<line x1={rvX} x2={rvX} y1={M.top - 14} y2={H - M.bottom + 8} stroke={LAB.firstDown} strokeWidth={2.5} />
							<path data-dots="faint" d={bgPath} fill={LAB.inkMuted} fillOpacity={0.2} pointerEvents="none" />
							<path d={trailPath} fill="none" stroke={LAB.inkMuted} strokeOpacity={0.2} strokeWidth={1} pointerEvents="none" />
							<path d={glowPath} fill={LAB.scrimmage} fillOpacity={0.1} pointerEvents="none" />
							<path data-dots="missed" d={missedPath} fill={LAB.opp} fillOpacity={0.14} stroke={LAB.opp} strokeWidth={1.6} pointerEvents="none" />
							<path data-dots="made" d={madePath} fill={LAB.scrimmage} fillOpacity={0.85} pointerEvents="none" />
							{!empty ? (
								<g pointerEvents="none">
									<line x1={avgX} x2={avgX} y1={M.top - 2} y2={H - M.bottom + 6} stroke={LAB.ink} strokeWidth={2} strokeDasharray="1 0" strokeOpacity={0.85} />
									<path d={`M${avgX - 6} ${M.top - 12}L${avgX + 6} ${M.top - 12}L${avgX} ${M.top - 2}Z`} fill={LAB.ink} />
									<text x={avgX} y={M.top - 17} fontSize={12} fontWeight={700} textAnchor="middle" fill={LAB.ink} stroke={LAB.page} strokeWidth={4} paintOrder="stroke">
										group average {formatStat(story, liveAvg)}
									</text>
								</g>
							) : null}
							{raidersRows.map((r) => {
								const on = hover === r.i || pin === r.i
								const cx = xAt(r)
								const cy = yAt(r.i)
								return (
									<g key={r.i} pointerEvents="none">
										{r.po ? (
											<circle cx={cx} cy={cy} r={on ? R + 4 : R + 2.4} fill={LAB.scrimmage} stroke={LAB.firstDown} strokeWidth={2.6} />
										) : (
											<circle cx={cx} cy={cy} r={on ? R + 4 : R + 2.4} fill={LAB.surface} stroke={LAB.firstDown} strokeWidth={2.6} strokeDasharray="3 2" />
										)}
									</g>
								)
							})}
							{pinned ? (
								<g pointerEvents="none">
									<circle cx={xAt(pinned)} cy={yAt(pinned.i)} r={R + 7} fill="none" stroke={LAB.ink} strokeWidth={2.5} />
									<text x={xAt(pinned)} y={yAt(pinned.i) - R - 12} fontSize={12} fontWeight={700} textAnchor="middle" fill={LAB.ink} stroke={LAB.page} strokeWidth={4} paintOrder="stroke">
										{teamLabel(meta.teams[pinned.i])}
									</text>
								</g>
							) : null}
							{hv && !hv.raiders ? <circle cx={xAt(hv)} cy={yAt(hv.i)} r={R + 3} fill="none" stroke={LAB.ink} strokeWidth={2} pointerEvents="none" /> : null}
							<g transform={`translate(${chipX}, 8)`} pointerEvents="none">
								<rect width={chipW} height={26} rx={7} fill={LAB.firstDown} />
								{raidersLogo ? <image href={raidersLogo} x={5} y={3} width={20} height={20} preserveAspectRatio="xMidYMid meet" /> : null}
								<text x={11 + logoW} y={17.5} fontSize={13} fontWeight={700} fill={LAB.onFirstDown}>
									{chip}
								</text>
							</g>
							<text transform={`translate(${X(story.base) - 5} ${baseY - 4}) rotate(-90)`} fontSize={11} fontWeight={600} fill={LAB.inkMuted} pointerEvents="none" stroke={LAB.page} strokeWidth={4} paintOrder="stroke">
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
								style={{ left: Math.max(0, Math.min(width - 240, xAt(hv) > width * 0.55 ? xAt(hv) - 252 : xAt(hv) + 14)), top: Math.max(0, Math.min(H - 150, yAt(hv.i) > H * 0.5 ? yAt(hv.i) - 120 : yAt(hv.i) + 16)) }}
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
								<p className="m-0 mt-1 text-[11px] text-lab-muted">Click to pin</p>
							</div>
						) : null}
						<div className="mt-1 flex justify-between text-xs font-semibold text-lab-muted" aria-hidden>
							<span>&larr; {story.higherIsBetter ? "Worse" : "Better"}</span>
							<span>{story.higherIsBetter ? "Better" : "Worse"} &rarr;</span>
						</div>
					</div>

					<div className="mt-3 flex flex-wrap items-start gap-x-5 gap-y-3">
						<button
							type="button"
							onClick={() => (playing ? stop() : play())}
							className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-lab-ink px-5 py-2 text-sm font-bold text-lab-page transition hover:opacity-90"
						>
							{playing ? <Pause className="h-4 w-4" aria-hidden /> : p >= 1 ? <RotateCcw className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
							{playing ? "Pause" : p >= 1 ? "Replay" : "Play"}
						</button>
						<div className="flex min-w-[240px] flex-1 flex-col gap-1">
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
								className="h-8 w-full"
								style={{ accentColor: LAB.firstDown }}
							/>
							<GameRuler games={games} n={n} mix={mix} />
							<p className="m-0 text-[11px] leading-snug text-lab-muted">Teams before 2021 played 16 games, so their second block ends at game 16.</p>
						</div>
					</div>
					<p className="m-0 mt-3 min-h-[44px] text-sm leading-snug text-lab-soft" aria-live="polite">
						{hv ? lineFor(hv.i) : "Hover or tap a dot to see which team it is, its record and whether it made the playoffs. Click one to pin it."}
					</p>

					{pinned ? (
						<section id="pinned-team" className="mt-3 scroll-mt-6 rounded-xl border-2 p-4" style={{ borderColor: pinned.raiders ? LAB.firstDown : LAB.ink }} aria-label="Pinned team">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="m-0 flex items-center gap-2 font-serif text-xl font-bold">
										{pinned.raiders ? <RaidersMark src={raidersLogo} size={28} /> : null}
										<PlayoffMark made={pinned.po} size={14} />
										{teamLabel(meta.teams[pinned.i])}
									</p>
									<p className="m-0 mt-1 text-sm text-lab-soft">{lineFor(pinned.i)}</p>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<ShareCard kind="season" view={{ stat: shareStat, filter, pin: pinRow, y: yMode }} stamp={stamp} text={shareText.season} alt={`${teamLabel(meta.teams[pinned.i])}: ${lineFor(pinned.i)}`} />
									<button type="button" onClick={() => step(-1)} aria-label="Previous team" className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-lab-line-strong text-lab-soft transition hover:bg-lab-hover hover:text-lab-ink">
										<ArrowLeft className="h-4 w-4" aria-hidden />
									</button>
									<button type="button" onClick={() => step(1)} aria-label="Next team" className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-lab-line-strong text-lab-soft transition hover:bg-lab-hover hover:text-lab-ink">
										<ArrowRight className="h-4 w-4" aria-hidden />
									</button>
									<button type="button" onClick={() => setPin(null)} aria-label="Clear the pinned team" className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-lab-line-strong text-lab-soft transition hover:bg-lab-hover hover:text-lab-ink">
										<CloseIcon className="h-4 w-4" aria-hidden />
									</button>
								</div>
							</div>
							<div className="mt-3 grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
								<MoveLine story={story} start={pinned.start} rest={pinned.rest} />
								<dl className="m-0 grid grid-cols-3 gap-4 text-center sm:text-left">
									<div>
										<dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">Move</dt>
										<dd className="m-0 font-mono text-lg font-bold tabular-nums">{formatStat(table, pinned.rest - pinned.start)}</dd>
									</div>
									<div>
										<dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">Direction</dt>
										<dd className="m-0 text-sm font-semibold">{pinned.toward ? "Toward average" : "Away from average"}</dd>
									</div>
									<div>
										<dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">Finished</dt>
										<dd className="m-0 font-mono text-lg font-bold tabular-nums">{recordText(meta.wins[pinned.i], meta.losses[pinned.i], seasonGames(seasonOf(meta.teams[pinned.i])))}</dd>
									</div>
								</dl>
							</div>
							{pinned.raiders ? (
								<button
									type="button"
									onClick={() => update({ years: [seasonOf(meta.teams[pinned.i])], scope: "all", team: null })}
									className="mt-3 min-h-[40px] rounded-lg border border-lab-line-strong px-4 py-2 text-sm font-semibold text-lab-soft transition hover:bg-lab-hover hover:text-lab-ink"
								>
									Show all 32 teams from {seasonOf(meta.teams[pinned.i])}
								</button>
							) : null}
							<p className="m-0 mt-3 text-xs text-lab-muted">The {season} Raiders are at {story.valueText}.</p>
						</section>
					) : null}

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
							<svg width="14" height="12" aria-hidden>
								<line x1="7" x2="7" y1="0" y2="12" stroke={LAB.ink} strokeWidth="2" />
							</svg>
							Group average, moving as you play
						</li>
						<li className="flex items-center gap-2">
							<svg width="18" height="12" aria-hidden>
								<rect x="0.5" y="0.5" width="17" height="11" fill={LAB.firstDown} fillOpacity={0.14} stroke={LAB.firstDown} strokeOpacity={0.7} strokeDasharray="3 3" />
							</svg>
							Where the middle half finished
						</li>
						<li className="flex items-center gap-2">
							<svg width="18" height="12" aria-hidden>
								<path d="M0 12L3 5L7 8L11 1L15 7L18 12Z" fill={LAB.scrimmage} fillOpacity={0.25} stroke={LAB.scrimmage} />
							</svg>
							How many teams sit at each value
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
								<div className="flex flex-wrap items-center justify-between gap-3">
									<h3 id="wins-heading" className="m-0 scroll-mt-6 font-serif text-lg font-bold">
										What that meant in wins and playoffs
									</h3>
									<ShareCard kind="wins" view={{ stat: shareStat, filter }} stamp={stamp} text={shareText.wins} alt={`${story.label}: ${story.winsLine}`} />
								</div>
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
						<p className="m-0 mt-6 rounded-xl border border-lab-line bg-lab-tint px-4 py-3 text-sm text-lab-soft">No team-seasons match these filters. Try a different team, other seasons, or choose &ldquo;Any&rdquo; for the season result.</p>
					)}

					<section className="mt-5 rounded-xl border border-lab-line bg-lab-tint p-4 sm:p-5" aria-labelledby="fifths-heading">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<h3 id="fifths-heading" className="m-0 scroll-mt-6 font-serif text-lg font-bold">
								How often teams made the playoffs, by {story.short}
							</h3>
							<ShareCard kind="fifths" view={{ stat: shareStat }} stamp={stamp} text={shareText.fifths} alt={`How often teams made the playoffs, by ${story.short}, with the Raiders in the ${fifthName(story.raidersFifth)}.`} />
						</div>
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
						<div className="flex flex-wrap items-center justify-between gap-3">
							<h3 id="check-heading" className="m-0 scroll-mt-6 font-serif text-lg font-bold">
								The Raiders&rsquo; playoff checklist
							</h3>
							<ShareCard kind="checklist" view={{}} stamp={stamp} text={shareText.checklist} alt="The Raiders' playoff checklist: each stat's playoff rate for teams that stood where the Raiders stand." />
						</div>
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

					<details open className="mt-5 rounded-xl border border-lab-line bg-lab-tint px-4 py-3 text-sm">
						<summary className="cursor-pointer font-semibold text-lab-soft">See every team in this chart ({Math.min(story.groupSize, TABLE_LIMIT)})</summary>
						<div className="mt-3">
							<Leaderboard
								meta={meta}
								table={table}
								story={story}
								rows={members}
								pin={pin}
								onPin={(i) => {
									setPin(i)
									toChart()
								}}
								season={season}
								limit={TABLE_LIMIT}
							/>
						</div>
					</details>

				</div>
			</div>
		</div>
	)
}
