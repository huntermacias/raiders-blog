"use client"

import { oddsText } from "@/lib/playoffs/format"
import type { GameLeverage } from "@/lib/playoffs/odds"
import { teamByAbbr } from "@/lib/nfl"
import { accentStyle } from "./accent"
import type { TeamOdds } from "./useOdds"

const pts = (swing: number) => `${swing >= 0 ? "+" : "−"}${Math.round(Math.abs(swing) * 100)}`

function Bar({ value, tone }: { value: number | null; tone?: "ink" | "muted" }) {
	return (
		<span className="block h-1.5 w-full overflow-hidden rounded-full bg-lab-line" aria-hidden="true">
			<span className={`block h-full rounded-full ${tone === "muted" ? "bg-lab-muted" : "bg-[var(--pm-accent)]"}`} style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
		</span>
	)
}

/** The seven seeds and "out" as columns, with the division champions and the wild cards labelled underneath. */
function SeedChart({ seeds, exact, busy }: { seeds: number[]; exact: boolean; busy: boolean }) {
	const out = Math.max(0, 1 - seeds.reduce((a, b) => a + b, 0))
	const cols = [...seeds.map((v, i) => ({ label: `#${i + 1}`, v })), { label: "Out", v: out }]
	const top = Math.max(0.05, ...cols.map((c) => c.v))
	return (
		<figure className="m-0" aria-label="Where the team finishes">
			<div className={`flex h-36 items-end gap-1.5 transition-opacity sm:gap-2 ${busy ? "opacity-50" : ""}`} aria-hidden="true">
				{cols.map((c, i) => (
					<div key={c.label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
						<span className="mb-1 block text-center font-mono text-[10px] font-semibold tabular-nums text-lab-soft sm:text-[11px]">{c.v >= 0.005 || c.v === 0 ? oddsText(c.v, exact).replace("%", "") : "<1"}</span>
						<span className={`block w-full rounded-t-md ${i === cols.length - 1 ? "bg-lab-line-strong" : "bg-[var(--pm-accent)]"}`} style={{ height: `${Math.max(2, Math.round((c.v / top) * 100))}%` }} />
					</div>
				))}
			</div>
			<div className="mt-1.5 flex gap-1.5 text-center font-mono text-[10px] font-bold tabular-nums text-lab-ink sm:gap-2 sm:text-xs" aria-hidden="true">
				{cols.map((c) => (
					<span key={c.label} className="min-w-0 flex-1">
						{c.label}
					</span>
				))}
			</div>
			<div className="mt-1.5 grid grid-cols-8 gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-lab-muted sm:gap-2" aria-hidden="true">
				<span className="col-span-4 border-t border-lab-line-strong pt-1 text-center">Division champion</span>
				<span className="col-span-3 border-t border-lab-line-strong pt-1 text-center">Wild card</span>
				<span className="border-t border-lab-line pt-1 text-center">&nbsp;</span>
			</div>
			<figcaption className="sr-only">
				{cols.map((c) => `${c.label}: ${oddsText(c.v, exact)}`).join(". ")}. Seeds 1 to 4 are division champions and 5 to 7 are wild cards.
			</figcaption>
		</figure>
	)
}

function GameRow({ g, biggest, nick }: { g: GameLeverage; biggest: boolean; nick: string }) {
	const opp = teamByAbbr(g.opp)
	return (
		<li className="rounded-xl border border-lab-line bg-lab-page p-3">
			<div className="flex items-center justify-between gap-2">
				<p className="m-0 text-sm font-bold">
					<span className="font-mono text-xs font-semibold text-lab-muted">Wk {g.week}</span> {g.home ? "vs" : "at"} {opp.nick}
				</p>
				{biggest ? <span className="rounded-sm bg-lab-ink px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-lab-page">Biggest swing</span> : null}
			</div>
			<p className="m-0 mt-0.5 text-xs text-lab-muted">The model gives the {nick} a {oddsText(g.pWin)} chance to win it.</p>
			<div className="mt-2 grid grid-cols-2 gap-3 text-xs">
				<div>
					<p className="m-0 flex justify-between font-semibold">
						<span className="text-lab-soft">If they win</span>
						<span className="font-mono tabular-nums">{oddsText(g.ifWin)}</span>
					</p>
					<Bar value={g.ifWin} />
				</div>
				<div>
					<p className="m-0 flex justify-between font-semibold">
						<span className="text-lab-soft">If they lose</span>
						<span className="font-mono tabular-nums">{oddsText(g.ifLose)}</span>
					</p>
					<Bar value={g.ifLose} tone="muted" />
				</div>
			</div>
			{g.swing !== null ? <p className="m-0 mt-2 text-xs text-lab-soft">Worth {pts(g.swing)} points of playoff odds.</p> : null}
		</li>
	)
}

/** What the followed team needs: its odds, where it is likely to finish, what a perfect and a terrible finish are worth, and the games that matter most. */
export default function NeedsPanel({ team, odds, working, picked }: { team: string; odds: TeamOdds | null; working: boolean; picked: number }) {
	const info = teamByAbbr(team)
	const mine = odds?.base.teams[team]
	const exact = Boolean(odds?.base.exact)
	const leverage = odds?.base.leverage ?? []
	const biggest = leverage.reduce<GameLeverage | null>((best, g) => (g.swing !== null && (best === null || (best.swing as number) < g.swing) ? g : best), null)

	return (
		<section aria-labelledby="needs-heading" className="lab-opp rounded-2xl border border-lab-line bg-lab-surface p-4 sm:p-5" style={accentStyle(team)}>
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h2 id="needs-heading" className="m-0 font-serif text-xl font-bold sm:text-2xl">
					What the {info.nick} need
				</h2>
				<p className="m-0 text-xs text-lab-muted" role="status" aria-live="polite">
					{!odds ? "Simulating the rest of the season…" : working ? "Updating for your latest pick…" : exact ? "Every game has a result in this scenario, so this is the final table." : `${odds.base.sims.toLocaleString("en-US")} simulated seasons, with your ${picked ? "picks" : "results so far"} held fixed.`}
				</p>
			</div>

			{!odds || !mine ? (
				<div className="mt-4 grid animate-pulse gap-4 lg:grid-cols-3" aria-hidden="true">
					<div className="h-36 rounded-xl bg-lab-tint" />
					<div className="h-36 rounded-xl bg-lab-tint" />
					<div className="h-36 rounded-xl bg-lab-tint" />
				</div>
			) : (
				<div className="mt-4 grid gap-6 lg:grid-cols-12 lg:gap-8">
					<div className="lg:col-span-3">
						<dl className="m-0 space-y-3">
							{[
								["Make the playoffs", mine.playoffs],
								["Win the division", mine.division],
								["Get the No. 1 seed", mine.bye],
							].map(([label, v]) => (
								<div key={label as string}>
									<dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">{label as string}</dt>
									<dd className={`m-0 mt-0.5 flex items-center gap-3 transition-opacity ${working ? "opacity-50" : ""}`}>
										<span className="w-16 shrink-0 font-serif text-2xl font-bold leading-none tabular-nums">{oddsText(v as number, exact)}</span>
										<Bar value={v as number} />
									</dd>
								</div>
							))}
						</dl>
						{odds.winOut !== null && odds.loseOut !== null ? (
							<div className="mt-4 rounded-xl border border-lab-line bg-lab-page p-3 text-xs">
								<p className="m-0 flex justify-between gap-2">
									<span className="font-semibold text-lab-soft">If they win out</span>
									<span className="font-mono font-bold tabular-nums">{oddsText(odds.winOut)}</span>
								</p>
								<p className="m-0 mt-1.5 flex justify-between gap-2">
									<span className="font-semibold text-lab-soft">If they lose out</span>
									<span className="font-mono font-bold tabular-nums">{oddsText(odds.loseOut)}</span>
								</p>
								<p className="m-0 mt-1.5 text-lab-muted">Playoff odds if they win, or lose, every game they have left, with your other picks kept.</p>
							</div>
						) : null}
					</div>

					<div className="lg:col-span-5">
						<h3 className="m-0 mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">Where they finish, % of seasons</h3>
						<SeedChart seeds={mine.seeds} exact={exact} busy={working} />
					</div>

					<div className="lg:col-span-4">
						<h3 className="m-0 mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">Next games, and what each is worth</h3>
						{leverage.length ? (
							<ul className={`m-0 list-none space-y-2 p-0 transition-opacity ${working ? "opacity-50" : ""}`}>
								{leverage.map((g) => (
									<GameRow key={g.gameId} g={g} biggest={biggest?.gameId === g.gameId} nick={info.nick} />
								))}
							</ul>
						) : (
							<p className="m-0 text-sm text-lab-muted">{exact ? "No games are left to play." : "The next games are picked, so nothing is left to swing."}</p>
						)}
					</div>
				</div>
			)}

			<p className="m-0 mt-4 text-xs leading-relaxed text-lab-muted">
				The odds come from Elo ratings like the ones behind Blogger vs. the Math, built only from this season&rsquo;s final scores, so they are rough early in the year. They do not
				know about injuries or rest, and ties are not simulated. They are a model, not a forecast.
			</p>
		</section>
	)
}
