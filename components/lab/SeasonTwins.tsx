"use client"

import * as React from "react"

import { labColorVars } from "@/lib/lab/colors"
import { abbrOf, formatStat, ordinalOf, recordText } from "@/lib/lab/historyKit"
import { LAB } from "@/lib/lab/theme"
import { type Backtest, type TwinMode, type TwinsResult, type Twin, TWIN_MODES, agreement, poolLine, trustLine, twinStory } from "@/lib/lab/twinsKit"

import { twinsQuery, readTwinsView, TWINS_SECTION, TWINS_SHARE_PATH } from "@/lib/lab/twinsShare"

import ShareCard from "./ShareCard"
import { PlayoffMark } from "./WillItLastParts"

export type TwinsModes = Record<TwinMode, { result: TwinsResult; test: Backtest | null } | null>

type Props = {
	modes: TwinsModes
	season: number
	n: number
	first: number
	last: number
	start: { wins: number; losses: number } | null
	/** Changes when the data does, so a shared card is fetched fresh. */
	stamp?: number
}

/** The five closest, then the Raiders' own closest team when it is not already among them. */
function listOf(result: TwinsResult): { twin: Twin; tag: string }[] {
	const out = result.twins.map((twin, k) => ({ twin, tag: `${k + 1}` }))
	const own = result.raidersTwin
	return own && !result.twins.some((t) => t.i === own.i) ? [...out, { twin: own, tag: "Raiders" }] : out
}

const pct = (v: number) => `${Math.round(v * 100)}%`

