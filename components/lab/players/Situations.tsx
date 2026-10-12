"use client"

import * as React from "react"

import { DOWN, TierChip, UP } from "@/components/lab/players/Bits"
import { trackPlayers } from "@/lib/lab/track"
import { tierOf } from "@/lib/lab/playersKit"
import {
	BUCKETS,
	BUCKET_LABEL,
	BUCKET_SHORT,
	DOWN_WORD,
	type GameView,
	type GridCell,
	METRICS,
	METRIC_WHAT,
	type Metric,
	type Play,
	ROLE,
	type Role,
	type SituationView,
	type SplitRow,
	type SplitStats,
	epaText,
	formatMetric,
	gameLine,
	gameSummary,
	higherIsBetter,
	pct0,
	playLine,
	playResult,
	spot,
} from "@/lib/lab/situationsKit"

// How far a cell's number must be from the league's in the same spot before it is colored. The small step is a hint, the big one a
// real gap; anything closer reads as the same as the league.
const STEPS: Record<Metric, [number, number]> = { sr: [0.04, 0.1], fd: [0.04, 0.1], x: [0.04, 0.1], ypp: [0.4, 1.0], epa: [0.06, 0.15] }
const MIN_CELL = 3

const GOOD_STRONG = "bg-emerald-200 text-emerald-950 dark:bg-emerald-800/60 dark:text-emerald-50"
const GOOD_SOFT = "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
const BAD_STRONG = "bg-rose-200 text-rose-950 dark:bg-rose-800/60 dark:text-rose-50"
const BAD_SOFT = "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100"

type Verdict = { cls: string; mark: string; word: string }

/** Better or worse than the league's same spot, as a color, an arrow and a word. */
function verdict(role: Role, m: Metric, mine: SplitStats | null, lg: SplitStats | null): Verdict {
	if (!mine || mine.n < MIN_CELL) return { cls: "bg-lab-tint text-lab-muted", mark: "", word: mine ? "too few plays to compare" : "no plays" }
	if (!lg) return { cls: "bg-lab-tint text-lab-ink", mark: "", word: "no league number to compare" }
	const raw = mine[m] - lg[m]
	const diff = higherIsBetter(role, m) ? raw : -raw
	const [small, big] = STEPS[m]
	if (diff >= big) return { cls: GOOD_STRONG, mark: "▲", word: "well above the league" }
	if (diff >= small) return { cls: GOOD_SOFT, mark: "▲", word: "above the league" }
	if (diff <= -big) return { cls: BAD_STRONG, mark: "▼", word: "well below the league" }
	if (diff <= -small) return { cls: BAD_SOFT, mark: "▼", word: "below the league" }
	return { cls: "bg-lab-tint text-lab-ink", mark: "●", word: "about the league average" }
}

function gap(m: Metric, mine: SplitStats, lg: SplitStats): string {
	const d = mine[m] - lg[m]
	if (m === "ypp") return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} yds`
	if (m === "epa") return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}`
	return `${d >= 0 ? "+" : "−"}${Math.abs(Math.round(d * 100))} pts`
}

