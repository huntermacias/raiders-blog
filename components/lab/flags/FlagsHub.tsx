"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import Link from "@/components/SiteLink"
import FlagCard from "@/components/lab/flags/FlagCard"
import FlagShare from "@/components/lab/flags/FlagShare"
import { useQueryParam } from "@/components/lab/flags/useQueryParam"
import { TeamLogo } from "@/components/lab/players/Media"
import type { SeasonSlice } from "@/lib/lab/flagsData"
import { COMPARE_PATH, type Flag, type FlagPlayer, SITUATIONS_PATH, penaltyHref, playerFlagsHref, teamFlagsHref, turnoversText } from "@/lib/lab/flagsKit"
import { cardStyle, teamName } from "@/lib/lab/playerView"

type Tab = "latest" | "worst" | "players" | "teams" | "types"
type Sort = "cost" | "flags" | "costly"
const TABS: { id: Tab; label: string }[] = [
	{ id: "latest", label: "Latest costly flags" },
	{ id: "worst", label: "Biggest of the year" },
	{ id: "players", label: "Players" },
	{ id: "teams", label: "Teams" },
	{ id: "types", label: "Penalties" },
]
const TAB_IDS = TABS.map((x) => x.id)
const SEASON_FALLBACK = ""
const BAD = "text-rose-700 dark:text-rose-400"

const SORTS: { id: Sort; label: string }[] = [
	{ id: "cost", label: "Cost" },
	{ id: "flags", label: "Flags" },
	{ id: "costly", label: "Costly" },
]

/**
 * The Flags hub: pick your team, then read the newest costly flags in the league, the biggest of the season, and who and which teams
 * get the most. The lists are short slices cut on the server; the whole log of a team or a player is on its own page.
 */
