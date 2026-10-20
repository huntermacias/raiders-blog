"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import Link from "@/components/SiteLink"
import { type MapData, defaultAxes, dotsFor, median, nearest, unit } from "@/lib/lab/mapKit"
import { type PlayerGroup, formatStat, lc, shownPct } from "@/lib/lab/playersKit"
import { compareHref, profileHref, teamNick } from "@/lib/lab/playerView"
import { trackPlayers } from "@/lib/lab/track"

const REACH = 24

const cache = new Map<string, Promise<MapData>>()
function load(group: string): Promise<MapData> {
	let p = cache.get(group)
	if (!p) {
		p = fetch(`/lab/players/map/${group}`).then((r) => {
			if (!r.ok) throw new Error(String(r.status))
			return r.json() as Promise<MapData>
		})
		p.catch(() => cache.delete(group))
		cache.set(group, p)
	}
	return p
}

/**
 * Every player at one job as a dot, two stats on the two axes, with the player of this page picked out. Up and to the right is always
 * better on both (an axis where lower is better is flipped, and says so). The dashed lines are the typical player. Hover, tap or
 * arrow through the dots; the table below has the same numbers.
 */
export default function LeagueMap({ group, focal, headline, peers, initialX, initialY }: { group: PlayerGroup; focal: string[]; headline: string; peers: string; initialX?: string; initialY?: string }) {
	const box = useRef<HTMLDivElement>(null)
	const [map, setMap] = useState<MapData | null>(null)
	const [failed, setFailed] = useState(false)
	const [xk, setX] = useState(initialX ?? "")
	const [yk, setY] = useState(initialY ?? "")
	const [hover, setHover] = useState<number | null>(null)
	const [pick, setPick] = useState<number | null>(null)
	// The drawing is made at the size it is shown, so type is always a readable size and dots are always the same size.
	const [W, setW] = useState(640)
	const H = Math.round(Math.min(460, Math.max(300, W * 0.62)))
	const M = { l: W < 480 ? 80 : 86, r: 26, t: 14, b: 48 }

	useEffect(() => {
		const el = box.current
		if (!el || typeof ResizeObserver === "undefined") return
		const ro = new ResizeObserver(() => setW(Math.max(280, Math.round(el.clientWidth))))
		ro.observe(el)
		setW(Math.max(280, Math.round(el.clientWidth)))
		return () => ro.disconnect()
	}, [])

	useEffect(() => {
		const el = box.current
		if (!el) return
		let started = false
		const go = () => {
			if (started) return
			started = true
			load(group)
				.then((m) => {
					setMap(m)
					setX((x) => x || initialX || defaultAxes(m, headline)[0])
					setY((y) => y || initialY || defaultAxes(m, headline)[1])
				})
				.catch(() => setFailed(true))
		}
		if (typeof IntersectionObserver === "undefined") {
			go()
			return
		}
		const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (go(), io.disconnect()), { rootMargin: "300px" })
		io.observe(el)
		return () => io.disconnect()
	}, [group, headline, initialX, initialY])

	const view = useMemo(() => (map && xk && yk ? dotsFor(map, xk, yk) : null), [map, xk, yk])
	const xs = map?.stats.find((s) => s.k === xk)
	const ys = map?.stats.find((s) => s.k === yk)
	const pts = useMemo(() => (view ? view.dots.map((d) => ({ x: M.l + unit(d.nx, view.x) * (W - M.l - M.r), y: H - M.b - unit(d.ny, view.y) * (H - M.t - M.b) })) : []), [view, W, H])
	const medX = view ? median(view.dots.map((d) => d.nx)) : null
	const medY = view ? median(view.dots.map((d) => d.ny)) : null
	const focalIdx = view ? view.dots.map((d, i) => (focal.includes(d.slug) ? i : -1)).filter((i) => i >= 0) : []
	const shown = hover ?? pick
	const sel = view && shown !== null ? view.dots[shown] : null

	function onMove(e: React.PointerEvent<SVGSVGElement>, commit: boolean) {
		const r = e.currentTarget.getBoundingClientRect()
		const i = nearest(pts, { x: e.clientX - r.left, y: e.clientY - r.top }, REACH)
		if (commit) {
			setPick(i < 0 ? null : i)
			if (i >= 0 && view) trackPlayers("lab_map_select", { group, player: view.dots[i].slug })
		}
		setHover(i < 0 ? null : i)
	}

	function setAxis(which: "x" | "y", k: string) {
		if (which === "x") setX(k)
		else setY(k)
		setHover(null)
		setPick(null)
		trackPlayers("lab_map_axes", { group, x: which === "x" ? k : xk, y: which === "y" ? k : yk })
	}

	function key(e: React.KeyboardEvent) {
		if (!view || !view.dots.length) return
		const order = view.dots.map((_, i) => i).sort((a, b) => view.dots[a].nx - view.dots[b].nx)
		const at = shown === null ? -1 : order.indexOf(shown)
		if (e.key === "ArrowRight" || e.key === "ArrowUp") setHover(order[Math.min(order.length - 1, at + 1)])
		else if (e.key === "ArrowLeft" || e.key === "ArrowDown") setHover(order[Math.max(0, at - 1)])
		else if (e.key === "Enter" && shown !== null) setPick(shown)
		else if (e.key === "Escape") {
			setHover(null)
			setPick(null)
		} else return
		e.preventDefault()
	}

	const graded = map?.stats.filter((s) => s.higher !== null) ?? []
	const axisName = (s: { label: string; short: string; higher: boolean | null }, small = false) => {
		const n = small ? s.short : s.label
		return s.higher === false ? `${n} (lower is better, flipped)` : s.higher === null ? `${n} (style, low to high)` : n
	}
	const ticks = [0, 0.25, 0.5, 0.75, 1]
	const tickLabel = (k: string, higher: boolean | null, nv: number) => formatStat(group, k, higher === false ? -nv : nv)
	const sorted = view ? view.dots.map((d, i) => ({ d, i })).sort((a, b) => b.d.nx - a.d.nx) : []
	const ahead = (axis: "nx" | "ny", slug: string) => {
		if (!view) return null
		const me = view.dots.find((d) => d.slug === slug)
		if (!me) return null
		return shownPct((view.dots.filter((d) => d[axis] < me[axis]).length / Math.max(1, view.dots.length - 1)) * 100)
	}
	const me = focal[0] ? view?.dots.find((d) => d.slug === focal[0]) : undefined

	return (
		<div ref={box} data-testid="league-map">
			{failed ? <p className="m-0 text-sm text-lab-soft">The league map could not load. The leaderboards above have the same numbers.</p> : null}
			{!map && !failed ? <div className="h-72 animate-pulse rounded-xl border border-lab-line bg-lab-tint" aria-hidden /> : null}
			{map && view && xs && ys ? (
				<div>
					<div className="flex flex-wrap items-end gap-3">
						<label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
							Across
							<select className="min-h-[44px] rounded-lg border border-lab-line bg-lab-surface px-3 text-sm font-normal normal-case tracking-normal text-lab-ink" value={xk} onChange={(e) => setAxis("x", e.target.value)}>
								{map.stats.map((s) => (
									<option key={s.k} value={s.k}>
										{s.label}
									</option>
								))}
							</select>
						</label>
						<label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
							Up
							<select className="min-h-[44px] rounded-lg border border-lab-line bg-lab-surface px-3 text-sm font-normal normal-case tracking-normal text-lab-ink" value={yk} onChange={(e) => setAxis("y", e.target.value)}>
								{map.stats.map((s) => (
									<option key={s.k} value={s.k}>
										{s.label}
									</option>
								))}
							</select>
						</label>
						<p className="m-0 pb-2 text-xs text-lab-muted">{view.dots.length} {peers} with both numbers</p>
					</div>

					<div className="relative mt-3">
						<svg
							width={W}
							height={H}
							viewBox={`0 0 ${W} ${H}`}
							className="block w-full touch-pan-y rounded-xl border border-lab-line bg-lab-surface outline-none focus-visible:ring-2 focus-visible:ring-[var(--pc-accent)]"
							role="application"
							tabIndex={0}
							aria-label={`${xs.label} across, ${ys.label} up, ${view.dots.length} ${peers}. Arrow keys move between players, Enter keeps one.`}
							onPointerMove={(e) => e.pointerType === "mouse" && onMove(e, false)}
							onPointerLeave={() => setHover(null)}
							onPointerDown={(e) => onMove(e, true)}
							onKeyDown={key}
						>
							{ticks.map((t) => {
								const gx = M.l + t * (W - M.l - M.r)
								const gy = H - M.b - t * (H - M.t - M.b)
								const nx = view.x.lo + t * (view.x.hi - view.x.lo)
								const ny = view.y.lo + t * (view.y.hi - view.y.lo)
								return (
									<g key={t}>
										<line x1={gx} x2={gx} y1={M.t} y2={H - M.b} stroke="var(--lab-line)" strokeWidth={1} />
										<line x1={M.l} x2={W - M.r} y1={gy} y2={gy} stroke="var(--lab-line)" strokeWidth={1} />
										<text x={gx} y={H - M.b + 16} textAnchor="middle" fontSize={11} fill="var(--lab-ink-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
											{tickLabel(xk, xs.higher, nx)}
										</text>
										<text x={M.l - 8} y={gy + 4} textAnchor="end" fontSize={11} fill="var(--lab-ink-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
											{tickLabel(yk, ys.higher, ny)}
										</text>
									</g>
								)
							})}
							{medX !== null ? <line x1={M.l + unit(medX, view.x) * (W - M.l - M.r)} x2={M.l + unit(medX, view.x) * (W - M.l - M.r)} y1={M.t} y2={H - M.b} stroke="var(--lab-line-strong)" strokeWidth={1.5} strokeDasharray="5 4" /> : null}
							{medY !== null ? <line x1={M.l} x2={W - M.r} y1={H - M.b - unit(medY, view.y) * (H - M.t - M.b)} y2={H - M.b - unit(medY, view.y) * (H - M.t - M.b)} stroke="var(--lab-line-strong)" strokeWidth={1.5} strokeDasharray="5 4" /> : null}
							<text x={W - M.r - 4} y={M.t + 12} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--lab-ink-muted)">
								Better on both &#8599;
							</text>
							<text x={M.l + 4} y={H - M.b - 6} fontSize={11} fontWeight={600} fill="var(--lab-ink-muted)">
								Worse on both
							</text>
							{pts.map((p, i) =>
								focalIdx.includes(i) ? null : (
									<circle key={view.dots[i].slug} cx={p.x} cy={p.y} r={shown === i ? 6.5 : 4.5} fill={shown === i ? "var(--lab-ink)" : "var(--lab-ink-muted)"} fillOpacity={shown === i ? 1 : 0.5} stroke="var(--lab-surface)" strokeWidth={1.5} />
								),
							)}
							{focalIdx.map((i, n) => (
								<g key={view.dots[i].slug}>
									<circle cx={pts[i].x} cy={pts[i].y} r={8} fill={n === 0 ? "var(--pc-accent)" : "var(--lab-ink)"} stroke="var(--lab-surface)" strokeWidth={2.5} />
									<text x={pts[i].x} y={pts[i].y - 13} textAnchor={pts[i].x > W - 110 ? "end" : pts[i].x < M.l + 60 ? "start" : "middle"} fontSize={12} fontWeight={700} fill="var(--lab-ink)" stroke="var(--lab-surface)" strokeWidth={3.5} paintOrder="stroke">
										{view.dots[i].name}
									</text>
								</g>
							))}
							{sel && shown !== null && !focalIdx.includes(shown) ? (
								<text x={pts[shown].x} y={pts[shown].y - 12} textAnchor={pts[shown].x > W - 110 ? "end" : pts[shown].x < M.l + 60 ? "start" : "middle"} fontSize={12} fontWeight={600} fill="var(--lab-ink)" stroke="var(--lab-surface)" strokeWidth={3.5} paintOrder="stroke">
									{sel.name}
								</text>
							) : null}
							<text x={M.l + (W - M.l - M.r) / 2} y={H - 6} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--lab-ink-soft)">
								{axisName(xs)} {xs.higher === null ? "" : "→ better"}
							</text>
							<text transform={`translate(11 ${M.t + (H - M.t - M.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--lab-ink-soft)">
								{axisName(ys, W < 480)} {ys.higher === null ? "" : "→ better"}
							</text>
						</svg>
					</div>

					<div className="mt-3 min-h-[3.5rem] text-sm leading-relaxed" aria-live="polite">
						{sel ? (
							<p className="m-0 text-lab-ink">
								<span className="font-semibold">{sel.name}</span> <span className="text-lab-muted">({teamNick(sel.team)}, {sel.pos})</span>: {xs.short} {formatStat(group, xk, sel.x)}, {ys.short} {formatStat(group, yk, sel.y)}. {" "}
								<Link href={profileHref(sel.slug)} className="font-semibold underline decoration-lab-line-strong underline-offset-2">
									Profile
								</Link>
								{focal[0] && sel.slug !== focal[0] ? (
									<>
										{" "}
										&middot;{" "}
										<Link href={compareHref(focal[0], sel.slug)} rel="nofollow" className="font-semibold underline decoration-lab-line-strong underline-offset-2">
											Compare
										</Link>
									</>
								) : null}
							</p>
						) : me ? (
							<p className="m-0 text-lab-soft">
								{me.name} is ahead of {ahead("nx", me.slug)}% of {peers} on {lc(xs.label)} and {ahead("ny", me.slug)}% on {lc(ys.label)}. Hover or tap any dot to see who it is. Dashed lines mark the typical player.
							</p>
						) : (
							<p className="m-0 text-lab-soft">Hover or tap any dot to see who it is. Dashed lines mark the typical player.</p>
						)}
					</div>

					<details className="mt-2 rounded-xl border border-lab-line bg-lab-surface">
						<summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-sm font-semibold text-lab-ink">View as a table</summary>
						<div className="max-h-80 overflow-auto border-t border-lab-line">
							<table className="w-full border-collapse text-left text-sm">
								<caption className="sr-only">
									{xs.label} and {ys.label}, {peers}, best first on {xs.label}
								</caption>
								<thead>
									<tr className="text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
										<th scope="col" className="sticky top-0 z-10 lab-solid-tint px-3 py-2">Player</th>
										<th scope="col" className="sticky top-0 z-10 lab-solid-tint px-3 py-2 text-right">{xs.short}</th>
										<th scope="col" className="sticky top-0 z-10 lab-solid-tint px-3 py-2 text-right">{ys.short}</th>
									</tr>
								</thead>
								<tbody>
									{sorted.map(({ d }) => (
										<tr key={d.slug} className={`border-t border-lab-line ${focal.includes(d.slug) ? "bg-lab-tint font-semibold" : ""}`}>
											<th scope="row" className="px-3 py-1.5 font-normal">
												<Link href={profileHref(d.slug)} className="hover:underline">
													{d.name}
												</Link>{" "}
												<span className="text-xs text-lab-muted">{teamNick(d.team)}</span>
											</th>
											<td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatStat(group, xk, d.x)}</td>
											<td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatStat(group, yk, d.y)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</details>
					{graded.length < 2 ? null : <p className="m-0 mt-2 text-xs leading-relaxed text-lab-muted">Each dot is one player with enough plays to be ranked. A dot far from the rest is either a real outlier or a player whose sample is still small, so check the sample note on his profile before leaning on it.</p>}
				</div>
			) : null}
		</div>
	)
}
