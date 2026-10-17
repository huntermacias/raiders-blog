"use client"

import { useEffect, useMemo, useState } from "react"
import { Trash2 } from "lucide-react"

import { teamByAbbr } from "@/lib/nfl"
import { type Branch, MAX_NAME } from "@/lib/playoffs/branches"
import { diffScenarios } from "@/lib/playoffs/compare"
import { oddsText } from "@/lib/playoffs/format"
import { simulateOdds } from "@/lib/playoffs/odds"
import { pickTeamGames } from "@/lib/playoffs/picks"
import { actualOutcome, recordText } from "@/lib/playoffs/season"
import { simulateSeason } from "@/lib/playoffs/simulator"
import { scenarioStory } from "@/lib/playoffs/summary"
import type { Game, Outcome, Predictions } from "@/lib/playoffs/types"
import TeamTag from "./TeamTag"
import { btn, btnSm, focusRing } from "./ui"

type Source = "real" | "winout" | "loseout" | `branch:${string}` | `flip:${string}`

type Props = {
	games: readonly Game[]
	picks: Predictions
	team: string
	branches: readonly Branch[]
	onSave: (name: string) => void
	onDelete: (id: string) => void
	onUse: (picks: Predictions, label: string) => void
}

const outcomeText = (g: Game, o: Outcome | null) => (o === "H" ? `${g.homeTeam} win` : o === "A" ? `${g.awayTeam} win` : o === "T" ? "Tie" : "Not picked")

