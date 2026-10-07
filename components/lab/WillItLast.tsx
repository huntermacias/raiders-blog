"use client"

import * as React from "react"
import { Check, Link2, Minus, Pause, Play, RotateCcw, TrendingDown, TrendingUp } from "lucide-react"

import CardFigure from "@/components/lab/CardFigure"
import { LAB } from "@/lib/lab/theme"
import { type Story, formatStat, ordinalOf, teamLabel } from "@/lib/lab/historyKit"

/** How long the dots take to travel from the first games to the rest of the season. */
const DURATION_MS = 4200
const SITE_URL = "https://www.raidersrundown.com"
const PAGE_PATH = "/lab/will-it-last"

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

function verdictColor(id: Story["verdict"]["id"]): string {
	if (id === "fade") return LAB.opp
	if (id === "improve") return LAB.scrimmage
	return LAB.inkSoft
}

function VerdictIcon({ id }: { id: Story["verdict"]["id"] }) {
	const cls = "h-4 w-4"
	if (id === "fade" || id === "linger") return <TrendingDown className={cls} aria-hidden />
	if (id === "improve" || id === "hold") return <TrendingUp className={cls} aria-hidden />
	return <Minus className={cls} aria-hidden />
}

type Props = {
	stories: Story[]
	season: number
	/** Games played, which is where every team's season is cut in two. */
	n: number
	first: number
	last: number
	/** Changes when the data does, so share images are not served stale. */
	stamp: number
}