export default function Situations({ name, views }: { name: string; views: SituationView[] }) {
	const [role, setRole] = React.useState<Role>(views[0].role)
	const view = views.find((v) => v.role === role) ?? views[0]
	const meta = ROLE[view.role]
	return (
		<div data-testid="situations">
			{views.length > 1 ? (
				<div role="tablist" aria-label="Which job" className="mb-4 flex flex-wrap gap-1.5">
					{views.map((v) => (
						<button
							key={v.role}
							type="button"
							role="tab"
							aria-selected={v.role === view.role}
							onClick={() => {
								setRole(v.role)
								trackPlayers("player_situation", { player: name, role: v.role, action: "job" })
							}}
							className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${v.role === view.role ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong text-lab-soft hover:border-lab-ink hover:text-lab-ink"}`}
						>
							{ROLE[v.role].tab} <span className="font-mono text-xs opacity-70">{v.total}</span>
						</button>
					))}
				</div>
			) : null}
			<p className="m-0 max-w-3xl text-sm text-lab-soft">
				{meta.blurb} Every number is set against the average {view.single.toLowerCase()} in the same spot, so a good day on 3rd and long is not mistaken for one on 1st and 10.
			</p>
			{view.read.length ? (
				<div className="mt-4 grid max-w-3xl gap-2 text-base leading-relaxed text-lab-ink" data-testid="situation-read">
					{view.read.map((r, i) => (
						<p key={i} className="m-0">
							{r}
						</p>
					))}
				</div>
			) : null}

			<h3 className="m-0 mt-8 font-serif text-xl font-bold">By down</h3>
			<DownTable view={view} />

			<h3 className="m-0 mt-10 font-serif text-xl font-bold">Down and distance</h3>
			<Grid key={`grid-${view.role}`} name={name} view={view} />

			<h3 className="m-0 mt-10 font-serif text-xl font-bold">Dive into a game</h3>
			<GameChart key={`game-${view.role}`} name={name} view={view} />

			<details className="mt-8 max-w-3xl rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm text-lab-soft">
				<summary className="cursor-pointer text-sm font-semibold text-lab-ink">What these numbers mean</summary>
				<dl className="mb-2 mt-3 grid gap-2 text-xs leading-relaxed text-lab-muted">
					{METRICS.map((m) => (
						<div key={m}>
							<dt className="inline font-semibold text-lab-soft">{meta.label[m]}. </dt>
							<dd className="m-0 inline">{METRIC_WHAT[m]}</dd>
						</div>
					))}
					<div>
						<dt className="inline font-semibold text-lab-soft">Distance. </dt>
						<dd className="m-0 inline">Short is 1 to 3 yards to go, medium 4 to 6, long 7 to 10, very long 11 or more. First down is nearly always 10 to go, so it sits in the long column.</dd>
					</div>
					<div>
						<dt className="inline font-semibold text-lab-soft">Small samples. </dt>
						<dd className="m-0 inline">A single spot has few plays behind it, so a cell with fewer than {MIN_CELL} plays is left uncolored and the percentile tags only appear once he has enough plays to be ranked against his position.</dd>
					</div>
				</dl>
			</details>
		</div>
	)
}

// ---------------------------------------------------------------------------------------------- by down

function DownTable({ view }: { view: SituationView }) {
	const meta = ROLE[view.role]
	return (
		<div className="mt-3 overflow-x-auto rounded-xl border border-lab-line bg-lab-surface">
			<table className="w-full min-w-[40rem] border-collapse text-left text-xs sm:text-sm">
				<caption className="sr-only">By down, against the average {view.single.toLowerCase()}</caption>
				<thead>
					<tr className="bg-lab-tint text-[10px] font-semibold uppercase tracking-[0.1em] text-lab-muted sm:text-[11px]">
						<th scope="col" className="sticky left-0 bg-lab-tint px-3 py-2">Spot</th>
						<th scope="col" className="px-2 py-2 text-right">{meta.nouns.replace(/^\w/, (c) => c.toUpperCase())}</th>
						{METRICS.map((m) => (
							<th key={m} scope="col" className="whitespace-nowrap px-2 py-2 text-right">
								{meta.short[m]}
							</th>
						))}
						<th scope="col" className="px-3 py-2">Success vs. {view.peers}</th>
					</tr>
				</thead>
				<tbody>
					{view.rows.map((r) => (
						<DownRow key={r.key} row={r} role={view.role} />
					))}
				</tbody>
			</table>
		</div>
	)
}

function DownRow({ row, role }: { row: SplitRow; role: Role }) {
	const strong = row.key === "all"
	return (
		<tr className={`border-t border-lab-line align-top ${strong ? "bg-lab-tint/50 font-semibold" : ""}`}>
			<th scope="row" className="sticky left-0 whitespace-nowrap bg-lab-surface px-3 py-2 text-left font-normal">
				{row.label}
			</th>
			<td className="px-2 py-2 text-right font-mono tabular-nums">{row.mine.n}</td>
			{METRICS.map((m) => {
				return (
					<td key={m} className="whitespace-nowrap px-2 py-2 text-right font-mono tabular-nums">
						<span className="font-bold text-lab-ink">{formatMetric(m, row.mine[m])}</span>
						{row.lg ? <span className="block text-[10px] font-normal text-lab-muted">lg {formatMetric(m, row.lg[m])}</span> : null}
					</td>
				)
			})}
			<td className="px-3 py-2">
				{row.pct && row.pct.sr !== undefined ? (
					<TierChip tier={tierOf(row.pct.sr)} />
				) : (
					<span className="text-[11px] text-lab-muted" title={row.min ? `He needs ${row.min} plays here to be ranked.` : undefined}>
						{row.mine.n < MIN_CELL ? "Few plays" : "Not enough to rank"}
					</span>
				)}
			</td>
		</tr>
	)
}

// ---------------------------------------------------------------------------------------------- the down-and-distance grid

function Grid({ name, view }: { name: string; view: SituationView }) {
	const [metric, setMetric] = React.useState<Metric>("sr")
	const [pick, setPick] = React.useState<GridCell | null>(null)
	const meta = ROLE[view.role]
	const byKey = new Map(view.grid.map((c) => [`${c.down}.${c.bucket}`, c]))
	const lead = pick ?? null
	return (
		<div className="mt-3">
			<div role="radiogroup" aria-label="What the grid shows" className="flex flex-wrap gap-1.5">
				{METRICS.map((m) => (
					<button
						key={m}
						type="button"
						role="radio"
						aria-checked={m === metric}
						onClick={() => {
							setMetric(m)
							trackPlayers("player_situation", { player: name, role: view.role, action: "metric", metric: m })
						}}
						className={`rounded-full border px-3 py-1 text-xs font-semibold ${m === metric ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong text-lab-soft hover:border-lab-ink hover:text-lab-ink"}`}
					>
						{meta.label[m]}
					</button>
				))}
			</div>
			<div className="mt-3 overflow-x-auto">
				<table className="w-full min-w-[30rem] border-separate border-spacing-1 text-center" data-testid="situation-grid">
					<caption className="sr-only">
						{meta.label[metric]} by down and distance. Each cell shows his number, how many plays are behind it, and whether it is above or below the league in that spot.
					</caption>
					<thead>
						<tr>
							<td />
							{BUCKETS.map((b) => (
								<th key={b} scope="col" className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-lab-muted sm:text-[11px]">
									{BUCKET_SHORT[b]}
									<span className="block font-normal normal-case tracking-normal">{BUCKET_LABEL[b].replace(" to go", "")}</span>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{[1, 2, 3, 4].map((d) => (
							<tr key={d}>
								<th scope="row" className="whitespace-nowrap pr-2 text-left font-mono text-xs font-bold text-lab-ink sm:text-sm">
									{DOWN_WORD[d]}
								</th>
								{BUCKETS.map((b) => {
									const c = byKey.get(`${d}.${b}`)!
									const v = verdict(view.role, metric, c.mine, c.lg)
									const selected = pick && pick.down === d && pick.bucket === b
									const label = c.mine
										? `${DOWN_WORD[d]} down, ${BUCKET_LABEL[b]}: ${formatMetric(metric, c.mine[metric])} ${meta.label[metric].toLowerCase()} on ${c.mine.n} ${c.mine.n === 1 ? meta.noun : meta.nouns}${c.lg ? ` (league ${formatMetric(metric, c.lg[metric])})` : ""}, ${v.word}`
										: `${DOWN_WORD[d]} down, ${BUCKET_LABEL[b]}: no plays`
									return (
										<td key={b} className="p-0">
											<button
												type="button"
												disabled={!c.mine}
												aria-label={label}
												aria-pressed={!!selected}
												onClick={() => {
													setPick(c)
													trackPlayers("player_situation", { player: name, role: view.role, action: "cell", spot: `${d}.${b}` })
												}}
												className={`flex h-14 w-full flex-col items-center justify-center rounded-md px-1 text-center leading-tight ${v.cls} ${selected ? "ring-2 ring-lab-ink" : ""} ${c.mine ? "" : "cursor-default opacity-50"}`}
											>
												{c.mine ? (
													<>
														<span className="font-mono text-sm font-bold tabular-nums sm:text-base">
															{c.mine.n >= MIN_CELL && v.mark ? (
																<span aria-hidden="true" className="mr-1 text-[9px]">
																	{v.mark}
																</span>
															) : null}
															{formatMetric(metric, c.mine[metric])}
														</span>
														<span className="text-[10px] opacity-80">
															{c.mine.n} {c.mine.n === 1 ? meta.noun : meta.nouns}
														</span>
													</>
												) : (
													<span className="text-lab-muted" aria-hidden="true">
														–
													</span>
												)}
											</button>
										</td>
									)
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-lab-muted" aria-hidden="true">
				<span className={`inline-flex items-center gap-1.5 ${UP}`}>
					<span className="inline-block h-3 w-3 rounded-sm bg-emerald-200 dark:bg-emerald-800/60" /> above the league in that spot
				</span>
				<span className="inline-flex items-center gap-1.5 text-lab-soft">
					<span className="inline-block h-3 w-3 rounded-sm bg-lab-tint ring-1 ring-lab-line" /> about even, or too few plays
				</span>
				<span className={`inline-flex items-center gap-1.5 ${DOWN}`}>
					<span className="inline-block h-3 w-3 rounded-sm bg-rose-200 dark:bg-rose-800/60" /> below the league in that spot
				</span>
			</div>
			<p className="m-0 mt-3 min-h-[2.5rem] max-w-3xl text-sm leading-relaxed text-lab-soft" aria-live="polite" data-testid="situation-pick">
				{lead && lead.mine ? (
					<>
						<span className="font-semibold text-lab-ink">
							{DOWN_WORD[lead.down]} down, {BUCKET_LABEL[lead.bucket]}:
						</span>{" "}
						{lead.mine.n} {lead.mine.n === 1 ? meta.noun : meta.nouns}, {Math.round(lead.mine.sr * lead.mine.n)} successful ({pct0(lead.mine.sr)}), {lead.mine.ypp.toFixed(1)} yards each, {Math.round(lead.mine.fd * lead.mine.n)} first downs or touchdowns.
						{lead.lg ? ` The average ${view.single.toLowerCase()} here: ${pct0(lead.lg.sr)} successful, ${lead.lg.ypp.toFixed(1)} yards each (${gap(metric, lead.mine, lead.lg)} on ${meta.label[metric].toLowerCase()}).` : ""}
						{lead.mine.n < MIN_CELL ? " That is very few plays, so treat it as a note, not a trend." : ""}
					</>
				) : (
					"Pick a cell to see what is behind it. Blank cells are spots he has not run a play in yet."
				)}
			</p>
		</div>
	)
}

// ---------------------------------------------------------------------------------------------- one game

const PAD = { l: 52, r: 56, t: 30, b: 14 }
const LANE = 40

function GameChart({ name, view }: { name: string; view: SituationView }) {
	const games = view.games
	const [week, setWeek] = React.useState<number>(games[games.length - 1]?.week ?? 0)
	const [sel, setSel] = React.useState<number | null>(null)
	const [asTable, setAsTable] = React.useState(false)
	const game = games.find((g) => g.week === week) ?? games[games.length - 1]
	if (!game) return <p className="m-0 mt-3 text-sm text-lab-soft">No plays to show yet.</p>
	const meta = ROLE[view.role]
	const sum = gameSummary(game.plays)
	const chosen = sel !== null ? game.plays[sel] : null
	return (
		<div className="mt-3">
			<div role="tablist" aria-label="Pick a game" className="flex flex-wrap gap-1.5">
				{games.map((g) => {
					const s = gameSummary(g.plays)
					return (
						<button
							key={g.week}
							type="button"
							role="tab"
							aria-selected={g.week === game.week}
							onClick={() => {
								setWeek(g.week)
								setSel(null)
								trackPlayers("player_situation", { player: name, role: view.role, action: "game", week: g.week })
							}}
							className={`rounded-lg border px-3 py-1.5 text-left text-xs ${g.week === game.week ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong text-lab-soft hover:border-lab-ink hover:text-lab-ink"}`}
						>
							<span className="font-mono font-bold">Wk {g.week}</span> {g.opp ? `vs ${g.opp}` : ""}
							<span className="block font-mono text-[10px] opacity-75">
								{s.wins}/{s.n} successful
							</span>
						</button>
					)
				})}
			</div>

			<p className="m-0 mt-3 max-w-3xl text-sm leading-relaxed text-lab-soft" data-testid="game-line">
				<span className="font-semibold text-lab-ink">
					Week {game.week}
					{game.opp ? ` vs ${game.opp}` : ""}
					{game.result ? ` (${game.result})` : ""}:
				</span>{" "}
				{gameLine(view.role, game, view.lgSr, view.single)}
			</p>

			{asTable ? (
				<PlayTable role={view.role} plays={game.plays} />
			) : (
				<Chart role={view.role} game={game} sel={sel} onSel={setSel} lgByDown={view.lgByDown} />
			)}

			<div className="mt-2 flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-lab-soft" aria-hidden={asTable}>
					<span className="inline-flex items-center gap-1.5">
						<svg width="14" height="14" viewBox="-7 -7 14 14" className={UP} aria-hidden="true">
							<circle r="5.5" fill="currentColor" />
						</svg>
						Successful play
					</span>
					<span className="inline-flex items-center gap-1.5">
						<svg width="14" height="14" viewBox="-7 -7 14 14" className={DOWN} aria-hidden="true">
							<path d="M-4.5 -4.5L4.5 4.5M4.5 -4.5L-4.5 4.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
						</svg>
						Not successful
					</span>
					<span className="text-lab-muted">Rows are the down. Left to right is the order of the game.</span>
				</div>
				<button
					type="button"
					onClick={() => setAsTable((v) => !v)}
					className="rounded-lg border border-lab-line-strong px-3 py-1.5 text-xs font-semibold text-lab-soft hover:border-lab-ink hover:text-lab-ink"
				>
					{asTable ? "Show the chart" : "Show as a table"}
				</button>
			</div>

			{!asTable ? (
				<p className="m-0 mt-3 min-h-[3rem] max-w-3xl rounded-lg border border-lab-line bg-lab-surface px-3 py-2 text-sm leading-relaxed text-lab-soft" aria-live="polite" data-testid="play-detail">
					{chosen ? (
						<>
							<span className={`mr-1.5 font-semibold ${chosen[5] ? UP : DOWN}`}>{chosen[5] ? "● Successful." : "✕ Not successful."}</span>
							{" "}
							<span className="text-lab-ink">{playLine(view.role, chosen)}</span>
						</>
					) : (
						`Hover or tap a play to see what happened. ${sum.n} ${sum.n === 1 ? meta.noun : meta.nouns} in this game.`
					)}
				</p>
			) : null}
		</div>
	)
}

function Chart({ role, game, sel, onSel, lgByDown }: { role: Role; game: GameView; sel: number | null; onSel: (i: number | null) => void; lgByDown: Record<string, number> }) {
	const n = game.plays.length
	// A short game still gets a chart about as wide as a full one, so the plays are not blown up.
	const slots = Math.max(n, 16)
	const STEP = Math.max(22, Math.min(40, Math.floor(520 / slots)))
	const W = PAD.l + slots * STEP + PAD.r
	const H = PAD.t + 4 * LANE + PAD.b
	const x = (i: number) => PAD.l + (i + 0.5) * STEP
	const y = (down: number) => PAD.t + (Math.min(4, Math.max(1, down)) - 0.5) * LANE
	const s = gameSummary(game.plays)
	const breaks: { i: number; q: number }[] = []
	game.plays.forEach((p, i) => {
		if (i === 0 || p[0] !== game.plays[i - 1][0]) breaks.push({ i, q: p[0] })
	})
	const refs = React.useRef<(SVGGElement | null)[]>([])
	const desc = `${s.wins} of ${s.n} plays were successful. ${s.byDown.map((d) => `${DOWN_WORD[d.down]} down ${d.wins} of ${d.n}`).join(", ")}.`
	return (
		<div className="mt-3 overflow-x-auto rounded-xl border border-lab-line bg-lab-surface p-2" data-testid="game-chart">
			<svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ maxWidth: "none" }} className="block" role="group" aria-label={`Every play, by down. ${desc}`}>
				{[1, 2, 3, 4].map((d) => (
					<g key={d}>
						<rect x={PAD.l} y={PAD.t + (d - 1) * LANE} width={slots * STEP} height={LANE} fill={d % 2 ? "var(--lab-tint)" : "transparent"} />
						<text x={PAD.l - 10} y={y(d) + 4} textAnchor="end" fontSize={12} fontWeight={700} fill="var(--lab-ink)" fontFamily="ui-monospace, monospace">
							{DOWN_WORD[d]}
						</text>
						{s.byDown.find((b) => b.down === d) ? (
							<text x={PAD.l + slots * STEP + 10} y={y(d) + 4} fontSize={11} fill="var(--lab-ink-soft)" fontFamily="ui-monospace, monospace">
								{s.byDown.find((b) => b.down === d)!.wins}/{s.byDown.find((b) => b.down === d)!.n}
							</text>
						) : null}
					</g>
				))}
				{breaks.map(({ i, q }) => (
					<g key={`q${i}`}>
						{i > 0 ? <line x1={PAD.l + i * STEP} x2={PAD.l + i * STEP} y1={PAD.t - 6} y2={PAD.t + 4 * LANE} stroke="var(--lab-line-strong)" strokeDasharray="3 3" /> : null}
						<text x={PAD.l + i * STEP + 4} y={PAD.t - 12} fontSize={10} fontWeight={700} fill="var(--lab-ink-muted)" letterSpacing="0.08em">
							{q > 4 ? "OT" : `Q${q}`}
						</text>
					</g>
				))}
				{game.plays.map((p, i) => {
					const ok = p[5] === 1
					const on = sel === i
					return (
						<g
							key={i}
							ref={(el) => {
								refs.current[i] = el
							}}
							role="button"
							tabIndex={0}
							aria-label={`${ok ? "Successful" : "Not successful"}. ${playLine(role, p)}`}
							aria-pressed={on}
							className={`cursor-pointer outline-none ${ok ? UP : DOWN}`}
							onMouseEnter={() => onSel(i)}
							onFocus={() => onSel(i)}
							onClick={() => onSel(on ? null : i)}
							onKeyDown={(e) => {
								if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
									const next = Math.min(n - 1, Math.max(0, i + (e.key === "ArrowRight" ? 1 : -1)))
									refs.current[next]?.focus()
									e.preventDefault()
								}
							}}
						>
							<circle cx={x(i)} cy={y(p[1])} r={13} fill="transparent" />
							{on ? <circle cx={x(i)} cy={y(p[1])} r={11} fill="none" stroke="var(--lab-ink)" strokeWidth={1.5} /> : null}
							{ok ? (
								<circle cx={x(i)} cy={y(p[1])} r={6} fill="currentColor" stroke="var(--lab-surface)" strokeWidth={2} />
							) : (
								<path d={`M${x(i) - 4.5} ${y(p[1]) - 4.5}L${x(i) + 4.5} ${y(p[1]) + 4.5}M${x(i) + 4.5} ${y(p[1]) - 4.5}L${x(i) - 4.5} ${y(p[1]) + 4.5}`} stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" fill="none" />
							)}
						</g>
					)
				})}
			</svg>
			<p className="sr-only">League success rate by down: {Object.entries(lgByDown).map(([d, v]) => `${DOWN_WORD[Number(d)]} ${pct0(v)}`).join(", ")}.</p>
		</div>
	)
}

function PlayTable({ role, plays }: { role: Role; plays: Play[] }) {
	return (
		<div className="mt-3 overflow-x-auto rounded-xl border border-lab-line bg-lab-surface" data-testid="play-table">
			<table className="w-full min-w-[34rem] border-collapse text-left text-xs sm:text-sm">
				<caption className="sr-only">Every play in this game</caption>
				<thead>
					<tr className="bg-lab-tint text-[10px] font-semibold uppercase tracking-[0.1em] text-lab-muted sm:text-[11px]">
						<th scope="col" className="px-3 py-2">#</th>
						<th scope="col" className="px-2 py-2">Qtr</th>
						<th scope="col" className="px-2 py-2">Down</th>
						<th scope="col" className="px-2 py-2">Spot</th>
						<th scope="col" className="px-2 py-2">What happened</th>
						<th scope="col" className="px-2 py-2 text-right">Yds</th>
						<th scope="col" className="px-2 py-2 text-right">EPA</th>
						<th scope="col" className="px-3 py-2">Result</th>
					</tr>
				</thead>
				<tbody>
					{plays.map((p, i) => (
						<tr key={i} className="border-t border-lab-line">
							<td className="px-3 py-1.5 font-mono tabular-nums text-lab-muted">{i + 1}</td>
							<td className="px-2 py-1.5 font-mono tabular-nums">{p[0] > 4 ? "OT" : `Q${p[0]}`}</td>
							<td className="whitespace-nowrap px-2 py-1.5 font-mono tabular-nums">
								{DOWN_WORD[p[1]]} &amp; {p[2]}
							</td>
							<td className="whitespace-nowrap px-2 py-1.5">{spot(p[3])}</td>
							<td className="px-2 py-1.5">{playResult(role, p)}</td>
							<td className="px-2 py-1.5 text-right font-mono tabular-nums">{p[4]}</td>
							<td className="px-2 py-1.5 text-right font-mono tabular-nums">{epaText(p[6]).replace(" EPA", "")}</td>
							<td className={`whitespace-nowrap px-3 py-1.5 font-semibold ${p[5] ? UP : DOWN}`}>{p[5] ? "● Successful" : "✕ Not successful"}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}