export default function CompareMode({ games, picks, team, branches, onSave, onDelete, onUse }: Props) {
	const [source, setSource] = useState<Source>("real")
	const [name, setName] = useState("")
	const [flipId, setFlipId] = useState("")
	const nick = teamByAbbr(team).nick

	const myOpen = useMemo(() => games.filter((g) => actualOutcome(g) === null && (g.homeTeam === team || g.awayTeam === team)).sort((a, b) => a.week - b.week), [games, team])
	const allOpen = useMemo(() => games.filter((g) => actualOutcome(g) === null).sort((a, b) => a.week - b.week), [games])

	const picksB = useMemo<Predictions>(() => {
		if (source === "real") return {}
		if (source === "winout") return pickTeamGames(games, picks, team, "W")
		if (source === "loseout") return pickTeamGames(games, picks, team, "L")
		if (source.startsWith("branch:")) return branches.find((b) => b.id === source.slice(7))?.picks ?? {}
		const g = games.find((x) => x.id === source.slice(5))
		if (!g) return picks
		const current = picks[g.id]
		// Flip: the other team wins. An unpicked game flips to the away team, so it differs from the home-team default.
		return { ...picks, [g.id]: current === "H" ? "A" : current === "A" ? "H" : "A" }
	}, [source, games, picks, team, branches])

	const simA = useMemo(() => simulateSeason({ games, predictions: picks }), [games, picks])
	const simB = useMemo(() => simulateSeason({ games, predictions: picksB }), [games, picksB])
	const diff = useMemo(() => diffScenarios(games, picks, picksB, simA, simB), [games, picks, picksB, simA, simB])

	// Playoff odds for the followed team in each scenario, worked out a moment after the choice so the page stays responsive.
	const [odds, setOdds] = useState<{ a: number; b: number } | null>(null)
	useEffect(() => {
		setOdds(null)
		const id = setTimeout(() => {
			const a = simulateOdds({ games, predictions: picks, sims: 700 }).teams[team]?.playoffs
			const b = simulateOdds({ games, predictions: picksB, sims: 700 }).teams[team]?.playoffs
			if (a !== undefined && b !== undefined) setOdds({ a, b })
		}, 30)
		return () => clearTimeout(id)
	}, [games, picks, picksB, team])

	const labelOf = (s: Source) =>
		s === "real" ? "Real results only" : s === "winout" ? `${nick} win out` : s === "loseout" ? `${nick} lose out` : s.startsWith("branch:") ? (branches.find((b) => b.id === s.slice(7))?.name ?? "Saved scenario") : "A flipped game"

	const flipGame = games.find((g) => `flip:${g.id}` === source)
	const tA = simA.teams[team]
	const tB = simB.teams[team]

	return (
		<div className="space-y-5">
			<div className="grid gap-4 lg:grid-cols-12">
				<section className="rounded-xl border border-lab-line bg-lab-surface p-4 lg:col-span-5" aria-labelledby="cmp-b">
					<h2 id="cmp-b" className="m-0 font-serif text-xl font-bold">
						Compare your scenario with…
					</h2>
					<p className="m-0 mt-1 text-sm text-lab-soft">Scenario A is the one you have built. Pick something to set it against.</p>
					<div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Scenario B">
						{(["real", "winout", "loseout"] as const).map((s) => (
							<button key={s} type="button" aria-pressed={source === s} onClick={() => setSource(s)} className={`${btnSm} ${source === s ? "!border-lab-ink !bg-lab-ink !text-lab-page" : ""}`}>
								{labelOf(s)}
							</button>
						))}
					</div>
					<label className="mt-3 block text-xs font-semibold text-lab-soft">
						Flip one game from your scenario
						<select
							value={flipId}
							onChange={(e) => {
								setFlipId(e.target.value)
								if (e.target.value) setSource(`flip:${e.target.value}`)
							}}
							className={`mt-1 block min-h-[40px] w-full rounded-lg border border-lab-line bg-lab-surface px-2 text-sm font-semibold text-lab-ink ${focusRing}`}
						>
							<option value="">Choose a game…</option>
							<optgroup label={`${nick} games`}>
								{myOpen.map((g) => (
									<option key={g.id} value={g.id}>{`Wk ${g.week}: ${g.awayTeam} at ${g.homeTeam}`}</option>
								))}
							</optgroup>
							<optgroup label="All games">
								{allOpen.map((g) => (
									<option key={`all-${g.id}`} value={g.id}>{`Wk ${g.week}: ${g.awayTeam} at ${g.homeTeam}`}</option>
								))}
							</optgroup>
						</select>
					</label>

					<h3 className="m-0 mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-lab-muted">Saved scenarios</h3>
					<form
						className="mt-2 flex gap-2"
						onSubmit={(e) => {
							e.preventDefault()
							onSave(name)
							setName("")
						}}
					>
						<input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_NAME} placeholder="Name this scenario" aria-label="Name for the saved scenario" className={`min-h-[40px] min-w-0 flex-1 rounded-lg border border-lab-line bg-lab-page px-3 text-sm ${focusRing}`} />
						<button type="submit" className={btn}>
							Save current
						</button>
					</form>
					{branches.length ? (
						<ul className="m-0 mt-2 list-none space-y-1 p-0">
							{branches.map((b) => (
								<li key={b.id} className="flex items-center gap-2">
									<button type="button" aria-pressed={source === `branch:${b.id}`} onClick={() => setSource(`branch:${b.id}`)} className={`flex min-h-[40px] min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border px-3 text-left text-sm font-semibold ${focusRing} ${source === `branch:${b.id}` ? "border-lab-ink bg-lab-tint" : "border-lab-line bg-lab-surface hover:border-lab-line-strong"}`}>
										<span className="truncate">{b.name}</span>
										<span className="shrink-0 font-mono text-[11px] font-normal text-lab-muted">{Object.keys(b.picks).length} picks</span>
									</button>
									<button type="button" onClick={() => onUse(b.picks, `open ${b.name}`)} className={btnSm}>
										Open
									</button>
									<button type="button" onClick={() => { onDelete(b.id); if (source === `branch:${b.id}`) setSource("real") }} className={`${btnSm} !px-2`} aria-label={`Delete ${b.name}`}>
										<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
									</button>
								</li>
							))}
						</ul>
					) : (
						<p className="m-0 mt-2 text-xs text-lab-muted">Save the scenario you have now, change some games, then compare the two. Saved scenarios stay in this browser.</p>
					)}
				</section>

				<section className="lg:col-span-7" aria-labelledby="cmp-diff">
					<h2 id="cmp-diff" className="m-0 font-serif text-xl font-bold">
						What changes
					</h2>
					<p className="m-0 mt-1 text-sm text-lab-soft">
						<span className="font-bold text-lab-ink">A:</span> your scenario <span className="mx-1 text-lab-muted">vs</span> <span className="font-bold text-lab-ink">B:</span> {labelOf(source)}
						{flipGame ? ` (${flipGame.awayTeam} at ${flipGame.homeTeam}, Week ${flipGame.week}: ${outcomeText(flipGame, picksB[flipGame.id] ?? null)} instead of ${outcomeText(flipGame, picks[flipGame.id] ?? null)})` : ""}
					</p>

					{diff.same ? (
						<p className="mt-4 rounded-xl border border-lab-line bg-lab-tint p-4 text-sm text-lab-soft">These are the same picks, so nothing differs. Choose another scenario to compare with, or flip a game.</p>
					) : (
						<>
							<div className="mt-3 grid grid-cols-2 gap-3">
								{[
									{ id: "A", t: tA, sim: simA, p: odds?.a },
									{ id: "B", t: tB, sim: simB, p: odds?.b },
								].map(({ id, t, sim, p }) => (
									<div key={id} className="rounded-xl border border-lab-line bg-lab-surface p-3">
										<p className="m-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-lab-muted">Scenario {id} · {nick}</p>
										<p className="m-0 mt-1 font-serif text-2xl font-bold">{t.seed ? `#${t.seed} seed` : "Out"}</p>
										<p className="m-0 text-xs text-lab-soft">{recordText(t.overall)} · {oddsText(p)} playoff odds{p === undefined ? " …" : ""}</p>
										<p className="m-0 mt-1 text-xs text-lab-muted">{scenarioStory(sim, team) ?? ""}</p>
									</div>
								))}
							</div>

							<h3 className="m-0 mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-lab-muted">The difference, in words</h3>
							{diff.lines.length ? (
								<ul className="m-0 mt-2 list-none space-y-1 p-0 text-sm">
									{diff.lines.map((l, i) => (
										<li key={i} className="flex gap-2"><span aria-hidden="true">→</span>{l}</li>
									))}
								</ul>
							) : (
								<p className="m-0 mt-2 text-sm text-lab-soft">The picks differ, but no seed or division winner changes. Records move for the teams below.</p>
							)}

							{diff.teams.length ? (
								<div className="mt-4 overflow-x-auto rounded-xl border border-lab-line">
									<table className="w-full border-collapse text-sm">
										<caption className="sr-only">Teams whose seed or record differs between the two scenarios</caption>
										<thead>
											<tr className="bg-lab-tint text-[10px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
												<th scope="col" className="p-2 text-left">Team</th>
												<th scope="col" className="p-2 text-right">A seed</th>
												<th scope="col" className="p-2 text-right">B seed</th>
												<th scope="col" className="p-2 text-right">A record</th>
												<th scope="col" className="p-2 text-right">B record</th>
											</tr>
										</thead>
										<tbody>
											{diff.teams.map((d) => (
												<tr key={d.team} className={`border-t border-lab-line ${d.flip ? "bg-lab-tint/60" : ""}`}>
													<th scope="row" className="p-2 text-left"><TeamTag id={d.team} /></th>
													<td className="p-2 text-right font-mono">{d.seedA ?? "—"}</td>
													<td className="p-2 text-right font-mono font-bold">{d.seedB ?? "—"}</td>
													<td className="p-2 text-right font-mono text-lab-soft">{d.recordA}</td>
													<td className="p-2 text-right font-mono text-lab-soft">{d.recordB}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							) : null}

							<details className="mt-4 rounded-xl border border-lab-line bg-lab-surface">
								<summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-sm font-semibold">{diff.picks.length} {diff.picks.length === 1 ? "game differs" : "games differ"}</summary>
								<ul className="m-0 max-h-72 list-none divide-y divide-lab-line overflow-y-auto p-0">
									{diff.picks.map((p) => {
										const g = games.find((x) => x.id === p.gameId) as Game
										return (
											<li key={p.gameId} className="flex items-center gap-3 px-3 py-2 text-sm">
												<span className="w-10 shrink-0 font-mono text-xs text-lab-muted">Wk {p.week}</span>
												<span className="min-w-0 flex-1">{g.awayTeam} at {g.homeTeam}</span>
												<span className="font-mono text-xs text-lab-soft">{outcomeText(g, p.a)} → <span className="font-bold text-lab-ink">{outcomeText(g, p.b)}</span></span>
											</li>
										)
									})}
								</ul>
							</details>

							<div className="mt-4 flex flex-wrap gap-2">
								<button type="button" className={btn} onClick={() => onUse(picksB, `switch to ${labelOf(source)}`)}>
									Make B my scenario
								</button>
								<p className="m-0 self-center text-xs text-lab-muted">You can undo it from the bar at the top.</p>
							</div>
						</>
					)}
				</section>
			</div>
		</div>
	)
}