export default function WillItLast({ stories, season, n, first, last, stamp }: Props) {
	const [idx, setIdx] = React.useState(0)
	const [p, setP] = React.useState(0)
	const [playing, setPlaying] = React.useState(false)
	const [hover, setHover] = React.useState<number | null>(null)
	const [copied, setCopied] = React.useState(false)
	const [width, setWidth] = React.useState(960)
	const reduced = usePrefersReducedMotion()
	const reducedRef = React.useRef(reduced)
	reducedRef.current = reduced
	const rootRef = React.useRef<HTMLDivElement>(null)
	const stripRef = React.useRef<HTMLDivElement>(null)
	const pRef = React.useRef(0)
	const raf = React.useRef(0)
	const started = React.useRef(false)

	const story = stories[Math.min(idx, stories.length - 1)]

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

	const pick = (i: number) => {
		stop()
		setIdx(i)
		setHover(null)
		started.current = true
		if (reducedRef.current) set(1)
		else {
			set(0)
			play(true)
		}
	}

	const narrow = width < 560
	const H = narrow ? 270 : 320
	const M = { left: 18, right: 18, top: 44, bottom: 34 }
	const plotW = width - M.left - M.right
	const [d0, d1] = story.domain
	const X = (v: number) => M.left + ((v - d0) / (d1 - d0)) * plotW
	const R = narrow ? 3.8 : 4.6
	const lane = H - M.top - M.bottom - 12

	const yOf = (i: number) => M.top + 6 + (((i * 53) % 100) / 100) * lane
	const delayOf = (i: number) => (((i * 37) % 100) / 100) * 0.22
	const xNow = (i: number) => {
		const d = story.dots[i]
		const local = ease(clamp01((p - delayOf(i)) / (1 - delayOf(i))))
		return X(d.start + (d.rest - d.start) * local)
	}

	const ticks = [0, 1, 2, 3, 4].map((k) => {
		const v = d0 + ((d1 - d0) * k) / 4
		return { x: X(v), label: formatStat(story, v) }
	})
	const rvX = X(story.value)
	const flip = rvX > width * 0.66
	const chip = `${season} Raiders ${story.valueText}`
	const chipW = chip.length * 7.4 + 22
	const hv = hover !== null ? story.dots[hover] : null
	const vColor = verdictColor(story.verdict.id)

	const keptPct = Math.round(story.kept * 100)
	const towardPct = Math.round(story.toward * 100)
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

	const progressText = p <= 0 ? `First ${n} games` : p >= 1 ? "Rest of the season" : `${Math.round(p * 100)}% of the way`

	return (
		<div ref={rootRef}>
			<div className="flex flex-wrap gap-2" role="group" aria-label="Choose a stat">
				{stories.map((s, i) => {
					const on = i === idx
					return (
						<button
							key={s.key}
							type="button"
							aria-pressed={on}
							onClick={() => pick(i)}
							className={`min-h-[44px] rounded-full border px-4 py-2 text-sm font-semibold transition ${on ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong bg-lab-surface text-lab-ink hover:bg-lab-hover"}`}
						>
							{s.label} <span className={on ? "opacity-80" : "text-lab-muted"}>&middot; {ordinalOf(s.rank)}</span>
						</button>
					)
				})}
			</div>

			<div className="mt-5 rounded-2xl border border-lab-line bg-lab-surface p-4 shadow-[var(--lab-shadow)] sm:p-7">
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

				<div ref={stripRef} className="mt-6 w-full">
					<svg width={width} height={H} role="img" aria-label={`${story.headline} ${story.verdict.text}. The table below the chart lists every team.`} className="block max-w-full select-none overflow-visible" style={{ touchAction: "pan-y" }}>
						<rect x={0} y={0} width={width} height={H - M.bottom + 12} rx={12} fill={LAB.page} stroke={LAB.line} />
						<rect x={X(story.band[0])} y={M.top - 8} width={Math.max(2, X(story.band[1]) - X(story.band[0]))} height={H - M.top - M.bottom + 16} fill={LAB.firstDown} fillOpacity={0.14 * ease(p)} stroke={LAB.firstDown} strokeOpacity={0.7 * ease(p)} strokeDasharray="4 4" />
						<line x1={X(story.base)} x2={X(story.base)} y1={M.top - 8} y2={H - M.bottom + 8} stroke={LAB.axis} strokeDasharray="2 5" />
						<line x1={rvX} x2={rvX} y1={M.top - 14} y2={H - M.bottom + 8} stroke={LAB.firstDown} strokeWidth={2.5} />
						{story.dots.map((d, i) => {
							const cx = xNow(i)
							const cy = yOf(i)
							const on = hover === i
							if (d.raiders) {
								return <circle key={i} cx={cx} cy={cy} r={R + 2.6} fill={LAB.team} stroke={LAB.firstDown} strokeWidth={2.5} pointerEvents="none" />
							}
							return d.toward ? (
								<circle key={i} cx={cx} cy={cy} r={on ? R + 2 : R} fill={LAB.team} fillOpacity={on ? 1 : 0.78} stroke={on ? LAB.ink : "none"} strokeWidth={2} pointerEvents="none" />
							) : (
								<circle key={i} cx={cx} cy={cy} r={on ? R + 2 : R} fill={LAB.opp2} fillOpacity={0.14} stroke={LAB.opp2} strokeWidth={on ? 2.6 : 1.8} pointerEvents="none" />
							)
						})}
						{story.dots.map((d, i) => (
							<circle
								key={`hit-${i}`}
								cx={xNow(i)}
								cy={yOf(i)}
								r={R + 5}
								fill="transparent"
								onPointerEnter={() => setHover(i)}
								onPointerDown={() => setHover(i)}
								onPointerLeave={() => setHover((h) => (h === i ? null : h))}
							/>
						))}
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
						{hv
							? `${teamLabel(hv.team)}: ${formatStat(story, hv.start)} through ${n} games, ${formatStat(story, hv.rest)} the rest of the way${hv.raiders ? " (an earlier Raiders team)" : hv.toward ? ", closer to average" : ", further from average"}.`
							: "Hover or tap a dot to see which team it is."}
					</p>
				</div>

				<dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
					{[
						{ k: "Their average start", v: story.startText, note: `through ${n} games` },
						{ k: "Their average finish", v: story.restText, note: "rest of the season" },
						{ k: "Moved toward average", v: `${towardPct}%`, note: `of ${story.dots.length} teams`, hot: true },
						{ k: "Typical finish for a team like this", v: story.typicalText, note: `league average is ${story.baseText}` },
						{ k: "Earlier Raiders teams", v: story.earlier.count ? `${story.earlier.toward} of ${story.earlier.count}` : "None", note: story.earlier.count ? "moved toward average" : "started this way" },
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
				</p>

				<ul className="m-0 mt-5 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-xs text-lab-soft" aria-label="Legend">
					<li className="flex items-center gap-2">
						<svg width="12" height="12" aria-hidden>
							<circle cx="6" cy="6" r="5" fill={LAB.team} />
						</svg>
						Moved toward average
					</li>
					<li className="flex items-center gap-2">
						<svg width="12" height="12" aria-hidden>
							<circle cx="6" cy="6" r="4.5" fill={LAB.opp2} fillOpacity={0.14} stroke={LAB.opp2} strokeWidth="1.8" />
						</svg>
						Moved away
					</li>
					<li className="flex items-center gap-2">
						<svg width="14" height="14" aria-hidden>
							<circle cx="7" cy="7" r="5" fill={LAB.team} stroke={LAB.firstDown} strokeWidth="2.5" />
						</svg>
						An earlier Raiders team
					</li>
					<li className="flex items-center gap-2">
						<svg width="18" height="12" aria-hidden>
							<rect x="0.5" y="0.5" width="17" height="11" fill={LAB.firstDown} fillOpacity={0.14} stroke={LAB.firstDown} strokeOpacity={0.7} strokeDasharray="3 3" />
						</svg>
						Where the middle half of teams finished
					</li>
					<li className="flex items-center gap-2">
						<svg width="14" height="12" aria-hidden>
							<line x1="7" x2="7" y1="0" y2="12" stroke={LAB.firstDown} strokeWidth="2.5" />
						</svg>
						The {season} Raiders now
					</li>
				</ul>

				<details className="mt-5 rounded-xl border border-lab-line bg-lab-tint px-4 py-3 text-sm">
					<summary className="cursor-pointer font-semibold text-lab-soft">See every team in this chart</summary>
					<div className="mt-3 max-h-80 overflow-auto">
						<table className="w-full border-collapse text-left text-xs tabular-nums">
							<caption className="sr-only">
								Teams since {first} that started at least as far from average as the {season} Raiders, with their {story.unit} through {n} games and over the rest of the season.
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
									<th scope="col" className="sticky top-0 bg-lab-page py-1.5 font-semibold">
										Moved
									</th>
								</tr>
							</thead>
							<tbody>
								{story.dots.map((d, i) => (
									<tr key={i} className="border-t border-lab-line">
										<th scope="row" className="py-1.5 pr-3 font-semibold">
											{teamLabel(d.team)}
										</th>
										<td className="py-1.5 pr-3 text-right font-mono">{formatStat(story, d.start)}</td>
										<td className="py-1.5 pr-3 text-right font-mono">{formatStat(story, d.rest)}</td>
										<td className="py-1.5">{d.toward ? "Toward average" : "Away from average"}</td>
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

			<div className="mt-6 max-w-xl">
				<CardFigure src={src} alt={`${story.label}: ${story.headline} ${story.verdict.text}.`} filename={`raiders-will-it-last-${story.key.replace(".", "-")}.png`} caption={`Share card, ${first} to ${last} history`} />
			</div>
		</div>
	)
}