export default function FlagsHub({ slices, roster, teams }: { slices: SeasonSlice[]; roster: Record<string, FlagPlayer>; teams: { abbr: string; name: string }[] }) {
	const router = useRouter()
	const [seasonParam, setSeasonParam] = useQueryParam("season", slices.map((x) => String(x.season)), SEASON_FALLBACK)
	const season = Number(seasonParam) || (slices[0]?.season ?? 0)
	const [tabParam, setTabParam] = useQueryParam("tab", TAB_IDS, "latest")
	const tab = tabParam as Tab
	const setTab = (x: Tab) => setTabParam(x)
	const [sort, setSort] = React.useState<Sort>("cost")
	const [q, setQ] = React.useState("")
	const [shown, setShown] = React.useState(25)
	const cur = slices.find((s) => s.season === season) ?? slices[0]

	const players = React.useMemo(() => {
		const needle = q.trim().toLowerCase()
		const list = (cur?.players ?? []).filter((r) => !needle || r.label.toLowerCase().includes(needle) || r.team.toLowerCase() === needle)
		return [...list].sort((a, b) => (sort === "flags" ? b.flags - a.flags : sort === "costly" ? b.costly - a.costly : 0) || b.cost - a.cost)
	}, [cur, q, sort])
	const teamList = React.useMemo(() => [...(cur?.teams ?? [])].sort((a, b) => (sort === "flags" ? b.flags - a.flags : sort === "costly" ? b.costly - a.costly : 0) || b.cost - a.cost), [cur, sort])
	if (!cur) return null
	const stamp = Math.floor(Date.parse(cur.generatedAt) / 1000) || 0
	const t = cur.totals
	const feed = (list: Flag[], empty: string) =>
		list.length ? (
			<ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
				{list.map((f) => (
					<FlagCard key={f.id} f={f} players={roster} showTeam per={cur.turnoverCost} share={{ season: cur.season, stamp }} />
				))}
			</ul>
		) : (
			<p className="m-0 rounded-2xl border border-dashed border-lab-line-strong p-5 text-sm text-lab-soft">{empty}</p>
		)

	return (
		<div>
			<div className="flex flex-wrap items-end gap-x-6 gap-y-4">
				<label className="block text-sm">
					<span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-lab-muted">Find your team</span>
					<select
						className="min-h-11 w-full min-w-[14rem] rounded-lg border border-lab-line-strong bg-lab-surface px-3 text-base text-lab-ink sm:text-sm"
						defaultValue=""
						onChange={(e) => {
							if (e.target.value) router.push(teamFlagsHref(e.target.value))
						}}
					>
						<option value="">Choose a team</option>
						{teams.map((x) => (
							<option key={x.abbr} value={x.abbr}>
								{x.name}
							</option>
						))}
					</select>
				</label>
				{slices.length > 1 ? (
					<div role="group" aria-label="Season" className="flex flex-wrap gap-1.5">
						{slices.map((s) => (
							<button
								key={s.season}
								type="button"
								aria-pressed={s.season === cur.season}
								onClick={() => {
									setSeasonParam(s.season === slices[0]?.season ? "" : String(s.season))
									setShown(25)
								}}
								className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${s.season === cur.season ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong text-lab-soft hover:border-lab-ink hover:text-lab-ink"}`}
							>
								{s.season}
							</button>
						))}
					</div>
				) : null}
			</div>

			<dl className="m-0 mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4" data-testid="flag-league-totals">
				{[
					["Flags", String(t.flags), `through week ${cur.week}`],
					["Costly flags", String(t.costly), "count like a turnover"],
					["Gift first downs", String(t.gifts), "on 4th down"],
					["Cost", t.cost.toFixed(0), `points, ${turnoversText(t.cost, cur.turnoverCost)}`],
				].map(([k, v, s]) => (
					<div key={k} className="rounded-xl border border-lab-line bg-lab-surface px-3.5 py-3">
						<dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">{k}</dt>
						<dd className="m-0 mt-1 font-mono text-2xl font-bold tabular-nums">{v}</dd>
						<dd className="m-0 mt-0.5 text-xs text-lab-muted">{s}</dd>
					</div>
				))}
			</dl>

			<p className="m-0 mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-semibold">
				<Link href={COMPARE_PATH} className="text-lab-ink underline underline-offset-4">
					Compare two teams
				</Link>
				<Link href={SITUATIONS_PATH} className="text-lab-ink underline underline-offset-4">
					When flags come: score, down, field, clock
				</Link>
			</p>

			<div role="tablist" aria-label="Flag lists" className="mt-8 flex gap-1.5 overflow-x-auto pb-1">
				{TABS.map((x) => (
					<button
						key={x.id}
						id={`flags-tab-${x.id}`}
						role="tab"
						type="button"
						aria-selected={tab === x.id}
						aria-controls="flags-panel"
						onClick={() => {
							setTab(x.id)
							setShown(25)
						}}
						className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${tab === x.id ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong text-lab-soft hover:border-lab-ink hover:text-lab-ink"}`}
					>
						{x.label}
					</button>
				))}
			</div>

			{tab !== "types" ? (
				<div className="mt-3 flex justify-end">
					<FlagShare
						view={{ kind: "board", board: tab, season: cur.season }}
						name="This list"
						file={`flags-${tab}`}
						stamp={stamp}
						text={`${TABS.find((x) => x.id === tab)?.label ?? "Flags"}, ${cur.season}: the penalty flags that cost the most.`}
						alt={`${TABS.find((x) => x.id === tab)?.label ?? "Flags"} in ${cur.season}`}
						label="Share this list"
					/>
				</div>
			) : (
				<div className="mt-3 flex justify-end">
					<FlagShare view={{ kind: "board", board: "types", season: cur.season }} name="The costliest penalties" file="flags-penalties" stamp={stamp} text={`The costliest penalties in the NFL, ${cur.season}:`} alt={`The costliest kinds of penalty in ${cur.season}`} label="Share this list" />
				</div>
			)}

			<div id="flags-panel" role="tabpanel" aria-labelledby={`flags-tab-${tab}`} className="mt-4">
				{tab === "latest" ? feed(cur.latest, "No costly flags yet this season.") : null}
				{tab === "worst" ? feed(cur.worst, "No flags yet this season.") : null}
				{tab === "types" ? (
					<div role="region" aria-label="Penalties by cost" tabIndex={0} className="overflow-x-auto [contain:paint]">
						<table className="w-full border-collapse text-sm">
							<caption className="sr-only">Every kind of penalty, by points lost</caption>
							<thead>
								<tr className="text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
									<th scope="col" className="w-8 py-1.5 pr-1 font-semibold">
										#
									</th>
									<th scope="col" className="py-1.5 pr-2 font-semibold">
										Penalty
									</th>
									<th scope="col" className="px-2 py-1.5 text-right font-semibold">
										Flags
									</th>
									<th scope="col" className="px-2 py-1.5 text-right font-semibold">
										Each
									</th>
									<th scope="col" className="px-2 py-1.5 text-right font-semibold">
										Costly
									</th>
									<th scope="col" className="py-1.5 pl-2 text-right font-semibold">
										Cost
									</th>
								</tr>
							</thead>
							<tbody>
								{cur.types.map((r, i) => (
									<tr key={r.type} className="border-t border-lab-line">
										<td className="py-2 pr-1 font-mono text-xs text-lab-muted">{i + 1}</td>
										<th scope="row" className="py-2 pr-2 text-left font-semibold">
											<Link href={penaltyHref(r.type)} className="text-lab-ink underline-offset-4 hover:underline">
												{r.type}
											</Link>
										</th>
										<td className="px-2 py-2 text-right font-mono tabular-nums">{r.flags}</td>
										<td className="px-2 py-2 text-right font-mono tabular-nums text-lab-soft">{r.avg.toFixed(1)}</td>
										<td className={`px-2 py-2 text-right font-mono tabular-nums ${r.costly ? BAD : "text-lab-muted"}`}>{r.costly}</td>
										<td className="py-2 pl-2 text-right font-mono tabular-nums">{r.cost.toFixed(1)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : null}
				{tab === "players" || tab === "teams" ? (
					<div>
						<div className="mb-3 flex flex-wrap items-center gap-2">
							<span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-lab-muted">Rank by</span>
							{SORTS.map((s) => (
								<button
									key={s.id}
									type="button"
									aria-pressed={sort === s.id}
									onClick={() => setSort(s.id)}
									className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${sort === s.id ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong text-lab-soft hover:border-lab-ink hover:text-lab-ink"}`}
								>
									{s.label}
								</button>
							))}
							{tab === "players" ? (
								<input
									type="search"
									value={q}
									onChange={(e) => setQ(e.target.value)}
									placeholder="Find a player or team"
									aria-label="Find a player or team code"
									className="min-h-11 min-w-0 flex-1 rounded-lg border border-lab-line-strong bg-lab-surface px-3 text-base sm:max-w-xs sm:text-sm"
								/>
							) : null}
						</div>
						<div role="region" aria-label={tab === "players" ? "Players by flag cost" : "Teams by flag cost"} tabIndex={0} className="overflow-x-auto [contain:paint]">
							<table className="w-full border-collapse text-sm">
								<caption className="sr-only">{tab === "players" ? "Players ranked by flag cost" : "Teams ranked by flag cost"}</caption>
								<thead>
									<tr className="text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
										<th scope="col" className="w-8 py-1.5 pr-1 font-semibold">
											#
										</th>
										<th scope="col" className="py-1.5 pr-2 font-semibold">
											{tab === "players" ? "Player" : "Team"}
										</th>
										<th scope="col" className="px-2 py-1.5 text-right font-semibold">
											Flags
										</th>
										<th scope="col" className="px-2 py-1.5 text-right font-semibold">
											Costly
										</th>
										<th scope="col" className="py-1.5 pl-2 text-right font-semibold">
											Cost
										</th>
									</tr>
								</thead>
								<tbody>
									{tab === "players"
										? players.slice(0, shown).map((r, i) => (
												<tr key={r.key} className="border-t border-lab-line" style={cardStyle(r.team)}>
													<td className="py-2 pr-1 font-mono text-xs text-lab-muted">{i + 1}</td>
													<th scope="row" className="py-2 pr-2 text-left font-semibold">
														{r.slug ? (
															<Link href={playerFlagsHref(r.slug)} className="text-lab-ink underline-offset-4 hover:underline">
																{r.label}
															</Link>
														) : (
															r.label
														)}
														<span className="ml-1.5 text-xs font-normal text-lab-muted">
															{r.team}
															{r.pos ? ` · ${r.pos}` : ""}
														</span>
													</th>
													<td className="px-2 py-2 text-right font-mono tabular-nums">{r.flags}</td>
													<td className={`px-2 py-2 text-right font-mono tabular-nums ${r.costly ? BAD : "text-lab-muted"}`}>{r.costly}</td>
													<td className="py-2 pl-2 text-right font-mono tabular-nums">{r.cost.toFixed(1)}</td>
												</tr>
											))
										: teamList.map((r, i) => (
												<tr key={r.team} className="border-t border-lab-line" style={cardStyle(r.team)}>
													<td className="py-2 pr-1 font-mono text-xs text-lab-muted">{i + 1}</td>
													<th scope="row" className="py-2 pr-2 text-left font-semibold">
														<Link href={teamFlagsHref(r.team)} className="inline-flex items-center gap-2 text-lab-ink underline-offset-4 hover:underline">
															<TeamLogo team={r.team} size={20} />
															{teamName(r.team)}
														</Link>
													</th>
													<td className="px-2 py-2 text-right font-mono tabular-nums">{r.flags}</td>
													<td className={`px-2 py-2 text-right font-mono tabular-nums ${r.costly ? BAD : "text-lab-muted"}`}>{r.costly}</td>
													<td className="py-2 pl-2 text-right font-mono tabular-nums">{r.cost.toFixed(1)}</td>
												</tr>
											))}
								</tbody>
							</table>
						</div>
						{tab === "players" && !players.length ? <p className="m-0 mt-3 text-sm text-lab-soft">Nobody matches. The list holds the {cur.players.length} players whose flags cost the most.</p> : null}
						{tab === "players" && players.length > shown ? (
							<button type="button" onClick={() => setShown((n) => n + 25)} className="mt-4 rounded-full border border-lab-line-strong px-4 py-2 text-sm font-semibold text-lab-ink hover:border-lab-ink">
								Show 25 more
							</button>
						) : null}
					</div>
				) : null}
			</div>
		</div>
	)
}