/** "99.9%" without rounding up to "100%", which would say the twin is identical. */
function closerText(v: number): string {
	const p = v * 100
	if (p >= 99.95) return "99.9%"
	return p >= 99 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`
}

function useReducedMotion(): boolean {
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

/** Eases a list of numbers toward a new list, starting from nothing so the shapes grow in on first view. */
function useTween(target: number[], reduced: boolean, ms = 560): number[] {
	const [cur, setCur] = React.useState<number[]>(() => target.map(() => 0))
	const live = React.useRef<number[]>(cur)
	React.useEffect(() => {
		if (reduced || typeof requestAnimationFrame === "undefined") {
			live.current = target
			setCur(target)
			return
		}
		const from = live.current.length === target.length ? live.current : target.map(() => 0)
		const t0 = performance.now()
		let raf = 0
		const step = (t: number) => {
			const k = Math.min(1, (t - t0) / ms)
			const e = 1 - (1 - k) ** 3
			const next = target.map((v, i) => from[i] + (v - from[i]) * e)
			live.current = next
			setCur(next)
			if (k < 1) raf = requestAnimationFrame(step)
		}
		raf = requestAnimationFrame(step)
		return () => cancelAnimationFrame(raf)
	}, [target, reduced, ms])
	return cur.length === target.length ? cur : target
}

const W = 720
const H = 476
const CX = W / 2
const CY = H / 2
const R = 196
/** On a phone there is no room for the stat names (the table below has them), so the chart zooms in on the shape. */
const COMPACT_BOX = `${CX - R - 14} ${CY - R - 14} ${2 * R + 28} ${2 * R + 28}`

function useCompact(): boolean {
	const [compact, setCompact] = React.useState(false)
	React.useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return
		const q = window.matchMedia("(max-width: 639px)")
		setCompact(q.matches)
		const on = () => setCompact(q.matches)
		q.addEventListener?.("change", on)
		return () => q.removeEventListener?.("change", on)
	}, [])
	return compact
}

const angleOf = (j: number, k: number) => -Math.PI / 2 + (j * 2 * Math.PI) / k
const at = (j: number, k: number, r: number): [number, number] => [CX + r * Math.cos(angleOf(j, k)), CY + r * Math.sin(angleOf(j, k))]
const shape = (vals: number[]) => vals.map((v, j) => at(j, vals.length, R * Math.max(0.02, v)).map((x) => x.toFixed(1)).join(",")).join(" ")

/**
 * The fingerprint: one spoke per stat, further out is better in the league. The Raiders' shape and a twin's shape
 * sit on top of each other, so how alike the two seasons were is something you can see.
 */
function Fingerprint({ result, twin, twinColor, hot, onHot, reduced }: { result: TwinsResult; twin: Twin; twinColor: string; hot: number | null; onHot: (j: number | null) => void; reduced: boolean }) {
	const k = result.stats.length
	const mine = useTween(React.useMemo(() => result.stats.map((s) => s.raidersPct), [result]), reduced)
	const theirs = useTween(React.useMemo(() => twin.pcts.map((p, j) => p ?? result.stats[j].raidersPct), [twin, result]), reduced)
	const compact = useCompact()
	const summary = `Radar chart of ${k} stats. Further out is better in the league. The Raiders and the ${twin.label} follow nearly the same shape.`
	return (
		<svg viewBox={compact ? COMPACT_BOX : `0 0 ${W} ${H}`} role="img" aria-label={summary} className="mx-auto block h-auto w-full max-w-[720px] select-none">
			{[0.25, 0.5, 0.75, 1].map((r) => (
				<polygon key={r} points={Array.from({ length: k }, (_, j) => at(j, k, R * r).map((x) => x.toFixed(1)).join(",")).join(" ")} fill="none" stroke={r === 0.5 ? LAB.axis : LAB.grid} strokeWidth={r === 0.5 ? 1.4 : 1} strokeDasharray={r === 0.5 ? "5 4" : undefined} />
			))}
			{result.stats.map((s, j) => {
				const [x, y] = at(j, k, R)
				const [lx, ly] = at(j, k, R + 16)
				const c = Math.cos(angleOf(j, k))
				const anchor = Math.abs(c) < 0.2 ? "middle" : c > 0 ? "start" : "end"
				const on = hot === j
				return (
					<g key={s.key}>
						<line x1={CX} y1={CY} x2={x} y2={y} stroke={on ? LAB.inkSoft : LAB.grid} strokeWidth={on ? 1.8 : 1} />
						<text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" fontSize={14} fontWeight={on ? 700 : 500} fill={on ? LAB.ink : LAB.inkSoft} className="hidden sm:inline" onMouseEnter={() => onHot(j)} onMouseLeave={() => onHot(null)}>
							{s.label}
						</text>
					</g>
				)
			})}
			<polygon points={shape(theirs)} fill={twinColor} fillOpacity={0.16} stroke={twinColor} strokeWidth={3} strokeLinejoin="round" />
			<polygon points={shape(mine)} fill={LAB.team} fillOpacity={0.14} stroke={LAB.team} strokeWidth={3} strokeLinejoin="round" strokeDasharray="1 0" />
			{theirs.map((v, j) => {
				const [x, y] = at(j, k, R * Math.max(0.02, v))
				return <rect key={`t${j}`} x={x - 4} y={y - 4} width={8} height={8} rx={1.5} fill={twinColor} stroke={LAB.surface} strokeWidth={1.5} transform={`rotate(45 ${x} ${y})`} />
			})}
			{mine.map((v, j) => {
				const [x, y] = at(j, k, R * Math.max(0.02, v))
				return <circle key={`m${j}`} cx={x} cy={y} r={hot === j ? 6 : 4.5} fill={LAB.team} stroke={LAB.surface} strokeWidth={1.5} />
			})}
			<text x={CX} y={CY - R * 0.5 - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={LAB.inkMuted} stroke={LAB.surface} strokeWidth={4} paintOrder="stroke" className="hidden sm:inline">
				League average
			</text>
		</svg>
	)
}

/** A stat's league standing as a strip: where the Raiders sit (circle) and where the twin sat (diamond). */
function Strip({ mine, theirs, twinColor }: { mine: number; theirs: number | null; twinColor: string }) {
	return (
		<div className="relative h-6 w-full" aria-hidden>
			<div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-lab-tint" />
			<div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-lab-muted" style={{ left: "50%" }} />
			{theirs !== null ? <span className="absolute top-1/2 block h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border border-lab-surface" style={{ left: `${theirs * 100}%`, background: twinColor }} /> : null}
			<span className="absolute top-1/2 block h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-lab-surface" style={{ left: `${mine * 100}%`, background: LAB.team }} />
		</div>
	)
}

export default function SeasonTwins({ modes, season, n, first, last, start, stamp = 0 }: Props) {
	const [mode, setMode] = React.useState<TwinMode>("all")
	const [pick, setPick] = React.useState(0)
	const [order, setOrder] = React.useState<"stats" | "match">("stats")
	const [hot, setHot] = React.useState<number | null>(null)
	const reduced = useReducedMotion()

	// The page only renders this when the whole-team match exists, so there is always something to show.
	const { result, test } = (modes[mode] ?? modes.all) as NonNullable<TwinsModes[TwinMode]>

	const list = React.useMemo(() => listOf(result), [result])

	// A shared link carries the match and the twin: open on the same one, and scroll to it.
	React.useEffect(() => {
		const rows = new Set(TWIN_MODES.flatMap((m) => (modes[m.id] ? listOf(modes[m.id]!.result).map((x) => x.twin.row) : [])))
		const v = readTwinsView(Object.fromEntries(new URLSearchParams(window.location.search)), rows)
		const picked = modes[v.mode] ?? modes.all
		if (!picked) return
		const at = v.twin ? listOf(picked.result).findIndex((x) => x.twin.row === v.twin) : -1
		if (v.mode !== "all" || at > 0) {
			setMode(modes[v.mode] ? v.mode : "all")
			setPick(Math.max(0, at))
		}
		if (window.location.hash === `#${TWINS_SECTION}`) document.getElementById(TWINS_SECTION)?.scrollIntoView({ block: "start" })
		// Only on arrival: after that the buttons are in charge.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])
	const chosen = list[Math.min(pick, list.length - 1)]
	const twin = chosen.twin
	const ownIndex = result.raidersTwin ? list.findIndex((x) => x.twin.i === result.raidersTwin?.i) : -1

	const twinAbbr = abbrOf(twin.row)
	const twinIsRaiders = twin.raiders
	const twinColor = twinIsRaiders ? LAB.firstDown : LAB.opp
	const vars = twinIsRaiders ? undefined : (labColorVars(twinAbbr) as React.CSSProperties)

	const rows = React.useMemo(() => {
		const idx = result.stats.map((_, j) => j)
		if (order === "stats") return idx
		const gaps = new Map(agreement(result, twin).map((a) => [a.index, a.gap]))
		return idx.sort((a, b) => (gaps.get(a) ?? 9) - (gaps.get(b) ?? 9) || a - b)
	}, [order, result, twin])

	const close = agreement(result, twin)
	const best = close.slice(0, 3).map((a) => result.stats[a.index].short)
	const worst = close.slice(-3).reverse().map((a) => result.stats[a.index].short)
	const mineRecord = start ? recordText(start.wins, start.losses, n) : null

	return (
		<div className="flex flex-col gap-10">
			<div role="group" aria-label="What to match on" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
				{TWIN_MODES.map((m) => {
					const on = mode === m.id
					const has = !!modes[m.id]
					return (
						<button
							key={m.id}
							type="button"
							disabled={!has}
							aria-pressed={on}
							onClick={() => {
								setMode(m.id)
								setPick(0)
								setHot(null)
							}}
							className={`min-h-[44px] w-full rounded-xl border px-4 py-2 text-left transition disabled:opacity-40 sm:w-auto ${on ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong bg-lab-surface text-lab-ink hover:bg-lab-hover"}`}
						>
							<span className="block text-sm font-bold">{m.label}</span>
							<span className={`block text-xs ${on ? "opacity-80" : "text-lab-muted"}`}>{m.note}</span>
						</button>
					)
				})}
			</div>

			<section className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]" style={vars} aria-labelledby="print-heading">
				<div className="min-w-0">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<h2 id="print-heading" className="m-0 scroll-mt-6 font-serif text-2xl font-bold tracking-tight">
							The {season} Raiders and the {twin.label}
						</h2>
						<ShareCard
							target={{ type: "twins", query: twinsQuery({ mode, twin: twin.row }), sharePath: TWINS_SHARE_PATH, name: "Season twins", file: `raiders-season-twins-${twin.row.toLowerCase().replace(" ", "-")}` }}
							stamp={stamp}
							text={`The ${season} Raiders' closest match since ${first}: the ${twin.label} (${recordText(twin.startWins, twin.startLosses, n)} after ${n}, then ${recordText(twin.wins, twin.losses, twin.games)}${twin.playoffs ? " and the playoffs" : ""}). Lay the two over each other:`}
							alt={`The ${season} Raiders and the ${twin.label}, laid over each other stat by stat`}
						/>
					</div>
					<p className="m-0 mt-2 max-w-xl text-sm leading-relaxed text-lab-soft">
						One spoke for each stat after {n} games. The further out, the better that team ranked among all team-seasons since {first}. The dashed ring is the league average.
					</p>
					<div className="mt-4 rounded-2xl border border-lab-line bg-lab-surface p-2 sm:p-4">
						<Fingerprint result={result} twin={twin} twinColor={twinColor} hot={hot} onHot={setHot} reduced={reduced} />
						<div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 px-2 pb-1 text-xs font-semibold text-lab-soft sm:px-1">
							<span className="inline-flex items-center gap-2">
								<span className="block h-3 w-3 rounded-full" style={{ background: LAB.team }} />
								{season} Raiders{mineRecord ? ` (${mineRecord})` : ""}
							</span>
							<span className="inline-flex items-center gap-2">
								<span className="block h-3 w-3 rotate-45 rounded-[2px]" style={{ background: twinColor }} />
								{twin.label} ({recordText(twin.startWins, twin.startLosses, n)} after {n})
							</span>
						</div>
					</div>
				</div>

				<div className="min-w-0">
					<h2 className="m-0 font-serif text-2xl font-bold tracking-tight">Closest team-seasons</h2>
					<p className="m-0 mt-2 text-sm leading-relaxed text-lab-soft">Pick one to lay it over the Raiders.</p>
					<ol className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
						{list.map((x, k) => {
							const on = k === Math.min(pick, list.length - 1)
							return (
								<li key={x.twin.row}>
									<button
										type="button"
										aria-pressed={on}
										onClick={() => setPick(k)}
										className={`flex min-h-[64px] w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${on ? "border-lab-ink bg-lab-tint" : "border-lab-line-strong bg-lab-surface hover:bg-lab-hover"}`}
									>
										<span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full border border-lab-line-strong px-2 text-xs font-bold tabular-nums">{x.tag}</span>
										<span className="min-w-0 flex-1">
											<span className="block truncate text-base font-bold">{x.twin.label}</span>
											<span className="block text-xs text-lab-muted">Closer than {closerText(x.twin.closer)} of all team-seasons</span>
										</span>
										<span className="shrink-0 text-right">
											<span className="block text-sm font-bold tabular-nums">
												{recordText(x.twin.startWins, x.twin.startLosses, n)} <span aria-hidden>&rarr;</span>
												<span className="sr-only"> then </span> {recordText(x.twin.wins, x.twin.losses, x.twin.games)}
											</span>
											<span className="inline-flex items-center gap-1.5 text-xs text-lab-muted">
												<PlayoffMark made={x.twin.playoffs} size={11} />
												{x.twin.playoffs ? "Playoffs" : "Missed"}
											</span>
										</span>
									</button>
								</li>
							)
						})}
					</ol>
					<p className="m-0 mt-4 text-sm leading-relaxed text-lab-soft" aria-live="polite">
						{twinStory(twin, n)} {best.length ? `The two teams looked most alike on ${best.slice(0, 2).join(" and ")}${worst.length ? `, and least alike on ${worst[0]}` : ""}.` : ""}
					</p>
					{ownIndex >= 0 && pick !== ownIndex ? (
						<button type="button" onClick={() => setPick(ownIndex)} className="mt-3 min-h-[44px] rounded-full border border-lab-line-strong px-4 py-2 text-sm font-semibold hover:bg-lab-hover">
							Show the closest Raiders team: {result.raidersTwin?.label}
						</button>
					) : null}
				</div>
			</section>

			<section aria-labelledby="stat-heading" style={vars}>
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2 id="stat-heading" className="m-0 font-serif text-2xl font-bold tracking-tight">
							Stat by stat
						</h2>
						<p className="m-0 mt-2 max-w-2xl text-sm leading-relaxed text-lab-soft">
							Where each team ranked among all team-seasons after {n} games: the circle is the {season} Raiders, the diamond is the {twin.label}. The last column is what the {twin.label} did over the rest of their season.
						</p>
					</div>
					<div role="group" aria-label="Order of the stats" className="flex gap-1.5">
						{(
							[
								["stats", "Offense, then defense"],
								["match", "Closest match first"],
							] as const
						).map(([id, label]) => (
							<button key={id} type="button" aria-pressed={order === id} onClick={() => setOrder(id)} className={`min-h-[40px] rounded-full border px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${order === id ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong bg-lab-surface hover:bg-lab-hover"}`}>
								{label}
							</button>
						))}
					</div>
				</div>
				<div className="mt-4 overflow-hidden rounded-2xl border border-lab-line bg-lab-surface">
					<div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_repeat(3,minmax(0,0.7fr))] gap-3 border-b border-lab-line px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-lab-muted md:grid">
						<span>Stat</span>
						<span className="flex justify-between">
							<span>Worse</span>
							<span>Better</span>
						</span>
						<span className="text-right">Raiders</span>
						<span className="text-right">Then</span>
						<span className="text-right">After</span>
					</div>
					<ul className="m-0 list-none p-0">
						{rows.map((j) => {
							const s = result.stats[j]
							const t = twin.values[j]
							const r = twin.rest[j]
							const on = hot === j
							return (
								<li
									key={s.key}
									onMouseEnter={() => setHot(j)}
									onMouseLeave={() => setHot(null)}
									onFocus={() => setHot(j)}
									onBlur={() => setHot(null)}
									tabIndex={0}
									className={`grid gap-x-3 gap-y-1 border-b border-lab-line px-4 py-3 outline-none last:border-b-0 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_repeat(3,minmax(0,0.7fr))] md:items-center ${on ? "bg-lab-tint" : ""}`}
								>
									<span className="text-sm font-bold">{s.label}</span>
									<Strip mine={s.raidersPct} theirs={twin.pcts[j]} twinColor={twinColor} />
									<span className="flex items-baseline justify-between gap-2 md:block md:text-right">
										<span className="text-xs text-lab-muted md:hidden">Raiders</span>
										<span className="text-sm font-bold tabular-nums">{formatStat(s, s.raiders)}</span>
										<span className="block text-[11px] text-lab-muted">{ordinalOf(Math.max(1, Math.min(100, Math.round(s.raidersPct * 100))))} percentile</span>
									</span>
									<span className="flex items-baseline justify-between gap-2 md:block md:text-right">
										<span className="text-xs text-lab-muted md:hidden">{twin.label}, first {n}</span>
										<span className="text-sm font-bold tabular-nums">{t === null ? "n/a" : formatStat(s, t)}</span>
									</span>
									<span className="flex items-baseline justify-between gap-2 md:block md:text-right">
										<span className="text-xs text-lab-muted md:hidden">{twin.label}, rest</span>
										<span className="text-sm tabular-nums text-lab-soft">{r === null ? "n/a" : formatStat(s, r)}</span>
									</span>
								</li>
							)
						})}
					</ul>
				</div>
			</section>

			<section aria-labelledby="next-heading" className="rounded-2xl border border-lab-line bg-lab-surface p-6 sm:p-8">
				<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-lab-muted">What happened next</p>
				<h2 id="next-heading" className="m-0 mt-2 max-w-3xl font-serif text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
					{pct(result.pool.outcomes.restWin)} wins after game {n}, and {pct(result.pool.outcomes.playoffs)} made the playoffs
				</h2>
				<p className="m-0 mt-4 max-w-3xl text-base leading-relaxed text-lab-soft">{poolLine(result)}</p>
				{test ? <p className="m-0 mt-4 max-w-3xl text-sm leading-relaxed text-lab-soft">{trustLine(test, first)} A twin is a way to see what a team resembles, not a prediction of what it will do.</p> : null}
			</section>

			<p className="m-0 max-w-3xl text-sm leading-relaxed text-lab-soft">
				How the matching works: every team-season from {first} to {last} is scored on the same {result.stats.length} stats, each one scaled by how much teams usually differ on it. A twin is a team-season
				whose scaled numbers are close to the Raiders&rsquo; across the board. Offense-only and defense-only matches use just those stats. The five closest are shown one by one; the {result.pool.size} closest are added up for the numbers above.
			</p>
		</div>
	)
}
