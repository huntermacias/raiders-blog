import { Check, Minus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import {
	type VegasBoard as Board,
	type VegasGame,
	axisDomain,
	axisPct,
	coverText,
	leanText,
	lineText,
	marginText,
	signed,
} from "@/lib/vegas"

const SHOWN = 8

const pts = (n: number | null) => (n === null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1))

/**
 * My margin picks against the closing spread, in the same fixed dark "stadium scoreboard" as the
 * prediction board so the markers always sit on the surface they were chosen for. Every game is two
 * short lanes on one shared margin axis: how far my number was from the final margin, and how far
 * the market's was. The shorter line wins, and the lane says so in words as well as color.
 */
export default function VegasBoard({ board, season }: { board: Board; season: number }) {
	const { games, summary: s } = board
	const domain = axisDomain(games)
	const newestFirst = games.slice().sort((a, b) => b.week - a.week)
	const head = newestFirst.slice(0, SHOWN)
	const rest = newestFirst.slice(SHOWN)
	const decided = s.ats.hits + s.ats.misses
	const maxErr = Math.max(s.hunterAvgError ?? 0, s.vegasAvgError ?? 0, 1)

	return (
		<section aria-label="Hunter versus Vegas" className="overflow-hidden rounded-xl border border-[#27272a] bg-[#09090b] text-zinc-50 shadow-lg">
			<div className="flex items-center justify-between gap-4 border-b border-[#27272a] px-5 py-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
				<span>Hunter vs. Vegas</span>
				<span>
					{season} <span className="hidden sm:inline">&middot; Raiders games </span>&middot; Closing line
				</span>
			</div>

			{games.length === 0 ? (
				<p className="px-5 py-10 text-center text-sm text-zinc-400">
					No graded Raiders game has a closing line yet. The first one lands right after a final score goes in.
				</p>
			) : (
				<>
					<div className="grid grid-cols-1 gap-px bg-zinc-800 md:grid-cols-3">
						<div className="bg-[#09090b] p-5 md:p-6">
							<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Against the spread</p>
							<p className="mt-2 flex items-baseline gap-3 font-serif text-5xl font-bold leading-none tabular-nums">
								{decided + s.ats.pushes > 0 ? (
									<>
										{s.ats.hits}&ndash;{s.ats.misses}
										{s.ats.pushes > 0 && <span className="text-3xl text-zinc-400">&ndash;{s.ats.pushes}</span>}
									</>
								) : (
									"—"
								)}
								{s.atsPct !== null && <span className="text-xl font-semibold text-emerald-300">{Math.round(s.atsPct * 100)}%</span>}
							</p>
							<p className="mt-2 text-xs text-zinc-400">
								Taking whichever side of the line my score implied
								{s.ats.noLean > 0 ? `; ${s.ats.noLean} sat exactly on it` : ""}.
							</p>
						</div>

						<div className="bg-[#09090b] p-5 md:p-6">
							<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Average miss, in points</p>
							<dl className="mt-3 space-y-2.5">
								{[
									{ k: "Me", v: s.hunterAvgError, bar: "bg-emerald-400" },
									{ k: "Vegas", v: s.vegasAvgError, bar: "bg-zinc-300" },
								].map((r) => (
									<div key={r.k} className="grid grid-cols-[3.25rem_1fr_3rem] items-center gap-3">
										<dt className="text-sm font-semibold text-zinc-300">{r.k}</dt>
										<dd className="h-2.5 overflow-hidden rounded-full bg-zinc-800" aria-hidden>
											<div className={cn("h-full rounded-full", r.bar)} style={{ width: `${r.v === null ? 0 : Math.max(3, (r.v / maxErr) * 100)}%` }} />
										</dd>
										<dd className="text-right font-mono text-lg font-bold tabular-nums">{pts(r.v === null ? null : Math.round(r.v * 10) / 10)}</dd>
									</div>
								))}
							</dl>
							<p className="mt-3 text-xs text-zinc-400">How far each number was from the real margin. Lower is better.</p>
						</div>

						<div className="bg-[#09090b] p-5 md:p-6">
							<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Closer to the final</p>
							<p className="mt-2 font-serif text-5xl font-bold leading-none tabular-nums">
								{s.closer.hunter}
								<span className="text-3xl text-zinc-400"> of {s.games}</span>
							</p>
							<p className="mt-2 text-xs text-zinc-400">
								Games where my margin beat the line{s.closer.tie > 0 ? ` (${s.closer.tie} tied)` : ""}. Vegas was closer in {s.closer.vegas}.
							</p>
						</div>
					</div>

					<div className="border-t border-[#27272a] px-5 pb-2 pt-4">
						<div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-zinc-300" aria-label="Legend">
							<span className="inline-flex items-center gap-2">
								<span aria-hidden className="h-3.5 w-3.5 rounded-full bg-emerald-400 ring-2 ring-[#09090b]" /> My margin
							</span>
							<span className="inline-flex items-center gap-2">
								<span aria-hidden className="h-3 w-3 rotate-45 border-2 border-zinc-200 bg-[#09090b]" /> Closing line
							</span>
							<span className="inline-flex items-center gap-2">
								<span aria-hidden className="h-4 w-[3px] rounded bg-zinc-50" /> Final margin
							</span>
						</div>

						<Axis domain={domain} />
						<ol className="divide-y divide-[#1f1f23]">
							{head.map((g) => (
								<GameRow key={g.week} g={g} domain={domain} />
							))}
						</ol>
						{rest.length > 0 && (
							<details className="group border-t border-[#1f1f23]">
								<summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between rounded-md py-2 text-sm font-semibold text-zinc-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 [&::-webkit-details-marker]:hidden">
									<span>
										<span className="group-open:hidden">Show {rest.length} earlier game{rest.length === 1 ? "" : "s"}</span>
										<span className="hidden group-open:inline">Hide earlier games</span>
									</span>
									<span aria-hidden className="text-zinc-400 transition-transform group-open:rotate-180">
										&#9662;
									</span>
								</summary>
								<ol className="divide-y divide-[#1f1f23]">
									{rest.map((g) => (
										<GameRow key={g.week} g={g} domain={domain} />
									))}
								</ol>
							</details>
						)}
					</div>

					<details className="group border-t border-[#27272a] px-5">
						<summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between py-2 text-sm font-semibold text-zinc-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 [&::-webkit-details-marker]:hidden">
							<span>View the numbers as a table</span>
							<span aria-hidden className="text-zinc-400 transition-transform group-open:rotate-180">
								&#9662;
							</span>
						</summary>
						<div className="overflow-x-auto pb-4">
							<table className="w-full min-w-[34rem] text-left text-xs tabular-nums">
								<caption className="sr-only">My margin picks against the closing line, by game</caption>
								<thead className="text-[10px] uppercase tracking-widest text-zinc-400">
									<tr>
										<th scope="col" className="py-2 pr-3 font-semibold">Wk</th>
										<th scope="col" className="py-2 pr-3 font-semibold">Opponent</th>
										<th scope="col" className="py-2 pr-3 font-semibold">Line</th>
										<th scope="col" className="py-2 pr-3 font-semibold">My pick</th>
										<th scope="col" className="py-2 pr-3 font-semibold">Final</th>
										<th scope="col" className="py-2 pr-3 font-semibold">Side I took</th>
										<th scope="col" className="py-2 pr-3 text-right font-semibold">Me off</th>
										<th scope="col" className="py-2 text-right font-semibold">Vegas off</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-[#1f1f23] text-zinc-200">
									{games.map((g) => (
										<tr key={g.week}>
											<th scope="row" className="py-2 pr-3 font-semibold">{g.week}</th>
											<td className="py-2 pr-3">{g.home ? "vs" : "at"} {g.oppNick}</td>
											<td className="py-2 pr-3">{lineText(g.line, g.oppNick)}</td>
											<td className="py-2 pr-3">{g.hunterRaiders}&ndash;{g.hunterOpponent}</td>
											<td className="py-2 pr-3">{g.actualRaiders}&ndash;{g.actualOpponent}</td>
											<td className="py-2 pr-3">{leanText(g) ?? "On the line"} ({atsWord(g)})</td>
											<td className="py-2 pr-3 text-right">{pts(g.hunterError)}</td>
											<td className="py-2 text-right">{pts(g.vegasError)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</details>
				</>
			)}

			<p className="border-t border-[#27272a] px-5 py-3 text-[11px] leading-relaxed text-zinc-500">
				Closing spread from nflverse. Margins are Raiders points minus opponent points. This is a scorekeeping exercise to see how my score
				predictions stack up against the market, not betting advice.
				{s.missingLine > 0 ? ` ${s.missingLine} graded game${s.missingLine === 1 ? "" : "s"} will join once the line is in.` : ""}
			</p>
		</section>
	)
}

function atsWord(g: VegasGame): string {
	return g.ats === "hit" ? "cashed" : g.ats === "miss" ? "missed" : g.ats === "push" ? "push" : "no side"
}

/** Tick labels along the top of the lanes. Same columns as a lane, so the ticks line up. */
function Axis({ domain }: { domain: ReturnType<typeof axisDomain> }) {
	return (
		<div aria-hidden className="mt-3 grid grid-cols-[3.25rem_1fr_4.75rem] items-end gap-3">
			<span />
			<div className="relative h-8">
				<span className="absolute left-0 top-0 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">&larr; <span className="sm:hidden">Opp.</span><span className="hidden sm:inline">Opp. wins</span></span>
				<span className="absolute right-0 top-0 text-[10px] font-semibold uppercase tracking-widest text-zinc-500"><span className="sm:hidden">Raiders</span><span className="hidden sm:inline">Raiders win</span> &rarr;</span>
				{domain.ticks.map((t) => (
					<span
						key={t}
						className={cn("absolute bottom-0 -translate-x-1/2 font-mono text-[10px] tabular-nums", t === 0 ? "font-bold text-zinc-300" : "text-zinc-500")}
						style={{ left: `${axisPct(t, domain)}%` }}
					>
						{t === 0 ? "0" : signed(t)}
					</span>
				))}
			</div>
			<span />
		</div>
	)
}

function GameRow({ g, domain }: { g: VegasGame; domain: ReturnType<typeof axisDomain> }) {
	const side = leanText(g)
	const ats = g.ats
	const AtsIcon = ats === "hit" ? Check : ats === "miss" ? X : Minus

	const sentence = [
		`Week ${g.week}, ${g.home ? "vs" : "at"} ${g.oppNick}.`,
		`Closing line ${lineText(g.line, g.oppNick)}.`,
		`I had ${marginText(g.hunterMargin, g.oppNick)}, off by ${pts(g.hunterError)}.`,
		`Final ${marginText(g.actualMargin, g.oppNick)}, so the line was off by ${pts(g.vegasError)}.`,
		g.closer === "hunter" ? "My number was closer." : g.closer === "vegas" ? "The line was closer." : "Dead even.",
		side ? `I took ${side}: ${atsWord(g)}.` : "My margin sat exactly on the line.",
	].join(" ")

	return (
		<li className="py-4">
			<p className="sr-only">{sentence}</p>
			<div aria-hidden>
				<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
					<p className="text-sm font-semibold">
						<span className="mr-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Wk {g.week}</span>
						{g.home ? "vs" : "at"} {g.oppNick}
						<span className="ml-2 font-normal text-zinc-400">
							{g.actualRaiders}&ndash;{g.actualOpponent}
						</span>
					</p>
					<p className="text-xs text-zinc-400">
						Line <span className="font-semibold text-zinc-200">{lineText(g.line, g.oppNick)}</span>
						<span className="mx-1.5 text-zinc-600">&middot;</span>
						{side ? (
							<>
								I took <span className="font-semibold text-zinc-200">{side}</span>
								<span
									className={cn(
										"ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11px] font-bold",
										ats === "hit" && "border-emerald-400/40 bg-emerald-400/15 text-emerald-300",
										ats === "miss" && "border-rose-400/40 bg-rose-400/15 text-rose-300",
										ats === "push" && "border-zinc-600 bg-zinc-800 text-zinc-300"
									)}
								>
									<AtsIcon className="h-3 w-3" strokeWidth={3} />
									{ats === "hit" ? "Cashed" : ats === "miss" ? "Missed" : "Push"}
								</span>
							</>
						) : (
							<span className="font-semibold text-zinc-300">No side: my margin was the line</span>
						)}
					</p>
				</div>
				<p className="mt-0.5 text-[11px] text-zinc-500">{coverText(g)}</p>

				<div className="mt-2 space-y-1">
					<Lane kind="hunter" g={g} domain={domain} />
					<Lane kind="vegas" g={g} domain={domain} />
				</div>
			</div>
		</li>
	)
}

function Lane({ kind, g, domain }: { kind: "hunter" | "vegas"; g: VegasGame; domain: ReturnType<typeof axisDomain> }) {
	const hunter = kind === "hunter"
	const value = hunter ? g.hunterMargin : g.line
	const err = hunter ? g.hunterError : g.vegasError
	const wins = g.closer === (hunter ? "hunter" : "vegas")
	const tie = g.closer === "tie"

	const a = axisPct(g.actualMargin, domain)
	const m = axisPct(value, domain)
	const left = Math.min(a, m)
	const width = Math.abs(a - m)

	return (
		<div className="grid grid-cols-[3.25rem_1fr_4.75rem] items-center gap-3">
			<span className="text-xs font-semibold text-zinc-300">{hunter ? "Me" : "Vegas"}</span>
			<div className="relative h-7">
				{domain.ticks.map((t) => (
					<span key={t} className={cn("absolute inset-y-0 w-px", t === 0 ? "bg-zinc-600" : "bg-zinc-800")} style={{ left: `${axisPct(t, domain)}%` }} />
				))}
				<span
					className={cn("absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full", wins ? (hunter ? "bg-emerald-400" : "bg-zinc-200") : tie ? "bg-zinc-500" : "bg-zinc-700")}
					style={{ left: `${left}%`, width: `${width}%` }}
				/>
				<span className="absolute top-0.5 h-6 w-[3px] -translate-x-1/2 rounded bg-zinc-50" style={{ left: `${a}%` }} />
				{hunter ? (
					<span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400 ring-2 ring-[#09090b]" style={{ left: `${m}%` }} />
				) : (
					<span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-zinc-200 bg-[#09090b]" style={{ left: `${m}%` }} />
				)}
			</div>
			<span className="flex items-center justify-end gap-1.5 font-mono text-xs tabular-nums text-zinc-300">
				{wins && <Check className="h-3.5 w-3.5 text-emerald-300" strokeWidth={3} aria-hidden />}
				<span className={wins ? "font-bold text-zinc-50" : undefined}>off {pts(err)}</span>
			</span>
		</div>
	)
}
